import type { Language } from "./preference-storage";
import type { ComponentPrecision } from "./types";

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

/** Shift decimal digits directly so 5.15 nF does not display as 5.1499999999999995. */
function shiftDecimal(value: number, exponent: number): string {
  const [coefficient, originalExponent] = value.toExponential().split("e");
  const shiftedExponent = Number(originalExponent) + exponent;
  if (shiftedExponent < -6 || shiftedExponent >= 21)
    return `${coefficient}e${shiftedExponent >= 0 ? "+" : ""}${shiftedExponent}`;
  const digits = coefficient.replace(".", "");
  const point = shiftedExponent + 1;
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + "0".repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

export function formatComponentValue(
  value: number,
  scale: number,
  language: Language,
  precision: ComponentPrecision = "full",
): string {
  const rounded = precision === "full" ? value : Number(value.toPrecision(precision));
  const scaleExponent = Math.log10(scale);
  const scaled = Number.isInteger(scaleExponent) && Number.isFinite(rounded) && rounded > 0
    ? shiftDecimal(rounded, -scaleExponent)
    : String(rounded / scale);
  if (precision === "full")
    return scaled.replace(".", language === "de" ? "," : ".");
  return new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US", {
    useGrouping: false,
    maximumSignificantDigits: precision,
  }).format(Number(scaled));
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

/** Accept either decimal separator and scientific notation, but no grouping. */
export function parseComponentValue(
  draft: string,
  scale: number,
): number | null {
  const normalized = draft.trim().replace(",", ".");
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized))
    return null;
  const entered = Number(normalized);
  const scaleExponent = Math.log10(scale);
  const value = Number.isInteger(scaleExponent) && Number.isFinite(entered) && entered > 0
    ? Number(shiftDecimal(entered, scaleExponent))
    : entered * scale;
  return Number.isFinite(scale) &&
    scale > 0 &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_COMPONENT_VALUE
    ? value
    : null;
}
