import { describe, expect, it } from "vitest";
import { catalogReference, catalogTableSource } from "./filter-catalog";
import { defaultSettings } from "./project";
import { designTolerance } from "./tolerance";
import type { FilterFamily } from "./types";

describe("catalog lookup coordinates", () => {
  it("uses Zverev B for Butterworth and does not truncate orders above 99", () => {
    expect(catalogReference({ ...defaultSettings, family: "butterworth", order: 5 })?.code).toBe("B 05");
    expect(catalogReference({ ...defaultSettings, family: "butterworth", order: 100 })?.code).toBe("B 100");
  });

  it("converts ripple in dB to reflection percent rather than using dB as the catalog suffix", () => {
    const result = catalogReference({ ...defaultSettings, family: "chebyshev", order: 7, ripple: -10 * Math.log10(1 - .1 ** 2) })!;
    expect(result.code).toBe("C 07 10");
    expect(result.alternative).toBe("T 07 10");
    expect(result.reflectionPercent).toBeCloseTo(10, 10);
    expect(result.fractional).toBe(false);
    const betweenEntries = catalogReference({ ...defaultSettings, family: "chebyshev", ripple: .5 })!;
    expect(betweenEntries.fractional).toBe(true);
    expect(betweenEntries.code).toContain("32.9771");
    // Independently evaluated with Python Decimal at 60-digit precision.
    expect(betweenEntries.reflectionPercent).toBeCloseTo(32.97712265590412, 10);
  });

  it("uses the realized Cauer stopband instead of the mask edge after order rounding", () => {
    const design = designTolerance({ response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 }, "cauer", 50);
    expect(design.minimumOrder).toBe(4);
    expect(design.settings!.order).toBe(5);
    const reference = catalogReference(design.settings!)!;
    expect(reference.code).toMatch(/^CC 05 /);
    expect(reference.alternative).toMatch(/^C 05 /);
    expect(reference.stopbandRatio).toBeLessThan(2);
    expect(reference.modularAngle).toBeGreaterThan(30);
    expect(reference.modularAngle).toBeLessThan(90);
    // A transformed bandpass has degree 10 but keeps its order-5 catalog prototype.
    expect(catalogReference({ ...design.settings!, response: "bandpass", bandwidth: 2e5, impedance: 600 })).toEqual(reference);
  });

  it("does not invent historical codes for families outside the documented convention", () => {
    for (const family of ["bessel", "legendre", "chebyshev2", "linkwitz-riley"] as FilterFamily[])
      expect(catalogReference({ ...defaultSettings, family })).toBeNull();
    expect(catalogTableSource("linkwitz-riley")).toBeNull();
    expect(catalogTableSource("cauer")).toBe("cauerTables");
  });
});
