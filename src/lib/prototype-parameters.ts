import type { CauerVariant } from "./types";
import { CAUER_ORDERS, cauerMinimumAttenuation } from "./filter-limits";
import { ellipticModulus, ellipticPrototype } from "./synthesis";

// Lossless prototype conventions: ADI, Op Amp Applications, §5-4, p. 5.24,
// https://www.analog.com/media/en/training-seminars/design-handbooks/P2%20Ch5_final_PtA.pdf#page=26
// rho is the amplitude reflection coefficient, NOT reflected power in percent.
export function reflectionPercentFromRipple(ripple: number): number {
  return 100 * Math.sqrt(-Math.expm1(-ripple * Math.LN10 / 10));
}

export function rippleFromReflectionPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100)
    throw new RangeError("Reflection coefficient must be between 0 and 100 percent (exclusive).");
  return -10 * Math.log1p(-((percent / 100) ** 2)) / Math.LN10;
}

export function modularAngleFromAttenuation(order: number, ripple: number, attenuation: number, variant?: CauerVariant): number {
  const ratio = order % 2 ? Math.sqrt(ellipticModulus(order, ripple, attenuation))
    : 1 / ellipticPrototype(order, ripple, attenuation, variant).stopbandRatio;
  return Math.asin(ratio) * 180 / Math.PI;
}

/** Feasible angles for the existing, validated Cauer synthesis range. */
export function modularAngleLimits(order: number, ripple: number, variant?: CauerVariant) {
  if (!CAUER_ORDERS.includes(order) || !Number.isFinite(ripple) || ripple < .1 || ripple > 3)
    throw new RangeError("Unsupported Cauer order or passband ripple.");
  return {
    min: modularAngleFromAttenuation(order, ripple, 80, variant),
    max: modularAngleFromAttenuation(order, ripple, cauerMinimumAttenuation(order), variant),
  };
}

/** Invert the degree equation without rounding the requested angle to a catalog entry. */
export function attenuationFromModularAngle(order: number, ripple: number, angle: number, variant?: CauerVariant): number {
  const limits = modularAngleLimits(order, ripple, variant);
  if (!Number.isFinite(angle) || angle < limits.min || angle > limits.max)
    throw new RangeError("Modular angle is outside the supported Cauer attenuation range.");
  let low = cauerMinimumAttenuation(order), high = 80;
  if (angle === limits.min) return high;
  if (angle === limits.max) return low;
  // At fixed n and Rp, increasing Rs strictly decreases the modular angle.
  for (let i = 0; i < 56; i++) {
    const middle = (low + high) / 2;
    if (modularAngleFromAttenuation(order, ripple, middle, variant) > angle) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
