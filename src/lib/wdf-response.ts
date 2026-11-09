import { decibels, magnitude, phaseDegrees, type Complex, type NetworkAnalysis } from './network';
import { frequencyAt, type FrequencyScale } from './plot-scales';
import { MAX_WDF_SAMPLE_RATE } from './wdf';

export type WdfComparisonSample = { frequency: number; wdf: Complex; analog: Complex };

export function analogToDigitalFrequency(frequency: number, sampleRate: number): number {
  return sampleRate / Math.PI * Math.atan(Math.PI * frequency / sampleRate);
}

/** Exact ideal WDF response via the bilinear equivalence, without truncating an
 * impulse response (which would smear narrow bands). Uses the same power-wave
 * S21 normalization as the analog plots: S21 = 2 sqrt(R1/R2) Vout/Vs.
 * The root changes computation order, not this transfer function.
 */
export function wdfTransfer(analog: NetworkAnalysis, sampleRate: number): (frequency: number) => Complex {
  if (!Number.isFinite(sampleRate) || sampleRate < 1 || sampleRate > MAX_WDF_SAMPLE_RATE) throw new Error('WDF: Die Abtastrate muss zwischen 1 Hz und 1 PHz liegen.');
  const nyquist = sampleRate / 2;
  // At z=-1 the analog frequency is infinite. Take the rational limit exactly,
  // rather than calling tan(pi/2) and plotting a spurious finite-frequency tail.
  const { num, den } = analog.scattering.s21;
  const limit = num.length < den.length ? 0 : num.length === den.length ? num.at(-1)! / den.at(-1)! : NaN;
  return frequency => {
    if (!Number.isFinite(frequency) || frequency < 0 || frequency > nyquist) throw new Error('WDF: Die Frequenz muss zwischen 0 und der Nyquist-Frequenz liegen.');
    if (frequency === nyquist) return { re: limit, im: 0 };
    return analog.evaluate(sampleRate / Math.PI * Math.tan(Math.PI * (frequency / sampleRate))).s21;
  };
}

/** Keep a useful range even after reducing fs below the previous start value. */
export function wdfPlotRange(requested: { min: number; max: number }, sampleRate: number, scale: FrequencyScale): { min: number; max: number } {
  const max = Math.min(requested.max, sampleRate / 2);
  const min = requested.min < max && (requested.min > 0 || scale === 'linear') ? requested.min : max / 1000;
  return { min, max };
}

export function sweepWdfComparison(analog: NetworkAnalysis, sampleRate: number,
  range: { min: number; max: number; points: number }, scale: FrequencyScale, landmarks: number[] = []): WdfComparisonSample[] {
  const { min, max, points } = range;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || (scale === 'log' && min === 0) || max <= min || max > sampleRate / 2 || !Number.isInteger(points) || points < 2 || points > 10001)
    throw new Error('WDF: Ungültiger Frequenzbereich.');
  const digital = wdfTransfer(analog, sampleRate);
  const frequencies = new Set(Array.from({ length: points }, (_, i) => frequencyAt(i / (points - 1), min, max, scale)));
  // Include analog AND warped landmarks so exact notches/edges cannot fall
  // between samples. The analog reference itself always uses the unwarped f.
  for (const f of landmarks.flatMap(f => [f, analogToDigitalFrequency(f, sampleRate)])) {
    if (f >= min && f <= max) frequencies.add(f);
  }
  return [...frequencies].sort((a, b) => a - b).map(frequency => ({ frequency, wdf: digital(frequency), analog: analog.evaluate(frequency).s21 }));
}

export function transferReadout(value: Complex): { amplitude: number | null; db: number | null; phase: number | null } {
  const amplitude = magnitude(value);
  const finite = Number.isFinite(value.re) && Number.isFinite(value.im) && Number.isFinite(amplitude);
  return { amplitude: finite ? amplitude : null, db: finite ? decibels(value) : null, phase: finite && amplitude > 0 ? phaseDegrees(value) : null };
}

export function wdfComparisonCsv(data: WdfComparisonSample[], sampleRate: number): string {
  const columns = (value: Complex) => {
    const readout = transferReadout(value);
    return [readout.amplitude === null ? '' : value.re, readout.amplitude === null ? '' : value.im, readout.amplitude ?? '', readout.db ?? '', readout.phase ?? ''];
  };
  return ['frequency_Hz,sample_rate_Hz,WDF_S21_real,WDF_S21_imag,WDF_S21_magnitude,WDF_S21_dB,WDF_S21_phase_deg,analog_S21_real,analog_S21_imag,analog_S21_magnitude,analog_S21_dB,analog_S21_phase_deg',
    ...data.map(point => [point.frequency, sampleRate, ...columns(point.wdf), ...columns(point.analog)].join(','))].join('\n');
}
