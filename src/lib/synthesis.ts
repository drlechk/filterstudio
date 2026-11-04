import type { FilterSettings, Section } from './types';
import { MIN_RELATIVE_BANDWIDTH } from './frequency';
import { CAUER_ORDERS, CHEBYSHEV_II_ORDERS, MAX_PROTOTYPE_ORDER, cauerMinimumAttenuation, chebyshevIIMinimumAttenuation } from './filter-limits';

/** Normalized LC ladder synthesis. Frequencies are angular internally.
 * Elliptic prototype: Orfanidis, Introduction to Signal Processing, 2e, ch. 13,
 * https://eceweb1.rutgers.edu/~orfanidi/intro2sp/2e/orfanidis-isp2e-1up.pdf
 * Ladder topology: T. L. Wu, Microwave Filter Design, chapter 3, p. 14,
 * https://www.ntuemc.tw/upload/file/201103081523116f390.pdf
 */
export type SynthesisResult = { sections: Section[]; z2: number; notes: string[] };

function chebyshev(n: number, ripple: number): { g: number[]; load: number } {
  const beta = 2 * Math.asinh(1 / Math.sqrt(Math.expm1(ripple * Math.LN10 / 10)));
  const gamma = Math.sinh(beta / (2 * n));
  const a = Array.from({ length: n }, (_, i) => Math.sin((2 * i + 1) * Math.PI / (2 * n)));
  const g = [2 * a[0] / gamma];
  for (let i = 1; i < n; i++) {
    const b = gamma ** 2 + Math.sin(i * Math.PI / n) ** 2;
    g.push(4 * a[i - 1] * a[i] / (b * g[i - 1]));
  }
  return { g, load: n % 2 ? 1 : 1 / Math.tanh(beta / 4) ** 2 };
}

const add = (a: number[], b: number[]) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || 0) + (b[i] || 0));
function mul(a: number[], b: number[]) {
  const c = Array(a.length + b.length - 1).fill(0) as number[];
  a.forEach((v, i) => b.forEach((w, j) => { c[i + j] += v * w; }));
  return c;
}
export function ellipticK(m: number) {
  return ellipticKFromComplement(1 - m);
}
// Preserve tiny complementary parameters during the high-attenuation continuation.
function ellipticKFromComplement(complement: number) {
  let a = 1, b = Math.sqrt(complement);
  for (let i = 0; i < 24 && Math.abs(a - b) > 1e-16 * a; i++) {
    const next = (a + b) / 2; b = Math.sqrt(a * b); a = next;
  }
  return Math.PI / (2 * a);
}
function jacobi(u: number, m: number) {
  const a = [1], c = [Math.sqrt(m)];
  let b = Math.sqrt(1 - m), k = 0, pow = 1;
  while (Math.abs(c[k] / a[k]) > 1e-15 && k < 20) {
    const prev = a[k]; k++;
    c[k] = (prev - b) / 2; a[k] = (prev + b) / 2;
    b = Math.sqrt(prev * b); pow *= 2;
  }
  let phi = pow * a[k] * u;
  while (k > 0) { phi = (phi + Math.asin(Math.max(-1, Math.min(1, c[k] * Math.sin(phi) / a[k])))) / 2; k--; }
  const sn = Math.sin(phi), cn = Math.cos(phi);
  return { sn, cn, dn: Math.sqrt(1 - m * sn * sn) };
}

// Inverse sc with complementary parameter via real Landen descent.
function inverseSc(w: number, m: number) {
  let k = Math.sqrt(m), factor = 1, v = w;
  for (let i = 0; i < 20 && k > 1e-16; i++) {
    const complementary = Math.sqrt((1 - k) * (1 + k));
    const next = k * k / (1 + complementary) ** 2;
    v = 2 * v / ((1 + next) * (1 + Math.sqrt(1 + (k * v) ** 2)));
    factor *= 1 + next; k = next;
  }
  return factor * Math.asinh(v);
}

