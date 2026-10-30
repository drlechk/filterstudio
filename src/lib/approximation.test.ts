import { describe, expect, it } from "vitest";
import katex from "katex";
import { chebyshevPolynomial, filterApproximation } from "./approximation";
import { analyzeNetwork, evaluatePolynomial, magnitude } from "./network";
import { ellipticPrototype, synthesize } from "./synthesis";
import type { FilterSettings } from "./types";

const defaults: FilterSettings = {
  family: "butterworth",
  response: "lowpass",
  order: 5,
  cutoff: 1e6,
  bandwidth: 5e5,
  impedance: 50,
  ripple: 0.5,
  attenuation: 40,
};
const realPolynomial = (p: number[], x: number) =>
  evaluatePolynomial(p, { re: x, im: 0 }).re;
const power = (
  reference: ReturnType<typeof filterApproximation>,
  omega: number,
) => {
  const characteristic =
    realPolynomial(reference.numerator, omega) /
    realPolynomial(reference.denominator, omega);
  return 1 / (1 + (reference.epsilon * characteristic) ** 2);
};

describe("displayed approximation reference", () => {
  it("expands known Chebyshev polynomials exactly and agrees with their trigonometric definition", () => {
    expect(chebyshevPolynomial(0)).toEqual([1]);
    expect(chebyshevPolynomial(1)).toEqual([0, 1]);
    expect(chebyshevPolynomial(3)).toEqual([0, -3, 0, 4]);
    expect(chebyshevPolynomial(5)).toEqual([0, 5, 0, -20, 0, 16]);
    for (let n = 1; n <= 9; n++)
      for (const x of [-1, -0.7, 0, 0.2, 0.9, 1, 1.4]) {
        const expected =
          Math.abs(x) <= 1
            ? Math.cos(n * Math.acos(x))
            : Math.cosh(n * Math.acosh(x));
        expect(realPolynomial(chebyshevPolynomial(n), x)).toBeCloseTo(
          expected,
          8,
        );
      }
  });

  it("shows the actual Butterworth power function for the selected prototype order", () => {
    const reference = filterApproximation(defaults);
    expect(reference.numerator).toEqual([0, 0, 0, 0, 0, 1]);
    expect(reference.denominator).toEqual([1]);
    expect(reference.epsilon).toBe(1);
    expect(reference.latex.characteristic).toContain(
      "F_{5}(\\Omega)=\\Omega^{5}",
    );
    for (const x of [0, 0.4, 1, 2])
      expect(power(reference, x)).toBeCloseTo(1 / (1 + x ** 10), 12);
  });

  it.each(["butterworth", "chebyshev", "cauer"] as const)(
    "%s characteristic reproduces the synthesized power response for all four filter types",
    (family) => {
      for (const order of family === "cauer" ? [3, 5, 7] : [2, 5, 9]) {
        for (const response of [
          "lowpass",
          "highpass",
          "bandpass",
          "bandstop",
        ] as const) {
          const settings = { ...defaults, family, order, response };
          const reference = filterApproximation(settings);
          const circuit = synthesize(settings);
          const network = analyzeNetwork(circuit.sections, {
            fRef: settings.cutoff,
            z1: settings.impedance,
            z2: circuit.z2,
          });
          const b = settings.bandwidth! / settings.cutoff;
          for (const x of [0.12, 0.5, 0.81, 0.97, 1.03, 1.28, 1.9, 3.4]) {
            const omega =
              response === "lowpass"
                ? x
                : response === "highpass"
                  ? -1 / x
                  : response === "bandpass"
                    ? (x * x - 1) / (b * x)
                    : (b * x) / (1 - x * x);
            const actual =
              magnitude(network.evaluate(x * settings.cutoff).s21) ** 2;
            expect(power(reference, omega)).toBeCloseTo(actual, 7);
          }
        }
      }
    },
  );

  it("Cauer reference preserves ripple, finite transmission zeros, and the specified stopband edge", () => {
    for (const order of [3, 5, 7])
      for (const ripple of [0.1, 3])
        for (const attenuation of [40, 80]) {
          const settings = {
            ...defaults,
            family: "cauer" as const,
            order,
            ripple,
            attenuation,
          };
          const reference = filterApproximation(settings);
          const prototype = ellipticPrototype(order, ripple, attenuation);
          expect(power(reference, 1)).toBeCloseTo(10 ** (-ripple / 10), 9);
          expect(
            10 * Math.log10(power(reference, prototype.stopbandRatio)),
          ).toBeCloseTo(-attenuation, 5);
          for (const pole of prototype.zeros) {
            expect(power(reference, pole)).toBeLessThan(1e-15);
            expect(
              power(reference, prototype.stopbandRatio / pole),
            ).toBeCloseTo(1, 9);
          }
          expect(reference.latex.characteristic).toContain(`R_{${order}}`);
          expect(reference.denominator.length).toBe(order);
        }
  });

  it("renders every reference formula as valid KaTeX, including band mappings and elliptic coefficients", () => {
    for (const family of ["butterworth", "chebyshev", "cauer"] as const)
      for (const response of [
        "lowpass",
        "highpass",
        "bandpass",
        "bandstop",
      ] as const) {
        const reference = filterApproximation({
          ...defaults,
          family,
          response,
          order: 7,
        });
        for (const latex of Object.values(reference.latex))
          expect(() =>
            katex.renderToString(latex, {
              throwOnError: true,
              strict: "error",
            }),
          ).not.toThrow();
      }
  });
});
