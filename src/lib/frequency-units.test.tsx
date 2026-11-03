import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FrequencyInput } from "../components/FrequencyInput";
import { PreferencesProvider } from "./preferences";
import { frequencyUnits, frequencyUnitScale } from "./frequency-units";
import { formatUnitValue, parseUnitValue } from "./unit-values";

describe("frequency input units", () => {
  it.each([
    ["Hz", "1000000"], ["kHz", "1000"], ["MHz", "1"], ["GHz", "0.001"],
  ] as const)("represents the same 1 MHz frequency in %s", (unit, expected) => {
    const scale = frequencyUnitScale(unit);
    expect(formatUnitValue(1e6, scale, "en")).toBe(expected);
    expect(parseUnitValue(expected, scale, 1, 1e12)).toBe(1e6);
    const markup = renderToStaticMarkup(<PreferencesProvider><FrequencyInput
      value={1e6} unit={unit} label="Cutoff frequency" onChange={() => {}} onUnitChange={() => {}}
    /></PreferencesProvider>);
    expect(markup).toContain(`aria-label="Cutoff frequency (${unit})"`);
    expect(markup).toContain(`value="${expected}"`);
    for (const candidate of frequencyUnits) expect(markup).toContain(`value="${candidate.symbol}"`);
    expect(markup).toContain(`value="${unit}" selected=""`);
  });

  it("preserves full stored precision when formatting across units", () => {
    const value = 1234567.8901234567;
    expect(formatUnitValue(value, 1, "en")).toBe("1234567.8901234567");
    expect(formatUnitValue(value, 1e3, "en")).toBe("1234.5678901234567");
    expect(formatUnitValue(value, 1e6, "de")).toBe("1,2345678901234567");
    expect(formatUnitValue(value, 1e9, "en")).toBe("0.0012345678901234567");
  });

  it("accepts decimal commas and scientific notation without floating-point scaling artifacts", () => {
    expect(parseUnitValue("2,45", 1e9, 1, 1e12)).toBe(2450000000);
    expect(parseUnitValue("0.000001", 1e6, 1, 1e12)).toBe(1);
    expect(parseUnitValue("1e-9", 1e9, 1, 1e12)).toBe(1);
    expect(parseUnitValue("4.01", 1e3, 1, 1e12)).toBe(4010);
  });

  it("enforces the same physical limits in every unit", () => {
    for (const { scale } of frequencyUnits) {
      for (const value of [1, 1e12]) {
        expect(parseUnitValue(formatUnitValue(value, scale, "en"), scale, 1, 1e12)).toBe(value);
      }
      for (const value of [.999, 1e12 + 1]) {
        expect(parseUnitValue(formatUnitValue(value, scale, "en"), scale, 1, 1e12)).toBeNull();
      }
    }
    expect(parseUnitValue("1e-12", 1e9, 1e-3, 1e15)).toBe(1e-3);
    expect(parseUnitValue("1e6", 1e9, 1e-3, 1e15)).toBe(1e15);
  });

  it("rejects incomplete or ambiguous input instead of reinterpreting it in another unit", () => {
    for (const draft of ["", "-1", "0", "1,000.5", "1e", "2 MHz", "Infinity", "0x10"]) {
      expect(parseUnitValue(draft, 1e6, 1, 1e12), draft).toBeNull();
    }
  });
});
