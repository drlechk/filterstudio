import { describe, expect, it } from 'vitest';
import { prototypeLoadImpedance, synthesize } from './synthesis';
import { analyzeNetwork, magnitude } from './network';
import { createCircuit, defaultSettings, parseProject } from './project';
import { buildWdf } from './wdf';
import { designTolerance } from './tolerance';

describe('separate source and load impedances', () => {
  it.each(['butterworth', 'chebyshev', 'chebyshev2', 'cauer', 'bessel', 'legendre', 'linkwitz-riley'] as const)(
    'applies independent terminations to %s synthesis and persistence', family => {
      const settings = { ...defaultSettings, family, order: family === 'linkwitz-riley' || family === 'chebyshev' || family === 'cauer' ? 4 : 3,
        impedance: 75, loadImpedance: 600 };
      const reference = synthesize({ ...settings, loadImpedance: undefined }), result = synthesize(settings);
      expect(result.sections).toEqual(reference.sections);
      expect(result.z2).toBe(600);
      expect(prototypeLoadImpedance(settings)).toBe(reference.z2);
      expect(result.notes.some(note => note.startsWith('Freie Lastimpedanz'))).toBe(true);
      const analysis = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: 75, z2: result.z2 });
      expect(magnitude(analysis.evaluate(0).s21)).toBeCloseTo(2 * Math.sqrt(75 * 600) / 675, 12);
      const project = { version: 1 as const, name: 'Independent ports', settings, ...createCircuit(result.sections), z2: result.z2,
        sweep: { min: 1e4, max: 1e8, points: 501 } };
      expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
      const model = buildWdf(project, 20e6);
      expect(model.elements.find(e => e.id === 'source')!.resistance).toBe(75);
      expect(model.elements.find(e => e.id === 'load')!.resistance).toBe(600);
    },
  );

  it('retains the topology-dependent automatic Chebyshev load and supports either manual load', () => {
    for (const ladderStart of ['series', 'shunt'] as const) {
      const settings = { ...defaultSettings, family: 'chebyshev' as const, order: 4, ladderStart };
      const automatic = synthesize(settings);
      expect(automatic.z2).toBe(prototypeLoadImpedance(settings));
      expect(synthesize({ ...settings, loadImpedance: automatic.z2 }).notes.some(n => n.startsWith('Freie Lastimpedanz'))).toBe(false);
      for (const loadImpedance of [.001, 25, 50, 100, 1e9]) expect(synthesize({ ...settings, loadImpedance }).z2).toBe(loadImpedance);
      for (const loadImpedance of [0, -1, .0001, 1e10, NaN, Infinity]) expect(() => synthesize({ ...settings, loadImpedance })).toThrow('Lastimpedanz');
    }
  });

  it('carries the selected load through tolerance design while reporting its effect on the ideal mask', () => {
    const design = designTolerance({ response: 'lowpass', passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 }, 'cauer', 50, 'series', 100);
    expect(design.settings!.loadImpedance).toBe(100);
    const result = synthesize(design.settings!);
    expect(result.z2).toBe(100);
    expect(result.notes.some(n => n.includes('Toleranzmaske'))).toBe(true);
  });
});
