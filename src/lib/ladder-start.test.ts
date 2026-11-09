import { describe, expect, it } from 'vitest';
import { synthesize, ellipticPrototype } from './synthesis';
import { analyzeNetwork, magnitude } from './network';
import { createCircuit, defaultSettings, parseProject } from './project';
import { defaultLadderStart } from './filter-limits';
import { designTolerance } from './tolerance';
import type { FilterFamily, FilterSettings, Project } from './types';

const families: [FilterFamily, number[]][] = [
  ['butterworth', [1, 4, 100]], ['chebyshev', [1, 4, 100]], ['chebyshev2', [1, 5, 11]],
  ['cauer', [3, 7, 19]], ['bessel', [1, 4, 20]], ['legendre', [1, 4, 20]], ['linkwitz-riley', [2, 6, 100]],
];
const network = (settings: FilterSettings) => {
  const result = synthesize(settings);
  return { ...result, analysis: analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: settings.impedance, z2: result.z2 }) };
};
const project = (settings: FilterSettings): Project => {
  const result = synthesize(settings);
  return { version: 1, name: 'Ladder topology', settings, ...createCircuit(result.sections), z2: result.z2,
    sweep: { min: settings.cutoff / 10, max: settings.cutoff * 10, points: 501 } };
};

describe('selectable ladder start', () => {
  it.each(families)('preserves complex transmission and losslessness for both %s topologies and every response', (family, orders) => {
    for (const order of orders) for (const response of ['lowpass', 'highpass', 'bandpass', 'bandstop'] as const) {
      const settings = { ...defaultSettings, family, order, response, bandwidth: .5e6, attenuation: 80 };
      const series = network({ ...settings, ladderStart: 'series' }), shunt = network({ ...settings, ladderStart: 'shunt' });
      expect(series.sections[0].connection).toBe('series');
      expect(shunt.sections[0].connection).toBe('shunt');
      expect(series.sections).toHaveLength(shunt.sections.length);
      for (const section of [...series.sections, ...shunt.sections]) {
        expect(section.value).toBeGreaterThan(0);
        expect(Number.isFinite(section.value)).toBe(true);
        if (section.kind === 'LC') {
          expect(section.value2).toBeGreaterThan(0);
          expect(Number.isFinite(section.value2)).toBe(true);
        }
      }
      for (const ratio of [0, .1, .6, .8, .99, 1, 1.01, 1.2, 1.5, 3, 10]) {
        const a = series.analysis.evaluate(ratio * settings.cutoff), b = shunt.analysis.evaluate(ratio * settings.cutoff);
        for (const key of ['s21', 's12'] as const) {
          expect(a[key].re).toBeCloseTo(b[key].re, 9);
          expect(a[key].im).toBeCloseTo(b[key].im, 9);
        }
        for (const key of ['s11', 's22'] as const) {
          expect(a[key].re).toBeCloseTo(-b[key].re, 9);
          expect(a[key].im).toBeCloseTo(-b[key].im, 9);
        }
        expect(magnitude(b.s21) ** 2 + magnitude(b.s11) ** 2).toBeCloseTo(1, 8);
      }
    }
  });

  it('preserves the family defaults for legacy projects and omitted settings', () => {
    for (const [family, orders] of families) {
      const settings = { ...defaultSettings, family, order: orders[0], attenuation: 80 };
      expect(synthesize(settings)).toEqual(synthesize({ ...settings, ladderStart: defaultLadderStart(family) }));
      const saved = project(settings), reopened = parseProject(JSON.parse(JSON.stringify(saved)));
      expect(reopened).toEqual(saved);
      expect(reopened.settings.ladderStart).toBeUndefined();
    }
  });

  it('keeps finite Cauer transmission zeros in the series-first dual', () => {
    const settings = { ...defaultSettings, family: 'cauer' as const, order: 5, ladderStart: 'series' as const };
    const result = network(settings);
    expect(result.sections.filter(s => s.kind === 'LC').every(s => s.connection === 'shunt' && s.resonator === 'series')).toBe(true);
    for (const zero of ellipticPrototype(settings.order, settings.ripple, settings.attenuation).zeros)
      expect(magnitude(result.analysis.evaluate(zero * settings.cutoff).s21)).toBeLessThan(1e-8);
  });

  it('round-trips both starts, including the reciprocal even-Chebyshev load at impedance limits', () => {
    for (const impedance of [.01, 50, 1e6]) for (const response of ['lowpass', 'highpass', 'bandpass', 'bandstop'] as const) {
      const settings = { ...defaultSettings, family: 'chebyshev' as const, order: 4, ripple: 3, response, bandwidth: .5e6, impedance };
      const series = project({ ...settings, ladderStart: 'series' }), shunt = project({ ...settings, ladderStart: 'shunt' });
      expect(shunt.z2).toBeLessThan(impedance);
      expect(shunt.z2 / impedance * (series.z2 / impedance)).toBeCloseTo(1, 14);
      expect(parseProject(JSON.parse(JSON.stringify(series)))).toEqual(series);
      expect(parseProject(JSON.parse(JSON.stringify(shunt)))).toEqual(shunt);
    }
  });

  it('retains the chosen topology through tolerance-mask design', () => {
    const spec = { response: 'lowpass' as const, passband: [1e6], stopband: [8e6], passbandLoss: 1, stopbandLoss: 40 };
    for (const [family] of families) for (const ladderStart of ['series', 'shunt'] as const) {
      const design = designTolerance(spec, family, 50, ladderStart);
      expect(design.issue).toBeNull();
      expect(design.settings!.ladderStart).toBe(ladderStart);
      const result = network(design.settings!);
      expect(result.sections[0].connection).toBe(ladderStart);
      expect(magnitude(result.analysis.evaluate(1e6).s21) ** 2).toBeCloseTo(10 ** (-.1), 6);
      expect(magnitude(result.analysis.evaluate(8e6).s21) ** 2).toBeLessThanOrEqual(1.0001e-4);
    }
  });

  it('rejects invalid ladder settings instead of silently selecting a topology', () => {
    const saved = project(defaultSettings);
    for (const ladderStart of ['invalid', null, ['series'], 0]) {
      expect(() => parseProject({ ...saved, settings: { ...defaultSettings, ladderStart } })).toThrow('Leiterbeginn');
      expect(() => synthesize({ ...defaultSettings, ladderStart } as FilterSettings)).toThrow('Leiterbeginn');
    }
  });
});
