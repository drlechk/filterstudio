import { describe, expect, it } from "vitest";
import { attenuationFromModularAngle, modularAngleFromAttenuation, modularAngleLimits,
  reflectionPercentFromRipple, rippleFromReflectionPercent } from "./prototype-parameters";
import { CAUER_ORDERS, cauerMinimumAttenuation } from "./filter-limits";
import { catalogReference } from "./filter-catalog";
import { createCircuit, defaultSettings, parseProject } from "./project";
import { synthesize } from "./synthesis";
import { analyzeNetwork, decibels, magnitude } from "./network";
import type { Project } from "./types";

describe("reflection coefficient and modular angle inputs", () => {
  it("converts amplitude reflection (not reflected power) to ripple", () => {
    expect(rippleFromReflectionPercent(20)).toBeCloseTo(-10 * Math.log10(.96), 14);
    for (const ripple of [.1, .2, .5, 1, 3])
      expect(rippleFromReflectionPercent(reflectionPercentFromRipple(ripple))).toBeCloseTo(ripple, 14);
    for (const percent of [NaN, Infinity, -20, 0, 100, 101])
      expect(() => rippleFromReflectionPercent(percent)).toThrow(RangeError);
  });

  // Independent 60-digit Decimal/AGM reference values used by the catalog tests.
  it.each([[3, 26.528386648019725], [5, 61.42640285280452]])(
    "reconstructs the documented n=%s, rho=20%%, theta=30° prototype", (order, expected) => {
      const ripple = rippleFromReflectionPercent(20);
      const attenuation = attenuationFromModularAngle(order, ripple, 30);
      expect(attenuation).toBeCloseTo(expected, 10);
      expect(catalogReference({ ...defaultSettings, family: "cauer", order, ripple, attenuation })?.code)
        .toBe(`CC 0${order} 20 30`);
    },
  );

  it("round-trips every supported Cauer order and rejects infeasible angles", () => {
    for (const order of CAUER_ORDERS) for (const ripple of [.1, .5, 3]) {
      const limits = modularAngleLimits(order, ripple);
      for (const attenuation of [cauerMinimumAttenuation(order), 55, 80]) {
        const angle = modularAngleFromAttenuation(order, ripple, attenuation);
        expect(angle).toBeGreaterThan(0);
        expect(angle).toBeLessThan(90);
        expect(attenuationFromModularAngle(order, ripple, angle)).toBeCloseTo(attenuation, 8);
      }
      for (const angle of [limits.min - 1e-5, limits.max + 1e-5, 0, 90, NaN, Infinity])
        expect(() => attenuationFromModularAngle(order, ripple, angle)).toThrow(RangeError);
    }
  });

  it("realizes the specified reflection across filter responses and survives project export/import", () => {
    for (const family of ["chebyshev", "cauer"] as const)
      for (const response of ["lowpass", "highpass", "bandpass", "bandstop"] as const)
        for (const ladderStart of ["series", "shunt"] as const) {
          const ripple = rippleFromReflectionPercent(20);
          const settings = { ...defaultSettings, family, response, ladderStart, bandwidth: 5e5,
            order: family === "chebyshev" ? 4 : 5, ripple,
            attenuation: family === "cauer" ? attenuationFromModularAngle(5, ripple, 30) : 40 };
          const result = synthesize(settings);
          const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: settings.impedance, z2: result.z2 });
          // Map positive normalized low-pass frequencies into each physical response.
          const physical = (omega: number) => {
            const f0 = settings.cutoff, bw = settings.bandwidth;
            if (response === "lowpass") return omega * f0;
            if (response === "highpass") return f0 / omega;
            const offset = response === "bandpass" ? bw * omega : bw / omega;
            return (Math.sqrt(offset ** 2 + 4 * f0 ** 2) + offset) / 2;
          };
          for (const omega of [.05, .25, .5, .75, 1]) {
            const reflection = magnitude(network.evaluate(physical(omega)).s11);
            expect(reflection).toBeLessThanOrEqual(.2 + 1e-6);
            if (omega === 1) expect(reflection).toBeCloseTo(.2, 6);
          }
          if (family === "cauer")
            expect(decibels(network.evaluate(physical(2)).s21)).toBeCloseTo(-settings.attenuation, 5);
          const project: Project = { version: 1, name: "Prototype parameters", settings,
            ...createCircuit(result.sections), z2: result.z2, sweep: { min: 1e4, max: 1e8, points: 501 } };
          const reopened = parseProject(JSON.parse(JSON.stringify(project)));
          expect(reopened).toEqual(project);
          expect(reflectionPercentFromRipple(reopened.settings.ripple)).toBeCloseTo(20, 12);
          if (family === "cauer") expect(modularAngleFromAttenuation(5, reopened.settings.ripple, reopened.settings.attenuation)).toBeCloseTo(30, 10);
        }
  });
});