/** Real polynomial and finite positive transmission zeros of an odd elliptic prototype. */
export function ellipticPrototype(n: number, ripple: number, attenuation: number) {
  const eps2 = Math.expm1(ripple * Math.LN10 / 10);
  const m1 = eps2 / Math.expm1(attenuation * Math.LN10 / 10);
  const k1 = ellipticK(m1);
  const q = Math.exp(-Math.PI * ellipticKFromComplement(m1) / k1 / n);
  let top = 0, bottom = 1;
  for (let j = 0; j < 12; j++) top += q ** (j * (j + 1));
  for (let j = 1; j <= 12; j++) bottom += 2 * q ** (j * j);
  const m = 16 * q * (top / bottom) ** 4;
  const capK = ellipticK(m);
  const v0 = capK * inverseSc(1 / Math.sqrt(eps2), m1) / (n * k1);
  const v = jacobi(v0, 1 - m);
  let denominator = [1];
  const poles: { re: number; im: number }[] = [];
  const zeros: number[] = [];
  for (let j = 0; j < n; j += 2) {
    const x = jacobi(j * capK / n, m);
    const den = 1 - (x.dn * v.sn) ** 2;
    const re = -x.cn * x.dn * v.sn * v.cn / den;
    const im = -x.sn * v.dn / den;
    poles.push({ re, im });
    if (!j) denominator = mul(denominator, [-re, 1]);
    else {
      denominator = mul(denominator, [re * re + im * im, -2 * re, 1]);
      zeros.push(1 / (Math.sqrt(m) * x.sn));
    }
  }
  const scale = 2 / denominator[0];
  return {
    denominator: denominator.map(v => v * scale), zeros, stopbandRatio: 1 / Math.sqrt(m), poles,
    // Cluster samples near the passband edge where high-order elliptic extrema accumulate.
    passbandFrequencies: Array.from({ length: 4 * n + 1 }, (_, i) => jacobi(i * capK / (4 * n), m).sn),
  };
}

function ladderDenominator(values: number[], zeros: number[]) {
  let A = [1], B = [0], C = [0], D = [1];
  values.forEach((value, i) => {
    if (i % 2 === 0) {
      const y = [0, value];
      A = add(A, mul(B, y)); C = add(C, mul(D, y));
    } else {
      const z = zeros[(i - 1) / 2], d = [1, 0, 1 / (z * z)], b = [0, value];
      B = add(mul(A, b), mul(B, d)); D = add(mul(C, b), mul(D, d));
      A = mul(A, d); C = mul(C, d);
    }
  });
  return add(add(A, B), add(C, D));
}

function solveLinear(matrix: number[][], vector: number[]) {
  const a = matrix.map((row, i) => [...row, vector[i]]), n = vector.length;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let j = k + 1; j < n; j++) if (Math.abs(a[j][k]) > Math.abs(a[pivot][k])) pivot = j;
    [a[k], a[pivot]] = [a[pivot], a[k]];
    if (Math.abs(a[k][k]) < 1e-20) return null;
    for (let i = k + 1; i < n; i++) {
      const r = a[i][k] / a[k][k];
      for (let j = k; j <= n; j++) a[i][j] -= r * a[k][j];
    }
  }
  const x = Array(n).fill(0) as number[];
  for (let i = n - 1; i >= 0; i--) {
    x[i] = a[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= a[i][j] * x[j];
    x[i] /= a[i][i];
  }
  return x;
}

