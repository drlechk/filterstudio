import { decibels, magnitude, phaseDegrees, sweepNetwork, type Complex, type NetworkAnalysis } from "./network";
import { bandEdges, isBandResponse } from "./frequency";
import { attenuationPosition, attenuationValue, frequencyAt, frequencyPosition, frequencyTicks, linearTicks, type FrequencyScale, type MagnitudeScale } from "./plot-scales";
import { toleranceEdges, toleranceRegions } from "./tolerance";
import type { Project, ToleranceSpec } from "./types";

export type ExportPlotSelection = Partial<Record<"sMagnitude" | "sPhase" | "attenuation" | "transmissionPhase", boolean>>;
export type ExportPlotContext = {
  language?: "de" | "en";
  frequencyScale?: FrequencyScale;
  magnitudeScale?: MagnitudeScale;
  dbRange?: number;
  tolerance?: { spec: ToleranceSpec; preview: NetworkAnalysis | null; showActual: boolean; normalized: boolean };
};
type Point = { x: number; y: number };
export type PlotShape =
  | { type: "line"; points: Point[]; color: string; dashed?: boolean; width?: number }
  | { type: "rect"; x: number; y: number; width: number; height: number; color: string }
  | { type: "label"; x: number; y: number; latex: string; anchor?: "west" | "east"; size?: number };
export type ExportPlot = {
  key: keyof ExportPlotSelection;
  width: number; height: number;
  frame: { x: number; y: number; width: number; height: number };
  decorations: PlotShape[];
  curves: PlotShape[];
};
const colors = ["#167d65", "#3366cc", "#c07819", "#a64e85"];
const keys = ["s21", "s11", "s12", "s22"] as const;
const labels = ["S_{21}", "S_{11}", "S_{12}", "S_{22}"];
const round = (value: number) => Number(value.toFixed(3));
const point = (p: Point) => `(${round(p.x)},${round(p.y)})`;
const numericLatex = (value: number) => {
  const [base, exponent] = Number(value.toPrecision(4)).toString().split("e");
  return exponent ? `${base}\\cdot 10^{${Number(exponent)}}` : base;
};
const frequencyLatex = (value: number) => {
  const unit = [[1e12, "THz"], [1e9, "GHz"], [1e6, "MHz"], [1e3, "kHz"], [1, "Hz"]] as const;
  const [scale, symbol] = unit.find(([scale]) => value >= scale) ?? unit[unit.length - 1];
  return `${numericLatex(value / scale)}\\,\\mathrm{${symbol}}`;
};
const validPhase = (value: Complex) => magnitude(value) === 0 ? null : phaseDegrees(value);

