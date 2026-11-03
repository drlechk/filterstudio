import type { FilterFamily } from "./types";

export const MAX_PROTOTYPE_ORDER = 20;
export const CAUER_ORDERS: readonly number[] = [3, 5, 7, 9, 11, 13, 15, 17, 19];
export const MAX_CAUER_ORDER = CAUER_ORDERS[CAUER_ORDERS.length - 1];
// A band transformation can split a Cauer resonator into two two-port blocks.
export const MAX_CIRCUIT_SECTIONS = 2 * MAX_PROTOTYPE_ORDER;
export const MAX_CIRCUIT_NODES = MAX_CIRCUIT_SECTIONS + 2;
export const cauerMinimumAttenuation = (order: number) => order >= 7 ? 40 : 20;

export function nearestFilterOrder(family: FilterFamily, order: number): number {
  if (family !== "cauer") return Math.max(1, Math.min(MAX_PROTOTYPE_ORDER, Math.round(order)));
  return CAUER_ORDERS.reduce((best, candidate) => Math.abs(candidate - order) < Math.abs(best - order) ? candidate : best);
}
