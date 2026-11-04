import { describe, expect, it } from "vitest";
import katex from "katex";
import fixtures from "./fixtures/monotonic-reference.json";
import { synthesize } from "./synthesis";
import { analyzeNetwork, decibels, evaluatePolynomial, magnitude } from "./network";
import { defaultSettings, createCircuit, parseProject } from "./project";
import { filterApproximation } from "./approximation";
import { monotonicAttenuation, monotonicFrequency, monotonicPrototype, type MonotonicFamily } from "./monotonic";
import { designTolerance, toleranceRegions } from "./tolerance";
import { circuitLatex } from "./circuit-export";
import { translateMessage } from "./messages";
import type { FilterResponse, FilterSettings, ToleranceSpec } from "./types";

const families: MonotonicFamily[] = ["bessel", "legendre"];
const responses: FilterResponse[] = ["lowpass", "highpass", "bandpass", "bandstop"];
function make(family: MonotonicFamily, patch: Partial<FilterSettings> = {}) {
  const settings = { ...defaultSettings, family, bandwidth: 5e5, ...patch };
  const result = synthesize(settings);
  const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: settings.impedance, z2: result.z2 });
  return { settings, result, network };
}

describe("Bessel and Legendre passive ladders", () => {
  it.each(fixtures.cases)("matches independent $family reference samples at order $order", ({ family, order, samples }) => {
    const { result, network } = make(family as MonotonicFamily, { order });
    expect(result.sections).toHaveLength(order);
    expect(result.z2).toBe(defaultSettings.impedance);
    expect(result.sections.every(s => s.value > 0 && Number.isFinite(s.value))).toBe(true);
    for (const sample of samples) {
      const s = network.evaluate(sample.frequency * defaultSettings.cutoff);
      if ("re" in sample) {
        expect(s.s21.re).toBeCloseTo(sample.re, 9);
        expect(s.s21.im).toBeCloseTo(sample.im, 9);
      } else expect(magnitude(s.s21) ** 2).toBeCloseTo(sample.power, 9);
      expect(magnitude(s.s21) ** 2 + magnitude(s.s11) ** 2).toBeCloseTo(1, 10);
      expect(s.s12.re).toBeCloseTo(s.s21.re, 10);
      expect(s.s12.im).toBeCloseTo(s.s21.im, 10);
      // decibels() intentionally clips plots at -160 dB; compare the raw value.
      expect(-20 * Math.log10(magnitude(s.s21))).toBeCloseTo(monotonicAttenuation(family as MonotonicFamily, order, sample.frequency), 7);
    }
    expect(decibels(network.evaluate(defaultSettings.cutoff).s21)).toBeCloseTo(-10 * Math.log10(2), 9);
    let previous = 1;
    for (let i = 0; i <= 500; i++) {
      const power = magnitude(network.evaluate((i / 250) * defaultSettings.cutoff).s21) ** 2;
      expect(power).toBeLessThanOrEqual(previous + 1e-10);
      previous = power;
    }
  });

  it.each(families)("preserves %s magnitude and phase under all four frequency transformations", family => {
    for (const order of [1, 2, 5, 10, 19, 20]) {
      const low = make(family, { order }).network;
      for (const response of responses) for (const b of [.001, .5, 4]) {
        const { settings, network } = make(family, { order, response, bandwidth: b * defaultSettings.cutoff });
        for (const x of [.01, .5, .99, 1.0001, 1.1, 2, 100]) {
          const mapped = response === "lowpass" ? x : response === "highpass" ? -1 / x
            : response === "bandpass" ? (x - 1 / x) / b : b * x / (1 - x * x);
          const actual = network.evaluate(x * settings.cutoff), expected = low.evaluate(Math.abs(mapped) * settings.cutoff);
          for (const key of ["s11", "s21", "s12", "s22"] as const) {
            expect(actual[key].re).toBeCloseTo(expected[key].re, 7);
            expect(actual[key].im).toBeCloseTo(Math.sign(mapped) * expected[key].im, 7);
          }
        }
      }
    }
  });

  it("preserves Bessel group delay near DC after half-power normalization", () => {
    for (const order of [3, 5, 10, 20]) {
      const { network } = make("bessel", { order });
      const expected = monotonicPrototype("bessel", order).alpha;
      for (const x of [.01, .03, .1]) {
        const h = 1e-5, before = network.evaluate((x - h) * defaultSettings.cutoff).s21, after = network.evaluate((x + h) * defaultSettings.cutoff).s21;
        const phaseDifference = Math.atan2(after.im * before.re - after.re * before.im, after.re * before.re + after.im * before.im);
        expect(-phaseDifference / (2 * h) / expected).toBeCloseTo(1, 5);
      }
    }
  });

  it.each(families)("round-trips %s projects and exports the actual circuit and valid reference formulas", family => {
    for (const response of responses) for (const order of [2, 5, 20]) {
      const { settings, result, network } = make(family, { order, response });
      const project = { version: 1 as const, name: family, settings, ...createCircuit(result.sections), z2: result.z2, sweep: { min: 1e4, max: 1e8, points: 601 } };
      expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
      expect(circuitLatex(project, { symbols: "european", matrices: "typeset" }, network)).toContain("\\begin{circuitikz}");
      const reference = filterApproximation(settings);
      expect(reference.characteristicPower).toBe(2);
      expect(reference.epsilon).toBe(1);
      for (const latex of Object.values(reference.latex)) expect(() => katex.renderToString(latex, { throwOnError: true })).not.toThrow();
      // Expanded high-order Legendre coefficients are a display representation;
      // the factored reference and actual circuit are used for numerical analysis.
      if (order <= 5) for (const x of [0, .1, .5, 1, 2]) {
        const squared = evaluatePolynomial(reference.numerator, { re: x, im: 0 }).re;
        expect(1 / (1 + squared)).toBeCloseTo(10 ** (-monotonicAttenuation(family, order, x) / 10), 10);
      }
    }
    const defaults = make(family).settings;
    expect(synthesize({ ...defaults, ripple: .1, attenuation: 20 })).toEqual(synthesize({ ...defaults, ripple: 3, attenuation: 80 }));
    for (const note of synthesize(defaults).notes) expect(translateMessage(note, "en")).not.toBe(note);
    for (const order of [0, 1.5, 21, NaN, Infinity]) expect(() => synthesize({ ...defaults, order })).toThrow();
  });

  it("contains the known optimum-L polynomials, not ordinary Legendre polynomials", () => {
    const expected = [[0, 1], [0, 0, 1], [0, 1, -3, 3], [0, 0, 3, -8, 6], [0, 1, -8, 28, -40, 20], [0, 0, 6, -40, 105, -120, 50]];
    for (const [i, coefficients] of expected.entries()) expect(monotonicPrototype("legendre", i + 1).loss).toEqual(coefficients);
  });
});

