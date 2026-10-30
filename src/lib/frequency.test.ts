import { describe, expect, it } from "vitest";
import { bandEdges, filterDegree } from "./frequency";
describe("band frequency parameters", () => {
  it("recovers both specified edges from center and bandwidth", () => {
    const edges = bandEdges({
      cutoff: Math.sqrt(800_000 * 1_200_000),
      bandwidth: 400_000,
    });
    expect(edges.lower).toBeCloseTo(800_000, 7);
    expect(edges.upper).toBeCloseTo(1_200_000, 7);
  });
  it("retains the lower edge for wide bands", () => {
    const { lower, upper } = bandEdges({ cutoff: 1e6, bandwidth: 1e12 });
    expect(lower).toBeCloseTo(1, 10);
    expect(lower * upper).toBeCloseTo(1e12, 0);
  });
  it("rejects missing and invalid bandwidths", () => {
    for (const bandwidth of [undefined, 0, -1, Infinity, NaN])
      expect(() => bandEdges({ cutoff: 1e6, bandwidth })).toThrow();
  });
  it("distinguishes prototype order from realized band-filter order", () => {
    expect(filterDegree({ response: "bandpass", order: 5 })).toBe(10);
    expect(filterDegree({ response: "bandstop", order: 7 })).toBe(14);
    expect(filterDegree({ response: "lowpass", order: 5 })).toBe(5);
  });
});