// Low-order positive component synthesis by matching ALL denominator coefficients.
function fitLadder(initial: number[], target: number[], zeros: number[]) {
  const n = initial.length;
  const residual = (x: number[]) => {
    const d = ladderDenominator(x.map(Math.exp), zeros);
    return target.slice(1).map((v, i) => ((d[i + 1] || 0) - v) / v);
  };
  const norm = (v: number[]) => v.reduce((s, x) => s + x * x, 0);
  let x = initial.map(Math.log), r = residual(x), score = norm(r), lambda = 1e-3;
  for (let iter = 0; iter < 240 && score > 1e-23; iter++) {
    const jac = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
    for (let j = 0; j < n; j++) {
      const next = [...x]; next[j] += 1e-5;
      const rn = residual(next);
      for (let i = 0; i < n; i++) jac[i][j] = (rn[i] - r[i]) / 1e-5;
    }
    const h = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
    const g = Array(n).fill(0) as number[];
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) h[j][k] += jac[i][j] * jac[i][k];
      for (let i = 0; i < n; i++) g[j] -= jac[i][j] * r[i];
      h[j][j] += lambda;
    }
    const step = solveLinear(h, g);
    if (!step) break;
    const next = x.map((v, i) => Math.max(-12, Math.min(8, v + step[i])));
    const rn = residual(next), sn = norm(rn);
    if (sn < score) { x = next; r = rn; score = sn; lambda = Math.max(1e-14, lambda / 3); }
    else lambda = Math.min(1e12, lambda * 8);
  }
  return { values: x.map(Math.exp), error: Math.sqrt(score) };
}

type ComplexPair = [number, number];
type EllipticPrototype = ReturnType<typeof ellipticPrototype>;
const complexMultiply = (a: ComplexPair, b: ComplexPair): ComplexPair => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const complexAdd = (a: ComplexPair, b: ComplexPair): ComplexPair => [a[0] + b[0], a[1] + b[1]];
const complexScale = (a: ComplexPair, b: number): ComplexPair => [a[0] * b, a[1] * b];

/** Evaluate the cleared ladder denominator directly, without expanded polynomials. */
function ladderDenominatorAt(values: number[], zeros: number[], omega: number): ComplexPair {
  let A: ComplexPair = [1, 0], B: ComplexPair = [0, 0], C: ComplexPair = [0, 0], D: ComplexPair = [1, 0];
  values.forEach((value, i) => {
    const branch: ComplexPair = [0, omega * value];
    if (i % 2 === 0) {
      A = complexAdd(A, complexMultiply(B, branch));
      C = complexAdd(C, complexMultiply(D, branch));
    } else {
      const ratio = omega / zeros[(i - 1) / 2], d = (1 - ratio) * (1 + ratio);
      B = complexAdd(complexMultiply(A, branch), complexScale(B, d));
      D = complexAdd(complexMultiply(C, branch), complexScale(D, d));
      A = complexScale(A, d); C = complexScale(C, d);
    }
  });
  return complexAdd(complexAdd(A, B), complexAdd(C, D));
}

function prototypeDenominatorAt(prototype: EllipticPrototype, omega: number): ComplexPair {
  let result: ComplexPair = [2, 0];
  for (const { re, im } of prototype.poles) {
    const factor: ComplexPair = im === 0 ? [1, omega / -re]
      : complexScale(complexMultiply([-re, omega - im], [-re, omega + im]), 1 / (re * re + im * im));
    result = complexMultiply(result, factor);
  }
  return result;
}

function relativeDenominatorError(actual: ComplexPair, target: ComplexPair): ComplexPair {
  const scale = target[0] ** 2 + target[1] ** 2;
  return [(actual[0] * target[0] + actual[1] * target[1]) / scale - 1, (actual[1] * target[0] - actual[0] * target[1]) / scale];
}

/** Match the complex denominator (magnitude AND phase) at more than n points.
 * Both denominators have degree n, so this is the same polynomial identity in
 * a better conditioned representation. Pole factors avoid cancellation near
 * the high-order passband extrema. Values are positive by log parametrization.
 */
