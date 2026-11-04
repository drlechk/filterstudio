import type { FilterFamily } from "./types";

export const MAX_PROTOTYPE_ORDER = 100;
// These spectral-factor tables are independently validated through order 20.
export const MAX_MONOTONIC_ORDER = 20;
export const LINKWITZ_RILEY_ORDERS: readonly number[] = Array.from({ length: MAX_PROTOTYPE_ORDER / 2 }, (_, i) => 2 * (i + 1));
export const CAUER_ORDERS: readonly number[] = [3, 5, 7, 9, 11, 13, 15, 17, 19];
export const MAX_CAUER_ORDER = CAUER_ORDERS[CAUER_ORDERS.length - 1];
// Validated positive-element, transformer-free inverse-Chebyshev ladders.
export const CHEBYSHEV_II_ORDERS: readonly number[] = [1, 3, 5, 7, 9, 11];
export const chebyshevIIMinimumAttenuation = (order: number) => order >= 11 ? 80 : order >= 7 ? 60 : order >= 5 ? 30 : 20;
export const minimumStopbandAttenuation = (family: FilterFamily, order: number) =>
  family === "chebyshev2" ? chebyshevIIMinimumAttenuation(order) : family === "cauer" ? cauerMinimumAttenuation(order) : 20;
export function filterOrderLimits(family: FilterFamily) {
  return family === "cauer" ? { min: 3, max: MAX_CAUER_ORDER, step: 2 }
    : family === "chebyshev2" ? { min: 1, max: 11, step: 2 }
    : family === "linkwitz-riley" ? { min: 2, max: MAX_PROTOTYPE_ORDER, step: 2 }
    : family === "bessel" || family === "legendre" ? { min: 1, max: MAX_MONOTONIC_ORDER, step: 1 }
    : { min: 1, max: MAX_PROTOTYPE_ORDER, step: 1 };
}
// A band transformation can split a Cauer resonator into two two-port blocks.
export const MAX_CIRCUIT_SECTIONS = 2 * MAX_PROTOTYPE_ORDER;
export const MAX_CIRCUIT_NODES = MAX_CIRCUIT_SECTIONS + 2;
export const cauerMinimumAttenuation = (order: number) => order >= 7 ? 40 : 20;

export function nearestFilterOrder(family: FilterFamily, order: number): number {
  const { min, max } = filterOrderLimits(family);
  if (family !== "cauer" && family !== "chebyshev2" && family !== "linkwitz-riley") return Math.max(min, Math.min(max, Math.round(order)));
  const orders = family === "cauer" ? CAUER_ORDERS : family === "linkwitz-riley" ? LINKWITZ_RILEY_ORDERS : CHEBYSHEV_II_ORDERS;
  return orders.reduce((best, candidate) => Math.abs(candidate - order) < Math.abs(best - order) ? candidate : best);
}
