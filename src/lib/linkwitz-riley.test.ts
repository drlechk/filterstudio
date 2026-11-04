import { describe, expect, it } from "vitest";
import katex from "katex";
import fixtures from "./fixtures/linkwitz-riley-reference.json";
import { synthesize } from "./synthesis";
import { analyzeNetwork, decibels, evaluatePolynomial, magnitude } from "./network";
import { defaultSettings, createCircuit, parseProject } from "./project";
import { filterApproximation } from "./approximation";
import { LINKWITZ_RILEY_ORDERS, filterOrderLimits, nearestFilterOrder } from "./filter-limits";
import { designTolerance, toleranceRegions } from "./tolerance";
import { bandEdges } from "./frequency";
import { circuitLatex } from "./circuit-export";
import { translateMessage } from "./messages";
import type { FilterResponse, FilterSettings, ToleranceSpec } from "./types";

const responses: FilterResponse[] = ["lowpass", "highpass", "bandpass", "bandstop"];
function make(patch: Partial<FilterSettings> = {}) {
  const settings: FilterSettings = { ...defaultSettings, family: "linkwitz-riley", order: 4, bandwidth: 5e5, ...patch };
  const result = synthesize(settings);
  const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: settings.impedance, z2: result.z2 });
  return { settings, result, network };
}

describe("Linkwitz–Riley passive ladders", () => {
  it.each(fixtures.cases)("matches the squared independent complex Butterworth response for LR$order", ({ order, samples }) => {
    const { result, network } = make({ order });
    expect(result.sections).toHaveLength(order);
    expect(result.z2).toBe(defaultSettings.impedance);
    expect(result.sections.every(s => s.value > 0 && Number.isFinite(s.value))).toBe(true);
    for (const sample of samples) {
      const s = network.evaluate(sample.frequency * defaultSettings.cutoff);
      expect(s.s21.re).toBeCloseTo(sample.re, 9);
      expect(s.s21.im).toBeCloseTo(sample.im, 9);
      expect(magnitude(s.s21) ** 2 + magnitude(s.s11) ** 2).toBeCloseTo(1, 10);
      expect(s.s12.re).toBeCloseTo(s.s21.re, 10);
      expect(s.s12.im).toBeCloseTo(s.s21.im, 10);
      expect(-20 * Math.log10(magnitude(s.s21))).toBeCloseTo(20 * Math.log10(1 + sample.frequency ** order), 8);
    }
    expect(decibels(network.evaluate(defaultSettings.cutoff).s21)).toBeCloseTo(-20 * Math.log10(2), 9);
  });

  it.each(LINKWITZ_RILEY_ORDERS)("adds complementary LR%i branches to unit magnitude with the correct polarity", order => {
    const lp = make({ order }).network, hp = make({ order, response: "highpass" }).network;
    const polarity = (-1) ** (order / 2);
    for (let i = 0; i <= 200; i++) {
      const f = defaultSettings.cutoff * 10 ** (-2 + i / 50);
      const l = lp.evaluate(f).s21, h = hp.evaluate(f).s21;
      expect(Math.hypot(l.re + polarity * h.re, l.im + polarity * h.im)).toBeCloseTo(1, 9);
      // Equal/opposite phase across the transition, not only at crossover.
      expect(l.im * h.re - l.re * h.im).toBeCloseTo(0, 10);
    }
    const l = lp.evaluate(defaultSettings.cutoff).s21, h = hp.evaluate(defaultSettings.cutoff).s21;
    expect(Math.hypot(l.re - polarity * h.re, l.im - polarity * h.im)).toBeLessThan(1e-9);
  });

  it.each(responses)("preserves complex response and -6 dB edges after %s transformation", response => {
    for (const order of LINKWITZ_RILEY_ORDERS) for (const b of [.001, .5, 4]) {
      const low = make({ order }).network;
      const { settings, network } = make({ order, response, bandwidth: b * defaultSettings.cutoff });
      for (const x of [.01, .5, .99, 1.0001, 1.1, 2, 100]) {
        const mapped = response === "lowpass" ? x : response === "highpass" ? -1 / x
          : response === "bandpass" ? (x - 1 / x) / b : b * x / (1 - x * x);
        const actual = network.evaluate(x * settings.cutoff), expected = low.evaluate(Math.abs(mapped) * settings.cutoff);
        for (const key of ["s11", "s21", "s12", "s22"] as const) {
          expect(actual[key].re).toBeCloseTo(expected[key].re, 7);
          expect(actual[key].im).toBeCloseTo(Math.sign(mapped) * expected[key].im, 7);
        }
      }
      const { lower, upper } = bandEdges(settings);
      const edges = response.startsWith("band") ? [lower, upper] : [settings.cutoff];
      for (const f of edges) expect(decibels(network.evaluate(f).s21)).toBeCloseTo(-20 * Math.log10(2), 7);
    }
  });

  it("round-trips projects, exports circuits and renders correct reference formulas", () => {
    for (const response of responses) for (const order of [2, 4, 20]) {
      const { settings, result, network } = make({ response, order });
      const project = { version: 1 as const, name: "Linkwitz–Riley", settings, ...createCircuit(result.sections), z2: result.z2, sweep: { min: 1e4, max: 1e8, points: 601 } };
      expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
      expect(circuitLatex(project, { symbols: "european", matrices: "typeset" }, network)).toContain("\\begin{circuitikz}");
      const reference = filterApproximation(settings);
      expect(reference.characteristicPower).toBe(2);
      expect(reference.epsilon).toBe(1);
      for (const latex of Object.values(reference.latex)) expect(() => katex.renderToString(latex, { throwOnError: true })).not.toThrow();
      for (const x of [0, .1, .5, 1, 2]) {
        const squared = evaluatePolynomial(reference.numerator, { re: x, im: 0 }).re;
        expect(1 / (1 + squared)).toBeCloseTo(1 / (1 + x ** order) ** 2, 10);
      }
      for (const note of result.notes) expect(translateMessage(note, "en")).not.toBe(note);
      expect(() => parseProject({ ...project, settings: { ...settings, order: 3 } })).toThrow(/Linkwitz/);
    }
    expect(filterOrderLimits("linkwitz-riley")).toEqual({ min: 2, max: 100, step: 2 });
    expect(nearestFilterOrder("linkwitz-riley", 5)).toBe(4);
    expect(nearestFilterOrder("linkwitz-riley", 1)).toBe(2);
    expect(nearestFilterOrder("linkwitz-riley", 101)).toBe(100);
    for (const order of [0, 1, 3, 5, 19, 21, 1.5, NaN, Infinity]) expect(() => make({ order })).toThrow();
    expect(make({ ripple: .1, attenuation: 20 }).result).toEqual(make({ ripple: 3, attenuation: 80 }).result);
  });
});

