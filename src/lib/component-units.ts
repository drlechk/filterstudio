import type { Language } from "./preference-storage";

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

export function formatComponentValue(
  value: number,
  scale: number,
  language: Language,
): string {
  return new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US", {
    useGrouping: false,
    maximumSignificantDigits: 10,
  }).format(value / scale);
}

/** Accept either decimal separator and scientific notation, but no grouping. */
export function parseComponentValue(
  draft: string,
  scale: number,
): number | null {
  const normalized = draft.trim().replace(",", ".");
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized))
    return null;
  const value = Number(normalized) * scale;
  return Number.isFinite(scale) &&
    scale > 0 &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_COMPONENT_VALUE
    ? value
    : null;
}
