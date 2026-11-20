import { describe, expect, it } from 'vitest';
import { wdfComponentScale } from './wdf-prewarp';
import { buildWdf, createWdfProcessor, exportWdf } from './wdf';
import { analogToDigitalFrequency, sweepWdfComparison, wdfComparisonCsv, wdfTransfer } from './wdf-response';
import { analyzeNetwork, magnitude } from './network';
import { buildWdfEquation } from './wdf-equation';
import { buildWdfSignalFlow, createSignalFlowProcessor } from './wdf-signal-flow';
import { createCircuit, defaultSettings, parseProject } from './project';
import { synthesize } from './synthesis';
import type { Project, Section } from './types';

const fs = 8000, fp = 2000;
const mixed: Section[] = [
  { id: 'r', kind: 'R', connection: 'series', value: 25 },
  { id: 'l', kind: 'L', connection: 'series', value: .002 },
  { id: 'c', kind: 'C', connection: 'shunt', value: 1e-6 },
  { id: 'lc1', kind: 'LC', connection: 'shunt', resonator: 'series', value: .001, value2: 1e-6 },
  { id: 'lc2', kind: 'LC', connection: 'series', resonator: 'parallel', value: .002, value2: 2e-6 },
];
const project = (): Project => ({ version: 1, name: 'Prewarping', settings: { ...defaultSettings, cutoff: 1200 },
  ...createCircuit(mixed), z2: 75, sweep: { min: 10, max: 4000, points: 501 },
  wdf: { sampleRate: fs, prewarpFrequency: fp, rootId: 'resonator:lc1' } });

