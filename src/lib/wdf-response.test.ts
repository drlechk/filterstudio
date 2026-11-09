import { describe, expect, it } from 'vitest';
import { analyzeNetwork, magnitude } from './network';
import { createCircuit, defaultSettings } from './project';
import { synthesize } from './synthesis';
import { buildWdf, createWdfProcessor } from './wdf';
import { analogToDigitalFrequency, sweepWdfComparison, transferReadout, wdfComparisonCsv, wdfPlotRange, wdfTransfer } from './wdf-response';

const fs = 48000;
function fixture(response: 'lowpass' | 'highpass' | 'bandpass' | 'bandstop', order = 5, z2 = 50) {
  const settings = { ...defaultSettings, cutoff: 2000, bandwidth: 1000, response, order };
  const { sections } = synthesize(settings);
  const project = { settings, z2, ...createCircuit(sections) };
  return { project, analog: analyzeNetwork(sections, { fRef: settings.cutoff, z1: settings.impedance, z2 }) };
}

describe('WDF transfer comparison', () => {
  it.each(['lowpass', 'highpass', 'bandpass', 'bandstop'] as const)('matches the actual %s WDF processor at different roots, including voltage/power-wave normalization', response => {
    const { project, analog } = fixture(response, 3, 75);
    const evaluate = wdfTransfer(analog, fs);
    const model = buildWdf(project, fs);
    for (const root of [model.adaptors[0].id, model.adaptors.at(-1)!.id]) {
      const processor = createWdfProcessor(buildWdf(project, fs, root));
      const impulse = Array.from({ length: 16384 }, (_, i) => processor.process(i === 0 ? 1 : 0));
      for (const f of [0, 750, 2000, 3000, 12000, fs / 2]) {
        const omega = 2 * Math.PI * f / fs;
        const scale = 2 * Math.sqrt(project.settings.impedance / project.z2);
        const actual = evaluate(f);
        expect(actual.re).toBeCloseTo(scale * impulse.reduce((sum, value, n) => sum + value * Math.cos(omega * n), 0), 8);
        expect(actual.im).toBeCloseTo(-scale * impulse.reduce((sum, value, n) => sum + value * Math.sin(omega * n), 0), 8);
      }
    }
  });

  it('keeps the analog reference at the same physical frequency, exposing warping as fs changes', () => {
    const { analog } = fixture('lowpass');
    const range = { min: 100, max: 10000, points: 51 };
    const a = sweepWdfComparison(analog, fs, range, 'linear', [2000]);
    const b = sweepWdfComparison(analog, fs * 2, range, 'linear', [2000]);
    const cutoffA = a.find(p => p.frequency === 2000)!, cutoffB = b.find(p => p.frequency === 2000)!;
    expect(cutoffA.analog).toEqual(analog.evaluate(2000).s21);
    expect(cutoffB.analog).toEqual(cutoffA.analog);
    expect(magnitude(cutoffA.wdf)).toBeLessThan(magnitude(cutoffA.analog));
    expect(magnitude(cutoffB.wdf)).toBeGreaterThan(magnitude(cutoffA.wdf));
    const mapped = a.find(p => p.frequency === analogToDigitalFrequency(2000, fs))!;
    expect(magnitude(mapped.wdf)).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it.each(['lowpass', 'highpass', 'bandpass', 'bandstop'] as const)('evaluates the exact Nyquist limit for high-order %s filters', response => {
    const { analog } = fixture(response, 100);
    expect(wdfTransfer(analog, fs)(fs / 2)).toEqual({ re: response === 'highpass' || response === 'bandstop' ? 1 : 0, im: 0 });
    const data = sweepWdfComparison(analog, fs, { min: 1, max: fs / 2, points: 51 }, 'log');
    expect(data.every(p => Number.isFinite(p.wdf.re) && Number.isFinite(p.wdf.im))).toBe(true);
  });

  it('includes a narrow resonator notch and its digital counterpart between regular sweep samples', () => {
    const f0 = 2000, L = .01, C = 1 / (2 * Math.PI * f0) ** 2 / L;
    const analog = analyzeNetwork([{ id: 'notch', kind: 'LC', connection: 'series', resonator: 'parallel', value: L, value2: C }], { fRef: f0, z1: 50 });
    const data = sweepWdfComparison(analog, 8000, { min: 500, max: 4000, points: 11 }, 'log', [f0]);
    expect(magnitude(data.find(p => p.frequency === f0)!.analog)).toBeLessThan(1e-12);
    expect(magnitude(data.find(p => p.frequency === analogToDigitalFrequency(f0, 8000))!.wdf)).toBeLessThan(1e-12);
  });

  it('bounds the plotting range after reducing fs, and supports DC only on a linear axis', () => {
    expect(wdfPlotRange({ min: 1e5, max: 1e7 }, fs, 'log')).toEqual({ min: 24, max: 24000 });
    expect(wdfPlotRange({ min: 0, max: 1e7 }, fs, 'linear')).toEqual({ min: 0, max: 24000 });
    expect(wdfPlotRange({ min: 0, max: 1e7 }, fs, 'log')).toEqual({ min: 24, max: 24000 });
    const { analog } = fixture('lowpass');
    expect(() => wdfTransfer(analog, fs)(24001)).toThrow('Nyquist');
    expect(() => wdfTransfer(analog, fs)(-1)).toThrow();
    expect(() => wdfTransfer(analog, NaN)).toThrow();
    expect(() => sweepWdfComparison(analog, fs, { min: 0, max: 24000, points: 101 }, 'log')).toThrow();
    expect(sweepWdfComparison(analog, fs, { min: 0, max: 24000, points: 101 }, 'linear')[0].wdf).toEqual({ re: 1, im: 0 });
  });

  it('exports comparable complex responses, amplitudes, dB and phases, including undefined phase at a zero', () => {
    const { analog } = fixture('lowpass');
    const data = sweepWdfComparison(analog, fs, { min: 0, max: 24000, points: 3 }, 'linear');
    const rows = wdfComparisonCsv(data, fs).split('\n').map(row => row.split(','));
    expect(rows[0]).toHaveLength(12);
    expect(rows[1].slice(0, 7)).toEqual(['0', '48000', '1', '0', '1', '0', '0']);
    expect(rows.at(-1)!.slice(0, 7)).toEqual(['24000', '48000', '0', '0', '0', '-160', '']);
    expect(transferReadout({ re: NaN, im: 0 })).toEqual({ amplitude: null, db: null, phase: null });
    expect(wdfComparisonCsv([{ frequency: 1, wdf: { re: NaN, im: 0 }, analog: { re: 0, im: 0 } }], fs)).not.toMatch(/NaN|Infinity/);
  });
});