/** One geometry model feeds both vector PDF and editable TikZ; no screenshots or remote services. */
export function exportPlots(project: Project, selection: ExportPlotSelection = {}, analysis?: NetworkAnalysis | null, context: ExportPlotContext = {}): ExportPlot[] {
  if (!Object.values(selection).some(Boolean)) return [];
  if (!analysis) throw new Error("Network analysis is required to export plots.");
  const { frequencyScale = "log", magnitudeScale = "db", dbRange = 100, tolerance } = context;
  const t = (de: string, en: string) => context.language === "de" ? de : en;
  const band = isBandResponse(project.settings.response) ? bandEdges(project.settings) : null;
  const circuitMarkers = band ? [band.lower, project.settings.cutoff, band.upper] : [project.settings.cutoff];
  const pages: ExportPlot[] = [];
  for (const key of ["sMagnitude", "sPhase", "attenuation", "transmissionPhase"] as const) {
    if (!selection[key]) continue;
    const transmission = key === "attenuation" || key === "transmissionPhase";
    const phase = key === "sPhase" || key === "transmissionPhase";
    const mask = transmission ? tolerance : undefined;
    const edges = mask ? toleranceEdges(mask.spec) : [];
    const min = mask ? edges[0].frequency / 2 : project.sweep.min;
    const max = mask ? edges[edges.length - 1].frequency * 2 : project.sweep.max;
    const maxLoss = mask ? Math.ceil((mask.spec.stopbandLoss + 20) / 10) * 10 : dbRange;
    const reference = mask?.normalized ? isBandResponse(mask.spec.response)
      ? Math.sqrt(mask.spec.passband[0] * mask.spec.passband[1]) : mask.spec.passband[0] : 1;
    const page: ExportPlot = { key, width: 720, height: 380, frame: { x: 78, y: 84, width: 616, height: 238 }, decorations: [], curves: [] };
    const { frame, decorations, curves } = page;
    const line = (target: PlotShape[], x1: number, y1: number, x2: number, y2: number, color: string, dashed = false, width = .6) =>
      target.push({ type: "line", points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], color, dashed, width });
    const label = (x: number, y: number, latex: string, anchor?: "west" | "east", size = 10) =>
      decorations.push({ type: "label", x, y, latex, anchor, size });
    const x = (f: number) => frame.x + frequencyPosition(f, min, max, frequencyScale) * frame.width;
    const y = (value: number) => frame.y + frame.height * (phase ? (180 - value) / 360
      : transmission ? 1 - attenuationPosition(value, maxLoss, magnitudeScale)
        : magnitudeScale === "db" ? -value / dbRange : 1 - value);
    const title = key === "sMagnitude" ? t("S-Parameter: Betrag", "S-parameter magnitude")
      : key === "sPhase" ? t("S-Parameter: Phase", "S-parameter phase")
        : key === "attenuation" ? t("Dämpfungsverlauf", "Attenuation response") : t("Phasenverlauf", "Phase response");
    label(20, 20, `\\text{${title}}${transmission ? "\\quad S_{21}" : ""}`, "west", 14);
    label(frame.x, 69, phase ? "\\varphi\,/\,{}^\\circ" : transmission
      ? magnitudeScale === "db" ? "A=-20\\log_{10}|S_{21}|\\;/\\;\\mathrm{dB}" : "A=1/|S_{21}|"
      : magnitudeScale === "db" ? "20\\log_{10}|S_{ij}|\\;/\\;\\mathrm{dB}" : "|S_{ij}|", "west", 9);
    const xCaption = `${mask?.normalized ? `\\Omega=f/f_{\\mathrm{ref}},\\quad f_{\\mathrm{ref}}=${frequencyLatex(reference)}` : "f\\,/\\,\\mathrm{Hz}"}\\quad\\text{${frequencyScale === "log" ? t("logarithmisch", "logarithmic") : "linear"}}`;
    label(frame.x + frame.width / 2, 365, xCaption);
    const ticks = phase ? [-180, -90, 0, 90, 180]
      : transmission ? magnitudeScale === "db" ? linearTicks(0, maxLoss) : [1, ...linearTicks(1, attenuationValue(maxLoss, "linear"))].filter((v, i, a) => a.indexOf(v) === i)
        : magnitudeScale === "db" ? Array.from({ length: 6 }, (_, i) => -dbRange * i / 5) : [0, .2, .4, .6, .8, 1];
    for (const tick of ticks) {
      const ordinate = transmission && !phase && magnitudeScale === "linear" ? 20 * Math.log10(tick) : tick;
      line(decorations, frame.x, y(ordinate), frame.x + frame.width, y(ordinate), "#d8dde3", true);
      label(frame.x - 10, y(ordinate), numericLatex(tick), "east", 9);
    }
    for (const tick of frequencyTicks(min / reference, max / reference, frequencyScale)) {
      line(decorations, x(tick * reference), frame.y, x(tick * reference), frame.y + frame.height, "#e6e9ed");
      label(x(tick * reference), 339, mask?.normalized ? numericLatex(tick) : frequencyLatex(tick), undefined, 9);
    }
    if (mask && !phase) {
      const regions = toleranceRegions(mask.spec, min, max);
      for (const [kind, ranges] of Object.entries(regions)) for (const [start, end] of ranges) {
        const pass = kind === "passband", boundary = y(pass ? mask.spec.passbandLoss : mask.spec.stopbandLoss);
        const upper = pass ? frame.y : boundary, lower = pass ? boundary : frame.y + frame.height;
        curves.push({ type: "rect", x: x(start), y: upper, width: x(end) - x(start), height: lower - upper, color: pass ? "#edf5ee" : "#faedf0" });
        line(curves, x(start), boundary, x(end), boundary, pass ? "#38824d" : "#ae4666", true);
      }
      label(page.width - 26, 69, `\\text{${t("Farbig: unzulässig", "Shaded: forbidden")}}`, "east", 9);
    }
    const markers = mask ? edges.map(edge => edge.frequency) : circuitMarkers;
    for (const f of markers.filter(f => f >= min && f <= max)) line(curves, x(f), frame.y, x(f), frame.y + frame.height, "#a6adb7", true);
    // Exact reference and mask/band edges retain ideal notches between sweep samples.
    const frequencies = mask ? Array.from({ length: 701 }, (_, i) => frequencyAt(i / 700, min, max, frequencyScale))
      : sweepNetwork(analysis, min, max, project.sweep.points, frequencyScale).map(sample => sample.frequency);
    const extras = [...markers, ...(mask?.preview ? [mask.preview.fRef] : [])];
    const samples = [...new Set([...frequencies, ...extras.filter(f => f >= min && f <= max)])].sort((a, b) => a - b);
    const sources = !transmission ? keys.map((key, i) => ({ analysis, key, label: labels[i], color: colors[i], dashed: i >= 2 }))
      : mask ? [
        ...(mask.preview ? [{ analysis: mask.preview, key: "s21" as const, label: `\\text{${t("Entwurfsvorschau", "Design preview")}}`, color: colors[0], dashed: false }] : []),
        ...(mask.showActual ? [{ analysis, key: "s21" as const, label: `\\text{${t("Aktuelle Schaltung", "Current circuit")}}`, color: colors[1], dashed: true }] : []),
      ] : [{ analysis, key: "s21" as const, label: `S_{21}\\quad\\text{${t("Aktuelle Schaltung", "Current circuit")}}`, color: colors[0], dashed: false }];
    if (!sources.length) throw new Error("No response is available for the selected tolerance plots.");
    const evaluated = new Map([...new Set(sources.map(source => source.analysis))].map(network => [network, new Map(samples.map(f => [f, network.evaluate(f)]))]));
    sources.forEach((source, i) => {
      const legendX = 26 + i * (transmission ? 240 : 130);
      line(decorations, legendX, 45, legendX + 23, 45, source.color, source.dashed, 1.6);
      label(legendX + 30, 45, source.label, "west");
      let segment: Point[] = [], previous: number | null = null;
      const finish = () => { if (segment.length > 1) curves.push({ type: "line", points: segment, color: source.color, dashed: source.dashed, width: 1.4 }); segment = []; };
      for (const f of samples) {
        const complex = evaluated.get(source.analysis)!.get(f)![source.key];
        if (!Number.isFinite(complex.re) || !Number.isFinite(complex.im)) throw new Error("The frequency response exceeds numeric precision.");
        const value = phase ? validPhase(complex) : transmission ? -decibels(complex) : magnitudeScale === "db" ? decibels(complex) : magnitude(complex);
        if (value === null || !Number.isFinite(value)) { finish(); previous = null; continue; }
        if (phase && previous !== null && Math.abs(value - previous) > 180) finish();
        // Bound off-page coordinates before the renderer clips them (TeX has a finite dimension range).
        segment.push({ x: x(f), y: Math.max(frame.y - 500, Math.min(frame.y + frame.height + 500, y(value))) });
        previous = value;
      }
      finish();
    });
    pages.push(page);
  }
  return pages;
}