describe('WDF component prewarping', () => {
  it('uses the analytic quarter-rate scaling and the stable DC limit', () => {
    expect(wdfComponentScale(fs, fp)).toBeCloseTo(Math.PI / 4, 15);
    expect(wdfComponentScale(fs)).toBe(1);
    expect(wdfComponentScale(1e15, 1e-300)).toBe(1);
    expect(wdfComponentScale(fs, 1e-8)).toBeCloseTo(1, 15);
    expect(wdfComponentScale(fs, fs / 2 * (1 - Number.EPSILON))).toBeGreaterThan(0);
    for (const invalid of [0, -1, fs / 2, fs, NaN, Infinity])
      expect(() => wdfComponentScale(fs, invalid)).toThrow('Vorverzerrungsfrequenz');
    for (const invalid of [0, NaN, Infinity, 1e16]) expect(() => wdfComponentScale(invalid, fp)).toThrow('Abtastrate');
  });

  it('scales all reactive elements, including both LC types, while retaining analog values and resistances', () => {
    const p = project(), original = structuredClone(p);
    const plain = buildWdf({ ...p, wdf: undefined }, fs), warped = buildWdf(p, fs);
    expect(warped.componentScale).toBeCloseTo(Math.PI / 4, 15);
    for (const element of warped.elements) {
      const before = plain.elements.find(e => e.id === element.id)!;
      if (element.kind === 'L' || element.kind === 'C') {
        expect(element.analogValue).toBe(before.value);
        expect(element.value / before.value).toBeCloseTo(Math.PI / 4, 14);
        expect(element.resistance / before.resistance).toBeCloseTo(element.kind === 'L' ? Math.PI / 4 : 4 / Math.PI, 14);
      } else {
        expect(element.value).toBe(before.value);
        expect(element.resistance).toBe(before.resistance);
      }
    }
    expect(p).toEqual(original);
    expect(buildWdf({ ...p, wdf: { sampleRate: fs } }, fs)).toEqual(plain);
  });

  it.each(['lowpass', 'highpass', 'bandpass', 'bandstop'] as const)(
    'matches the complex analog response at the reference frequency and the plotted %s response', response => {
      for (const family of ['butterworth', 'chebyshev', 'chebyshev2', 'cauer', 'bessel', 'legendre', 'linkwitz-riley'] as const) {
        const settings = { ...defaultSettings, family, response, order: family === 'linkwitz-riley' ? 4 : 3, cutoff: 1200, bandwidth: 1000 };
        const synthesis = synthesize(settings);
        const p = { ...project(), settings, ...createCircuit(synthesis.sections), z2: synthesis.z2 };
        const analog = analyzeNetwork(synthesis.sections, { fRef: settings.cutoff, z1: settings.impedance, z2: p.z2 });
        const model = buildWdf(p, fs), processor = createWdfProcessor(model);
        const impulse = Array.from({ length: 8192 }, (_, i) => processor.process(i === 0 ? 1 : 0));
        const digital = wdfTransfer(analog, fs, fp);
        for (const frequency of [0, 400, 1200, fp, 3000, fs / 2]) {
          const omega = 2 * Math.PI * frequency / fs;
          const measured = impulse.reduce((sum, value, i) => ({ re: sum.re + value * Math.cos(omega * i), im: sum.im - value * Math.sin(omega * i) }), { re: 0, im: 0 });
          const scale = 2 * Math.sqrt(settings.impedance / p.z2);
          expect(measured.re * scale).toBeCloseTo(digital(frequency).re, 8);
          expect(measured.im * scale).toBeCloseTo(digital(frequency).im, 8);
          if (frequency === fp) {
            expect(measured.re * scale).toBeCloseTo(analog.evaluate(fp).s21.re, 8);
            expect(measured.im * scale).toBeCloseTo(analog.evaluate(fp).s21.im, 8);
          }
        }
      }
    },
  );

  it('keeps root changes, the executable signal graph and the difference equation consistent', () => {
    const p = project(), model = buildWdf(p, fs), reference = createWdfProcessor(model);
    const input = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0) + .2 * Math.sin(i * .7));
    const expected = input.map(reference.process);
    for (const root of model.adaptors) {
      const rerooted = buildWdf(p, fs, root.id);
      const processor = createSignalFlowProcessor(buildWdfSignalFlow(rerooted));
      input.map(processor.process).forEach((value, i) => expect(value).toBeCloseTo(expected[i], 11));
    }
    const equation = buildWdfEquation(model);
    expected.forEach((_, n) => {
      const lhs = equation.denominator.reduce((sum, a, k) => sum + a * (expected[n - k] ?? 0), 0);
      const rhs = equation.numerator.reduce((sum, b, k) => sum + b * (input[n - k] ?? 0), 0);
      expect(lhs).toBeCloseTo(rhs, 10);
    });
  });

  it('preserves the analog reference and includes the matched frequency and warped landmarks in sweeps', () => {
    const p = project(), analog = analyzeNetwork(mixed, { fRef: 1200, z1: 50, z2: 75 });
    const range = { min: 10, max: fs / 2, points: 51 };
    const data = sweepWdfComparison(analog, fs, range, 'log', [1200], fp);
    expect(analogToDigitalFrequency(fp, fs, fp)).toBe(fp);
    expect(analogToDigitalFrequency(1200, fs, fp)).toBeCloseTo(fs / Math.PI * Math.atan(1200 / fp), 12);
    expect(data.some(point => point.frequency === analogToDigitalFrequency(1200, fs, fp))).toBe(true);
    expect(data.find(point => point.frequency === fp)!.wdf).toEqual(analog.evaluate(fp).s21);
    for (const point of data) expect(point.analog).toEqual(analog.evaluate(point.frequency).s21);
    const rows = wdfComparisonCsv(data, fs, 'unwrapped', fp).split('\n').map(row => row.split(','));
    expect(rows[0].at(-1)).toBe('prewarp_frequency_Hz');
    expect(rows.slice(1).every(row => row.at(-1) === String(p.wdf!.prewarpFrequency))).toBe(true);
  });

  it('retains an LC notch at the selected reference frequency', () => {
    const l = .01, c = 1 / (2 * Math.PI * fp) ** 2 / l;
    const analog = analyzeNetwork([{ id: 'notch', kind: 'LC', connection: 'series', resonator: 'parallel', value: l, value2: c }], { fRef: fp, z1: 50 });
    expect(magnitude(wdfTransfer(analog, fs, fp)(fp))).toBeLessThan(1e-12);
    expect(magnitude(wdfTransfer(analog, fs)(fp))).toBeGreaterThan(.01);
  });

  it('round-trips settings and runnable exports and rejects malformed imported frequencies', () => {
    const p = project(), restored = parseProject(JSON.parse(JSON.stringify(p)));
    expect(restored).toEqual(p);
    const model = buildWdf(restored, fs, restored.wdf!.rootId);
    const exported = JSON.parse(exportWdf(model));
    expect(exported.prewarpFrequency).toBe(fp);
    expect(exported.componentScale).toBeCloseTo(Math.PI / 4, 15);
    expect(exported.elements).toEqual(model.elements);
    const original = createWdfProcessor(model), replay = createWdfProcessor(exported);
    for (let i = 0; i < 100; i++) expect(replay.process(i === 0 ? 1 : 0)).toBe(original.process(i === 0 ? 1 : 0));
    for (const prewarpFrequency of [null, '2000', 0, -1, fs / 2, NaN, Infinity])
      expect(() => parseProject({ ...p, wdf: { ...p.wdf, prewarpFrequency } })).toThrow('WDF');
  });
});
