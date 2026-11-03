import type { Section } from './types';

/** Coefficients in ascending powers of p = s / (2 pi fRef). */
export type Polynomial = number[];
export type Rational = { num: Polynomial; den: Polynomial };
export type Complex = { re: number; im: number };
export type Scattering<T> = { s11: T; s12: T; s21: T; s22: T };
export type ChainMatrix<T> = { A: T; B: T; C: T; D: T };
export type NumericNetwork = Scattering<Complex> & { abcd: ChainMatrix<Complex> };
export type NetworkAnalysis = {
  fRef: number;
  z1: number;
  z2: number;
  abcd: ChainMatrix<Rational>;
  scattering: Scattering<Rational>;
  denominator: Polynomial;
  numerators: Scattering<Polynomial>;
  characteristic: Rational;
  lossless: boolean;
  latex: { abcd: string; s: string; numerators: Scattering<string>; denominator: string; sections: string[]; characteristic: string; characteristicResponse?: string };
  evaluate: (frequency: number) => NumericNetwork;
};

const TAU = 2 * Math.PI;
const trim = (a: Polynomial): Polynomial => {
  const b = a.slice();
  while (b.length > 1 && b[b.length - 1] === 0) b.pop();
  return b.length ? b : [0];
};
export const polyAdd = (a: Polynomial, b: Polynomial): Polynomial =>
  trim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || 0) + (b[i] || 0)));
export const polyScale = (a: Polynomial, k: number): Polynomial => trim(a.map((v) => v * k));
export const polyMultiply = (a: Polynomial, b: Polynomial): Polynomial => {
  const c = Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) c[i + j] += a[i] * b[j];
  return trim(c);
};

const cmul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cadd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cscale = (a: Complex, scale: number): Complex => ({ re: a.re * scale, im: a.im * scale });
const cdivideScalar = (a: Complex, divisor: number): Complex => ({ re: a.re / divisor, im: a.im / divisor });
export const magnitude = (a: Complex): number => Math.hypot(a.re, a.im);
export const decibels = (a: Complex, floor = -160): number => Math.max(floor, 20 * Math.log10(magnitude(a)));
export const phaseDegrees = (a: Complex): number => Math.atan2(a.im, a.re) * 180 / Math.PI;
export function evaluatePolynomial(a: Polynomial, p: Complex): Complex {
  let result: Complex = { re: 0, im: 0 };
  for (let i = a.length - 1; i >= 0; i--) {
    result = cmul(result, p);
    result.re += a[i];
  }
  return result;
}

type ScaledPolynomialValue = Complex & { exponent: number; bound: number };

/** x = mantissa * 2^exponent, also for subnormal and near-MAX_VALUE inputs. */
function binaryParts(x: number): { mantissa: number; exponent: number } {
  if (x === 0) return { mantissa: 0, exponent: 0 };
  const exponent = Math.max(-1074, Math.min(1023, Math.floor(Math.log2(Math.abs(x)))));
  return { mantissa: x / 2 ** exponent, exponent };
}

/**
 * Horner on the imaginary axis with a separate binary exponent. The absolute
 * coefficient bound controls scaling, so cancellation does not itself cause
 * overflow. No intermediate p^degree or enormous polynomial value is formed.
 */
