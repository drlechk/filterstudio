import { describe, expect, it } from 'vitest';
import { synthesize, ellipticPrototype } from './synthesis';
import { analyzeNetwork, decibels, magnitude, polyAdd, polyMultiply, type Polynomial } from './network';
import type { FilterSettings } from './types';
import { MIN_RELATIVE_BANDWIDTH } from './frequency';

const defaults: FilterSettings = { family: 'butterworth', response: 'lowpass', order: 5, cutoff: 1e6, impedance: 50, ripple: .5, attenuation: 40 };
const make = (settings: Partial<FilterSettings>) => {
  const s = { ...defaults, ...settings }, result = synthesize(s);
  return { result, network: analyzeNetwork(result.sections, { fRef: s.cutoff, z1: s.impedance, z2: result.z2 }) };
};

describe('passive analog synthesis', () => {
  it('agrees with the Butterworth power response at all supported orders', () => {
    for (let order = 1; order <= 10; order++) {
      const { network } = make({ order });
      for (const ratio of [0, .1, .5, .8, 1, 1.5, 3, 10]) {
        expect(magnitude(network.evaluate(ratio * defaults.cutoff).s21) ** 2).toBeCloseTo(1 / (1 + ratio ** (2 * order)), 9);
      }
    }
  });

  it('matches Chebyshev I including the unequal termination of even orders', () => {
    for (let order = 1; order <= 10; order++) for (const ripple of [.1, .5, 3]) {
      const { network, result } = make({ family: 'chebyshev', order, ripple });
      expect(result.z2 >= defaults.impedance).toBe(true);
      if (order % 2) expect(result.z2).toBe(defaults.impedance);
      for (const ratio of [0, .1, .3, .6, .8, 1, 1.5, 3]) {
        const t = ratio <= 1 ? Math.cos(order * Math.acos(ratio)) : Math.cosh(order * Math.acosh(ratio));
        const expected = 1 / (1 + Math.expm1(ripple * Math.LN10 / 10) * t * t);
        expect(magnitude(network.evaluate(ratio * defaults.cutoff).s21) ** 2).toBeCloseTo(expected, 8);
      }
    }
  });

  it('matches published 5th-order elliptic LC prototype values', () => {
    // T. L. Wu / Hong: rp=.1 dB, Ωs=1.4085, rs=39.5947 dB.
    const r = synthesize({ ...defaults, family: 'cauer', cutoff: 1 / (2 * Math.PI), impedance: 1, ripple: .1, attenuation: 39.5947 });
    const expected = [1.0058, 1.1862, 1.5771, .8638, .7578];
    r.sections.forEach((s, i) => expect(s.value).toBeCloseTo(expected[i], 3));
    expect(r.sections[1].value2).toBeCloseTo(.1816, 3);
    expect(r.sections[3].value2).toBeCloseTo(.5436, 3);
  });

  it('realizes elliptic ripple, finite transmission zeros, and stopband attenuation', () => {
    for (const order of [3, 5, 7]) for (const ripple of [.1, .5, 3]) for (const attenuation of [40, 80]) {
      const { network } = make({ family: 'cauer', order, ripple, attenuation });
      const prototype = ellipticPrototype(order, ripple, attenuation);
      expect(network.denominator.length - 1).toBe(order);
      expect(decibels(network.evaluate(defaults.cutoff).s21)).toBeCloseTo(-ripple, 4);
      expect(decibels(network.evaluate(defaults.cutoff * prototype.stopbandRatio).s21)).toBeCloseTo(-attenuation, 3);
      for (let i = 0; i <= 80; i++) {
        const point = network.evaluate(defaults.cutoff * i / 80);
        expect(decibels(point.s21)).toBeGreaterThanOrEqual(-ripple - .0001);
        expect(decibels(point.s21)).toBeLessThanOrEqual(.0001);
        expect(magnitude(point.s21) ** 2 + magnitude(point.s11) ** 2).toBeCloseTo(1, 7);
      }
      for (const zero of prototype.zeros) expect(magnitude(network.evaluate(zero * defaults.cutoff).s21)).toBeLessThan(1e-8);
      for (let i = 0; i <= 40; i++) {
        const ratio = prototype.stopbandRatio * 10 ** (i / 40);
        expect(decibels(network.evaluate(ratio * defaults.cutoff).s21)).toBeLessThanOrEqual(-attenuation + .001);
      }
    }
  });

  it('produces positive finite components across the advertised Cauer parameter range', () => {
    for (const order of [3, 5, 7]) for (const ripple of [.1, .2, .3, .5, .7, 1, 1.5, 2, 2.5, 3]) for (const attenuation of [order === 7 ? 40 : 20, 45, 50, 60, 70, 80]) {
      const r = synthesize({ ...defaults, family: 'cauer', order, ripple, attenuation });
      expect(r.sections).toHaveLength(order);
      for (const s of r.sections) {
        expect(Number.isFinite(s.value) && s.value > 0).toBe(true);
        if (s.kind === 'LC') expect(Number.isFinite(s.value2) && s.value2! > 0).toBe(true);
      }
    }
  });

  it('maps low-pass magnitude to high-pass by frequency inversion for every family', () => {
    for (const family of ['butterworth', 'chebyshev', 'cauer'] as const) for (const order of [3, 5, 7]) {
      const low = make({ family, order, response: 'lowpass' }).network;
      const high = make({ family, order, response: 'highpass' }).network;
      expect(magnitude(high.evaluate(0).s21)).toBe(0);
      for (const ratio of [.01, .1, .3, .8, 1, 1.2, 3, 10, 100]) {
        expect(magnitude(high.evaluate(ratio * defaults.cutoff).s21)).toBeCloseTo(magnitude(low.evaluate(defaults.cutoff / ratio).s21), 8);
      }
    }
  });

  it('rejects unsupported or invalid requests explicitly', () => {
    expect(() => synthesize({ ...defaults, cutoff: 0 })).toThrow();
    expect(() => synthesize({ ...defaults, order: 1.5 })).toThrow();
    expect(() => synthesize({ ...defaults, family: 'chebyshev', ripple: 0 })).toThrow();
    expect(() => synthesize({ ...defaults, family: 'cauer', order: 4 })).toThrow();
    expect(() => synthesize({ ...defaults, family: 'cauer', order: 7, attenuation: 20 })).toThrow();
  });

  it('maps every complex S-parameter through the exact band transformation', () => {
    const keys = ['s11', 's12', 's21', 's22'] as const;
    for (const family of ['butterworth', 'chebyshev', 'cauer'] as const) {
      const orders = family === 'cauer' ? [3, 5, 7] : [1, 4, 7, 10];
      for (const order of orders) for (const b of [MIN_RELATIVE_BANDWIDTH, .005, .05, .2, 1, 4]) for (const response of ['bandpass', 'bandstop'] as const) {
        const low = make({ family, order }).network;
        const band = make({ family, order, response, bandwidth: b * defaults.cutoff }).network;
        const upper = (Math.hypot(b, 2) + b) / 2, lower = 1 / upper;
        for (const ratio of [.05, .3, .7, lower, lower * 1.001, .9999, 1.0001, upper * .999, upper, 1.2, 2, 5, 20]) {
          const mapped = response === 'bandpass' ? (ratio - 1 / ratio) / b : b * ratio / (1 - ratio * ratio);
          const expected = low.evaluate(Math.abs(mapped) * defaults.cutoff);
          const actual = band.evaluate(ratio * defaults.cutoff);
          for (const key of keys) {
            expect(actual[key].re, `${family} n=${order} ${response} b=${b} r=${ratio} ${key}.re`).toBeCloseTo(expected[key].re, 7);
            expect(actual[key].im, `${family} n=${order} ${response} b=${b} r=${ratio} ${key}.im`).toBeCloseTo(Math.sign(mapped) * expected[key].im, 7);
          }
          expect(magnitude(actual.s21) ** 2 + magnitude(actual.s11) ** 2).toBeCloseTo(1, 8);
        }
      }
    }
  });

  it('places band edges and center correctly and preserves even-Chebyshev terminations', () => {
    for (const family of ['butterworth', 'chebyshev', 'cauer'] as const) for (const response of ['bandpass', 'bandstop'] as const) {
      const order = family === 'cauer' ? 7 : 8;
      const low = make({ family, order });
      const b = MIN_RELATIVE_BANDWIDTH;
      const { network, result } = make({ family, order, response, bandwidth: b * defaults.cutoff });
      const upper = (Math.hypot(b, 2) + b) / 2;
      for (const ratio of [1 / upper, upper]) {
        expect(decibels(network.evaluate(ratio * defaults.cutoff).s21)).toBeCloseTo(family === 'butterworth' ? -10 * Math.log10(2) : -defaults.ripple, 5);
      }
      expect(result.z2).toBe(low.result.z2);
      if (response === 'bandpass') {
        expect(magnitude(network.evaluate(0).s21)).toBeLessThan(1e-9);
        expect(magnitude(network.evaluate(defaults.cutoff).s21)).toBeCloseTo(magnitude(low.network.evaluate(0).s21), 8);
        expect(magnitude(network.evaluate(defaults.cutoff * 1e5).s21)).toBeLessThan(1e-6);
      } else {
        expect(magnitude(network.evaluate(defaults.cutoff).s21)).toBeLessThan(1e-8);
        expect(magnitude(network.evaluate(0).s21)).toBeCloseTo(magnitude(low.network.evaluate(0).s21), 8);
        expect(magnitude(network.evaluate(defaults.cutoff * 1e5).s21)).toBeCloseTo(magnitude(low.network.evaluate(0).s21), 8);
      }
    }
  });

  it('realizes both Cauer notch pairs and the bandstop center zero', () => {
    for (const order of [3, 5, 7]) for (const response of ['bandpass', 'bandstop'] as const) for (const b of [MIN_RELATIVE_BANDWIDTH, .005, .05, .5, 3]) {
      const { network, result } = make({ family: 'cauer', order, response, bandwidth: b * defaults.cutoff });
      expect(new Set(result.sections.map(s => s.id)).size).toBe(result.sections.length);
      expect(result.sections).toHaveLength(order + Math.floor(order / 2));
      for (const zero of ellipticPrototype(order, defaults.ripple, defaults.attenuation).zeros) {
        const width = b * (response === 'bandpass' ? zero : 1 / zero);
        const upper = (Math.hypot(width, 2) + width) / 2;
        for (const ratio of [1 / upper, upper]) expect(magnitude(network.evaluate(ratio * defaults.cutoff).s21)).toBeLessThan(1e-8);
      }
      if (response === 'bandstop') expect(magnitude(network.evaluate(defaults.cutoff).s21)).toBeLessThan(1e-8);
      for (const section of result.sections) {
        expect(section.kind).toBe('LC');
        expect(section.value > 0 && Number.isFinite(section.value)).toBe(true);
        expect(section.value2! > 0 && Number.isFinite(section.value2)).toBe(true);
      }
    }
  });

  it('matches independently substituted S polynomials up to removable factors', () => {
    const power = (p: Polynomial, n: number) => {
      let result = [1];
      for (let i = 0; i < n; i++) result = polyMultiply(result, p);
      return result;
    };
    const substitute = (p: Polynomial, top: Polynomial, bottom: Polynomial, degree: number) =>
      p.reduce((sum, coefficient, k) => polyAdd(sum, polyMultiply(power(top, k), power(bottom, degree - k)).map(v => v * coefficient)), [0]);
    for (const family of ['butterworth', 'chebyshev', 'cauer'] as const) for (const response of ['bandpass', 'bandstop'] as const) {
      // Unit relative bandwidth keeps this coefficient identity well-conditioned;
      // the complex-response test separately exercises the minimum width through b=4.
      const order = family === 'cauer' ? 7 : 10, b = 1;
      const low = make({ family, order }).network;
      const band = make({ family, order, response, bandwidth: b * defaults.cutoff }).network;
      const top = response === 'bandpass' ? [1, 0, 1] : [0, b];
      const bottom = response === 'bandpass' ? [0, b] : [1, 0, 1];
      const expectedDenominator = substitute(low.denominator, top, bottom, order);
      expect(expectedDenominator).toHaveLength(2 * order + 1);
      for (const key of ['s11', 's12', 's21', 's22'] as const) {
        const expectedNumerator = substitute(low.numerators[key], top, bottom, order);
        const left = polyMultiply(expectedNumerator, band.denominator);
        const right = polyMultiply(band.numerators[key], expectedDenominator);
        const scale = Math.max(...left.map(Math.abs), ...right.map(Math.abs));
        const residual = Math.max(...Array.from({ length: Math.max(left.length, right.length) }, (_, i) => Math.abs((left[i] || 0) - (right[i] || 0))));
        expect(residual / scale, `${family} ${response} ${key}`).toBeLessThan(1e-10);
      }
    }
  });

  it('requires finite, positive and supported bandwidth only for band filters', () => {
    for (const response of ['bandpass', 'bandstop'] as const) {
      for (const bandwidth of [undefined, 0, -1, NaN, Infinity, .98 * MIN_RELATIVE_BANDWIDTH * defaults.cutoff]) {
        expect(() => synthesize({ ...defaults, response, bandwidth })).toThrow();
      }
      expect(() => synthesize({ ...defaults, response, bandwidth: MIN_RELATIVE_BANDWIDTH * defaults.cutoff })).not.toThrow();
    }
    expect(() => synthesize({ ...defaults, bandwidth: undefined })).not.toThrow();
  });

  it('preserves the band response under frequency and impedance scaling', () => {
    for (const family of ['butterworth', 'chebyshev', 'cauer'] as const) for (const response of ['bandpass', 'bandstop'] as const) {
      const order = family === 'cauer' ? 5 : 4;
      const reference = make({ family, response, order, bandwidth: defaults.cutoff / 3 }).network;
      for (const [cutoff, impedance] of [[1e3, 25], [1e9, 75]]) {
        const scaled = make({ family, response, order, cutoff, impedance, bandwidth: cutoff / 3 }).network;
        for (const ratio of [.2, .8, .99, 1.01, 1.2, 5]) {
          const expected = reference.evaluate(ratio * defaults.cutoff), actual = scaled.evaluate(ratio * cutoff);
          for (const key of ['s11', 's12', 's21', 's22'] as const) {
            expect(actual[key].re).toBeCloseTo(expected[key].re, 10);
            expect(actual[key].im).toBeCloseTo(expected[key].im, 10);
          }
        }
      }
    }
  });
});
