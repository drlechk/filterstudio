import { jsPDF } from "jspdf";
import "svg2pdf.js";
import type { Project } from "./types";
import type { NetworkAnalysis } from "./network";
import { matrixExportBlocks, type CircuitExportOptions } from "./circuit-export";
import { circuitSvg, componentListSvgs, matrixBlockSvg, plotSvg } from "./circuit-export-svg";
import { orderedSections } from "./project";
import { exportPlots, type ExportPlotContext } from "./export-plots";

/** All drawing, formula layout and PDF serialization run locally; there is no compilation service. */
export async function circuitPdf(project: Project, options: CircuitExportOptions, analysis?: NetworkAnalysis | null, plotContext?: ExportPlotContext): Promise<Blob> {
  if (options.matrices === "typeset" && !analysis) throw new Error("Matrix analysis is required for this export.");
  const pages = [circuitSvg(project, options), ...componentListSvgs(project, options)];
  if (options.matrices === "typeset") {
    for (const block of matrixExportBlocks(analysis!, orderedSections(project.nodes, project.wires))) pages.push(matrixBlockSvg(block));
  }
  pages.push(...exportPlots(project, options.plots, analysis, plotContext).map(plotSvg));
  const dimensions = (page: typeof pages[number]) => {
    const scale = Math.min(1, 14000 / Math.max(page.width, page.height));
    return { width: page.width * scale, height: page.height * scale };
  };
  const first = dimensions(pages[0]);
  const pdf = new jsPDF({ unit: "pt", format: [first.width, first.height], orientation: first.width > first.height ? "landscape" : "portrait", compress: true });
  pdf.setProperties({ title: project.name, creator: "Filterstudio", subject: "Circuit, component list, matrices and selected response plots" });
  for (const [i, page] of pages.entries()) {
    const { width, height } = dimensions(page);
    if (i) pdf.addPage([width, height], width > height ? "landscape" : "portrait");
    const svg = new DOMParser().parseFromString(page.source, "image/svg+xml").documentElement;
    if (svg.querySelector("parsererror")) throw new Error("Unable to render the diagram.");
    await pdf.svg(svg, { x: 0, y: 0, width, height });
  }
  return pdf.output("blob");
}