function scaledPolynomial(a: Polynomial, omega: number): ScaledPolynomialValue {
  if (omega === 0) {
    const v = binaryParts(a[0]);
    return { re: v.mantissa, im: 0, exponent: v.exponent, bound: Math.abs(v.mantissa) };
  }
  const w = binaryParts(omega);
  let value: ScaledPolynomialValue = { re: 0, im: 0, exponent: 0, bound: 0 };
  for (let i = a.length - 1; i >= 0; i--) {
    const coefficient = binaryParts(a[i]);
    const productExponent = value.exponent + w.exponent;
    const exponent = value.bound === 0 ? coefficient.exponent : coefficient.mantissa === 0 ? productExponent : Math.max(productExponent, coefficient.exponent);
    const productScale = value.bound === 0 ? 0 : 2 ** (productExponent - exponent);
    const coefficientScale = coefficient.mantissa === 0 ? 0 : 2 ** (coefficient.exponent - exponent);
    const re = -value.im * w.mantissa * productScale + coefficient.mantissa * coefficientScale;
    const im = value.re * w.mantissa * productScale;
    const bound = value.bound * Math.abs(w.mantissa) * productScale + Math.abs(coefficient.mantissa) * coefficientScale;
    const shift = bound === 0 ? 0 : Math.floor(Math.log2(bound));
    value = { re: re / 2 ** shift, im: im / 2 ** shift, bound: bound / 2 ** shift, exponent: exponent + shift };
  }
  return value;
}

function scaleBinary(value: number, exponent: number): number {
  if (value === 0) return value;
  // Splitting keeps a representable subnormal result from being lost when
  // 2^exponent alone would round to zero (and likewise avoids early overflow).
  while (exponent > 1023) { value *= 2 ** 1023; exponent -= 1023; }
  while (exponent < -1022) { value *= 2 ** -1022; exponent += 1022; }
  return value * 2 ** exponent;
}

function scaledDivide(numerator: ScaledPolynomialValue, denominator: ScaledPolynomialValue): Complex {
  const n = magnitude(numerator), d = magnitude(denominator);
  if (d === 0) return { re: Number.NaN, im: Number.NaN };
  if (n === 0) return { re: 0, im: 0 };
  const np = binaryParts(n), dp = binaryParts(d);
  const exponent = numerator.exponent - denominator.exponent + np.exponent - dp.exponent;
  const amplitude = np.mantissa / dp.mantissa;
  const nr = numerator.re / n, ni = numerator.im / n, dr = denominator.re / d, di = denominator.im / d;
  return {
    re: scaleBinary(amplitude * (nr * dr + ni * di), exponent),
    im: scaleBinary(amplitude * (ni * dr - nr * di), exponent),
  };
}

type NumericSection = { connection: Section['connection']; num: Polynomial; den: Polynomial };
const scaledComplex = (value: Complex, exponent = 0): ScaledPolynomialValue => ({ ...value, exponent, bound: magnitude(value) });
const zeroComplex = (): Complex => ({ re: 0, im: 0 });
const isZero = (value: Complex) => value.re === 0 && value.im === 0;

function multiplyScaled(a: ScaledPolynomialValue, b: ScaledPolynomialValue): ScaledPolynomialValue {
  if (isZero(a) || isZero(b)) return scaledComplex(zeroComplex());
  const am = binaryParts(magnitude(a)), bm = binaryParts(magnitude(b));
  const result = cmul(cdivideScalar(a, 2 ** am.exponent), cdivideScalar(b, 2 ** bm.exponent));
  return scaledComplex(result, a.exponent + b.exponent + am.exponent + bm.exponent);
}

/**
 * Numerical response is evaluated from the original sections, not the expanded
 * global polynomial. Narrow-band transforms have strongly cancelling global
 * coefficients around their center frequency, even though each local two-port
 * is well conditioned. Cleared local denominators also avoid infinite Z/Y at
 * ideal resonances; independent binary exponents protect the cascade scale.
 */