function fitLadderResponse(initial: number[], prototype: EllipticPrototype, zeros: number[]) {
  const samples = prototype.passbandFrequencies.filter((_, i) => i % 2 === 0)
    .map(omega => ({ omega, target: prototypeDenominatorAt(prototype, omega) }));
  const residual = (x: number[]) => {
    const values = x.map(Math.exp);
    return samples.flatMap(({ omega, target }) => relativeDenominatorError(ladderDenominatorAt(values, zeros, omega), target));
  };
  const norm = (r: number[]) => r.reduce((sum, value) => sum + value * value, 0);
  const n = initial.length;
  let x = initial.map(Math.log), r = residual(x), score = norm(r), lambda = 1e-3;
  for (let iteration = 0; iteration < 600 && score > 1e-20; iteration++) {
    const columns = x.map((_, j) => {
      const next = [...x]; next[j] += 1e-5;
      const rn = residual(next);
      return r.map((value, i) => (rn[i] - value) / 1e-5);
    });
    const h = x.map((_, j) => x.map((_, k) => columns[j].reduce((sum, value, i) => sum + value * columns[k][i], 0) + (j === k ? lambda : 0)));
    const g = x.map((_, j) => -columns[j].reduce((sum, value, i) => sum + value * r[i], 0));
    for (let j = 0; j < n; j++) h[j][j] += lambda * Math.max(h[j][j], 1);
    const step = solveLinear(h, g);
    if (!step) break;
    const next = x.map((value, i) => Math.max(-12, Math.min(8, value + Math.max(-1, Math.min(1, step[i])))));
    const rn = residual(next), sn = norm(rn);
    if (sn < score) { x = next; r = rn; score = sn; lambda = Math.max(1e-14, lambda / 3); }
    else lambda = Math.min(1e12, lambda * 8);
  }
  return { values: x.map(Math.exp), error: Math.sqrt(score) };
}

function highOrderEllipticLadder(n: number, ripple: number, attenuation: number) {
  const target = ellipticPrototype(n, ripple, attenuation);
  // Interleaving the resonances gives a better initial path for high orders.
  const orders = [
    (zeros: number[]) => zeros.filter((_, i) => i % 2).concat(zeros.filter((_, i) => i % 2 === 0).reverse()),
    (zeros: number[]) => zeros,
    (zeros: number[]) => [...zeros].reverse(),
    (zeros: number[]) => zeros.filter((_, i) => i % 2 === 0).concat(zeros.filter((_, i) => i % 2).reverse()),
  ];
  for (const orderZeros of orders) {
    let values = chebyshev(n, ripple).g, converged = true;
    // Continue from a near-all-pole prototype; never return an intermediate design.
    for (let rs = 160; ; rs = Math.max(attenuation, rs - 5)) {
      const prototype = rs === attenuation ? target : ellipticPrototype(n, ripple, rs);
      const fit = fitLadderResponse(values, prototype, orderZeros(prototype.zeros));
      if (!Number.isFinite(fit.error) || fit.error > 1e-7) { converged = false; break; }
      values = fit.values;
      if (rs === attenuation) break;
    }
    if (!converged) continue;
    const zeros = orderZeros(target.zeros);
    // Validate also at interleaved points not used in fitting and across the stopband.
    const verification = [...target.passbandFrequencies, ...Array.from({ length: 41 }, (_, i) => target.stopbandRatio * 10 ** (i / 40))];
    if (verification.every(omega => {
      const error = relativeDenominatorError(ladderDenominatorAt(values, zeros, omega), prototypeDenominatorAt(target, omega));
      return Math.hypot(...error) < 2e-6;
    })) return { values, zeros, stopbandRatio: target.stopbandRatio };
  }
  throw new Error('Diese Cauer-Spezifikation konnte nicht zuverlässig synthetisiert werden. Bitte die Sperrdämpfung erhöhen oder den Grad verringern.');
}

