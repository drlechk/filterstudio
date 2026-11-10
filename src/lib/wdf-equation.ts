import type { ComponentPrecision } from './types';
import type { Language } from './preference-storage';
import type { WdfAdaptor, WdfModel } from './wdf';
import { adaptorCoefficientPorts } from './wdf-signal-flow';
import { DEFAULT_COMPONENT_PRECISION } from './component-rounding';
import { WdfExpressions, expressionGroups, expressionLatex, type Expression } from './wdf-expression';

type Arithmetic<T> = {
  constant(value: number): T;
  add(...values: T[]): T;
  multiply(...values: T[]): T;
  symbol(latex: string, value: number): T;
};
type DelayPolynomial<T> = { coefficients: T[]; minus: number; plus: number };
type Stage<T> = { adaptor: WdfAdaptor; gamma: T[]; num: DelayPolynomial<T>; den: DelayPolynomial<T> };
type Polynomials<T> = { numerator: T[]; denominator: T[] };
export type EquationLatex = { latex: string; groups: string[][] };
export type WdfEquation = Polynomials<number> & {
  order: number;
  symbolic: EquationLatex;
  /** Small filters have explicit scalar expressions; larger ones use factored polynomials. */
  coefficients?: Polynomials<Expression>;
};

const numeric: Arithmetic<number> = {
  constant: value => value,
  add: (...values) => values.reduce((a, b) => a + b, 0),
  multiply: (...values) => values.reduce((a, b) => a * b, 1),
  symbol: (_, value) => value,
};
const gammaName = (adaptor: WdfAdaptor, index: number) => `\\gamma_{${index + 1},\\mathrm{${adaptor.label}}}`;

function portCoefficients<T>(adaptor: WdfAdaptor, math: Arithmetic<T>): T[] {
  const { referencePort, independent } = adaptorCoefficientPorts(adaptor);
  const result = adaptor.ports.map(() => math.constant(1));
  independent.forEach((port, index) => { result[port] = math.symbol(gammaName(adaptor, index), adaptor.ports[port].coefficient); });
  result[referencePort] = math.add(math.constant(adaptor.adaptedPort === null ? 2 : 1),
    ...independent.map(port => math.multiply(math.constant(-1), result[port])));
  return result;
}

function polynomialMath<T>(math: Arithmetic<T>) {
  return {
    add: (a: T[], b: T[]) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => math.add(a[i] ?? math.constant(0), b[i] ?? math.constant(0))),
    scale: (a: T[], scale: T) => a.map(value => math.multiply(value, scale)),
    multiply: (a: T[], b: T[]) => Array.from({ length: a.length + b.length - 1 }, (_, k) =>
      math.add(...a.flatMap((value, i) => k >= i && k - i < b.length ? [math.multiply(value, b[k - i])] : []))),
  };
}

/** Keep powers of (1−q) and (1+q) separate. On −1<q<1 all physical
 * impedances and chain-matrix terms are positive, so an addition's endpoint
 * multiplicity is exactly the minimum of its operands' multiplicities.
 * This cancels redundant delay factors without approximate root finding or
 * numerically ill-conditioned division of expanded polynomials. */
function delayPolynomialMath<T>(math: Arithmetic<T>) {
  const poly = polynomialMath(math);
  const expand = (value: DelayPolynomial<T>): T[] => {
    let coefficients = value.coefficients;
    for (const [count, sign] of [[value.minus, -1], [value.plus, 1]]) {
      for (let i = 0; i < count; i++) coefficients = poly.multiply(coefficients, [math.constant(1), math.constant(sign)]);
    }
    return coefficients;
  };
  return {
    expand,
    add: (a: DelayPolynomial<T>, b: DelayPolynomial<T>): DelayPolynomial<T> => {
      const minus = Math.min(a.minus, b.minus), plus = Math.min(a.plus, b.plus);
      return { minus, plus, coefficients: poly.add(expand({ ...a, minus: a.minus - minus, plus: a.plus - plus }), expand({ ...b, minus: b.minus - minus, plus: b.plus - plus })) };
    },
    scale: (a: DelayPolynomial<T>, scale: T): DelayPolynomial<T> => ({ ...a, coefficients: poly.scale(a.coefficients, scale) }),
    multiply: (a: DelayPolynomial<T>, b: DelayPolynomial<T>): DelayPolynomial<T> => ({ minus: a.minus + b.minus, plus: a.plus + b.plus, coefficients: poly.multiply(a.coefficients, b.coefficients) }),
  };
}

