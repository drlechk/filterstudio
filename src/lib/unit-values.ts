import type { Language } from "./preference-storage";
import type { ComponentPrecision } from "./types";

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

export function formatUnitValue(
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

/** Accept either decimal separator and scientific notation, but no grouping. */
export function parseUnitValue(
  draft: string,
  scale: number,
  min = 0,
  max = Infinity,
  allowZero = false,
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
    (value > 0 || (allowZero && value === 0 && /^\+?(?:0+(?:\.0*)?|\.0+)(?:e[+-]?\d+)?$/i.test(normalized))) &&
    value >= min &&
    value <= max
    ? value
    : null;
}