describe("Linkwitz–Riley tolerance design", () => {
  const masks: ToleranceSpec[] = [
    { response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 },
    { response: "highpass", passband: [1e6], stopband: [.5e6], passbandLoss: 1, stopbandLoss: 40 },
    { response: "bandpass", passband: [.8e6, 1.2e6], stopband: [.4e6, 2.4e6], passbandLoss: 1, stopbandLoss: 40 },
    { response: "bandstop", passband: [.5e6, 2e6], stopband: [.8e6, 1.2e6], passbandLoss: 1, stopbandLoss: 40 },
  ];
  it.each(masks)("meets the complete $response mask with the smallest supported even order", mask => {
    for (const ap of [.1, 1, 3]) for (const as of [20, 40, 80]) {
      const spec = { ...mask, passbandLoss: ap, stopbandLoss: as };
      const design = designTolerance(spec, "linkwitz-riley", 50);
      expect(design.issue).toBeNull();
      expect(LINKWITZ_RILEY_ORDERS).toContain(design.settings!.order);
      const { network } = make(design.settings!);
      for (const f of spec.passband) expect(-decibels(network.evaluate(f).s21)).toBeCloseTo(ap, 7);
      for (const [region, intervals] of Object.entries(toleranceRegions(spec, 1e3, 1e9))) for (const [lo, hi] of intervals) for (let i = 0; i <= 100; i++) {
        const loss = -decibels(network.evaluate(lo * (hi / lo) ** (i / 100)).s21);
        if (region === "passband") expect(loss).toBeLessThanOrEqual(ap + 1e-7);
        else expect(loss).toBeGreaterThanOrEqual(as - 1e-7);
      }
      for (let n = 2; n < design.settings!.order; n += 2) {
        const passFrequency = Math.expm1(ap * Math.LN10 / 20) ** (1 / n);
        expect(20 * Math.log10(1 + (design.stopbandRatio! * passFrequency) ** n)).toBeLessThan(as);
      }
    }
  });
  it("rejects impossible masks without relaxing them", () => {
    expect(designTolerance({ ...masks[0], stopband: [1.001e6] }, "linkwitz-riley", 50)).toMatchObject({ settings: null, issue: "order" });
    expect(designTolerance({ ...masks[2], passband: [999950, 1000050] }, "linkwitz-riley", 50)).toMatchObject({ settings: null, issue: "range" });
  });
});