/** Physical source → load order, independent of the scattering root. Each
 * branch is its impedance (series) or admittance (shunt), normalized to its
 * WDF port resistance. Thus every variable below is an independent gamma. */
function stages<T>(model: WdfModel, math: Arithmetic<T>): Stage<T>[] {
  const adaptors = new Map(model.adaptors.map(a => [a.id, a]));
  const elements = new Map(model.elements.map(e => [e.id, e]));
  const result: Stage<T>[] = [];
  let id = elements.get('source')!.parentId;
  while (id !== 'load') {
    const adaptor = adaptors.get(id)!;
    if (adaptor.ports.length === 2) break; // Direct resistive termination.
    const branchId = adaptor.ports[1].neighborId;
    const branch = elements.get(branchId);
    const one = (): DelayPolynomial<T> => ({ coefficients: [math.constant(1)], minus: 0, plus: 0 });
    let num: DelayPolynomial<T>, den: DelayPolynomial<T>;
    if (branch) {
      if (branch.kind === 'R') { num = den = one(); }
      else {
        const sign = (branch.kind === 'C') === (adaptor.kind === 'series') ? 1 : -1;
        num = { ...one(), minus: sign < 0 ? 1 : 0, plus: sign > 0 ? 1 : 0 };
        den = { ...one(), minus: sign > 0 ? 1 : 0, plus: sign < 0 ? 1 : 0 };
      }
    } else {
      const resonator = adaptors.get(branchId)!;
      const [g0, gL, gC] = portCoefficients(resonator, math);
      const sum = math.add(gL, gC);
      const difference = math.add(gC, math.multiply(math.constant(-1), gL));
      num = { coefficients: [sum, math.multiply(math.constant(resonator.kind === 'series' ? 2 : -2), difference), sum], minus: 0, plus: 0 };
      den = { coefficients: [g0], minus: 1, plus: 1 };
      if (resonator.kind !== adaptor.kind) [num, den] = [den, num];
    }
    result.push({ adaptor, gamma: portCoefficients(adaptor, math), num, den });
    id = adaptor.ports[2].neighborId;
  }
  return result;
}

/** Cleared chain matrices in [V, R_port I] coordinates:
 * S: [[g2 D, g1 N], [0, g0 D]] / (g2 D)
 * P: [[g0 D, 0], [g1 N, g2 D]] / (g0 D).
 * The load vector is [1,1] Vout; Vs = [1,1] [Vin, Rs Iin].
 * Multiplying backwards needs only two polynomials, rather than a symbolic
 * determinant or an expanded state matrix. Degree grows by one per L/C.
 */
