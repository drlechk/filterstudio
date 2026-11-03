export type FrequencyScale = "linear" | "log";
export type MagnitudeScale = "linear" | "db";

/** Plot coordinates and their inverses, shared by curves, cursors and drag handles. */
export function frequencyPosition(frequency: number, min: number, max: number, scale: FrequencyScale): number {
  return scale === "linear" ? (frequency - min) / (max - min)
    : (Math.log(frequency) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

export function frequencyAt(position: number, min: number, max: number, scale: FrequencyScale): number {
  if (position === 0) return min;
  if (position === 1) return max;
  return scale === "linear" ? min + position * (max - min)
    : Math.exp(Math.log(min) + position * (Math.log(max) - Math.log(min)));
}

/** Equally spaced, readable ticks in the displayed units. */
export function linearTicks(min: number, max: number, intervals = 5): number[] {
  const rawStep = (max - min) / intervals;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 2.5, 5, 10].find(n => n * power >= rawStep) ?? 10) * power;
  const first = Math.ceil(min / step) * step;
  const ticks = Array.from({ length: Math.max(0, Math.floor((max - first) / step + 1e-10) + 1) }, (_, i) => Number((first + i * step).toPrecision(14)));
  return ticks.length >= 2 ? ticks : [min, (min + max) / 2, max];
}

export function frequencyTicks(min: number, max: number, scale: FrequencyScale): number[] {
  if (scale === "linear") return linearTicks(min, max);
  const ticks: number[] = [];
  for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent++) {
    for (const multiple of [1, 2, 5]) {
      const frequency = multiple * 10 ** exponent;
      if (frequency >= min && frequency <= max) ticks.push(frequency);
    }
  }
  if (ticks.length < 2) return [min, frequencyAt(.5, min, max, scale), max];
  let previous = -Infinity;
  return ticks.filter(tick => {
    const position = frequencyPosition(tick, min, max, scale);
    if (position - previous < .085) return false;
    previous = position;
    return true;
  });
}

const dbToLogAmplitude = Math.LN10 / 20;
/** Linear attenuation is the amplitude loss factor 1/|S21|, with unity at 0 dB. */
export const attenuationValue = (lossDb: number, scale: MagnitudeScale) => scale === "db" ? lossDb : Math.exp(lossDb * dbToLogAmplitude);
export const attenuationDb = (value: number, scale: MagnitudeScale) => scale === "db" ? value : Math.log(value) / dbToLogAmplitude;

export function attenuationPosition(lossDb: number, maximumDb: number, scale: MagnitudeScale): number {
  return scale === "db" ? lossDb / maximumDb
    : Math.expm1(lossDb * dbToLogAmplitude) / Math.expm1(maximumDb * dbToLogAmplitude);
}

export function attenuationAt(position: number, maximumDb: number, scale: MagnitudeScale): number {
  const bounded = Math.max(0, Math.min(1, position));
  return scale === "db" ? bounded * maximumDb
    : Math.log1p(bounded * Math.expm1(maximumDb * dbToLogAmplitude)) / dbToLogAmplitude;
}