function evaluateSections(sections: NumericSection[], omega: number, z1: number, z2: number): NumericNetwork {
  let a: Complex = { re: 1, im: 0 }, b = zeroComplex(), c = zeroComplex(), d = { re: 1, im: 0 };
  let exponent = 0, q = scaledComplex({ re: 1, im: 0 });
  for (const section of sections) {
    const numerator = scaledPolynomial(section.num, omega), denominator = scaledPolynomial(section.den, omega);
    const localExponent = Math.max(numerator.exponent, denominator.exponent);
    const n = cscale(numerator, 2 ** (numerator.exponent - localExponent));
    const v = cscale(denominator, 2 ** (denominator.exponent - localExponent));
    const aq = cmul(a, v), bq = cmul(b, v), cq = cmul(c, v), dq = cmul(d, v);
    if (section.connection === 'series') {
      b = cadd(cmul(a, n), bq); d = cadd(cmul(c, n), dq); a = aq; c = cq;
    } else {
      a = cadd(aq, cmul(b, n)); c = cadd(cq, cmul(d, n)); b = bq; d = dq;
    }
    const largest = Math.max(magnitude(a), magnitude(b), magnitude(c), magnitude(d));
    // Coincident ideal resonances can give an all-zero cleared matrix. Its
    // local Taylor limit retains the cancelled factors without frequency nudges.
    if (largest === 0) return evaluateSectionLimit(sections, omega, z1, z2);
    const shift = binaryParts(largest).exponent;
    a = cdivideScalar(a, 2 ** shift); b = cdivideScalar(b, 2 ** shift);
    c = cdivideScalar(c, 2 ** shift); d = cdivideScalar(d, 2 ** shift);
    exponent += localExponent + shift;
    q = multiplyScaled(q, denominator);
  }
  const ratio = z2 / z1, ar = cscale(a, ratio), cr = cscale(c, ratio);
  const delta = cadd(cadd(ar, b), cadd(cr, d));
  if (isZero(delta)) return evaluateSectionLimit(sections, omega, z1, z2);
  const s11 = scaledDivide(scaledComplex(cadd(cadd(ar, b), cscale(cadd(cr, d), -1))), scaledComplex(delta));
  const s22 = scaledDivide(scaledComplex(cadd(cadd(cscale(ar, -1), b), cadd(cscale(cr, -1), d))), scaledComplex(delta));
  const transmission = scaledDivide(scaledComplex(cscale(q, 2 * Math.sqrt(ratio)), q.exponent), scaledComplex(delta, exponent));
  const physical = (value: Complex, unit: number) => scaledDivide(scaledComplex(cscale(value, unit), exponent), q);
  return { s11, s12: transmission, s21: transmission, s22, abcd: { A: physical(a, 1), B: physical(b, z1), C: physical(c, 1 / z1), D: physical(d, 1) } };
}

type ComplexPolynomial = Complex[];
const cpAdd = (a: ComplexPolynomial, b: ComplexPolynomial): ComplexPolynomial =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => cadd(a[i] ?? zeroComplex(), b[i] ?? zeroComplex()));
const cpScale = (a: ComplexPolynomial, scale: number) => a.map(v => cscale(v, scale));
function cpMultiply(a: ComplexPolynomial, b: ComplexPolynomial): ComplexPolynomial {
  const result = Array.from({ length: a.length + b.length - 1 }, zeroComplex);
  a.forEach((v, i) => b.forEach((w, j) => { result[i + j] = cadd(result[i + j], cmul(v, w)); }));
  return result;
}