function derive<T>(model: WdfModel, chain: Stage<T>[], math: Arithmetic<T>, rescale?: (values: T[][]) => T[][]): Polynomials<T> & { cancelled: { minus: number; plus: number } } {
  if (!chain.length) return {
    numerator: [math.multiply(math.constant(.5), portCoefficients(model.adaptors[0], math)[0])], denominator: [math.constant(1)],
    cancelled: { minus: 0, plus: 0 },
  };
  const poly = delayPolynomialMath(math);
  let voltage: DelayPolynomial<T> = { coefficients: [math.constant(1)], minus: 0, plus: 0 };
  let current = voltage, numerator = voltage;
  for (const { adaptor, gamma: [g0, g1, g2], num, den } of [...chain].reverse()) {
    const a = poly.scale(den, adaptor.kind === 'series' ? g2 : g0);
    const d = poly.scale(den, adaptor.kind === 'series' ? g0 : g2);
    const branch = poly.scale(num, g1);
    const v = poly.multiply(voltage, a), i = poly.multiply(current, d);
    const nextVoltage = adaptor.kind === 'series' ? poly.add(v, poly.multiply(current, branch)) : v;
    current = adaptor.kind === 'series' ? i : poly.add(i, poly.multiply(voltage, branch));
    voltage = nextVoltage;
    numerator = poly.multiply(numerator, a);
    if (rescale) {
      const scaled = rescale([voltage.coefficients, current.coefficients, numerator.coefficients]);
      [voltage, current, numerator] = [voltage, current, numerator].map((p, i) => ({ ...p, coefficients: scaled[i] }));
    }
  }
  const denominator = poly.add(voltage, current);
  const cancelled = { minus: Math.min(numerator.minus, denominator.minus), plus: Math.min(numerator.plus, denominator.plus) };
  const reduce = (p: DelayPolynomial<T>) => poly.expand({ ...p, minus: p.minus - cancelled.minus, plus: p.plus - cancelled.plus });
  return { numerator: reduce(numerator), denominator: reduce(denominator), cancelled };
}

const equationBundle = (groups: string[][]): EquationLatex => ({ groups, latex: groups.flat().join('\n\n') });
const aligned = (lines: string[]) => `\\begin{aligned}\n${lines.join('\\\\\n')}\n\\end{aligned}`;
const voltage = (input: boolean, delay: number) => `${input ? 'V_s' : 'V_{\\mathrm{out}}'}[n${delay ? `-${delay}` : ''}]`;

type EquationTerm = { coefficient: string; negative: boolean; delays: number[]; input: boolean };

/** Identical taps share their multiplier, including symmetric feedforward taps. */
function equationTerms(terms: EquationTerm[], approximate: boolean) {
  const combined = new Map<string, EquationTerm>();
  for (const term of terms) {
    const key = JSON.stringify([term.input, term.negative, term.coefficient]);
    const previous = combined.get(key);
    if (previous) previous.delays.push(...term.delays);
    else combined.set(key, { ...term, delays: [...term.delays] });
  }
  const parts = [...combined.values()].map((term, index) => {
    const samples = term.delays.map(delay => voltage(term.input, delay)).join('+');
    const signal = term.delays.length > 1 ? `\\left(${samples}\\right)` : samples;
    return `${term.negative ? '-' : index ? '+' : ''}${term.coefficient === '1' ? '' : `${term.coefficient}\\,`}${signal}`;
  });
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 2) lines.push(`${i ? '&\\quad ' : `${voltage(false, 0)}&${approximate ? '\\simeq' : '='}`}${parts.slice(i, i + 2).join(' ')}`);
  return aligned(lines.length ? lines : [`${voltage(false, 0)}&=0`]);
}

function scalarSymbolic(coefficients: Polynomials<Expression>, math: WdfExpressions): EquationLatex {
  let { numerator, denominator } = coefficients;
  const divisor = denominator[0];
  if (divisor.kind === 'constant') {
    const inverse = math.constant(1 / divisor.value);
    numerator = numerator.map(c => math.multiply(c, inverse));
    denominator = denominator.map(c => math.multiply(c, inverse));
  }
  const feedback = denominator.slice(1).map(c => math.multiply(math.constant(-1), c));
  const taps: { input: boolean; negative: boolean; magnitude: Expression; delay: number }[] = [];
  for (const [input, values] of [[false, feedback], [true, numerator]] as const) values.forEach((value, index) => {
    if (value.kind === 'constant' && value.value === 0) return;
    const negative = (value.kind === 'constant' || value.kind === 'product') && value.scale < 0;
    const magnitude = negative ? math.multiply(math.constant(-1), value) : value;
    taps.push({ input, negative, magnitude, delay: index + (input ? 0 : 1) });
  });
  const { names, definitions } = expressionGroups([...taps.map(t => t.magnitude), ...(divisor.kind === 'constant' ? [] : [divisor])]);
  const terms = taps.map(({ input, negative, magnitude, delay }): EquationTerm => {
    let coefficient = expressionLatex(magnitude, names);
    if (divisor.kind !== 'constant') coefficient = `\\frac{${coefficient}}{${expressionLatex(divisor, names)}}`;
    else if (magnitude.kind === 'sum' && !names.has(magnitude.id)) coefficient = `\\left(${coefficient}\\right)`;
    return { coefficient, negative, delays: [delay], input };
  });
  return equationBundle([[equationTerms(terms, false)], ...definitions.map(line => [aligned([line])])]);
}