const ellipticCache = new Map<string, { values: number[]; zeros: number[]; stopbandRatio: number }>();
function ellipticLadder(n: number, ripple: number, attenuation: number) {
  const key = `${n}/${ripple}/${attenuation}`;
  const cached = ellipticCache.get(key);
  if (cached) return cached;
  if (n > 7) {
    const result = highOrderEllipticLadder(n, ripple, attenuation);
    ellipticCache.set(key, result);
    return result;
  }
  const prototype = ellipticPrototype(n, ripple, attenuation);
  const base = chebyshev(n, ripple).g;
  let best = fitLadder(base, prototype.denominator, prototype.zeros);
  for (let attempt = 0; best.error > 1e-8 && attempt < 8; attempt++) {
    const start = base.map((v, i) => v * Math.exp(.65 * Math.sin((i + 1) * (attempt + 1) * 1.7)));
    const candidate = fitLadder(start, prototype.denominator, prototype.zeros);
    if (candidate.error < best.error) best = candidate;
  }
  if (best.error > 1e-7) throw new Error('Diese Cauer-Spezifikation konnte nicht zuverlässig synthetisiert werden. Bitte die Sperrdämpfung erhöhen oder den Grad verringern.');
  const result = { values: best.values, zeros: prototype.zeros, stopbandRatio: prototype.stopbandRatio };
  ellipticCache.set(key, result);
  return result;
}

/** Inverse Chebyshev poles and zeros, internally scaled to the 3 dB point.
 * The public reference frequency is the stopband edge, as in cheb2ap:
 * https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.cheb2ap.html
 */
function inverseChebyshevPrototype(n: number, attenuation: number): EllipticPrototype {
  const es = Math.sqrt(Math.expm1(attenuation * Math.LN10 / 10));
  const mu = Math.asinh(es) / n, stopbandRatio = Math.cosh(Math.acosh(es) / n);
  let denominator = [1];
  const poles: { re: number; im: number }[] = [], zeros: number[] = [];
  for (let j = 0; j < n; j += 2) {
    const theta = j * Math.PI / (2 * n);
    const real = -Math.sinh(mu) * Math.cos(theta), imaginary = Math.cosh(mu) * Math.sin(theta);
    const norm = real * real + imaginary * imaginary;
    const re = stopbandRatio * real / norm, im = -stopbandRatio * imaginary / norm;
    poles.push({ re, im });
    denominator = mul(denominator, j ? [re * re + im * im, -2 * re, 1] : [-re, 1]);
    if (j) zeros.push(stopbandRatio / Math.sin(theta));
  }
  return { poles, zeros, denominator: denominator.map(v => 2 * v / denominator[0]), stopbandRatio,
    passbandFrequencies: Array.from({ length: 4 * n + 1 }, (_, i) => i / (4 * n)) };
}

const polynomialAt = (p: number[], omega: number) => p.reduceRight<ComplexPair>(
  (value, coefficient) => complexAdd(complexMultiply(value, [0, omega]), [coefficient, 0]), [0, 0]);
const complexDivide = (a: ComplexPair, b: ComplexPair): ComplexPair => {
  const norm = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / norm, (a[1] * b[0] - a[0] * b[1]) / norm];
};
function removeResonance(p: number[], omega: number) {
  const remainder = [...p], quotient = Array<number>(p.length - 2).fill(0);
  for (let i = p.length - 1; i >= 2; i--) {
    quotient[i - 2] = remainder[i];
    remainder[i - 2] -= remainder[i] * omega * omega;
  }
  return quotient;
}
function* zeroOrders(zeros: number[]): Generator<number[]> {
  if (!zeros.length) { yield []; return; }
  for (const [i, zero] of zeros.entries())
    for (const rest of zeroOrders(zeros.filter((_, j) => i !== j))) yield [zero, ...rest];
}

/** Zero shifting: remove a shunt capacitance, then a series parallel-LC branch.
 * Y=(D+R)/(D-R), where the reflection numerator R is the leading term of D.
 * Extraction order matters: accept only positive values and verify the complete
 * complex denominator independently against its pole factors, not coefficients.
 */