/** Exact-frequency limit about p=jω, used only for coincident ideal poles. */
function evaluateSectionLimit(sections: NumericSection[], omega: number, z1: number, z2: number): NumericNetwork {
  let a: ComplexPolynomial = [{ re: 1, im: 0 }], b = [zeroComplex()], c = [zeroComplex()], d = [{ re: 1, im: 0 }], q = [{ re: 1, im: 0 }];
  for (const section of sections) {
    const scale = Math.max(...section.num.map(Math.abs), ...section.den.map(Math.abs));
    const taylor = (coefficients: Polynomial): ComplexPolynomial => {
      const [v0 = 0, v1 = 0, v2 = 0] = coefficients.map(v => v / scale);
      return [{ re: v0 - v2 * omega * omega, im: v1 * omega }, { re: v1, im: 2 * v2 * omega }, { re: v2, im: 0 }];
    };
    const n = taylor(section.num), v = taylor(section.den);
    const aq = cpMultiply(a, v), bq = cpMultiply(b, v), cq = cpMultiply(c, v), dq = cpMultiply(d, v);
    if (section.connection === 'series') {
      b = cpAdd(cpMultiply(a, n), bq); d = cpAdd(cpMultiply(c, n), dq); a = aq; c = cq;
    } else {
      a = cpAdd(aq, cpMultiply(b, n)); c = cpAdd(cq, cpMultiply(d, n)); b = bq; d = dq;
    }
    q = cpMultiply(q, v);
    while ([a, b, c, d, q].every(p => p.length > 1 && isZero(p[0]))) {
      a = a.slice(1); b = b.slice(1); c = c.slice(1); d = d.slice(1); q = q.slice(1);
    }
    const largest = Math.max(...[a, b, c, d, q].flat().map(magnitude));
    const shift = 2 ** binaryParts(largest).exponent;
    const rescale = (p: ComplexPolynomial) => p.map(v => cdivideScalar(v, shift));
    a = rescale(a); b = rescale(b); c = rescale(c); d = rescale(d); q = rescale(q);
  }
  const ratio = z2 / z1, ar = cpScale(a, ratio), cr = cpScale(c, ratio);
  const delta = cpAdd(cpAdd(ar, b), cpAdd(cr, d));
  const quotient = (n: ComplexPolynomial, den: ComplexPolynomial): Complex => {
    if (n.every(isZero)) return zeroComplex();
    let i = 0;
    while (i < Math.min(n.length, den.length) - 1 && isZero(n[i]) && isZero(den[i])) i++;
    return scaledDivide(scaledComplex(n[i] ?? zeroComplex()), scaledComplex(den[i] ?? zeroComplex()));
  };
  const transmission = quotient(cpScale(q, 2 * Math.sqrt(ratio)), delta);
  return {
    s11: quotient(cpAdd(cpAdd(ar, b), cpScale(cpAdd(cr, d), -1)), delta),
    s12: transmission, s21: transmission,
    s22: quotient(cpAdd(cpAdd(cpScale(ar, -1), b), cpAdd(cpScale(cr, -1), d)), delta),
    abcd: { A: quotient(a, q), B: quotient(cpScale(b, z1), q), C: quotient(cpScale(c, 1 / z1), q), D: quotient(d, q) },
  };
}

/** Remove removable powers of p without approximate polynomial root cancellation. */
const rational = (num: Polynomial, den: Polynomial): Rational => {
  let n = trim(num), d = trim(den);
  if (n.length === 1 && n[0] === 0) return { num: [0], den: [1] };
  while (n[0] === 0 && d[0] === 0 && n.length > 1 && d.length > 1) {
    n = n.slice(1); d = d.slice(1);
  }
  return { num: n, den: d };
};
export function evaluateRational(r: Rational, omega: number): Complex {
  if (!Number.isFinite(omega)) throw new Error('Die normierte Frequenz muss endlich sein.');
  let n = r.num, d = r.den;
  if (n.every((v) => v === 0)) return { re: 0, im: 0 };
  // Cascading coincident ideal resonators can retain a common non-p factor.
  // Evaluate its removable 0/0 limit rather than introducing a fake notch gap.
  while (true) {
    const numerator = scaledPolynomial(n, omega);
    const denominator = scaledPolynomial(d, omega);
    if (n.length > 1 && d.length > 1 && magnitude(numerator) <= 2e-14 * numerator.bound && magnitude(denominator) <= 2e-14 * denominator.bound) {
      const degree = Math.max(n.length, d.length) - 1;
      const derivative = (p: Polynomial) => p.slice(1).map((v, i) => v * ((i + 1) / degree));
      n = derivative(n); d = derivative(d);
    } else return scaledDivide(numerator, denominator);
  }
}

function positive(value: number, name: string) {
  if (!(value > 0) || !Number.isFinite(value)) throw new Error(`${name} muss eine endliche, positive Zahl sein.`);
}

