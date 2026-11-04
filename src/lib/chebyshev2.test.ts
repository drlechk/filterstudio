import { describe, expect, it } from "vitest";
import katex from "katex";
import { synthesize } from "./synthesis";
import { analyzeNetwork, decibels, evaluatePolynomial, magnitude } from "./network";
import { CHEBYSHEV_II_ORDERS, chebyshevIIMinimumAttenuation, nearestFilterOrder } from "./filter-limits";
import { createCircuit, defaultSettings, parseProject } from "./project";
import { designTolerance, toleranceRegions } from "./tolerance";
import { filterApproximation } from "./approximation";
import { circuitLatex } from "./circuit-export";
import { translateMessage } from "./messages";
import type { FilterSettings, FilterResponse, ToleranceSpec } from "./types";

const defaults: FilterSettings = { ...defaultSettings, family: "chebyshev2", bandwidth: 5e5 };
function make(patch: Partial<FilterSettings> = {}) {
  const settings = { ...defaults, ...patch }, result = synthesize(settings);
  const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: settings.impedance, z2: result.z2 });
  return { settings, result, network };
}
// Independent analytic definition, normalized to the stopband edge, not the 3 dB point.
function referencePower(n: number, rs: number, omega: number) {
  const x = Math.abs(omega);
  if (!x) return 1;
  const t = x < 1 ? Math.cosh(n * Math.acosh(1 / x)) : Math.cos(n * Math.acos(1 / x));
  return t * t / (t * t + Math.expm1(rs * Math.LN10 / 10));
}
const responses: FilterResponse[] = ["lowpass", "highpass", "bandpass", "bandstop"];

describe("passive inverse-Chebyshev synthesis", () => {
  it.each(CHEBYSHEV_II_ORDERS)("matches the analytic response, stopband peaks and transmission zeros at order %i", order => {
    const min = chebyshevIIMinimumAttenuation(order);
    for (const attenuation of new Set([min, Math.min(80, min + .37), (min + 80) / 2, 80])) {
      const { result, network } = make({ order, attenuation });
      expect(result.z2).toBe(defaults.impedance);
      expect(result.sections.every(section => section.value > 0 && Number.isFinite(section.value) && (section.kind !== "LC" || (section.value2! > 0 && Number.isFinite(section.value2))))).toBe(true);
      let previous = 1;
      for (let i = 0; i <= 120; i++) {
        const x = i / 120, actual = network.evaluate(x * defaults.cutoff);
        const power = magnitude(actual.s21) ** 2;
        expect(power).toBeLessThanOrEqual(previous + 1e-8);
        expect(power).toBeCloseTo(referencePower(order, attenuation, x), 7);
        expect(power + magnitude(actual.s11) ** 2).toBeCloseTo(1, 9);
        previous = power;
      }
      expect(decibels(network.evaluate(defaults.cutoff).s21)).toBeCloseTo(-attenuation, 5);
      for (let i = 0; i < 80; i++) {
        const x = 10 ** (3 * i / 79);
        const actual = magnitude(network.evaluate(x * defaults.cutoff).s21) ** 2;
        expect(actual).toBeCloseTo(referencePower(order, attenuation, x), 9);
        expect(actual).toBeLessThanOrEqual(10 ** (-attenuation / 10) * (1 + 1e-6));
      }
      for (let k = 1; k <= (order - 1) / 2; k++) {
        const zero = 1 / Math.cos((2 * k - 1) * Math.PI / (2 * order));
        expect(magnitude(network.evaluate(zero * defaults.cutoff).s21)).toBeLessThan(1e-8);
        const peak = 1 / Math.cos(k * Math.PI / order);
        expect(decibels(network.evaluate(peak * defaults.cutoff).s21)).toBeCloseTo(-attenuation, 5);
      }
    }
  });

  it.each(responses)("preserves the prototype under the %s frequency transform and round-trips projects and exports", response => {
    for (const order of [1, 5, 9, 11]) for (const relativeBandwidth of [.001, .5, 4]) {
      const attenuation = Math.max(40, chebyshevIIMinimumAttenuation(order));
      const { settings, result, network } = make({ order, attenuation, response, bandwidth: relativeBandwidth * defaults.cutoff });
      const low = make({ order, attenuation }).network;
      for (const ratio of [.01, .5, .99, 1.0001, 1.1, 2, 100]) {
        const mapped = response === "lowpass" ? ratio : response === "highpass" ? -1 / ratio
          : response === "bandpass" ? (ratio - 1 / ratio) / relativeBandwidth : relativeBandwidth * ratio / (1 - ratio * ratio);
        const actual = network.evaluate(ratio * settings.cutoff), expected = low.evaluate(Math.abs(mapped) * settings.cutoff);
        for (const key of ["s11", "s21", "s12", "s22"] as const) {
          expect(actual[key].re).toBeCloseTo(expected[key].re, 6);
          expect(actual[key].im).toBeCloseTo(Math.sign(mapped) * expected[key].im, 6);
        }
        expect(magnitude(actual.s21) ** 2).toBeCloseTo(referencePower(order, attenuation, mapped), 7);
      }
      const project = { version: 1 as const, name: "Inverse Chebyshev", settings, ...createCircuit(result.sections), z2: result.z2, sweep: { min: 1e4, max: 1e8, points: 601 } };
      expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
      expect(circuitLatex(project, { symbols: "european", matrices: "typeset" }, network)).toContain("\\begin{circuitikz}");
    }
  });

  it("shows the inverse characteristic and ignores the unused passband-ripple parameter", () => {
    const reference = filterApproximation(defaults);
    expect(reference.numerator).toEqual([0, 0, 0, 0, 0, 1]);
    expect(reference.denominator).toEqual([16, 0, -20, 0, 5]);
    for (const omega of [-3, -.5, 0, .1, .9, 1, 1.5, 100]) {
      const characteristic = evaluatePolynomial(reference.numerator, { re: omega, im: 0 }).re / evaluatePolynomial(reference.denominator, { re: omega, im: 0 }).re;
      expect(1 / (1 + (reference.epsilon * characteristic) ** 2)).toBeCloseTo(referencePower(5, 40, omega), 12);
    }
    for (const latex of Object.values(reference.latex)) expect(() => katex.renderToString(latex, { throwOnError: true })).not.toThrow();
    expect(synthesize({ ...defaults, ripple: .1 })).toEqual(synthesize({ ...defaults, ripple: 3 }));
    for (const note of synthesize(defaults).notes) expect(translateMessage(note, "en")).not.toBe(note);
  });

  it("rejects unsupported LC realizations instead of changing the family or accepting negative parts", () => {
    for (const order of [0, 2, 4, 6, 8, 10, 12, 13, 20]) expect(() => synthesize({ ...defaults, order })).toThrow();
    for (const order of CHEBYSHEV_II_ORDERS) {
      for (const attenuation of [NaN, Infinity, 81, chebyshevIIMinimumAttenuation(order) - .01]) expect(() => synthesize({ ...defaults, order, attenuation })).toThrow();
    }
    expect(nearestFilterOrder("chebyshev2", 20)).toBe(11);
    expect(nearestFilterOrder("chebyshev2", 6)).toBe(5);
  });
});

