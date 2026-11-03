import { describe, expect, it } from "vitest";
import { analyzeNetwork, sweepNetwork } from "./network";
import { attenuationAt, attenuationDb, attenuationPosition, attenuationValue, frequencyAt, frequencyPosition, frequencyTicks } from "./plot-scales";

describe("frequency axes and sampling", () => {
  it("uses arithmetic spacing for linear axes and geometric spacing for log axes", () => {
    const network = analyzeNetwork([], { fRef: 1e6, z1: 50 });
    expect(sweepNetwork(network, 100, 10000, 3, "linear").map(point => point.frequency)).toEqual([100, 5050, 10000]);
    expect(sweepNetwork(network, 100, 10000, 3).map(point => point.frequency)).toEqual([100, expect.closeTo(1000, 9), 10000]);
    for (const scale of ["linear", "log"] as const) {
      const samples = sweepNetwork(network, 100, 10000, 17, scale);
      samples.forEach((point, index) => {
        expect(frequencyPosition(point.frequency, 100, 10000, scale)).toBeCloseTo(index / 16, 12);
        expect(point.s21).toEqual({ re: 1, im: 0 });
      });
    }
  });

  it.each(["linear", "log"] as const)("keeps pointer positions and frequency handles inverse on the %s axis", scale => {
    for (const [min, max] of [[.001, 1e15], [999000, 1001000], [1, 100]]) {
      for (const position of [0, .01, .25, .5, .9, 1]) {
        const frequency = frequencyAt(position, min, max, scale);
        expect(frequencyPosition(frequency, min, max, scale)).toBeCloseTo(position, 10);
        expect(frequency).toBeGreaterThanOrEqual(min);
        expect(frequency).toBeLessThanOrEqual(max);
      }
    }
  });

  it("keeps ticks readable, ordered and inside the range, including narrow and normalized bands", () => {
    expect(frequencyTicks(1, 10, "linear")).toEqual([2, 4, 6, 8, 10]);
    for (const scale of ["linear", "log"] as const) for (const [min, max] of [[.001, 1e15], [.999, 1.001], [1, 100]]) {
      const ticks = frequencyTicks(min, max, scale);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(14);
      expect(ticks).toEqual([...new Set(ticks)].sort((a, b) => a - b));
      expect(ticks.every(tick => tick >= min && tick <= max)).toBe(true);
    }
  });
});

describe("attenuation scaling", () => {
  it("uses amplitude loss factors, with unity at 0 dB and a factor of ten at 20 dB", () => {
    expect(attenuationValue(0, "linear")).toBe(1);
    expect(attenuationValue(20, "linear")).toBeCloseTo(10, 12);
    expect(attenuationValue(3.010299956639812, "linear")).toBeCloseTo(Math.SQRT2, 12);
    expect(attenuationPosition(20, 60, "linear")).toBeCloseTo(9 / 999, 12);
    expect(attenuationPosition(20, 60, "db")).toBeCloseTo(1 / 3, 12);
    for (const loss of [0, .1, .5, 3, 20, 40, 80, 100]) {
      expect(attenuationDb(attenuationValue(loss, "linear"), "linear")).toBeCloseTo(loss, 12);
    }
  });

  it.each(["linear", "db"] as const)("converts dragged %s attenuation boundaries back to the unchanged dB specification", scale => {
    for (const loss of [.1, .5, 3, 20, 40, 80]) {
      expect(attenuationAt(attenuationPosition(loss, 100, scale), 100, scale)).toBeCloseTo(loss, 11);
      expect(attenuationPosition(loss + .05, 100, scale)).toBeGreaterThan(attenuationPosition(loss, 100, scale));
    }
    expect(attenuationAt(-1, 100, scale)).toBe(0);
    expect(attenuationAt(2, 100, scale)).toBeCloseTo(100, 12);
  });
});
