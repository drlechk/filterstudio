import type { CircuitNode, ComponentPrecision } from "./types";

export const DEFAULT_COMPONENT_PRECISION = 4;
export const componentPrecisionOptions = Array.from({ length: 15 }, (_, i) => i + 1);

export function isRoundingDigits(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 15;
}

export function isComponentPrecision(value: unknown): value is ComponentPrecision {
  return value === "full" || isRoundingDigits(value);
}

/** Explicit physical rounding in SI units, independent of the displayed unit. */
export function roundComponentValues(nodes: CircuitNode[], digits: number) {
  if (!isRoundingDigits(digits)) throw new RangeError("Expected 1–15 significant digits.");
  let changedValues = 0;
  const rounded = nodes.map((node) => {
    const section = node.section;
    if (!section) return node;
    const value = Number(section.value.toPrecision(digits));
    const value2 = section.kind === "LC"
      ? Number(section.value2!.toPrecision(digits))
      : section.value2;
    if (value === section.value && value2 === section.value2) return node;
    if (value !== section.value) changedValues++;
    if (value2 !== section.value2) changedValues++;
    return {
      ...node,
      section: {
        ...section,
        value,
        ...(section.kind === "LC" ? { value2 } : {}),
      },
    };
  });
  return { nodes: changedValues ? rounded : nodes, changedValues };
}