describe("Bessel and Legendre tolerance design", () => {
  const masks: Record<FilterResponse, ToleranceSpec> = {
    lowpass: { response: "lowpass", passband: [1e6], stopband: [10e6], passbandLoss: 1, stopbandLoss: 40 },
    highpass: { response: "highpass", passband: [1e6], stopband: [.1e6], passbandLoss: 1, stopbandLoss: 40 },
    bandpass: { response: "bandpass", passband: [.8e6, 1.2e6], stopband: [.05e6, 15e6], passbandLoss: 1, stopbandLoss: 40 },
    bandstop: { response: "bandstop", passband: [.5e6, 2e6], stopband: [.98e6, 1.02e6], passbandLoss: 1, stopbandLoss: 40 },
  };
  it.each(families)("meets every %s mask with actual LC values and places Ap at the passband edges", family => {
    for (const response of responses) {
      const spec = masks[response], design = designTolerance(spec, family, 50);
      expect(design.issue).toBeNull();
      const { network } = make(family, design.settings!);
      for (const f of spec.passband) expect(-decibels(network.evaluate(f).s21)).toBeCloseTo(spec.passbandLoss, 7);
      for (const [region, intervals] of Object.entries(toleranceRegions(spec, 1e3, 1e9))) for (const [lo, hi] of intervals) for (let i = 0; i <= 100; i++) {
        const loss = -decibels(network.evaluate(lo * (hi / lo) ** (i / 100)).s21);
        if (region === "passband") expect(loss).toBeLessThanOrEqual(spec.passbandLoss + 1e-7);
        else expect(loss).toBeGreaterThanOrEqual(spec.stopbandLoss - 1e-7);
      }
      // Every smaller order, scaled to Ap, fails at least one stopband edge.
      for (let order = 1; order < design.settings!.order; order++) {
        expect(monotonicAttenuation(family, order, design.stopbandRatio! * monotonicFrequency(family, order, spec.passbandLoss))).toBeLessThan(spec.stopbandLoss);
      }
    }
  });
  it.each(families)("rejects unsupported %s masks and frequency ranges without weakening requirements", family => {
    expect(designTolerance({ ...masks.lowpass, stopband: [1.001e6] }, family, 50)).toMatchObject({ settings: null, minimumOrder: 21, issue: "order" });
    expect(designTolerance({ ...masks.highpass, passband: [1.1], stopband: [1], passbandLoss: .01 }, family, 50).issue).toBe("attenuation");
    expect(designTolerance({ ...masks.bandpass, passband: [999950, 1000050], stopband: [1e5, 1e7] }, family, 50)).toMatchObject({ settings: null, issue: "range" });
  });
});
