import { describe, expect, it } from "vitest";
import {
  formatComponentValue,
  initialComponentUnit,
  parseComponentValue,
} from "./component-units";

describe("component value units", () => {
  it("converts capacitor, inductor, and resistor inputs into SI values", () => {
    for (const [input, scale, expected] of [
      ["470", 1e-12, 4.7e-10],
      ["4,7", 1e-9, 4.7e-9],
      ["0.1", 1e-6, 1e-7],
      ["2.2", 1e-3, 0.0022],
      ["47", 1e3, 47000],
      ["1e3", 1, 1000],
    ] as const) {
      const actual = parseComponentValue(input, scale);
      expect(actual).not.toBeNull();
      expect(actual! / expected).toBeCloseTo(1, 14);
    }
  });

  it("chooses useful initial units for small capacitors, inductors, and large resistors", () => {
    expect(initialComponentUnit("C", 470e-12).symbol).toBe("pF");
    expect(initialComponentUnit("L", 10e-6).symbol).toBe("µH");
    expect(initialComponentUnit("R", 47000).symbol).toBe("kΩ");
    expect(initialComponentUnit("C", 0.1e-15).symbol).toBe("fF");
  });

  it("converts display units without introducing grouping or decimal ambiguity", () => {
    expect(formatComponentValue(4.7e-9, 1e-12, "en")).toBe("4700");
    expect(formatComponentValue(4.7e-9, 1e-12, "de")).toBe("4700");
    expect(formatComponentValue(4.7e-9, 1e-6, "en")).toBe("0.0047");
    expect(formatComponentValue(4.7e-9, 1e-6, "de")).toBe("0,0047");
    expect(formatComponentValue(47000, 1e6, "en")).toBe("0.047");
    expect(parseComponentValue("4700", 1e-12)! / 4.7e-9).toBeCloseTo(1, 14);
    expect(parseComponentValue("0,0047", 1e-6)! / 4.7e-9).toBeCloseTo(1, 14);
    expect(parseComponentValue("5.15", 1e-9)).toBe(5.15e-9);
    expect(parseComponentValue("5150", 1e-12)).toBe(5.15e-9);
    expect(parseComponentValue("0,00515", 1e-6)).toBe(5.15e-9);
  });

  it("rejects invalid values and checks limits after conversion to the base unit", () => {
    for (const input of [
      "",
      " ",
      "0",
      "-1",
      "Infinity",
      "NaN",
      "0x10",
      "1,000.5",
      "1.2.3",
      "10 nF",
      "1e309",
      "1e-999",
    ]) {
      expect(parseComponentValue(input, 1), input).toBeNull();
    }
    expect(parseComponentValue("1e6", 1e9)).toBe(1e15);
    expect(parseComponentValue("1e7", 1e9)).toBeNull();
    expect(parseComponentValue("1", 0)).toBeNull();
    expect(parseComponentValue("1", Infinity)).toBeNull();
  });
});
