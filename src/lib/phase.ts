import { magnitude, phaseDegrees, type Complex } from './network';

export type PhaseMode = 'wrapped' | 'unwrapped';

export function validPhase(value: Complex | undefined): number | null {
  return value && Number.isFinite(value.re) && Number.isFinite(value.im) && magnitude(value) > 0
    ? phaseDegrees(value) : null;
}

/** Remove full turns between consecutive samples; undefined phases start a new segment. */
export function unwrapPhase(values: readonly (number | null)[]): (number | null)[] {
  let previous: number | null = null;
  let offset = 0;
  return values.map(value => {
    if (value === null || !Number.isFinite(value)) {
      previous = null;
      offset = 0;
      return null;
    }
    if (previous !== null) {
      const delta = value - previous;
      // Exactly half a turn is ambiguous, so preserve its original direction.
      if (Math.abs(delta) > 180) offset -= Math.sign(delta) * Math.ceil((Math.abs(delta) - 180) / 360) * 360;
    }
    previous = value;
    return value + offset;
  });
}

export function phaseValues(values: readonly (number | null)[], mode: PhaseMode): (number | null)[] {
  return mode === 'unwrapped' ? unwrapPhase(values) : values.map(value => value !== null && Number.isFinite(value) ? value : null);
}

/** Shared degree axis for all visible traces, including multiple full turns. */
export function phaseAxis(values: readonly (number | null)[], mode: PhaseMode) {
  let lower = -180, upper = 180, step = 90;
  if (mode === 'unwrapped') {
    lower = 0;
    upper = 0;
    for (const value of values) {
      if (value !== null && Number.isFinite(value)) {
        lower = Math.min(lower, value);
        upper = Math.max(upper, value);
      }
    }
    step = Math.max(90, Math.ceil((upper - lower) / 540) * 90);
    lower = Math.floor(lower / step) * step;
    upper = Math.ceil(upper / step) * step;
    if (upper === lower) { lower = -180; upper = 180; }
  }
  const ticks = Array.from({ length: Math.round((upper - lower) / step) + 1 }, (_, i) => lower + i * step);
  return { lower, upper, ticks };
}