/** Z for a series section, Y for a shunt section; all values are SI. */
function sectionImmittance(section: Section, fRef: number): Rational {
  positive(section.value, 'Bauteilwert');
  if (section.connection !== 'series' && section.connection !== 'shunt') throw new Error('Unbekannte Zweigart.');
  const w = TAU * fRef;
  let z: Rational;
  switch (section.kind) {
    case 'R': z = { num: [section.value], den: [1] }; break;
    case 'L': z = { num: [0, w * section.value], den: [1] }; break;
    case 'C': z = { num: [1], den: [0, w * section.value] }; break;
    case 'LC': {
      positive(section.value2 ?? NaN, 'Kapazität');
      const l = w * section.value, c = w * section.value2!;
      if (section.resonator === 'parallel') z = { num: [0, l], den: [1, 0, l * c] };
      else if (section.resonator === 'series') z = { num: [1, 0, l * c], den: [0, c] };
      else throw new Error('Für einen LC-Zweig muss die Resonatorart angegeben sein.');
      break;
    }
    default: throw new Error('Unbekanntes Bauelement.');
  }
  return section.connection === 'series' ? z : { num: z.den, den: z.num };
}

function coefficientLatex(value: number, digits = 7): string {
  const rounded = Number(value.toPrecision(digits));
  const text = String(rounded);
  if (!text.includes('e')) return text;
  const [base, exponent] = text.split('e');
  return `${base}\\cdot 10^{${Number(exponent)}}`;
}

export function polynomialLatex(coefficients: Polynomial, variable = 'p', digits = 7): string {
  const terms: string[] = [];
  for (let i = coefficients.length - 1; i >= 0; i--) {
    const value = coefficients[i];
    if (value === 0) continue;
    const absolute = Math.abs(value);
    const coefficient = i > 0 && absolute === 1 ? '' : coefficientLatex(absolute, digits);
    const power = i === 0 ? '' : i === 1 ? variable : `${variable}^{${i}}`;
    terms.push(`${terms.length ? value < 0 ? ' - ' : ' + ' : value < 0 ? '-' : ''}${coefficient}${power}`);
  }
  return terms.join('') || '0';
}

export function rationalLatex(value: Rational): string {
  if (value.den.length === 1 && value.den[0] === 1) return polynomialLatex(value.num);
  return `\\frac{${polynomialLatex(value.num)}}{${polynomialLatex(value.den)}}`;
}

const matrixLatex = (a: string, b: string, c: string, d: string) =>
  `\\begin{pmatrix}${a} & ${b} \\\\ ${c} & ${d}\\end{pmatrix}`;

/**
 * Cascades reciprocal passive two-ports using [V1,I1]^T = M [V2,-I2]^T,
 * where both port currents I1/I2 are defined INTO the network. S uses real,
 * positive power-wave reference impedances. Algebraic polynomial arithmetic
 * uses floating-point coefficients; no response fitting is involved. The
 * numerical response independently cascades the original sections to avoid
 * cancellation in expanded narrow-band polynomials.
 *
 * Reference: Michael Steer, Microwave and RF Design III, §§2.2, 2.7.
 * https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_III_-_Networks_(Steer)/02%3A_Chapter_2/2.7%3A_Scattering_Parameter_Two-Port_Relationships
 */
