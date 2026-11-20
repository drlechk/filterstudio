import { expect, it } from 'vitest';
import { defaultSettings, createCircuit, parseProject } from './project';
import { synthesize } from './synthesis';
import { analyzeNetwork, decibels, magnitude } from './network';
import { reflectionPercentFromRipple, rippleFromReflectionPercent, modularAngleFromAttenuation, attenuationFromModularAngle } from './prototype-parameters';
import { MIN_PASSBAND_RIPPLE } from './filter-limits';
import { designTolerance, toleranceRegions, validateTolerance } from './tolerance';
import type { CauerVariant } from './types';
import fixtures from './fixtures/small-ripple-reference.json';

// Numerical continuation is CPU-bound; shared CI runners need more than 5 seconds.
it.each(fixtures.cases)('matches independent SciPy reference at Rp=$ripple, n=$order, class=$cauerVariant', fixture => {
  const settings = { ...defaultSettings, ...fixture, family: 'cauer' as const, cauerVariant: fixture.cauerVariant as CauerVariant };
  const result = synthesize(settings);
  const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: settings.impedance, z2: result.z2 });
  for (const { frequency, re, im } of fixture.samples) {
    const point = network.evaluate(frequency * settings.cutoff);
    expect(point.s21.re).toBeCloseTo(re, 7);
    expect(point.s21.im).toBeCloseTo(im, 7);
    if (frequency <= 1) expect(magnitude(point.s11)).toBeLessThanOrEqual(reflectionPercentFromRipple(settings.ripple) / 100 + 1e-6);
  }
  const angle = modularAngleFromAttenuation(settings.order, settings.ripple, settings.attenuation, settings.cauerVariant);
  expect(attenuationFromModularAngle(settings.order, settings.ripple, angle, settings.cauerVariant)).toBeCloseTo(settings.attenuation, 8);
}, 30_000);

it.each([2, 15])('accepts %s percent reflection through synthesis, project files and tolerance masks', percent => {
  const ripple = rippleFromReflectionPercent(percent);
  expect(reflectionPercentFromRipple(ripple)).toBeCloseTo(percent, 12);
  for (const family of ['chebyshev', 'cauer'] as const) {
    const settings = { ...defaultSettings, family, order: percent === 2 ? 3 : 5, ripple };
    const result = synthesize(settings);
    const project = { version: 1 as const, name: 'Small ripple', settings, ...createCircuit(result.sections), z2: result.z2,
      sweep: { min: 1000, max: 1e8, points: 501 } };
    expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    const spec = { response: 'lowpass' as const, passband: [1e6], stopband: [3e6], passbandLoss: ripple, stopbandLoss: 40 };
    const design = designTolerance(spec, family, 50);
    expect(design.issue).toBeNull();
    expect(design.settings!.ripple).toBe(ripple);
    const actual = synthesize(design.settings!);
    const network = analyzeNetwork(actual.sections, { fRef: design.settings!.cutoff, z1: 50, z2: actual.z2 });
    for (const [region, intervals] of Object.entries(toleranceRegions(spec, 1, 1e9))) for (const [lo, hi] of intervals) {
      for (let i = 0; i <= 160; i++) {
        const db = decibels(network.evaluate(lo * (hi / lo) ** (i / 160)).s21);
        if (region === 'passband') expect(db).toBeGreaterThanOrEqual(-ripple - 1e-7);
        else expect(db).toBeLessThanOrEqual(-40 + 1e-7);
      }
    }
  }
});

it('enforces the same positive lower bound for synthesis and masks', () => {
  for (const ripple of [0, -1, MIN_PASSBAND_RIPPLE / 2, NaN, Infinity, 3.01]) {
    expect(() => synthesize({ ...defaultSettings, family: 'chebyshev', ripple })).toThrow();
    expect(validateTolerance({ response: 'lowpass', passband: [1e6], stopband: [2e6], passbandLoss: ripple, stopbandLoss: 40 })).toBe('attenuation');
  }
});
