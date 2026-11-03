import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FrequencyResponsePlot } from "./FrequencyResponsePlot";
import { PreferencesProvider } from "../lib/preferences";
import { analyzeNetwork } from "../lib/network";
import type { MagnitudeScale } from "../lib/plot-scales";

const analysis = analyzeNetwork([{ id: "r", kind: "R", connection: "series", value: 50 }], { fRef: 1, z1: 50, z2: 50 });
const props = { analysis, min: 1, max: 10, points: 11, cutoff: 5, mode: "magnitude" as const, onModeChange: () => {}, onExport: () => {},
  frequencyScale: "linear" as const, magnitudeScale: "db" as MagnitudeScale, onFrequencyScaleChange: () => {}, onMagnitudeScaleChange: () => {} };
const render = (overrides: Partial<typeof props> = {}) => renderToStaticMarkup(<PreferencesProvider><FrequencyResponsePlot {...props} {...overrides} /></PreferencesProvider>);
const coordinates = (markup: string) => markup.match(/<path d="([^"]+)" stroke="var\(--accent\)"/)![1];

describe("second frequency response plot", () => {
  it("plots forward transmission S21 in dB and linear units", () => {
    for (const magnitudeScale of ["db", "linear"] as const) {
      const markup = render({ magnitudeScale });
      expect(markup).toContain("Frequency response S₂₁");
      // This resistor has S21=2/3; its loaded voltage ratio would be 1/2.
      const ys = [...coordinates(markup).matchAll(/[ML][\d.-]+,([\d.-]+)/g)].map(match => Number(match[1]));
      expect(new Set(ys)).toEqual(new Set([magnitudeScale === "linear" ? 96.67 : 31.68]));
      expect(markup).not.toMatch(/NaN|Infinity/);
    }
  });

  it("includes an exact transmission zero even when it falls between sweep samples", () => {
    const resonator = analyzeNetwork([{ id: "lc", kind: "LC", connection: "series", resonator: "parallel", value: 1, value2: 1 }], { fRef: 1 / (2 * Math.PI), z1: 10 });
    const markup = render({ analysis: resonator, min: .01, max: .3, cutoff: resonator.fRef });
    expect(coordinates(markup)).toContain("L503.72,242.00");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("leaves gaps at undefined values and phase wraps", () => {
    const custom = { ...analysis, evaluate: (f: number) => ({ ...analysis.evaluate(f), s21: f === 5 ? { re: NaN, im: NaN } : { re: -1, im: f < 5 ? .1 : -.1 } }) };
    const markup = renderToStaticMarkup(<PreferencesProvider><FrequencyResponsePlot {...props} analysis={custom} mode="phase" /></PreferencesProvider>);
    expect(markup).toContain("phase in degrees");
    expect((coordinates(markup).match(/M/g) ?? []).length).toBeGreaterThan(1);
    expect(coordinates(markup)).not.toMatch(/NaN|Infinity/);
    expect(markup).toContain("Undefined values are omitted");
  });
});
