import { describe, expect, it } from "vitest";
import { catalogReference, catalogTableSource, verifiedCatalogReferences } from "./filter-catalog";
import { defaultSettings } from "./project";
import { designTolerance } from "./tolerance";
import type { FilterFamily } from "./types";

// Independently evaluated using Python Decimal (60-digit AGM elliptic integrals)
// for the published n=3/5, rho=20%, theta=30° reference parameters.
const cauerReferences = [
  { order: 3, attenuation: 26.528386648019725, code: "CC 03 20 30" },
  { order: 5, attenuation: 61.42640285280452, code: "CC 05 20 30" },
];

describe("documented catalog references", () => {
  it("returns a sourced table row without manufacturing a Butterworth code", () => {
    const entry = catalogReference({ ...defaultSettings, family: "butterworth", order: 8 })!;
    expect(entry.code).toBeNull();
    expect(entry.location[1]).toBe("Table 1, column n = 8");
    expect(verifiedCatalogReferences).toContain(entry);
    for (const order of [1, 10, 100])
      expect(catalogReference({ ...defaultSettings, family: "butterworth", order })).toBeNull();
  });

  it("only matches the explicitly registered Chebyshev table cells", () => {
    const settings = { ...defaultSettings, family: "chebyshev" as const, order: 5, ripple: 1 };
    const entry = catalogReference(settings)!;
    expect(entry.code).toBeNull();
    expect(entry.location[1]).toBe("Table 2, n = 5, ripple = 1 dB");
    expect(catalogReference({ ...settings, ripple: .999999 })).toBeNull();
    expect(catalogReference({ ...settings, ripple: .5 })).toBeNull();
    expect(catalogReference({ ...settings, order: 6 })).toBeNull();
  });

  it.each(cauerReferences)("returns the literal published $code only on a matching prototype", ({ order, attenuation, code }) => {
    const settings = { ...defaultSettings, family: "cauer" as const, order, ripple: -10 * Math.log10(.96), attenuation };
    const entry = catalogReference(settings)!;
    expect(entry.code).toBe(code);
    expect(entry.sourceTitle).toContain("Zverev");
    expect(entry.location[1]).toContain("144");
    expect(entry.sourceUrl).toContain(encodeURIComponent(code));
    expect(verifiedCatalogReferences).toContain(entry);
    // No nearest-entry matching, even when the code would round to identical integers.
    expect(catalogReference({ ...settings, attenuation: attenuation + .0001 })).toBeNull();
    expect(catalogReference({ ...settings, ripple: settings.ripple + .0001 })).toBeNull();
    expect(catalogReference({ ...settings, response: "bandpass", bandwidth: 2e5, impedance: 600 })).toBe(entry);
  });

  it("does not assign a reference to arbitrary synthesized Cauer designs or other families", () => {
    const design = designTolerance({ response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 }, "cauer", 50);
    expect(catalogReference(design.settings!)).toBeNull();
    for (const family of ["bessel", "legendre", "chebyshev2", "linkwitz-riley"] as FilterFamily[])
      expect(catalogReference({ ...defaultSettings, family })).toBeNull();
    expect(catalogTableSource("cauer")).toBe("cauerTables");
  });

  it("keeps evidence on every registered entry and a finite list of literal codes", () => {
    expect(verifiedCatalogReferences.filter(entry => entry.code).map(entry => entry.code)).toEqual(["CC 03 20 30", "CC 05 20 30"]);
    for (const entry of verifiedCatalogReferences) {
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
      expect(entry.sourceTitle).toBeTruthy();
      expect(entry.location[0]).toBeTruthy();
      expect(entry.location[1]).toBeTruthy();
    }
  });
});