export function analyzeNetwork(sections: Section[], options: { fRef: number; z1: number; z2?: number }): NetworkAnalysis {
  const { fRef, z1 } = options, z2 = options.z2 ?? z1;
  positive(fRef, 'Bezugsfrequenz'); positive(z1, 'Eingangsimpedanz'); positive(z2, 'Ausgangsimpedanz');
  let a = [1], b = [0], c = [0], d = [1], q = [1];
  const sectionLatex: string[] = [];
  const numericSections: NumericSection[] = [];
  for (const [index, section] of sections.entries()) {
    const v = sectionImmittance(section, fRef);
    numericSections.push({ connection: section.connection, num: polyScale(v.num, section.connection === 'series' ? 1 / z1 : z1), den: v.den });
    const aq = polyMultiply(a, v.den), bq = polyMultiply(b, v.den);
    const cq = polyMultiply(c, v.den), dq = polyMultiply(d, v.den);
    if (section.connection === 'series') {
      b = polyAdd(bq, polyMultiply(a, v.num));
      d = polyAdd(dq, polyMultiply(c, v.num));
      a = aq; c = cq;
      sectionLatex.push(`\\mathbf{M}_{${index + 1}}(p)=${matrixLatex('1', rationalLatex(v), '0', '1')}`);
    } else {
      a = polyAdd(aq, polyMultiply(b, v.num));
      c = polyAdd(cq, polyMultiply(d, v.num));
      b = bq; d = dq;
      sectionLatex.push(`\\mathbf{M}_{${index + 1}}(p)=${matrixLatex('1', '0', rationalLatex(v), '1')}`);
    }
    q = polyMultiply(q, v.den);
    // Pure p factors can otherwise accumulate for adjacent capacitive/inductive sections.
    while ([a, b, c, d, q].every((p) => p[0] === 0)) {
      a = a.length > 1 ? a.slice(1) : a;
      b = b.length > 1 ? b.slice(1) : b;
      c = c.length > 1 ? c.slice(1) : c;
      d = d.length > 1 ? d.slice(1) : d;
      q = q.slice(1);
    }
  }
  const az2 = polyScale(a, z2), cz1z2 = polyScale(c, z1 * z2), dz1 = polyScale(d, z1);
  let denominator = polyAdd(polyAdd(az2, b), polyAdd(cz1z2, dz1));
  let s11 = polyAdd(polyAdd(az2, b), polyScale(polyAdd(cz1z2, dz1), -1));
  let s22 = polyAdd(polyAdd(polyScale(az2, -1), b), polyAdd(polyScale(cz1z2, -1), dz1));
  let transmission = polyScale(q, 2 * Math.sqrt(z1 * z2));
  // These sections all have det(M)=1, hence S12=S21 for arbitrary real Z1,Z2.
  while ([denominator, s11, s22, transmission].every((p) => p[0] === 0)) {
    denominator = denominator.slice(1);
    s11 = s11.length > 1 ? s11.slice(1) : s11;
    s22 = s22.length > 1 ? s22.slice(1) : s22;
    transmission = transmission.length > 1 ? transmission.slice(1) : transmission;
  }
  const divisor = denominator[0] || denominator[denominator.length - 1];
  denominator = polyScale(denominator, 1 / divisor);
  const numerators = { s11: polyScale(s11, 1 / divisor), s12: polyScale(transmission, 1 / divisor), s21: polyScale(transmission, 1 / divisor), s22: polyScale(s22, 1 / divisor) };
  if (![a, b, c, d, q, denominator, ...Object.values(numerators)].every((p) => p.every(Number.isFinite))) {
    throw new Error('Der Wertebereich ist für eine stabile Polynomrechnung zu groß. Bezugsfrequenz oder Bauteilwerte anpassen.');
  }
  const abcd = { A: rational(a, q), B: rational(b, q), C: rational(c, q), D: rational(d, q) };
  const scattering = {
    s11: rational(numerators.s11, denominator), s12: rational(numerators.s12, denominator),
    s21: rational(numerators.s21, denominator), s22: rational(numerators.s22, denominator),
  };
  // Ψ = S11/S21 is defined by the actual network, including unequal port references.
  // The common scattering denominator cancels. Only a lossless network additionally
  // satisfies |S21|² = 1/(1+|Ψ|²) on the imaginary frequency axis.
  const characteristic = rational(numerators.s11, numerators.s21);
  const lossless = sections.every(section => section.kind !== 'R');
  const latex = {
    abcd: `\\mathbf{M}(p)=${matrixLatex(rationalLatex(abcd.A), rationalLatex(abcd.B), rationalLatex(abcd.C), rationalLatex(abcd.D))}`,
    s: `\\mathbf{S}(p)=\\frac{1}{D(p)}${matrixLatex('N_{1,1}(p)', 'N_{1,2}(p)', 'N_{2,1}(p)', 'N_{2,2}(p)')}`,
    numerators: {
      s11: `N_{1,1}(p)=${polynomialLatex(numerators.s11)}`,
      s12: `N_{1,2}(p)=${polynomialLatex(numerators.s12)}`,
      s21: `N_{2,1}(p)=${polynomialLatex(numerators.s21)}`,
      s22: `N_{2,2}(p)=${polynomialLatex(numerators.s22)}`,
    },
    denominator: `D(p)=${polynomialLatex(denominator)}`,
    sections: sectionLatex,
    characteristic: `\\begin{gathered}\\Psi(p)=\\frac{S_{11}(p)}{S_{21}(p)}=\\frac{N_{11}(p)}{N_{21}(p)}\\\\\\Psi(p)=${rationalLatex(characteristic)}\\end{gathered}`,
    ...(lossless ? { characteristicResponse: '\\begin{gathered}p=jx,\\quad x=f/f_0\\\\|S_{21}(jx)|^2=\\frac{1}{1+|\\Psi(jx)|^2},\\qquad |S_{11}(jx)|^2=\\frac{|\\Psi(jx)|^2}{1+|\\Psi(jx)|^2}\\\\A(f)=10\\log_{10}\\!\\left(1+|\\Psi(jf/f_0)|^2\\right)\\,\\mathrm{dB}\\end{gathered}' } : {}),
  };
  return {
    fRef, z1, z2, abcd, scattering, denominator, numerators, characteristic, lossless, latex,
    evaluate(frequency: number): NumericNetwork {
      if (frequency < 0 || !Number.isFinite(frequency)) throw new Error('Die Frequenz muss endlich und nicht negativ sein.');
      const omega = frequency / fRef;
      if (!Number.isFinite(omega)) throw new Error('Die normierte Frequenz muss endlich sein.');
      return evaluateSections(numericSections, omega, z1, z2);
    },
  };
}

