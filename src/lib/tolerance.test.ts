import { describe, expect, it } from "vitest";
import { analyzeNetwork, decibels } from "./network";
import { bandEdges, isBandResponse } from "./frequency";
import { createCircuit, defaultSettings, parseProject } from "./project";
import { ellipticPrototype, synthesize } from "./synthesis";
import {
  defaultTolerance,
  designTolerance,
  moveToleranceEdge,
  parseTolerance,
  toleranceEdges,
  toleranceRegions,
  validateTolerance,
} from "./tolerance";
import type {
  FilterFamily,
  FilterResponse,
  Project,
  ToleranceSpec,
} from "./types";

const families: FilterFamily[] = ["butterworth", "chebyshev", "cauer"];
const responses: FilterResponse[] = [
  "lowpass",
  "highpass",
  "bandpass",
  "bandstop",
];
const masks: Record<FilterResponse, ToleranceSpec> = {
  lowpass: {
    response: "lowpass",
    passband: [1e6],
    stopband: [2e6],
    passbandLoss: 1,
    stopbandLoss: 40,
  },
  highpass: {
    response: "highpass",
    passband: [1e6],
    stopband: [0.5e6],
    passbandLoss: 1,
    stopbandLoss: 40,
  },
  bandpass: {
    response: "bandpass",
    passband: [0.8e6, 1.2e6],
    stopband: [0.4e6, 2e6],
    passbandLoss: 1,
    stopbandLoss: 40,
  },
  bandstop: {
    response: "bandstop",
    passband: [0.5e6, 2e6],
    stopband: [0.8e6, 1.3e6],
    passbandLoss: 1,
    stopbandLoss: 40,
  },
};

