import type { Language } from "./preference-storage";
import type { ComponentPrecision } from "./types";
import { formatUnitValue as formatComponentValue, parseUnitValue } from "./unit-values";
export { formatUnitValue as formatComponentValue } from "./unit-values";

export type ComponentQuantity = "R" | "L" | "C";
export type ComponentUnit = { symbol: string; scale: number };
export const MAX_COMPONENT_VALUE = 1e15;

/** Ascending SI prefixes; values in projects always use the base unit. */
export const componentUnits: Record<
  ComponentQuantity,
  readonly ComponentUnit[]
> = {
  C: [
    { symbol: "fF", scale: 1e-15 },
    { symbol: "pF", scale: 1e-12 },
    { symbol: "nF", scale: 1e-9 },
    { symbol: "µF", scale: 1e-6 },
    { symbol: "mF", scale: 1e-3 },
    { symbol: "F", scale: 1 },
  ],
  L: [
    { symbol: "pH", scale: 1e-12 },
    { symbol: "nH", scale: 1e-9 },
    { symbol: "µH", scale: 1e-6 },
    { symbol: "mH", scale: 1e-3 },
    { symbol: "H", scale: 1 },
  ],
  R: [
    { symbol: "µΩ", scale: 1e-6 },
    { symbol: "mΩ", scale: 1e-3 },
    { symbol: "Ω", scale: 1 },
    { symbol: "kΩ", scale: 1e3 },
    { symbol: "MΩ", scale: 1e6 },
    { symbol: "GΩ", scale: 1e9 },
  ],
};

export function initialComponentUnit(
  quantity: ComponentQuantity,
  value: number,
): ComponentUnit {
  const units = componentUnits[quantity];
  return [...units].reverse().find((unit) => value >= unit.scale) ?? units[0];
}

/** Shared by circuit labels and the component list; never changes the SI value. */
export function formatComponentLabel(
  value: number,
  quantity: ComponentQuantity,
  language: Language,
  precision: ComponentPrecision = 4,
): string {
  const unit = initialComponentUnit(quantity, value);
  return `${formatComponentValue(value, unit.scale, language, precision)} ${unit.symbol}`;
}

/** Component values are positive SI quantities, capped at the project limit. */
export const parseComponentValue = (draft: string, scale: number): number | null =>
  parseUnitValue(draft, scale, 0, MAX_COMPONENT_VALUE);