function extractInverseChebyshev(prototype: EllipticPrototype, zeros: number[]) {
  let top = [...prototype.denominator], bottom = [...prototype.denominator];
  top[top.length - 1] *= 2; bottom.pop();
  const values: number[] = [];
  for (const omega of zeros) {
    const capacitance = complexDivide(polynomialAt(top, omega), polynomialAt(bottom, omega))[1] / omega;
    const residual = removeResonance(add(top, [0, ...bottom.map(v => -capacitance * v)]), omega);
    const inductance = complexDivide(polynomialAt(bottom, omega), complexMultiply([0, omega ** 3], polynomialAt(residual, omega)))[0];
    top = residual;
    bottom = removeResonance(add(bottom, [0, ...residual.map(v => -inductance * omega * omega * v)]), omega);
    const scale = Math.max(...top.map(Math.abs), ...bottom.map(Math.abs));
    top = top.map(v => v / scale); bottom = bottom.map(v => v / scale);
    values.push(capacitance, inductance);
  }
  values.push(top[1] / bottom[0]);
  return values;
}
const inverseChebyshevCache = new Map<string, { values: number[]; zeros: number[] }>();
function inverseChebyshevLadder(n: number, attenuation: number) {
  const key = `${n}/${attenuation}`, cached = inverseChebyshevCache.get(key);
  if (cached) return cached;
  const prototype = inverseChebyshevPrototype(n, attenuation);
  const verification = [...prototype.passbandFrequencies,
    ...Array.from({ length: 81 }, (_, i) => prototype.stopbandRatio * 10 ** (-2 + 4 * i / 80))];
  let best: { values: number[]; zeros: number[] } | undefined, bestError = Infinity;
  for (const zeros of zeroOrders([...prototype.zeros].reverse())) {
    const values = extractInverseChebyshev(prototype, zeros);
    if (!values.every(value => Number.isFinite(value) && value > 0)) continue;
    const error = Math.max(...verification.map(omega => Math.hypot(...relativeDenominatorError(
      ladderDenominatorAt(values, zeros, omega), prototypeDenominatorAt(prototype, omega)))));
    if (error < bestError) { best = { values, zeros }; bestError = error; }
    if (error < 1e-10) break;
  }
  if (!best || bestError > 1e-7) throw new Error('Diese Chebyshev-II-Spezifikation konnte nicht zuverlässig als passive LC-Leiter synthetisiert werden.');
  const result = { values: best.values.map(v => v * prototype.stopbandRatio), zeros: best.zeros.map(v => v / prototype.stopbandRatio) };
  inverseChebyshevCache.set(key, result);
  return result;
}

/** Wideband frequency transforms with p=s/ω0 and b=B/f0:
 * BP: q=(p²+1)/(bp); BS: q=bp/(p²+1).
 * https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.lp2bp.html
 * https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.lp2bs.html
 */
function bandTransform(section: Section, b: number, response: 'bandpass' | 'bandstop'): Section[] {
  const bp = response === 'bandpass';
  if (section.kind === 'L') {
    const inductance = bp ? section.value / b : section.value * b;
    return [{ ...section, kind: 'LC', value: inductance, value2: 1 / inductance, resonator: bp ? 'series' : 'parallel' }];
  }
  if (section.kind === 'C') {
    const capacitance = bp ? section.value / b : section.value * b;
    return [{ ...section, kind: 'LC', value: 1 / capacitance, value2: capacitance, resonator: bp ? 'parallel' : 'series' }];
  }
  if (section.kind === 'LC' && section.connection === 'series' && section.resonator === 'parallel') {
    // The Cauer branch Z(q)=Lq/(1+aq²), a=LC, becomes
    // Z(p)=kp(p²+1)/[(p²+ωlo²)(p²+ωhi²)]. Its Foster-I residues
    // Alo=k/(1+ωhi²), Ahi=k/(1+ωlo²) are strictly positive.
    // Thus two series-connected parallel LC blocks exactly realize Z(p).
    // Foster I: Storer, Passive Network Synthesis, chapter 3, pp. 16–17.
    // https://www.ee.iitb.ac.in/~belur/ee225/J-E-Storer-1957.pdf
    const a = section.value * section.value2!;
    const t = b * (bp ? 1 / Math.sqrt(a) : Math.sqrt(a));
    const high = (Math.hypot(t, 2) + t) / 2, low = 1 / high;
    const k = section.value * b / (bp ? a : 1);
    const lowResidue = k / (1 + high * high), highResidue = k / (1 + low * low);
    return [
      { ...section, value: highResidue, value2: 1 / lowResidue },
      { ...section, value: lowResidue, value2: 1 / highResidue },
    ];
  }
  throw new Error('Diese Prototyp-Struktur kann nicht als Bandfilter transformiert werden.');
}