describe("analog tolerance-mask design", () => {
  it("chooses known analog prototype orders and respects the supported Cauer ladders", () => {
    const butterworth = designTolerance(masks.lowpass, "butterworth", 50);
    const chebyshev = designTolerance(masks.lowpass, "chebyshev", 50);
    const cauer = designTolerance(masks.lowpass, "cauer", 50);
    expect(butterworth.minimumOrder).toBe(8);
    expect(butterworth.settings?.order).toBe(8);
    expect(chebyshev.minimumOrder).toBe(5);
    expect(chebyshev.settings?.order).toBe(5);
    expect(cauer.minimumOrder).toBe(4);
    expect(cauer.settings?.order).toBe(5);
  });

  for (const family of families)
    it.each(responses)(
      `${family} realizes the %s mask with its actual LC network`,
      (response) => {
        const spec = masks[response];
        const design = designTolerance(spec, family, 50);
        expect(design.issue).toBeNull();
        const settings = design.settings!;
        const result = synthesize(settings);
        const network = analyzeNetwork(result.sections, {
          fRef: settings.cutoff,
          z1: settings.impedance,
          z2: result.z2,
        });
        const edges = toleranceEdges(spec);
        const regions = toleranceRegions(
          spec,
          edges[0].frequency / 1000,
          edges.at(-1)!.frequency * 1000,
        );
        for (const [region, intervals] of Object.entries(regions))
          for (const [lo, hi] of intervals) {
            for (let i = 0; i <= 160; i++) {
              const f = lo * (hi / lo) ** (i / 160);
              const loss = -decibels(network.evaluate(f).s21);
              expect(Number.isFinite(loss)).toBe(true);
              if (region === "passband")
                expect(loss, `A(${f}) in passband`).toBeLessThanOrEqual(
                  spec.passbandLoss + 0.0001,
                );
              else
                expect(loss, `A(${f}) in stopband`).toBeGreaterThanOrEqual(
                  spec.stopbandLoss - 0.0001,
                );
            }
          }
        for (const f of spec.passband)
          expect(-decibels(network.evaluate(f).s21)).toBeCloseTo(
            spec.passbandLoss,
            4,
          );
      },
    );

  it("scales Butterworth cutoff and bandwidth rather than treating the passband edge as 3 dB", () => {
    for (const response of responses) {
      const spec = masks[response],
        settings = designTolerance(spec, "butterworth", 50).settings!;
      const center = isBandResponse(response)
        ? Math.sqrt(spec.passband[0] * spec.passband[1])
        : spec.passband[0];
      if (response === "lowpass")
        expect(settings.cutoff).toBeGreaterThan(center);
      if (response === "highpass") expect(settings.cutoff).toBeLessThan(center);
      if (isBandResponse(response)) {
        expect(settings.cutoff).toBe(center);
        const width = spec.passband[1] - spec.passband[0];
        if (response === "bandpass")
          expect(settings.bandwidth).toBeGreaterThan(width);
        else expect(settings.bandwidth).toBeLessThan(width);
        const result = synthesize(settings);
        const network = analyzeNetwork(result.sections, {
          fRef: settings.cutoff,
          z1: 50,
          z2: result.z2,
        });
        for (const f of Object.values(bandEdges(settings)))
          expect(-decibels(network.evaluate(f).s21)).toBeCloseTo(
            10 * Math.log10(2),
            6,
          );
      }
    }
  });

  it("preserves order and relative frequencies under frequency and impedance scaling", () => {
    for (const family of families)
      for (const response of responses) {
        const base = designTolerance(masks[response], family, 50);
        for (const factor of [0.001, 1000]) {
          const spec = {
            ...masks[response],
            passband: masks[response].passband.map((f) => f * factor),
            stopband: masks[response].stopband.map((f) => f * factor),
          };
          const scaled = designTolerance(spec, family, 75);
          expect(scaled.issue).toBeNull();
          expect(scaled.settings?.order).toBe(base.settings?.order);
          expect(scaled.settings!.cutoff / base.settings!.cutoff).toBeCloseTo(
            factor,
            8,
          );
          expect(scaled.settings!.impedance).toBe(75);
        }
      }
  });

  it("uses the stricter side of an asymmetric band specification", () => {
    const spec = { ...masks.bandpass, stopband: [0.4e6, 1.4e6] };
    const design = designTolerance(spec, "chebyshev", 50);
    const upperRatio = (1.4 ** 2 - 0.8 * 1.2) / ((1.2 - 0.8) * 1.4);
    expect(design.stopbandRatio).toBeCloseTo(upperRatio, 12);
    expect(design.minimumOrder).toBeGreaterThan(
      designTolerance(masks.bandpass, "chebyshev", 50).minimumOrder!,
    );
  });

  it("reports unsupported orders and frequencies without silently weakening the mask", () => {
    for (const family of families) {
      const design = designTolerance(
        { ...masks.lowpass, stopband: [1.001e6], stopbandLoss: 80 },
        family,
        50,
      );
      expect(design.issue).toBe("order");
      expect(design.settings).toBeNull();
      expect(design.minimumOrder).toBeGreaterThan(family === "cauer" ? 19 : 20);
    }
    const narrow = {
      ...masks.bandpass,
      passband: [1e6, 1e6 + 10],
      stopband: [0.9e6, 1.1e6],
    };
    expect(designTolerance(narrow, "chebyshev", 50).issue).toBe("range");
    expect(
      designTolerance(
        { ...masks.highpass, passband: [1.01], stopband: [1] },
        "butterworth",
        50,
      ).settings,
    ).toBeNull();
  });

  it("selects and realizes orders 20 and 19 when the mask requires them", () => {
    const passbandLoss = .5, stopbandLoss = 40;
    const ratio = Math.expm1(stopbandLoss * Math.LN10 / 10) / Math.expm1(passbandLoss * Math.LN10 / 10);
    for (const family of families) {
      const stopRatio = family === 'butterworth' ? Math.exp(Math.log(ratio) / (2 * 19.5))
        : family === 'chebyshev' ? Math.cosh(Math.acosh(Math.sqrt(ratio)) / 19.5)
        : (ellipticPrototype(17, passbandLoss, stopbandLoss).stopbandRatio + ellipticPrototype(19, passbandLoss, stopbandLoss).stopbandRatio) / 2;
      const spec = { ...masks.lowpass, passbandLoss, stopbandLoss, stopband: [1e6 * stopRatio] };
      const design = designTolerance(spec, family, 50);
      expect(design.issue).toBeNull();
      expect(design.settings?.order).toBe(family === 'cauer' ? 19 : 20);
      const settings = design.settings!, result = synthesize(settings);
      const network = analyzeNetwork(result.sections, { fRef: settings.cutoff, z1: 50, z2: result.z2 });
      expect(decibels(network.evaluate(1e6).s21)).toBeCloseTo(-passbandLoss, 5);
      expect(decibels(network.evaluate(spec.stopband[0]).s21)).toBeLessThanOrEqual(-stopbandLoss + 1e-5);
    }
  });

  it("never creates a seventh-order Cauer below the solver’s attenuation range", () => {
    let found = false;
    for (let ratio = 1.02; ratio < 1.4; ratio += 0.01) {
      const design = designTolerance(
        { ...masks.lowpass, stopband: [ratio * 1e6], stopbandLoss: 30 },
        "cauer",
        50,
      );
      if (design.settings?.order === 7) {
        expect(design.settings.attenuation).toBe(40);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe("tolerance-mask editing and persistence", () => {
  it("creates valid defaults for all responses including frequency limits", () => {
    for (const response of responses)
      for (const cutoff of [1, 1e6, 1e12])
        expect(
          validateTolerance(
            defaultTolerance({
              ...defaultSettings,
              response,
              cutoff,
              bandwidth: cutoff / 2,
            }),
          ),
        ).toBeNull();
  });

  it("prevents crossing frequency edges or leaving the supported range", () => {
    for (const response of responses)
      for (const edge of toleranceEdges(masks[response])) {
        for (const frequency of [-100, 1, 1e6, 1e12, 1e15]) {
          const moved = moveToleranceEdge(
            masks[response],
            edge.band,
            edge.index,
            frequency,
          );
          expect(validateTolerance(moved)).toBeNull();
          expect(moved).not.toBe(masks[response]);
        }
      }
    expect(moveToleranceEdge(masks.lowpass, "passband", 0, NaN)).toBe(
      masks.lowpass,
    );
  });

  it("round-trips applied masks with the project while accepting older files", () => {
    for (const response of responses) {
      const tolerance = masks[response],
        settings = designTolerance(tolerance, "chebyshev", 50).settings!;
      const result = synthesize(settings);
      const project: Project = {
        version: 1,
        name: "Toleranzentwurf",
        settings,
        ...createCircuit(result.sections),
        z2: result.z2,
        tolerance,
        sweep: { min: 1e5, max: 1e7, points: 601 },
      };
      expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(
        project,
      );
      const old = { ...project, tolerance: undefined };
      expect(
        parseProject(JSON.parse(JSON.stringify(old))).tolerance,
      ).toBeUndefined();
      expect(() =>
        parseProject({
          ...project,
          tolerance: { ...tolerance, passbandLoss: -1 },
        }),
      ).toThrow("Toleranzschema");
      expect(() =>
        parseProject({
          ...project,
          tolerance: {
            ...tolerance,
            response: response === "lowpass" ? "highpass" : "lowpass",
          },
        }),
      ).toThrow("Toleranzschema");
    }
  });

  it("rejects malformed masks and strips unknown fields", () => {
    for (const raw of [
      null,
      {},
      { ...masks.lowpass, passband: ["1000000"] },
      { ...masks.bandpass, stopband: [1] },
      { ...masks.highpass, passband: [Infinity] },
      { ...masks.lowpass, stopbandLoss: 10 },
      { ...masks.lowpass, stopband: [0.5e6] },
      { ...masks.lowpass, response: ["lowpass"] },
    ])
      expect(() => parseTolerance(raw)).toThrow("Toleranzschema");
    expect(parseTolerance({ ...masks.lowpass, extra: true })).toEqual(
      masks.lowpass,
    );
  });
});
