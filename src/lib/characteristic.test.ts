import { describe, expect, it } from "vitest";
import katex from "katex";
import { analyzeNetwork, evaluateRational, magnitude } from "./network";
import { synthesize } from "./synthesis";
import { defaultSettings } from "./project";
import type { Section } from "./types";

describe("characteristic function of the actual circuit", () => {
  it("recovers the analytic third-order Butterworth characteristic", () => {
    const w = 2 * Math.PI * 1e6;
    const sections: Section[] = [
      { id: "L1", kind: "L", connection: "series", value: 50 / w },
      { id: "C2", kind: "C", connection: "shunt", value: 2 / (w * 50) },
      { id: "L3", kind: "L", connection: "series", value: 50 / w },
    ];
    const network = analyzeNetwork(sections, { fRef: 1e6, z1: 50 });
    expect(network.characteristic).toEqual({ num: [0, 0, 0, 1], den: [1] });
    expect(network.lossless).toBe(true);
    expect(network.latex.characteristic).toContain("\\Psi(p)=p^{3}");
    const edited = analyzeNetwork(
      sections.map((s) => (s.id === "C2" ? { ...s, value: s.value * 1.2 } : s)),
      { fRef: 1e6, z1: 50 },
    );
    expect(edited.characteristic).not.toEqual(network.characteristic);
  });

  it.each(["butterworth", "chebyshev", "cauer"] as const)(
    "%s Ψ reproduces the actual reflection and power response for every filter type",
    (family) => {
      for (const response of [
        "lowpass",
        "highpass",
        "bandpass",
        "bandstop",
      ] as const) {
        // Even Chebyshev includes unequal synthesis terminations.
        const settings = {
          ...defaultSettings,
          family,
          response,
          order: family === "chebyshev" ? 4 : 5,
          bandwidth: 0.5e6,
        };
        const result = synthesize(settings);
        const network = analyzeNetwork(result.sections, {
          fRef: settings.cutoff,
          z1: settings.impedance,
          z2: result.z2,
        });
        for (const x of [0.17, 0.49, 0.83, 1.21, 2.7]) {
          const psi = evaluateRational(network.characteristic, x);
          const s = network.evaluate(x * settings.cutoff);
          // Ψ*S21 = S11 checks the complex phase as well as magnitude.
          expect(psi.re * s.s21.re - psi.im * s.s21.im).toBeCloseTo(s.s11.re, 7);
          expect(psi.re * s.s21.im + psi.im * s.s21.re).toBeCloseTo(s.s11.im, 7);
          expect(1 / (1 + magnitude(psi) ** 2)).toBeCloseTo(
            magnitude(s.s21) ** 2,
            7,
          );
        }
        for (const latex of [
          network.latex.characteristic,
          network.latex.characteristicResponse!,
          network.latex.abcd,
          network.latex.abcdDenominator,
          ...Object.values(network.latex.abcdEntries),
          ...network.latex.sections,
        ]) {
          expect(() =>
            katex.renderToString(latex, {
              throwOnError: true,
              strict: "error",
            }),
          ).not.toThrow();
        }
      }
    },
  );

  it("handles a matched through and an unequal-port junction", () => {
    const through = analyzeNetwork([], { fRef: 1e6, z1: 50 });
    expect(through.characteristic).toEqual({ num: [0], den: [1] });
    expect(through.latex.characteristic).toContain("\\Psi(p)=0");
    const mismatch = analyzeNetwork([], { fRef: 1e6, z1: 50, z2: 100 });
    expect(evaluateRational(mismatch.characteristic, 1).re).toBeCloseTo(
      1 / (2 * Math.sqrt(2)),
      12,
    );
  });

  it("keeps the reflection/transmission quotient for resistors without claiming the lossless power identity", () => {
    const network = analyzeNetwork(
      [{ id: "R1", kind: "R", connection: "series", value: 50 }],
      { fRef: 1e6, z1: 50 },
    );
    expect(network.lossless).toBe(false);
    expect(network.latex.characteristicResponse).toBeUndefined();
    const psi = evaluateRational(network.characteristic, 1);
    expect(psi.re).toBeCloseTo(0.5, 12);
    expect(psi.im).toBe(0);
    expect(1 / (1 + magnitude(psi) ** 2)).not.toBeCloseTo(
      magnitude(network.evaluate(1e6).s21) ** 2,
      3,
    );
  });

  it("identifies a characteristic pole at a finite transmission zero", () => {
    const network = analyzeNetwork(
      [
        {
          id: "LC1",
          kind: "LC",
          connection: "series",
          value: 1,
          value2: 1,
          resonator: "parallel",
        },
      ],
      { fRef: 1 / (2 * Math.PI), z1: 1 },
    );
    expect(magnitude(network.evaluate(network.fRef).s21)).toBe(0);
    expect(
      magnitude(evaluateRational(network.characteristic, 0.99999)),
    ).toBeGreaterThan(20000);
    expect(
      magnitude(evaluateRational(network.characteristic, 1.00001)),
    ).toBeGreaterThan(20000);
  });
});