export function synthesize(settings: FilterSettings): SynthesisResult {
  const { family, response, order: n, cutoff, impedance: z, ripple, attenuation } = settings;
  if (!Number.isInteger(n) || n < 1 || n > MAX_PROTOTYPE_ORDER) throw new Error('Der Filtergrad muss zwischen 1 und 20 liegen.');
  if (!(cutoff > 0) || !Number.isFinite(cutoff) || !(z > 0) || !Number.isFinite(z)) throw new Error('Frequenz und Impedanz müssen positiv sein.');
  if ((family === 'chebyshev' || family === 'cauer') && (!(ripple >= .01 && ripple <= 3) || !Number.isFinite(ripple))) throw new Error('Die Welligkeit muss zwischen 0,01 und 3 dB liegen.');
  const isBand = response === 'bandpass' || response === 'bandstop';
  const bandwidth = settings.bandwidth;
  if (isBand && (!(bandwidth! > 0) || !Number.isFinite(bandwidth))) throw new Error('Für Bandfilter muss eine endliche, positive Bandbreite in Hz angegeben werden.');
  const relativeBandwidth = isBand ? bandwidth! / cutoff : 0;
  if (isBand && (!Number.isFinite(relativeBandwidth) || relativeBandwidth < MIN_RELATIVE_BANDWIDTH * (1 - 1e-12))) throw new Error(`Die Bandbreite muss mindestens ${100 * MIN_RELATIVE_BANDWIDTH} % der Mittenfrequenz betragen.`);
  const omega = 2 * Math.PI * cutoff, notes: string[] = [];
  let sections: Section[], load = 1;
  if (family === 'chebyshev2') {
    if (!CHEBYSHEV_II_ORDERS.includes(n)) throw new Error('Die Chebyshev-II-Synthese unterstützt ungerade Grade von 1 bis 11.');
    if (!(attenuation >= chebyshevIIMinimumAttenuation(n) && attenuation <= 80)) throw new Error('Chebyshev II benötigt 20–80 dB Sperrdämpfung; ab Grad 5 mindestens 30 dB, ab Grad 7 mindestens 60 dB und bei Grad 11 genau 80 dB.');
    const inverse = inverseChebyshevLadder(n, attenuation);
    sections = inverse.values.map((v, i): Section => i % 2 === 0
      ? { id: `section-${i + 1}`, kind: 'C', connection: 'shunt', value: v }
      : { id: `section-${i + 1}`, kind: 'LC', connection: 'series', value: v, value2: 1 / (inverse.zeros[(i - 1) / 2] ** 2 * v), resonator: 'parallel' });
    notes.push('Inverser Chebyshev: monotoner Durchlassbereich und gleichmäßige Sperrbandwelligkeit.');
    if (n > 1) notes.push('LC-Resonatoren erzeugen endliche Übertragungsnullstellen.');
  } else if (family === 'cauer') {
    if (!CAUER_ORDERS.includes(n)) throw new Error('Die Cauer-Synthese unterstützt ungerade Grade von 3 bis 19.');
    if (!(attenuation >= 20 && attenuation <= 80)) throw new Error('Die Cauer-Sperrdämpfung muss zwischen 20 und 80 dB liegen.');
    if (attenuation < cauerMinimumAttenuation(n)) throw new Error('Cauer-Leiterstrukturen ab Grad 7 benötigen eine Sperrdämpfung zwischen 40 und 80 dB.');
    const ell = ellipticLadder(n, ripple, attenuation);
    sections = ell.values.map((v, i): Section => i % 2 === 0
      ? { id: `section-${i + 1}`, kind: 'C', connection: 'shunt', value: v }
      : { id: `section-${i + 1}`, kind: 'LC', connection: 'series', value: v, value2: 1 / (ell.zeros[(i - 1) / 2] ** 2 * v), resonator: 'parallel' });
    if (isBand) {
      const width = relativeBandwidth * (response === 'bandpass' ? ell.stopbandRatio : 1 / ell.stopbandRatio);
      const upper = (Math.hypot(width, 2) + width) / 2;
      notes.push(`Elliptische LC-Synthese mit endlichen Übertragungsnullstellen. Sperrbandgrenzen: ${(cutoff / upper).toPrecision(5)} Hz und ${(cutoff * upper).toPrecision(5)} Hz.`);
    } else notes.push(`Elliptische LC-Synthese mit endlichen Übertragungsnullstellen. Sperrbandgrenze: ${(response === 'lowpass' ? cutoff * ell.stopbandRatio : cutoff / ell.stopbandRatio).toPrecision(5)} Hz.`);
  } else {
    const g = family === 'butterworth'
      ? Array.from({ length: n }, (_, i) => 2 * Math.sin((2 * i + 1) * Math.PI / (2 * n)))
      : chebyshev(n, ripple).g;
    if (family === 'chebyshev') load = chebyshev(n, ripple).load;
    sections = g.map((v, i) => ({ id: `section-${i + 1}`, kind: i % 2 === 0 ? 'L' : 'C', connection: i % 2 === 0 ? 'series' : 'shunt', value: v }));
  }
  if (response === 'bandpass' || response === 'bandstop') {
    sections = sections.flatMap(section => bandTransform(section, relativeBandwidth, response));
    notes.push(`Tiefpass-Prototypgrad ${n}; resultierender Bandfiltergrad ${2 * n}. Mittenfrequenz f₀ = √(f₁f₂), Bandbreite B = f₂ − f₁.`);
  }
  sections = sections.map((s, i) => {
    let scaled = { ...s };
    if (response === 'highpass') {
      if (s.kind === 'L') scaled = { ...s, kind: 'C', value: 1 / s.value };
      else if (s.kind === 'C') scaled = { ...s, kind: 'L', value: 1 / s.value };
      else if (s.kind === 'LC') scaled = { ...s, value: 1 / s.value2!, value2: 1 / s.value };
    }
    if (scaled.kind === 'L') scaled.value *= z / omega;
    if (scaled.kind === 'C') scaled.value /= z * omega;
    if (scaled.kind === 'LC') { scaled.value *= z / omega; scaled.value2! /= z * omega; }
    if (!(scaled.value > 0) || !Number.isFinite(scaled.value) || (scaled.kind === 'LC' && (!(scaled.value2! > 0) || !Number.isFinite(scaled.value2)))) {
      throw new Error('Die gewählten Frequenz- und Impedanzwerte überschreiten den numerischen Bereich der Bauteilsynthese.');
    }
    scaled.id = `section-${i + 1}`;
    scaled.label = `${scaled.kind}${i + 1}`;
    return scaled;
  });
  if (family === 'chebyshev2') notes.push(isBand ? 'Die beiden Bandgrenzen bezeichnen die Sperrbandgrenzen bei −Rs dB.' : 'Die Grenzfrequenz bezeichnet die Sperrbandgrenze bei −Rs dB.');
  else if (isBand) notes.push(family === 'butterworth' ? 'Die beiden Bandgrenzen liegen bei −3,0103 dB.' : 'Die beiden Bandgrenzen liegen bei −Rp dB; die Sperrdämpfung wird innerhalb des Sperrbereichs erreicht.');
  else if (family === 'butterworth') notes.push('Die Grenzfrequenz bezeichnet den −3,0103-dB-Punkt.');
  else notes.push('Die Grenzfrequenz bezeichnet die Durchlassbandgrenze bei −Rp dB.');
  if (load !== 1) notes.push('Gerader Chebyshev-Grad: Der Ausgangsabschluss wird für die spezifizierte Welligkeit angepasst.');
  return { sections, z2: z * load, notes };
}
