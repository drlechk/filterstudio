import { describe, expect, it } from 'vitest';
import katex from 'katex';
import fixtures from './fixtures/high-order-reference.json';
import { synthesize } from './synthesis';
import { analyzeNetwork, decibels, magnitude } from './network';
import { defaultSettings, createCircuit, orderedSections, parseProject } from './project';
import { filterApproximation } from './approximation';
import { filterOrderLimits, nearestFilterOrder, MAX_CIRCUIT_SECTIONS } from './filter-limits';
import { designTolerance, toleranceRegions } from './tolerance';
import { bandEdges, filterDegree } from './frequency';
import { circuitLatex, componentListEntries } from './circuit-export';
import { circuitSvg, componentListSvgs, matrixBlockSvg } from './circuit-export-svg';
import type { FilterFamily, FilterResponse, FilterSettings, ToleranceSpec } from './types';

const families = ['butterworth', 'chebyshev', 'linkwitz-riley'] as const;
const responses: FilterResponse[] = ['lowpass', 'highpass', 'bandpass', 'bandstop'];
function make(patch: Partial<FilterSettings>) {
  const settings = { ...defaultSettings, order: 100, bandwidth: .5e6, ...patch };
  const result = synthesize(settings);
  return { settings, result, network: analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: settings.impedance, z2: result.z2 }) };
}

describe('high-order synthesis and actual-network evaluation', () => {
  it.each(fixtures.cases)('matches independent complex $family n=$order Rp=$ripple pole-product references', ({ family, order, ripple, samples }) => {
    const { result, network } = make({ family: family as FilterFamily, order, ripple });
    expect(result.sections).toHaveLength(order);
    expect(result.sections.every(s => s.value > 0 && Number.isFinite(s.value))).toBe(true);
    expect(network.denominator.every(Number.isFinite)).toBe(true);
    for (const { frequency, re, im } of samples) {
      const actual = network.evaluate(frequency * defaultSettings.cutoff);
      const amplitude = Math.hypot(re, im);
      expect(Math.hypot(actual.s21.re - re, actual.s21.im - im) / amplitude).toBeLessThan(1e-8);
      expect(magnitude(actual.s11) ** 2 + magnitude(actual.s21) ** 2).toBeCloseTo(1, 9);
    }
  });

  it.each(families)('supports %s n=100 across responses, impedance limits and narrow bands', family => {
    const low = make({ family }).network;
    for (const response of responses) for (const impedance of [.01, 50, 1e6]) for (const b of [.001, .5, 4]) {
      const { settings, network } = make({ family, response, impedance, bandwidth: defaultSettings.cutoff * b });
      expect(network.denominator.every(Number.isFinite)).toBe(true);
      for (const x of [.01, .5, .9995, 1, 1.0005, 1.5, 100]) {
        if (response === 'bandstop' && x === 1) {
          expect(magnitude(network.evaluate(settings.cutoff).s21)).toBe(0);
          continue;
        }
        const w = response === 'lowpass' ? x : response === 'highpass' ? -1 / x
          : response === 'bandpass' ? (x - 1 / x) / b : b * x / (1 - x * x);
        const expected = low.evaluate(Math.abs(w) * settings.cutoff), actual = network.evaluate(x * settings.cutoff);
        for (const key of ['s11', 's21', 's12', 's22'] as const) {
          expect(actual[key].re).toBeCloseTo(expected[key].re, 7);
          expect(actual[key].im).toBeCloseTo(Math.sign(w) * expected[key].im, 7);
          expect(Number.isFinite(magnitude(actual[key]))).toBe(true);
        }
      }
      const edges = response.startsWith('band') ? Object.values(bandEdges(settings)) : [settings.cutoff];
      for (const f of edges) expect(decibels(network.evaluate(f).s21)).toBeCloseTo(family === 'butterworth' ? -10 * Math.log10(2) : family === 'linkwitz-riley' ? -20 * Math.log10(2) : -.5, 6);
    }
  });

  it.each(families)('round-trips and exports %s n=100 band circuits with finite coefficients', family => {
    const { settings, result, network } = make({ family, response: 'bandpass' });
    expect(filterDegree(settings)).toBe(200);
    const project = { version: 1 as const, name: family, settings, ...createCircuit(result.sections), z2: result.z2, sweep: { min: 1e4, max: 1e8, points: 601 } };
    const reopened = parseProject(JSON.parse(JSON.stringify(project)));
    expect(reopened).toEqual(project);
    expect(orderedSections(reopened.nodes, reopened.wires)).toEqual(result.sections);
    const options = { symbols: 'european' as const, matrices: 'typeset' as const, language: 'en' as const };
    const latex = circuitLatex(project, options, network);
    expect(latex).toContain('\\begin{circuitikz}');
    expect(latex).not.toMatch(/NaN|Infinity|undefined/);
    expect(componentListEntries(project, options)).toHaveLength(202); // L/C per block, plus source/load resistors.
    for (const formula of [...Object.values(filterApproximation(settings).latex), ...Object.values(network.latex.abcdEntries), ...Object.values(network.latex.numerators), network.latex.denominator]) {
      expect(() => katex.renderToString(formula, { throwOnError: true })).not.toThrow();
    }
    const changed = result.sections.map((section, i) => i ? section : { ...section, value: section.value * 1.2 });
    const edited = analyzeNetwork(changed, { fRef: settings.cutoff, z1: settings.impedance, z2: result.z2 });
    const edge = bandEdges(settings).lower;
    expect(magnitude(edited.evaluate(edge).s21)).not.toBeCloseTo(magnitude(network.evaluate(edge).s21), 5);
  });

  it('renders large vector export pages with a complete paginated component list', () => {
    const { settings, result, network } = make({ family: 'linkwitz-riley', response: 'bandpass' });
    const project = { version: 1 as const, name: 'LR100', settings, ...createCircuit(result.sections), z2: result.z2, sweep: { min: 1e4, max: 1e8, points: 601 } };
    const options = { symbols: 'american' as const, matrices: 'typeset' as const };
    const lists = componentListSvgs(project, options);
    expect(lists).toHaveLength(9);
    for (const page of [circuitSvg(project, options), ...lists, matrixBlockSvg({ title: 'A(p)', formulas: [network.latex.abcdEntries.A] })]) {
      expect(page.width > 0 && Number.isFinite(page.width)).toBe(true);
      expect(page.height > 0 && Number.isFinite(page.height)).toBe(true);
      expect(page.source).not.toMatch(/NaN|Infinity|merror/);
    }
  });

  it('keeps lower family limits and rejects unsupported orders in synthesis and project files', () => {
    for (const [family, max] of [['bessel', 20], ['legendre', 20], ['chebyshev2', 11], ['cauer', 19], ['butterworth', 100], ['chebyshev', 100], ['linkwitz-riley', 100]] as const) {
      expect(filterOrderLimits(family).max).toBe(max);
      expect(nearestFilterOrder(family, 100)).toBe(max);
      const order = family === 'bessel' || family === 'legendre' ? 21 : 101;
      expect(() => make({ family, order })).toThrow();
      const { settings, result } = make({ family, order: max, attenuation: 80 });
      const project = { version: 1 as const, name: family, settings: { ...settings, order }, ...createCircuit(result.sections), z2: result.z2, sweep: { min: 1e4, max: 1e8, points: 601 } };
      expect(() => parseProject(project)).toThrow();
    }
    expect(MAX_CIRCUIT_SECTIONS).toBe(200);
  });
});