export function evaluateNetwork(sections: Section[], frequency: number, z1: number, z2 = z1): NumericNetwork {
  return analyzeNetwork(sections, { fRef: frequency > 0 ? frequency : 1, z1, z2 }).evaluate(frequency);
}

export function sweepNetwork(analysis: NetworkAnalysis, min: number, max: number, points = 401): (NumericNetwork & { frequency: number })[] {
  positive(min, 'Startfrequenz'); positive(max, 'Endfrequenz');
  if (max <= min || !Number.isInteger(points) || points < 2 || points > 10001) throw new Error('Ungültiger Frequenzbereich oder ungültige Anzahl von Stützstellen (2–10001).');
  const logMin = Math.log(min), span = Math.log(max) - logMin;
  return Array.from({ length: points }, (_, index) => {
    const frequency = index === 0 ? min : index === points - 1 ? max : Math.exp(logMin + span * index / (points - 1));
    return { frequency, ...analysis.evaluate(frequency) };
  });
}

export function formatEngineering(value: number, unit = '', digits = 4, locale?: string): string {
  if (!Number.isFinite(value)) return `${value} ${unit}`.trim();
  if (value === 0) return `0 ${unit}`.trim();
  const exponent = Math.max(-12, Math.min(12, Math.floor(Math.log10(Math.abs(value)) / 3) * 3));
  const prefixes: Record<number, string> = { [-12]: 'p', [-9]: 'n', [-6]: 'µ', [-3]: 'm', 0: '', 3: 'k', 6: 'M', 9: 'G', 12: 'T' };
  const rounded = Number((value / 10 ** exponent).toPrecision(digits));
  const formatted = locale ? rounded.toLocaleString(locale, { maximumSignificantDigits: digits, useGrouping: false }) : String(rounded);
  return `${formatted} ${prefixes[exponent]}${unit}`.trim();
}
