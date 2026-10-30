import type { FilterSettings, Section } from './types';
import { MIN_RELATIVE_BANDWIDTH } from './frequency';

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
  let a = 1, b = Math.sqrt(1 - m);
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
  const q = Math.exp(-Math.PI * ellipticK(1 - m1) / k1 / n);
  let top = 0, bottom = 1;
  for (let j = 0; j < 12; j++) top += q ** (j * (j + 1));
  for (let j = 1; j <= 12; j++) bottom += 2 * q ** (j * j);
  const m = 16 * q * (top / bottom) ** 4;
  const capK = ellipticK(m);
  const v0 = capK * inverseSc(1 / Math.sqrt(eps2), m1) / (n * k1);
  const v = jacobi(v0, 1 - m);
  let denominator = [1];
  const zeros: number[] = [];
  for (let j = 0; j < n; j += 2) {
    const x = jacobi(j * capK / n, m);
    const den = 1 - (x.dn * v.sn) ** 2;
    const re = -x.cn * x.dn * v.sn * v.cn / den;
    const im = -x.sn * v.dn / den;
    if (!j) denominator = mul(denominator, [-re, 1]);
    else {
      denominator = mul(denominator, [re * re + im * im, -2 * re, 1]);
      zeros.push(1 / (Math.sqrt(m) * x.sn));
    }
  }
  const scale = 2 / denominator[0];
  return { denominator: denominator.map(v => v * scale), zeros, stopbandRatio: 1 / Math.sqrt(m) };
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

// Positive component synthesis by matching ALL denominator coefficients, not
// sampled magnitudes. Every accepted network is checked against the prototype.
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

const ellipticCache = new Map<string, { values: number[]; zeros: number[]; stopbandRatio: number }>();
function ellipticLadder(n: number, ripple: number, attenuation: number) {
  const key = `${n}/${ripple}/${attenuation}`;
  const cached = ellipticCache.get(key);
  if (cached) return cached;
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
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('Der Filtergrad muss zwischen 1 und 10 liegen.');
  if (!(cutoff > 0) || !Number.isFinite(cutoff) || !(z > 0) || !Number.isFinite(z)) throw new Error('Frequenz und Impedanz müssen positiv sein.');
  if (family !== 'butterworth' && (!(ripple >= .01 && ripple <= 3) || !Number.isFinite(ripple))) throw new Error('Die Welligkeit muss zwischen 0,01 und 3 dB liegen.');
  const isBand = response === 'bandpass' || response === 'bandstop';
  const bandwidth = settings.bandwidth;
  if (isBand && (!(bandwidth! > 0) || !Number.isFinite(bandwidth))) throw new Error('Für Bandfilter muss eine endliche, positive Bandbreite in Hz angegeben werden.');
  const relativeBandwidth = isBand ? bandwidth! / cutoff : 0;
  if (isBand && (!Number.isFinite(relativeBandwidth) || relativeBandwidth < MIN_RELATIVE_BANDWIDTH * (1 - 1e-12))) throw new Error(`Die Bandbreite muss mindestens ${100 * MIN_RELATIVE_BANDWIDTH} % der Mittenfrequenz betragen.`);
  const omega = 2 * Math.PI * cutoff, notes: string[] = [];
  let sections: Section[], load = 1;
  if (family === 'cauer') {
    if (![3, 5, 7].includes(n)) throw new Error('Die Cauer-Synthese unterstützt die ungeraden Grade 3, 5 und 7.');
    if (!(attenuation >= 20 && attenuation <= 80)) throw new Error('Die Cauer-Sperrdämpfung muss zwischen 20 und 80 dB liegen.');
    if (n === 7 && attenuation < 40) throw new Error('Die Cauer-Leiterstruktur 7. Grades benötigt eine Sperrdämpfung zwischen 40 und 80 dB.');
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
  if (isBand) notes.push(family === 'butterworth' ? 'Die beiden Bandgrenzen liegen bei −3,0103 dB.' : 'Die beiden Bandgrenzen liegen bei −Rp dB; die Sperrdämpfung wird innerhalb des Sperrbereichs erreicht.');
  else if (family === 'butterworth') notes.push('Die Grenzfrequenz bezeichnet den −3,0103-dB-Punkt.');
  else notes.push('Die Grenzfrequenz bezeichnet die Durchlassbandgrenze bei −Rp dB.');
  if (load !== 1) notes.push('Gerader Chebyshev-Grad: Der Ausgangsabschluss wird für die spezifizierte Welligkeit angepasst.');
  return { sections, z2: z * load, notes };
}
