import { circuitDrawing, escapeLatexText, type CircuitExportOptions, type Point, type MatrixExportBlock } from "./circuit-export";
import type { Project } from "./types";
import { mathSvg } from "./export-math-svg";
import type { ExportPlot, PlotShape } from "./export-plots";

const cm = 72 / 2.54;
const number = (value: number) => Number(value.toFixed(4));
const position = (p: Point) => `${number(p.x * cm)},${number(-p.y * cm)}`;
const svgPage = (content: string[], x: number, y: number, width: number, height: number) => ({
  source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">${content.join("")}</svg>`,
  width, height,
});

export function circuitSvg(project: Project, options: CircuitExportOptions) {
  const drawing = circuitDrawing(project, options), content: string[] = [];
  let left = -.5 * cm, right = drawing.width * cm + .5 * cm;
  let top = -drawing.top * cm, bottom = -drawing.bottom * cm + .5 * cm;
  for (const item of drawing.items) {
    const color = "muted" in item && item.muted ? "#888888" : "#202020";
    if (item.type === "label") {
      const formula = mathSvg(item.latex, 9);
      const x = item.at.x * cm - (item.anchor === "center" ? formula.width / 2 : item.anchor === "east" ? formula.width : 0);
      const y = -item.at.y * cm - formula.height / 2;
      left = Math.min(left, x); right = Math.max(right, x + formula.width);
      top = Math.min(top, y); bottom = Math.max(bottom, y + formula.height);
      content.push(formula.source.replace("<svg ", `<svg x="${x}" y="${y}" `).replace('color="black"', `color="${color}"`));
    } else if (item.type === "wire") {
      content.push(`<polyline points="${item.points.map(position).join(" ")}" fill="none" stroke="${color}" stroke-width=".8"/>`);
    } else if (item.type === "terminal" || item.type === "junction") {
      content.push(`<circle cx="${item.at.x * cm}" cy="${-item.at.y * cm}" r="${(item.type === "terminal" ? .065 : .035) * cm}" fill="${item.type === "terminal" ? "white" : "#202020"}" stroke="#202020" stroke-width=".8"/>`);
    } else if (item.type === "element") {
      const cx = (item.from.x + item.to.x) / 2 * cm, cy = -(item.from.y + item.to.y) / 2 * cm;
      const half = Math.hypot(item.to.x - item.from.x, item.to.y - item.from.y) * cm / 2;
      const angle = -Math.atan2(item.to.y - item.from.y, item.to.x - item.from.x) * 180 / Math.PI;
      const size = item.kind === "C" ? .07 * cm : .4 * cm;
      let body: string;
      if (item.kind === "C") body = `<path d="M${-size},-8V8M${size},-8V8"/>`;
      else if (item.kind === "R" && options.symbols === "american") body = `<path d="M${-size},0l${size / 5},-4 ${size / 5},8 ${size / 5},-8 ${size / 5},8 ${size / 5},-8 ${size / 5},8 ${size / 5},-8 ${size / 5},8 ${size / 5},-8 ${size / 5},4"/>`;
      else if (item.kind === "R" || (item.kind === "L" && options.symbols === "european")) body = `<rect x="${-size}" y="-4" width="${2 * size}" height="8" fill="${item.kind === "L" ? color : "white"}"/>`;
      else if (item.kind === "L") body = `<path d="M${-size},0c0,-9 ${size / 2},-9 ${size / 2},0c0,-9 ${size / 2},-9 ${size / 2},0c0,-9 ${size / 2},-9 ${size / 2},0c0,-9 ${size / 2},-9 ${size / 2},0"/>`;
      else body = `<circle r="${size}" fill="white"/><path transform="rotate(${-angle})" d="M-7,0c2,-7 5,-7 7,0s5,7 7,0"/>`;
      content.push(`<g transform="translate(${cx},${cy}) rotate(${angle})" fill="none" stroke="${color}" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"><path d="M${-half},0H${-size}M${size},0H${half}"/>${body}</g>`);
    }
  }
  const margin = 10;
  return svgPage(content, left - margin, top - margin, right - left + margin * 2, bottom - top + margin * 2);
}

export function matrixBlockSvg(block: MatrixExportBlock) {
  const content: string[] = [];
  let y = 12, width = 0;
  for (const [i, formula] of [`\\text{${escapeLatexText(block.title)}}`, ...block.formulas].entries()) {
    const rendered = mathSvg(formula, i === 0 ? 12 : 10);
    content.push(rendered.source.replace("<svg ", `<svg x="12" y="${y}" `));
    width = Math.max(width, rendered.width);
    y += rendered.height + (i === 0 ? 18 : 12);
  }
  return svgPage(content, 0, 0, width + 24, y);
}

export function plotSvg(plot: ExportPlot) {
  const render = (shape: PlotShape) => {
    if (shape.type === "label") {
      const formula = mathSvg(shape.latex, shape.size ?? 10);
      const x = shape.x - (shape.anchor === "west" ? 0 : shape.anchor === "east" ? formula.width : formula.width / 2);
      return formula.source.replace("<svg ", `<svg x="${x}" y="${shape.y - formula.height / 2}" `);
    }
    if (shape.type === "rect") return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${shape.color}"/>`;
    return `<polyline points="${shape.points.map(p => `${number(p.x)},${number(p.y)}`).join(" ")}" fill="none" stroke="${shape.color}" stroke-width="${shape.width ?? .6}"${shape.dashed ? ' stroke-dasharray="4 3"' : ""}/>`;
  };
  const frame = plot.frame, clipId = `plot-${plot.key}`;
  return svgPage([
    `<rect width="${plot.width}" height="${plot.height}" fill="white"/>`,
    ...plot.decorations.map(render),
    `<defs><clipPath id="${clipId}"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}"/></clipPath></defs>`,
    `<g clip-path="url(#${clipId})">${plot.curves.map(render).join("")}</g>`,
  ], 0, 0, plot.width, plot.height);
}