function polynomialLatex(values: Expression[], names: Map<number, string> = new Map()): string {
  return values.flatMap((coefficient, k) => {
    if (coefficient.kind === 'constant' && coefficient.value === 0) return [];
    const negative = (coefficient.kind === 'constant' || coefficient.kind === 'product') && coefficient.scale < 0;
    const text = expressionLatex(coefficient, names);
    const q = k ? `q${k > 1 ? `^{${k}}` : ''}` : '';
    const term = k && coefficient.kind === 'constant' && Math.abs(coefficient.value) === 1 ? `${negative ? '-' : ''}${q}`
      : `${coefficient.kind === 'sum' && !names.has(coefficient.id) ? `\\left(${text}\\right)` : text}${q ? `\\,${q}` : ''}`;
    return [term];
  }).join('+').replace(/\+\-/g, '-') || '0';
}

function delayFactorsLatex(minus: number, plus: number): string[] {
  return [[minus, '-'], [plus, '+']].flatMap(([count, sign]) => Number(count) > 0
    ? [`\\left(1${sign}q\\right)${Number(count) > 1 ? `^{${count}}` : ''}`] : []);
}

function delayPolynomialLatex(value: DelayPolynomial<Expression>): string {
  const polynomial = polynomialLatex(value.coefficients), factors = delayFactorsLatex(value.minus, value.plus);
  if (!factors.length) return polynomial;
  if (polynomial !== '1') factors.unshift(`\\left(${polynomial}\\right)`);
  return factors.join('\\,');
}

/** For large filters keep the exact gamma dependence factored in polynomial
 * groups. Coefficient extraction defines every tap without exponential strings. */
function factoredSymbolic(chain: Stage<Expression>[], order: number, cancelled: { minus: number; plus: number }): EquationLatex {
  const definitions: string[] = [`q\\,x[n]=x[n-1],\\qquad F_{${chain.length + 1}}(q)=G_{${chain.length + 1}}(q)=1`];
  const factors = new Map<string, number>();
  const polynomials = new Map<string, string>();
  const polynomial = (value: DelayPolynomial<Expression>) => {
    const latex = delayPolynomialLatex(value);
    if (latex === '1') return '1';
    const existing = polynomials.get(latex);
    if (existing) return existing;
    const name = `\\Phi_{${polynomials.size + 1}}(q)`;
    polynomials.set(latex, name);
    definitions.push(`${name}=${latex}`);
    return name;
  };
  for (let index = chain.length - 1; index >= 0; index--) {
    const { adaptor, gamma, num, den } = chain[index], i = index + 1;
    const g = gamma.map(c => c.kind === 'sum' ? `\\left(${expressionLatex(c)}\\right)` : expressionLatex(c));
    const u = polynomial(num), w = polynomial(den);
    const factor = (gamma: string, polynomial: string) => gamma === '1' ? polynomial : polynomial === '1' ? gamma : `${gamma}\\,${polynomial}`;
    const a = factor(g[adaptor.kind === 'series' ? 2 : 0], w);
    const d = factor(g[adaptor.kind === 'series' ? 0 : 2], w);
    const branch = factor(g[1], u);
    definitions.push(aligned([
      `F_{${i}}(q)&=${a}F_{${i + 1}}(q)${adaptor.kind === 'series' ? `+${branch}G_{${i + 1}}(q)` : ''}`,
      `G_{${i}}(q)&=${d}G_{${i + 1}}(q)${adaptor.kind === 'parallel' ? `+${branch}F_{${i + 1}}(q)` : ''}`,
    ]));
    factors.set(a, (factors.get(a) ?? 0) + 1);
  }
  const numerator = [...factors].map(([factor, count]) => `\\left(${factor}\\right)${count > 1 ? `^{${count}}` : ''}`).join('\\,');
  const equation = `${voltage(false, 0)}=-\\sum_{k=1}^{${order}}\\frac{d_k}{d_0}\\,V_{\\mathrm{out}}[n-k]+\\sum_{k=0}^{${order}}\\frac{b_k}{d_0}\\,V_s[n-k]`;
  const common = delayFactorsLatex(cancelled.minus, cancelled.plus).join('\\,');
  const coefficients = aligned([
    ...(common ? [`E(q)&=${common}`] : []),
    `D(q)&=${common ? '\\frac{F_1(q)+G_1(q)}{E(q)}' : 'F_1(q)+G_1(q)'}`,
    `B(q)&=${common ? `\\frac{${numerator}}{E(q)}` : numerator}`,
    'd_k&=[q^k]D(q),\\qquad b_k=[q^k]B(q)',
  ]);
  return equationBundle([[equation], [coefficients], ...definitions.map(line => [line])]);
}