function maskFor(family: typeof families[number], response: FilterResponse, fractional: number): ToleranceSpec {
  const ap = .5, as = 40, ratio = Math.expm1(as * Math.LN10 / 10) / Math.expm1(ap * Math.LN10 / 10);
  const r = family === 'butterworth' ? Math.exp(Math.log(ratio) / (2 * fractional))
    : family === 'chebyshev' ? Math.cosh(Math.acosh(Math.sqrt(ratio)) / fractional)
    : Math.exp(Math.log(Math.expm1(as * Math.LN10 / 20) / Math.expm1(ap * Math.LN10 / 20)) / fractional);
  const edges = (b: number) => Object.values(bandEdges({ cutoff: 1e6, bandwidth: b * 1e6 }));
  return { response, passbandLoss: ap, stopbandLoss: as,
    passband: response.startsWith('band') ? edges(.5) : [1e6],
    stopband: response === 'lowpass' ? [r * 1e6] : response === 'highpass' ? [1e6 / r] : edges(response === 'bandpass' ? .5 * r : .5 / r),
  };
}

describe('high-order tolerance masks', () => {
  it.each(families)('selects %s n=100, meets the mask and rejects masks needing a higher order', family => {
    for (const response of responses) {
      const spec = maskFor(family, response, 99.5);
      const design = designTolerance(spec, family, 50);
      expect(design.issue).toBeNull();
      expect(design.settings?.order).toBe(100);
      const { network } = make(design.settings!);
      for (const f of spec.passband) expect(-decibels(network.evaluate(f).s21)).toBeCloseTo(spec.passbandLoss, 6);
      for (const [region, intervals] of Object.entries(toleranceRegions(spec, 1e5, 1e7))) for (const [lo, hi] of intervals) for (let i = 0; i <= 150; i++) {
        const loss = -decibels(network.evaluate(lo * (hi / lo) ** (i / 150)).s21);
        if (region === 'passband') expect(loss).toBeLessThanOrEqual(spec.passbandLoss + 1e-6);
        else expect(loss).toBeGreaterThanOrEqual(spec.stopbandLoss - 1e-6);
      }
      expect(designTolerance(maskFor(family, response, 100.5), family, 50)).toMatchObject({ settings: null, issue: 'order' });
    }
  });
});
