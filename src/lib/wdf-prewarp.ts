export const MAX_WDF_SAMPLE_RATE = 1e15;

/** Common L/C scaling before the ordinary bilinear transform. Resistances stay
 * fixed, so this is equivalent to s = 2 fs k (1-z^-1)/(1+z^-1).
 * J. O. Smith: https://www.dsprelated.com/freebooks/filters/Frequency_Warping.html
 */
export function wdfComponentScale(sampleRate: number, prewarpFrequency?: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate < 1 || sampleRate > MAX_WDF_SAMPLE_RATE)
    throw new Error('WDF: Die Abtastrate muss zwischen 1 Hz und 1 PHz liegen.');
  if (prewarpFrequency === undefined) return 1;
  if (!Number.isFinite(prewarpFrequency) || prewarpFrequency <= 0 || prewarpFrequency >= sampleRate / 2)
    throw new Error('WDF: Die Vorverzerrungsfrequenz muss positiv und kleiner als die Nyquist-Frequenz sein.');
  const x = Math.PI * (prewarpFrequency / sampleRate);
  // Stable at tiny f/fs, including underflow of the ratio.
  return x < 1e-4 ? 1 - x * x / 3 - x ** 4 / 45 : x / Math.tan(x);
}