export function buildWdfEquation(model: WdfModel): WdfEquation {
  const numericStages = stages(model, numeric);
  const raw = derive(model, numericStages, numeric, values => {
    const scale = Math.max(...values.flat().map(Math.abs));
    if (!Number.isFinite(scale) || scale === 0) throw new Error('WDF equation: coefficient range exceeded.');
    return values.map(poly => poly.map(v => v / scale));
  });
  const lead = raw.denominator[0];
  const denominator = raw.denominator.map(v => v / lead), numerator = raw.numerator.map(v => v / lead);
  if (![...denominator, ...numerator].every(Number.isFinite)) throw new Error('WDF equation: coefficient range exceeded.');
  const order = denominator.length - 1;
  const math = new WdfExpressions(), symbolicStages = stages(model, math);
  if (order <= 6 && model.adaptors.length <= 12) {
    const coefficients = derive(model, symbolicStages, math);
    const scalar = scalarSymbolic(coefficients, math);
    const factored = symbolicStages.length ? factoredSymbolic(symbolicStages, order, raw.cancelled) : null;
    if (!factored || scalar.latex.length <= factored.latex.length) {
      return { numerator, denominator, order, coefficients, symbolic: scalar };
    }
    return { numerator, denominator, order, symbolic: factored };
  }
  return { numerator, denominator, order, symbolic: factoredSymbolic(symbolicStages, order, raw.cancelled) };
}

export function wdfNumberLatex(value: number, precision: ComponentPrecision = DEFAULT_COMPONENT_PRECISION, language: Language = 'en'): string {
  const rounded = precision === 'full' ? value : Number(value.toPrecision(precision));
  const [mantissa, exponent] = String(rounded).split('e');
  const decimal = language === 'de' ? mantissa.replace('.', '{,}') : mantissa;
  return exponent ? `${decimal}\\cdot 10^{${Number(exponent)}}` : decimal;
}

export function numericWdfEquation(equation: WdfEquation, precision: ComponentPrecision = DEFAULT_COMPONENT_PRECISION, language: Language = 'en'): EquationLatex {
  const terms: EquationTerm[] = [];
  for (const [input, values] of [[false, equation.denominator.slice(1).map(v => -v)], [true, equation.numerator]] as const) values.forEach((value, i) => {
    if (value === 0) return;
    terms.push({ input, negative: value < 0, coefficient: wdfNumberLatex(Math.abs(value), precision, language), delays: [i + (input ? 0 : 1)] });
  });
  return equationBundle([[equationTerms(terms, precision !== 'full')]]);
}
