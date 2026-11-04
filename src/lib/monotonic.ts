import prototypes from "./monotonic-prototypes.json";
import type { FilterFamily } from "./types";

export type MonotonicFamily = "bessel" | "legendre";
export const isMonotonicFamily = (family: FilterFamily): family is MonotonicFamily =>
  family === "bessel" || family === "legendre";
export const hasHalfPowerCutoff = (family: FilterFamily) =>
  family === "butterworth" || isMonotonicFamily(family);

/** Positive LC ladders, equal 1-ohm terminations, half-power cutoff 1 rad/s.
 * Generated at 120-digit precision by scripts/generate-monotonic-prototypes.py.
 * Poles/loss coefficients describe the reference; g gives actual component values.
 */
export function monotonicPrototype(family: MonotonicFamily, order: number) {
  const prototype = Number.isInteger(order) && prototypes[family][order - 1];
  if (!prototype) throw new Error("Bessel und Legendre unterstützen Grade von 1 bis 20.");
  return prototype;
}

/** Factored evaluation avoids cancellation in the expanded Legendre polynomial. */
export function monotonicAttenuation(family: MonotonicFamily, order: number, omega: number) {
  if (omega === 0) return 0;
  const logarithm = monotonicPrototype(family, order).poles.reduce(
    (sum, [re, im]) => sum + Math.log(Math.hypot(re, omega - im) / Math.hypot(re, im)), 0,
  );
  return Math.max(0, 20 * logarithm / Math.LN10);
}

/** Unique positive frequency at the requested loss, for monotonic prototypes. */
export function monotonicFrequency(family: MonotonicFamily, order: number, attenuation: number) {
  let lo = 0, hi = 1;
  while (monotonicAttenuation(family, order, hi) < attenuation) hi *= 2;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (monotonicAttenuation(family, order, mid) < attenuation) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