describe("inverse-Chebyshev tolerance masks", () => {
  const masks: Record<FilterResponse, ToleranceSpec> = {
    lowpass: { response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 },
    highpass: { response: "highpass", passband: [1e6], stopband: [.5e6], passbandLoss: 1, stopbandLoss: 40 },
    bandpass: { response: "bandpass", passband: [.8e6, 1.2e6], stopband: [.4e6, 2e6], passbandLoss: 1, stopbandLoss: 40 },
    bandstop: { response: "bandstop", passband: [.5e6, 2e6], stopband: [.8e6, 1.3e6], passbandLoss: 1, stopbandLoss: 40 },
  };
  it.each(responses)("meets the %s mask with the actual ladder, using the inferred stopband edge", response => {
    const spec = masks[response], design = designTolerance(spec, "chebyshev2", 50);
    expect(design.issue).toBeNull();
    const { network } = make(design.settings!);
    for (const edge of spec.passband) expect(-decibels(network.evaluate(edge).s21)).toBeCloseTo(spec.passbandLoss, 5);
    for (const [region, intervals] of Object.entries(toleranceRegions(spec, 1e3, 1e9))) for (const [lo, hi] of intervals) for (let i = 0; i <= 120; i++) {
      const loss = -decibels(network.evaluate(lo * (hi / lo) ** (i / 120)).s21);
      if (region === "passband") expect(loss).toBeLessThanOrEqual(spec.passbandLoss + 1e-5);
      else expect(loss).toBeGreaterThanOrEqual(spec.stopbandLoss - 1e-5);
    }
  });
  it("finds the highest supported order and rejects masks beyond the passive realization range", () => {
    const passbandLoss = .5, stopbandLoss = 80;
    const ratio = Math.cosh(Math.acosh(Math.sqrt(Math.expm1(stopbandLoss * Math.LN10 / 10) / Math.expm1(passbandLoss * Math.LN10 / 10))) / 10.5);
    const spec = { ...masks.lowpass, passbandLoss, stopbandLoss, stopband: [ratio * 1e6] };
    const design = designTolerance(spec, "chebyshev2", 50);
    expect(design.settings?.order).toBe(11);
    const { network } = make(design.settings!);
    expect(-decibels(network.evaluate(1e6).s21)).toBeCloseTo(passbandLoss, 5);
    expect(-decibels(network.evaluate(spec.stopband[0]).s21)).toBeGreaterThanOrEqual(stopbandLoss - 1e-5);
    expect(designTolerance({ ...spec, stopband: [1.001e6] }, "chebyshev2", 50).issue).toBe("order");
  });
});
