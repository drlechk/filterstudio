import { describe, expect, it } from "vitest";
import { exportPlots, plotLatex, type ExportPlot, type ExportPlotContext } from "./export-plots";
import { circuitLatex } from "./circuit-export";
import { plotSvg } from "./circuit-export-svg";
import { analyzeNetwork } from "./network";
import { createCircuit, defaultSettings } from "./project";
import type { Project, Section, ToleranceSpec } from "./types";

const sections: Section[] = [{ id: "r", kind: "R", connection: "series", value: 900 }];
const project: Project = { version: 1, name: "Plot export", settings: defaultSettings, z2: 50,
  ...createCircuit(sections), sweep: { min: 1e5, max: 1e7, points: 31 } };
const analysis = analyzeNetwork(sections, { fRef: 1e6, z1: 50 });
const all = { sMagnitude: true, sPhase: true, attenuation: true, transmissionPhase: true };
const traces = (page: ExportPlot) => page.curves.filter(shape => shape.type === "line").filter(shape => shape.width === 1.4);
const spec: ToleranceSpec = { response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 };

describe("response plot exports", () => {
  it("adds only selected pages, independently of matrix comments, and requires numeric analysis", () => {
    expect(exportPlots(project)).toEqual([]);
    expect(() => exportPlots(project, all)).toThrow(/analysis/);
    const pages = exportPlots(project, all, analysis);
    expect(pages.map(page => page.key)).toEqual(Object.keys(all));
    for (const key of Object.keys(all) as (keyof typeof all)[]) {
      const tex = circuitLatex(project, { symbols: "european", matrices: "source", plots: { [key]: true } }, analysis);
      const uncommented = tex.split("\n").filter(line => !line.startsWith("%"));
      expect(uncommented.filter(line => line.startsWith("\\begin{tikzpicture}"))).toHaveLength(1);
      expect(tex).toContain(`% Plot: ${key}`);
    }
  });

  it("exports the expected physical magnitudes and losses on both axis scales", () => {
    // 900 ohms between 50-ohm ports: |S21|=.1, |S11|=.9, loss=20 dB or factor 10.
    for (const magnitudeScale of ["db", "linear"] as const) {
      const pages = exportPlots(project, all, analysis, { frequencyScale: "linear", magnitudeScale, dbRange: 60 });
      expect(traces(pages[0])).toHaveLength(4);
      expect(traces(pages[1])).toHaveLength(4);
      const f = pages[0].frame;
      const sy = f.y + f.height * (magnitudeScale === "db" ? 20 / 60 : .9);
      const ay = f.y + f.height * (magnitudeScale === "db" ? 1 - 20 / 60 : 1 - 9 / 999);
      for (const p of traces(pages[0])[0].points) expect(p.y).toBeCloseTo(sy, 8);
      for (const p of traces(pages[2])[0].points) expect(p.y).toBeCloseTo(ay, 8);
      for (const p of traces(pages[3])[0].points) expect(p.y).toBe(f.y + f.height / 2);
      for (const page of pages) expect(plotSvg(page).source + plotLatex(page)).not.toMatch(/NaN|Infinity|merror|<image/);
    }
  });

  it("preserves tolerance preview, optional comparison, normalization and forbidden regions", () => {
    const preview = analyzeNetwork([], { fRef: 1e6, z1: 50 });
    const context: ExportPlotContext = { language: "de", frequencyScale: "log", tolerance: { spec, preview, normalized: true, showActual: true } };
    const pages = exportPlots(project, { attenuation: true, transmissionPhase: true }, analysis, context);
    expect(traces(pages[0])).toHaveLength(2);
    expect(traces(pages[1])).toHaveLength(2);
    expect(pages[0].curves.filter(shape => shape.type === "rect")).toHaveLength(2);
    expect(plotLatex(pages[0])).toContain("Entwurfsvorschau");
    expect(plotLatex(pages[0])).toContain("Aktuelle Schaltung");
    expect(plotLatex(pages[0])).toContain("\\Omega=f/f_");
    expect(traces(pages[0])[0].points[0].y).toBe(pages[0].frame.y + pages[0].frame.height);
    expect(traces(pages[0])[1].points[0].y).toBeCloseTo(pages[0].frame.y + pages[0].frame.height * 2 / 3);
    const withoutComparison = exportPlots(project, all, analysis, { ...context, tolerance: { ...context.tolerance!, showActual: false } });
    expect(traces(withoutComparison[2])).toHaveLength(1);
    expect(() => exportPlots(project, all, analysis, { tolerance: { spec, preview: null, normalized: false, showActual: false } })).toThrow(/No response/);
  });

  it("leaves gaps at ideal zeros and at wrapped phases without bridging them", () => {
    const f0 = project.settings.cutoff;
    const synthetic = { ...analysis, evaluate: (f: number) => {
      const network = analysis.evaluate(f);
      const degrees = f < f0 ? 170 : -170;
      return { ...network, s21: f === f0 ? { re: 0, im: 0 } : { re: Math.cos(degrees * Math.PI / 180), im: Math.sin(degrees * Math.PI / 180) } };
    } };
    const page = exportPlots(project, { transmissionPhase: true }, synthetic)[0];
    expect(traces(page)).toHaveLength(2);
    for (const trace of traces(page)) expect(new Set(trace.points.map(p => p.y)).size).toBe(1);
    const matched = analyzeNetwork([], { fRef: f0, z1: 50 });
    // Matched through: S11 and S22 are zero everywhere and have no phase curve.
    expect(traces(exportPlots(project, { sPhase: true }, matched)[0])).toHaveLength(2);
  });

  it("rejects non-finite network samples instead of silently exporting corrupt curves", () => {
    const broken = { ...analysis, evaluate: (f: number) => ({ ...analysis.evaluate(f), s21: { re: NaN, im: 0 } }) };
    expect(() => exportPlots(project, all, broken)).toThrow(/precision/);
  });
});
