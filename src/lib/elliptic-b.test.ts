import { describe, expect, it } from 'vitest';
import { synthesize, ellipticPrototype, prototypeLoadImpedance } from './synthesis';
import { defaultSettings, createCircuit, parseProject } from './project';
import { analyzeNetwork, decibels, magnitude, evaluatePolynomial } from './network';
import { filterApproximation } from './approximation';
import { cauerMinimumAttenuation, filterOrderLimits, nearestFilterOrder } from './filter-limits';
import { buildWdf, createWdfProcessor } from './wdf';
import { modularAngleFromAttenuation, attenuationFromModularAngle } from './prototype-parameters';
import reference from './fixtures/elliptic-b-reference.json';

const defaults = { ...defaultSettings, family: 'cauer' as const, cauerVariant: 'b' as const, cutoff: 2000, bandwidth: 1000 };

describe('even-order Cauer class B', () => {
  it('preserves odd prototypes, distinguishes even classes and honors explicit loads', () => {
    for (const order of [3, 5, 9]) {
      expect(synthesize({ ...defaults, order, cauerVariant: 'b' })).toEqual(synthesize({ ...defaults, order, cauerVariant: 'c' }));
    }
    const b = synthesize({ ...defaults, order: 4 });
    const c = synthesize({ ...defaults, order: 4, cauerVariant: 'c' });
    expect(b.sections).not.toEqual(c.sections);
    expect(c.z2).toBe(50);
    const custom = synthesize({ ...defaults, order: 4, loadImpedance: 600 });
    expect(custom.sections).toEqual(b.sections);
    expect(custom.z2).toBe(600);
    expect(custom.notes.some(note => note.includes('Freie Lastimpedanz'))).toBe(true);
    const dual = synthesize({ ...defaults, order: 4, ladderStart: 'series' });
    expect(dual.z2 * b.z2).toBeCloseTo(50 ** 2, 10);
    expect(dual.z2).toBeCloseTo(prototypeLoadImpedance({ ...defaults, order: 4, ladderStart: 'series' }), 10);
  });

  it.each(reference.cases)('agrees with independent SciPy poles/zeros for n=$order, Rp=$ripple, Rs=$attenuation', fixture => {
    const settings = { ...defaults, order: fixture.order, ripple: fixture.ripple, attenuation: fixture.attenuation };
    const result = synthesize(settings), prototype = ellipticPrototype(settings.order, settings.ripple, settings.attenuation, settings.cauerVariant);
    const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: settings.impedance, z2: result.z2 });
    const rho = Math.sqrt(1 - 10 ** (-settings.ripple / 10));
    expect(result.z2).toBeCloseTo(settings.impedance * (1 - rho) / (1 + rho), 10);
    expect(result.z2).toBeCloseTo(prototypeLoadImpedance(settings), 10);
    expect(result.sections).toHaveLength(settings.order);
    expect(prototype.zeros).toHaveLength(settings.order / 2 - 1);
    expect(prototype.stopbandRatio).toBeCloseTo(fixture.stopbandRatio, 9);
    expect(network.denominator.length - 1).toBe(settings.order);
    for (const { frequency, re, im } of fixture.samples) {
      const point = network.evaluate(frequency * settings.cutoff);
      expect(point.s21.re).toBeCloseTo(re, 7);
      expect(point.s21.im).toBeCloseTo(im, 7);
      expect(magnitude(point.s11) ** 2 + magnitude(point.s21) ** 2).toBeCloseTo(1, 9);
    }
  });

  it.each([2, 4, 6, 8, 10, 12, 14, 16, 18])('realizes positive LC values across the supported ranges at n=%i', order => {
    for (const ripple of [.1, .5, 3]) for (const attenuation of [cauerMinimumAttenuation(order), 60, 80]) {
      const result = synthesize({ ...defaults, order, ripple, attenuation });
      for (const section of result.sections) {
        expect(Number.isFinite(section.value) && section.value > 0).toBe(true);
        if (section.kind === 'LC') expect(Number.isFinite(section.value2) && section.value2! > 0).toBe(true);
      }
    }
  });

  it.each(['lowpass', 'highpass', 'bandpass', 'bandstop'] as const)('transforms and dualizes the %s ladder, and round-trips projects', response => {
    for (const order of [2, 4, 8, 18]) {
      const settings = { ...defaults, order, response };
      const low = synthesize({ ...settings, response: 'lowpass' });
      const lowNetwork = analyzeNetwork(low.sections, { fRef: settings.cutoff, z1: 50, z2: low.z2 });
      for (const ladderStart of ['series', 'shunt'] as const) {
        const actualSettings = { ...settings, ladderStart }, result = synthesize(actualSettings);
        const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: 50, z2: result.z2 });
        expect(result.sections[0].connection).toBe(ladderStart);
        for (const x of [.2, .8, 1.1, 1.5, 3]) {
          const omega = response === 'lowpass' ? x : response === 'highpass' ? -1 / x
            : response === 'bandpass' ? (x * x - 1) / (.5 * x) : .5 * x / (1 - x * x);
          expect(magnitude(network.evaluate(x * settings.cutoff).s21)).toBeCloseTo(magnitude(lowNetwork.evaluate(Math.abs(omega) * settings.cutoff).s21), 7);
        }
        const p = { version: 1 as const, name: 'Even Cauer', settings: actualSettings, ...createCircuit(result.sections), z2: result.z2,
          sweep: { min: 10, max: 20000, points: 501 } };
        expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
      }
    }
  });

  it('uses the transformed reflection zeros and stopband edge in the approximation and modular angle', () => {
    for (const order of [2, 4, 6, 8]) {
      const settings = { ...defaults, order }, result = synthesize(settings);
      const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: 50, z2: result.z2 });
      const approximation = filterApproximation(settings);
      for (const omega of [0, .1, .5, .9, 1, 1.2, 2, approximation.stopbandRatio!]) {
        const f = evaluatePolynomial(approximation.numerator, { re: omega, im: 0 }).re / evaluatePolynomial(approximation.denominator, { re: omega, im: 0 }).re;
        expect(1 / (1 + (approximation.epsilon * f) ** 2)).toBeCloseTo(magnitude(network.evaluate(omega * settings.cutoff).s21) ** 2, 7);
      }
      const angle = modularAngleFromAttenuation(order, settings.ripple, settings.attenuation, settings.cauerVariant);
      expect(Math.sin(angle * Math.PI / 180)).toBeCloseTo(1 / approximation.stopbandRatio!, 12);
      expect(attenuationFromModularAngle(order, settings.ripple, angle, settings.cauerVariant)).toBeCloseTo(settings.attenuation, 9);
      expect(decibels(network.evaluate(settings.cutoff).s21)).toBeCloseTo(-settings.ripple, 7);
    }
  });

  it('exports an executable even-order WDF whose frequency response matches its LC circuit', () => {
    const settings = { ...defaults, order: 4 }, result = synthesize(settings), sampleRate = 16000;
    const project = { settings, ...createCircuit(result.sections), z2: result.z2 };
    const processor = createWdfProcessor(buildWdf(project, sampleRate));
    const impulse = Array.from({ length: 8192 }, (_, i) => processor.process(i === 0 ? 1 : 0));
    const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: 50, z2: result.z2 });
    for (const frequency of [100, 1000, 2000, 4000, 7000]) {
      const omega = 2 * Math.PI * frequency / sampleRate;
      const re = impulse.reduce((sum, v, i) => sum + 2 * Math.sqrt(50 / result.z2) * v * Math.cos(omega * i), 0);
      const im = impulse.reduce((sum, v, i) => sum - 2 * Math.sqrt(50 / result.z2) * v * Math.sin(omega * i), 0);
      const actual = network.evaluate(sampleRate / Math.PI * Math.tan(omega / 2)).s21;
      expect(re).toBeCloseTo(actual.re, 9); expect(im).toBeCloseTo(actual.im, 9);
    }
    expect(filterOrderLimits('cauer')).toEqual({ min: 2, max: 19, step: 1 });
    expect(nearestFilterOrder('cauer', 4)).toBe(4);
    expect(nearestFilterOrder('cauer', 20)).toBe(19);
  });
});
