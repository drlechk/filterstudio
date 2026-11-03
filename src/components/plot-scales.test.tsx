import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PreferencesProvider } from "../lib/preferences";
import { analyzeNetwork } from "../lib/network";
import { designTolerance } from "../lib/tolerance";
import type { ToleranceSpec } from "../lib/types";
import { ResponsePlot } from "./ResponsePlot";
import { TolerancePlot } from "./TolerancePlot";
import type { PlotScaleProps } from "./PlotScaleControls";

// A 900-ohm series resistor between 50-ohm ports has S21=0.1: -20 dB,
// or a linear attenuation factor of 10, at every frequency.
const analysis = analyzeNetwork([{ id: "R1", kind: "R", connection: "series", value: 900 }], { fRef: 1e6, z1: 50 });
const scales: PlotScaleProps = { frequencyScale: "linear", magnitudeScale: "linear", onFrequencyScaleChange: () => {}, onMagnitudeScaleChange: () => {} };
const spec: ToleranceSpec = { response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 };
const traceY = (markup: string) => [...markup.match(/<path d="([^"]+)" stroke="var\(--trace-s21\)"/)![1].matchAll(/[ML][\d.-]+,([\d.-]+)/g)].map(match => Number(match[1]));

describe("plot scale rendering", () => {
  it("renders S-parameter magnitudes in linear units or dB with matching axis geometry", () => {
    for (const magnitudeScale of ["linear", "db"] as const) {
      const markup = renderToStaticMarkup(<PreferencesProvider><ResponsePlot {...scales} magnitudeScale={magnitudeScale} analysis={analysis} min={1e5} max={1e7} points={51} cutoff={1e6} mode="magnitude" /></PreferencesProvider>);
      expect(markup).toContain(magnitudeScale === "linear" ? "linear magnitude versus linear frequency" : "magnitude in dB versus linear frequency");
      expect(new Set(traceY(markup))).toEqual(new Set([magnitudeScale === "linear" ? 220.2 : 67.6]));
      expect(markup).not.toMatch(/NaN|Infinity/);
    }
  });

  it("renders phase in degrees while allowing a linear frequency axis", () => {
    const markup = renderToStaticMarkup(<PreferencesProvider><ResponsePlot {...scales} analysis={analysis} min={1e5} max={1e7} points={51} cutoff={1e6} mode="phase" /></PreferencesProvider>);
    expect(markup).toContain("phase versus linear frequency");
    expect(markup).toContain("Phase in degrees");
    expect(markup).not.toContain("Logarithmic · dB");
    expect(new Set(traceY(markup))).toEqual(new Set([133]));
  });

  it("renders attenuation factors and dB at their corresponding heights without changing the mask", () => {
    for (const magnitudeScale of ["linear", "db"] as const) {
      const markup = renderToStaticMarkup(<PreferencesProvider><TolerancePlot {...scales} magnitudeScale={magnitudeScale} spec={spec} design={designTolerance(spec, "butterworth", 50)} preview={analysis} previewError={null} actual={null} onChange={() => {}} /></PreferencesProvider>);
      // Insertion loss 20 dB sits at 20/60 of the dB axis, but at
      // (10-1)/(1000-1) of the amplitude-loss-factor axis.
      const path = markup.match(/<path d="([^"]+)" fill="none" stroke="var\(--trace-s21\)"/)![1];
      const heights = [...path.matchAll(/[ML][\d.-]+,([\d.-]+)/g)].map(match => Number(match[1]));
      expect(new Set(heights)).toEqual(new Set([magnitudeScale === "linear" ? 287.77 : 207.33]));
      expect(markup).toContain('aria-valuenow="40"');
      expect(markup).toContain(magnitudeScale === "linear" ? "as a linear factor versus linear frequency" : "in dB versus linear frequency");
      expect(markup).not.toMatch(/NaN|Infinity/);
    }
  });
});
