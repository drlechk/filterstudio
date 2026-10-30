import { describe, expect, it } from 'vitest';
import { analyzeNetwork, decibels, evaluateNetwork, evaluateRational, magnitude, polyMultiply, sweepNetwork, type Complex } from './network';
import type { Section } from './types';

const PI2 = 2 * Math.PI;
const closeComplex = (actual: Complex, expected: Complex, precision = 10) => {
  expect(actual.re).toBeCloseTo(expected.re, precision);
  expect(actual.im).toBeCloseTo(expected.im, precision);
};
const section = (kind: Section['kind'], connection: Section['connection'], value: number, value2?: number, resonator?: Section['resonator']): Section =>
  ({ id: `${kind}-${connection}`, kind, connection, value, value2, resonator });

describe('ABCD and power-wave S analysis', () => {
  it('returns an ideal through connection with identical ports', () => {
    const n = analyzeNetwork([], { fRef: 1e6, z1: 50 });
    const s = n.evaluate(0);
    closeComplex(s.s21, { re: 1, im: 0 });
    closeComplex(s.s12, s.s21);
    closeComplex(s.s11, { re: 0, im: 0 });
    closeComplex(s.s22, { re: 0, im: 0 });
  });

  it('normalizes waves correctly at an unequal-impedance junction', () => {
    const s = evaluateNetwork([], 1e6, 50, 100);
    closeComplex(s.s11, { re: 1 / 3, im: 0 });
    closeComplex(s.s22, { re: -1 / 3, im: 0 });
    closeComplex(s.s21, { re: 2 * Math.sqrt(2) / 3, im: 0 });
    expect(magnitude(s.s21) ** 2 + magnitude(s.s11) ** 2).toBeCloseTo(1, 12);
  });

  it('has the expected insertion loss and reflection for a series resistor', () => {
    const s = evaluateNetwork([section('R', 'series', 50)], 1e6, 50);
    closeComplex(s.s21, { re: 2 / 3, im: 0 });
    closeComplex(s.s11, { re: 1 / 3, im: 0 });
    expect(magnitude(s.s21) ** 2 + magnitude(s.s11) ** 2).toBeLessThan(1);
  });

  it('agrees with the analytic third-order Butterworth polynomial and magnitude', () => {
    const fc = 1e6, z = 50, w = PI2 * fc;
    const sections = [section('L', 'series', z / w), section('C', 'shunt', 2 / (w * z)), section('L', 'series', z / w)];
    const n = analyzeNetwork(sections, { fRef: fc, z1: z });
    expect(n.denominator).toEqual([1, 2, 2, 1]);
    expect(n.numerators.s21).toEqual([1]);
    for (const ratio of [0, 0.01, 0.1, 0.5, 1, 2, 10, 100]) {
      const s = n.evaluate(ratio * fc);
      expect(magnitude(s.s21) ** 2).toBeCloseTo(1 / (1 + ratio ** 6), 12);
      expect(magnitude(s.s21) ** 2 + magnitude(s.s11) ** 2).toBeCloseTo(1, 12);
    }
    expect(decibels(n.evaluate(fc).s21)).toBeCloseTo(-3.01029995664, 8);
  });

  it('supports high-pass capacitor/inductor sections and their DC limit', () => {
    const fc = 1e6, z = 50, w = PI2 * fc;
    const n = analyzeNetwork([section('C', 'series', 1 / (w * z)), section('L', 'shunt', z / (2 * w)), section('C', 'series', 1 / (w * z))], { fRef: fc, z1: z });
    for (const ratio of [0, 0.1, 0.5, 1, 10]) {
      expect(magnitude(n.evaluate(ratio * fc).s21) ** 2).toBeCloseTo(ratio ** 6 / (1 + ratio ** 6), 12);
    }
    expect(n.numerators.s21).toEqual([0, 0, 0, 1]);
  });

  it('uses cascade order: L then C has a different reflection than C then L', () => {
    const a = section('L', 'series', 50), b = section('C', 'shunt', 0.02);
    const first = evaluateNetwork([a, b], 1 / PI2, 50);
    const reversed = evaluateNetwork([b, a], 1 / PI2, 50);
    closeComplex(first.s21, reversed.s21);
    closeComplex(first.s11, reversed.s22);
    expect(magnitude({ re: first.s11.re - reversed.s11.re, im: first.s11.im - reversed.s11.im })).toBeGreaterThan(0.5);
  });

  it('produces exact finite transmission zeros for both resonator orientations', () => {
    const series = evaluateNetwork([section('LC', 'series', 1, 1, 'parallel')], 1 / PI2, 1);
    const shunt = evaluateNetwork([section('LC', 'shunt', 1, 1, 'series')], 1 / PI2, 1);
    closeComplex(series.s21, { re: 0, im: 0 });
    closeComplex(series.s11, { re: 1, im: 0 });
    closeComplex(shunt.s21, { re: 0, im: 0 });
    closeComplex(shunt.s11, { re: -1, im: 0 });
  });

  it('resolves removable singularities of coincident ideal resonators', () => {
    const r = section('LC', 'series', 1, 1, 'parallel');
    const s = evaluateNetwork([r, r], 1 / PI2, 1);
    closeComplex(s.s21, { re: 0, im: 0 });
    closeComplex(s.s11, { re: 1, im: 0 });
  });

  it('keeps a 24-section ideal circuit finite throughout the extreme UI frequency range', () => {
    for (const fRef of [1, 1e12]) {
      const value = 1 / (PI2 * fRef);
      const sections = Array.from({ length: 24 }, () => section('LC', 'series', value, value, 'parallel'));
      const n = analyzeNetwork(sections, { fRef, z1: 1 });
      for (const frequency of [.001, 1, 10, 1e6, 1e12, 1e15]) {
        const s = n.evaluate(frequency);
        for (const entry of [s.s11, s.s12, s.s21, s.s22]) {
          expect(Number.isFinite(entry.re)).toBe(true);
          expect(Number.isFinite(entry.im)).toBe(true);
        }
        const omega = frequency / fRef;
        if (omega === 1) {
          // The local Taylor limit removes the 23 common resonance factors.
          expect(magnitude(s.s21)).toBeLessThan(1e-12);
          expect(s.s11.re).toBeCloseTo(1, 10);
        } else {
          // 24 identical series impedances are exactly Z = 24 jω/(1−ω²).
          const reactance = 24 * omega / (1 - omega * omega);
          closeComplex(s.s21, { re: 4 / (4 + reactance * reactance), im: -2 * reactance / (4 + reactance * reactance) });
        }
        expect(magnitude(s.s11) ** 2 + magnitude(s.s21) ** 2).toBeCloseTo(1, 10);
      }
    }
  });

  it('retains representable tiny transmission even when individual polynomial powers overflow', () => {
    // At p=j 10^15, p²/p²² = 10^-300; p²² alone is unrepresentable.
    const den = Array(23).fill(0) as number[]; den[22] = 1;
    const result = evaluateRational({ num: [0, 0, 1], den }, 1e15);
    expect(result.re).toBeGreaterThan(0);
    expect(result.re / 1e-300).toBeCloseTo(1, 12);
    expect(result.im).toBe(0);
    // Scaling coefficients first by their global maximum would lose the
    // constant here, although it dominates at this small normalized frequency.
    const wide = [1e-300, ...Array<number>(23).fill(0), 1e300];
    const same = evaluateRational({ num: wide, den: wide.map(v => 2 * v) }, 1e-30);
    closeComplex(same, { re: .5, im: 0 });
  });

  it('evaluates narrow band cascades from their sections despite cancelling global coefficients', () => {
    const order = 9, fRef = 1e6, w = PI2 * fRef, bandwidth = .001;
    const g = Array.from({ length: order }, (_, i) => 2 * Math.sin((2 * i + 1) * Math.PI / (2 * order)));
    const low = analyzeNetwork(g.map((v, i) => section(i % 2 ? 'C' : 'L', i % 2 ? 'shunt' : 'series', v / w)), { fRef, z1: 1 });
    const band = analyzeNetwork(g.map((v, i) => i % 2
      ? section('LC', 'shunt', bandwidth / (v * w), v / (bandwidth * w), 'parallel')
      : section('LC', 'series', v / (bandwidth * w), bandwidth / (v * w), 'series')), { fRef, z1: 1 });
    const upper = (Math.hypot(bandwidth, 2) + bandwidth) / 2;
    for (const ratio of [1 / upper, .9998, 1, 1.0002, upper]) {
      const mapped = (ratio - 1 / ratio) / bandwidth;
      const expected = low.evaluate(Math.abs(mapped) * fRef), actual = band.evaluate(ratio * fRef);
      for (const key of ['s11', 's12', 's21', 's22'] as const) {
        closeComplex(actual[key], { re: expected[key].re, im: Math.sign(mapped) * expected[key].im }, 8);
      }
      expect(magnitude(actual.s21) ** 2 + magnitude(actual.s11) ** 2).toBeCloseTo(1, 12);
    }
  });

  it('interpolates logarithmic sweeps without forming max/min', () => {
    const through = analyzeNetwork([], { fRef: 1, z1: 50 });
    const sweep = sweepNetwork(through, 1e-300, 1e300, 3);
    expect(sweep.map(v => v.frequency)).toEqual([1e-300, 1, 1e300]);
    for (const point of sweep) closeComplex(point.s21, { re: 1, im: 0 });
  });

  it('preserves reciprocity and unitarity for mixed reactive sections and unequal ports', () => {
    const sections = [section('C', 'series', 4e-9), section('L', 'shunt', 2e-6), section('LC', 'series', 3e-6, 1e-9, 'parallel'), section('LC', 'shunt', 5e-6, 2e-9, 'series')];
    const n = analyzeNetwork(sections, { fRef: 1e6, z1: 50, z2: 75 });
    for (const s of sweepNetwork(n, 1e4, 1e8, 257)) {
      closeComplex(s.s12, s.s21);
      expect(magnitude(s.s11) ** 2 + magnitude(s.s21) ** 2).toBeCloseTo(1, 10);
      expect(magnitude(s.s22) ** 2 + magnitude(s.s12) ** 2).toBeCloseTo(1, 10);
      const orthogonalReal = s.s11.re * s.s12.re + s.s11.im * s.s12.im + s.s21.re * s.s22.re + s.s21.im * s.s22.im;
      const orthogonalImag = s.s11.re * s.s12.im - s.s11.im * s.s12.re + s.s21.re * s.s22.im - s.s21.im * s.s22.re;
      expect(orthogonalReal).toBeCloseTo(0, 10); expect(orthogonalImag).toBeCloseTo(0, 10);
    }
  });

  it('does not depend on the chosen normalization frequency', () => {
    const sections = [section('LC', 'series', 8e-6, 6e-9, 'series'), section('LC', 'shunt', 2e-6, 5e-9, 'parallel')];
    const a = analyzeNetwork(sections, { fRef: 1e5, z1: 50 });
    const b = analyzeNetwork(sections, { fRef: 1e7, z1: 50 });
    for (const f of [0, 1e4, 1e5, 1e6, 1e7]) closeComplex(a.evaluate(f).s21, b.evaluate(f).s21);
  });

  it('emits usable LaTeX and rejects nonphysical input', () => {
    const n = analyzeNetwork([section('L', 'series', 1e-6)], { fRef: 1e6, z1: 50 });
    expect(n.latex.abcd).toContain('\\begin{pmatrix}');
    expect(n.latex.abcd).toContain('\\mathbf{M}(p)');
    expect(n.latex.sections[0]).toContain('\\mathbf{M}_{1}(p)');
    expect(n.latex.s).toContain('\\mathbf{S}(p)');
    expect(n.latex.sections).toHaveLength(1);
    expect(() => analyzeNetwork([section('C', 'shunt', 0)], { fRef: 1e6, z1: 50 })).toThrow();
    expect(() => analyzeNetwork([], { fRef: 1e6, z1: 0 })).toThrow();
    expect(() => sweepNetwork(n, 1e6, 1e3)).toThrow();
    expect(polyMultiply([1, 2], [1, 3])).toEqual([1, 5, 6]);
  });
});
