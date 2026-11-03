import type { NetworkAnalysis } from "./network";
import { orderedSections } from "./project";
import { initialComponentUnit, formatComponentValue } from "./component-units";
import type { ComponentPrecision, Project, Section } from "./types";
import { exportPlots, plotLatex, type ExportPlotContext, type ExportPlotSelection } from "./export-plots";

export type CircuitExportOptions = {
  symbols: "european" | "american";
  matrices: "none" | "typeset" | "source";
  includeSourceAndLoad?: boolean;
  plots?: ExportPlotSelection;
};
export type Point = { x: number; y: number };
export type DrawingItem =
  | { type: "wire"; points: Point[]; muted?: boolean }
  | { type: "element"; kind: "R" | "L" | "C" | "sV"; from: Point; to: Point; muted?: boolean }
  | { type: "terminal"; at: Point }
  | { type: "junction"; at: Point }
  | { type: "label"; at: Point; latex: string; anchor: "center" | "west" | "east"; muted?: boolean };
export type CircuitDrawing = { items: DrawingItem[]; width: number; bottom: number; top: number };
export type MatrixExportBlock = { title: string; formulas: string[] };

/** User labels are always literal text, never executable TeX. */
export function escapeLatexText(text: string): string {
  const escapes: Record<string, string> = {
    "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$",
    "&": "\\&", "%": "\\%", "#": "\\#", "_": "\\_",
    "~": "\\textasciitilde{}", "^": "\\textasciicircum{}",
  };
  return text.replace(/[\\{}$&%#_~^]/g, character => escapes[character]).replace(/[\r\n\t]/g, " ");
}

function valueLatex(value: number, kind: "R" | "L" | "C", precision: ComponentPrecision): string {
  const unit = initialComponentUnit(kind, value);
  const [mantissa, exponent] = formatComponentValue(value, unit.scale, "en", precision).split(/e/i);
  const numeric = exponent === undefined ? mantissa : `${mantissa}\\cdot 10^{${Number(exponent)}}`;
  const symbol = unit.symbol.replace("µ", "\\mu ").replace("Ω", "\\Omega ");
  return `${numeric}\\,\\mathrm{${symbol}}`;
}

/** A tidy ladder layout follows electrical connection order, independently of canvas positions. */
export function circuitDrawing(project: Project, { includeSourceAndLoad = true }: Pick<CircuitExportOptions, "includeSourceAndLoad"> = {}): CircuitDrawing {
  const sections = orderedSections(project.nodes, project.wires);
  const precision = project.componentPrecision ?? 4;
  const items: DrawingItem[] = [];
  const at = (x: number, y: number): Point => ({ x, y });
  const wire = (points: Point[], muted = false) => items.push({ type: "wire", points, muted });
  const element = (kind: "R" | "L" | "C" | "sV", from: Point, to: Point, muted = false) => items.push({ type: "element", kind, from, to, muted });
  const label = (x: number, y: number, latex: string, anchor: "center" | "west" | "east" = "center", muted = false) =>
    items.push({ type: "label", at: at(x, y), latex, anchor, muted });
  const bottom = -4;
  const input = includeSourceAndLoad ? 3 : 0;
  if (includeSourceAndLoad) {
    element("sV", at(0, bottom), at(0, 0), true);
    label(-.65, -2, "V_s", "east", true);
    element("R", at(0, 0), at(input, 0), true);
    label(1.5, .65, `R_1=${valueLatex(project.settings.impedance, "R", precision)}`, "center", true);
  }
  items.push({ type: "terminal", at: at(input, 0) }, { type: "terminal", at: at(input, bottom) });
  label(input, 1.25, "\\text{Port 1}");
  let x = input + 1;
  wire([at(input, 0), at(x, 0)]);
  sections.forEach((section, index) => {
    const i = index + 1;
    const name = section.label ? `\\text{${escapeLatexText(section.label)}}` : `${section.kind}_{${i}}`;
    const value = (kind: "R" | "L" | "C", number: number) => `${kind}_{${i}}=${valueLatex(number, kind, precision)}`;
    // Extra room for resonator branches and full-precision labels.
    const baseWidth = section.kind === "LC" ? 7 : 4.5;
    const width = Math.max(baseWidth, (section.label?.length ?? 0) * .17 + 1, precision === "full" || precision > 8 ? 7 : 0);
    const end = x + width, center = (x + end) / 2;
    const shunt = section.connection === "shunt";
    if (shunt) {
      wire([at(x, 0), at(end, 0)]);
      items.push({ type: "junction", at: at(center, 0) }, { type: "junction", at: at(center, bottom) });
    }
    if (section.kind !== "LC") {
      element(section.kind, shunt ? at(center, 0) : at(x, 0), shunt ? at(center, bottom) : at(end, 0));
      label(shunt ? center + .65 : center, shunt ? -2 : .65,
        `${name}=${valueLatex(section.value, section.kind, precision)}`, shunt ? "west" : "center");
    } else {
      label(center, 1.65, name);
      if (section.resonator === "series") {
        element("L", shunt ? at(center, 0) : at(x, 0), shunt ? at(center, -2) : at(center, 0));
        element("C", shunt ? at(center, -2) : at(center, 0), shunt ? at(center, bottom) : at(end, 0));
        label(shunt ? center + .65 : (x + center) / 2, shunt ? -1 : .65, value("L", section.value), shunt ? "west" : "center");
        label(shunt ? center + .65 : (center + end) / 2, shunt ? -3 : .65, value("C", section.value2!), shunt ? "west" : "center");
      } else if (shunt) {
        wire([at(center, 0), at(center, -.6), at(center - .65, -.6)]);
        wire([at(center, -.6), at(center + .65, -.6)]);
        wire([at(center - .65, -3.4), at(center + .65, -3.4)]);
        wire([at(center, -3.4), at(center, bottom)]);
        element("L", at(center - .65, -.6), at(center - .65, -3.4));
        element("C", at(center + .65, -.6), at(center + .65, -3.4));
        label(center - 1.1, -2, value("L", section.value), "east");
        label(center + 1.1, -2, value("C", section.value2!), "west");
      } else {
        wire([at(x, 0), at(x + .5, 0)]);
        wire([at(x + .5, -.6), at(x + .5, .6)]);
        wire([at(end - .5, -.6), at(end - .5, .6)]);
        wire([at(end - .5, 0), at(end, 0)]);
        element("L", at(x + .5, .6), at(end - .5, .6));
        element("C", at(x + .5, -.6), at(end - .5, -.6));
        label(center, 1.1, value("L", section.value));
        label(center, -1.15, value("C", section.value2!));
      }
    }
    x = end;
  });
  const output = x + 1, load = output + 2;
  wire([at(x, 0), at(output, 0)]);
  wire([at(input, bottom), at(output, bottom)]);
  if (includeSourceAndLoad) {
    wire([at(0, bottom), at(input, bottom)], true);
    wire([at(output, 0), at(load, 0)], true);
    wire([at(output, bottom), at(load, bottom)], true);
    element("R", at(load, 0), at(load, bottom), true);
    label(load + .65, -2, `R_2=${valueLatex(project.z2, "R", precision)}`, "west", true);
  }
  items.push({ type: "terminal", at: at(output, 0) }, { type: "terminal", at: at(output, bottom) });
  label(output, 1.25, "\\text{Port 2}");
  return { items, width: includeSourceAndLoad ? load : output, bottom, top: 2.1 };
}

export function matrixExportBlocks(analysis: NetworkAnalysis, sections: Section[]): MatrixExportBlock[] {
  return [
    { title: "M(p)", formulas: [analysis.latex.abcd, analysis.latex.abcdDenominator, ...Object.values(analysis.latex.abcdEntries)] },
    ...analysis.sectionDerivations.map((derivation, i) => ({
      title: `M${i + 1}: ${sections[i].label || `${sections[i].kind}${i + 1}`}`,
      formulas: derivation.groups.flat(),
    })),
  ];
}

export function circuitLatex(project: Project, options: CircuitExportOptions, analysis?: NetworkAnalysis | null, plotContext?: ExportPlotContext): string {
  if (options.matrices !== "none" && !analysis) throw new Error("Matrix analysis is required for this export.");
  const drawing = circuitDrawing(project, options);
  const point = ({ x, y }: Point) => `(${Number(x.toFixed(5))},${Number(y.toFixed(5))})`;
  const circuit = drawing.items.map(item => {
    const color = "muted" in item && item.muted ? "gray" : "black";
    if (item.type === "wire") return `\\draw[${color}] ${item.points.map(point).join(" -- ")};`;
    if (item.type === "element") return `\\draw[${color}] ${point(item.from)} to[${item.kind}] ${point(item.to)};`;
    if (item.type === "terminal") return `\\draw[black,fill=white] ${point(item.at)} circle[radius=0.065];`;
    if (item.type === "junction") return `\\fill[black] ${point(item.at)} circle[radius=0.035];`;
    if (item.type === "label") return `\\node[anchor=${item.anchor},text=${color},font=\\small] at ${point(item.at)} {$${item.latex}$};`;
    return "";
  });
  const blocks = options.matrices === "none" ? [] : matrixExportBlocks(analysis!, orderedSections(project.nodes, project.wires));
  const appendix = blocks.map(block => [
    "\\begin{tikzpicture}",
    "\\node[inner sep=0pt] {\\begin{tabular}{@{}l@{}}",
    `\\textbf{${escapeLatexText(block.title)}}\\\\[8pt]`,
    block.formulas.map(formula => `$\\displaystyle ${formula}$`).join("\\\\[8pt]\n"),
    "\\end{tabular}};",
    "\\end{tikzpicture}",
  ].join("\n")).join("\n\n");
  return [
    "% Filterstudio - standalone circuit diagram; compile with pdfLaTeX or LuaLaTeX.",
    "% Source and load represent the port reference impedances, not extra filter sections.",
    "% Circuit layout follows electrical connection order; canvas positions are not exported.",
    "\\documentclass[border=8pt,multi={circuitikz,tikzpicture}]{standalone}",
    "\\usepackage[T1]{fontenc}", "\\usepackage[utf8]{inputenc}", "\\usepackage{textcomp}",
    "\\usepackage{amsmath,amssymb}", `\\usepackage[${options.symbols}]{circuitikz}`,
    "\\begin{document}", "\\begin{circuitikz}", ...circuit, "\\end{circuitikz}",
    ...(appendix ? [options.matrices === "source"
      ? `% Optional matrix pages: uncomment the following lines to typeset them.\n${appendix.split("\n").map(line => `% ${line}`).join("\n")}`
      : appendix] : []),
    ...exportPlots(project, options.plots, analysis, plotContext).map(plotLatex),
    "\\end{document}", "",
  ].join("\n");
}