export function plotLatex(plot: ExportPlot): string {
  const render = (shape: PlotShape) => {
    if (shape.type === "label") return `\\node[anchor=${shape.anchor ?? "center"},inner sep=0pt,font=\\fontsize{${shape.size ?? 10}}{12}\\selectfont] at ${point(shape)} {$${shape.latex}$};`;
    const color = `{rgb,255:red,${parseInt(shape.color.slice(1, 3), 16)};green,${parseInt(shape.color.slice(3, 5), 16)};blue,${parseInt(shape.color.slice(5, 7), 16)}}`;
    if (shape.type === "rect") return `\\fill[color=${color}] ${point(shape)} rectangle ${point({ x: shape.x + shape.width, y: shape.y + shape.height })};`;
    return `\\draw[color=${color},line width=${shape.width ?? .6}pt${shape.dashed ? ",dash pattern=on 4pt off 3pt" : ""}] ${shape.points.map(point).join(" -- ")};`;
  };
  const f = plot.frame;
  return [`% Plot: ${plot.key}`, "\\begin{tikzpicture}[x=1pt,y=-1pt]",
    `\\path[use as bounding box] (0,0) rectangle (${plot.width},${plot.height});`,
    ...plot.decorations.map(render), "\\begin{scope}",
    `\\clip ${point(f)} rectangle ${point({ x: f.x + f.width, y: f.y + f.height })};`,
    ...plot.curves.map(render), "\\end{scope}", "\\end{tikzpicture}"].join("\n");
}
