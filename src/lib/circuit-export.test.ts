import { describe, expect, it } from "vitest";
import { circuitDrawing, circuitLatex, matrixExportBlocks, type DrawingItem, type Point } from "./circuit-export";
import { circuitSvg, matrixBlockSvg } from "./circuit-export-svg";
import { createCircuit, defaultSettings } from "./project";
import { analyzeNetwork } from "./network";
import { synthesize } from "./synthesis";
import type { Project, Section } from "./types";

const project = (sections: Section[]): Project => ({
  version: 1, name: "Export test", settings: { ...defaultSettings }, z2: 75,
  ...createCircuit(sections), sweep: { min: 1e4, max: 1e8, points: 101 },
});
const analysis = (sections: Section[]) => analyzeNetwork(sections, { fRef: 1e6, z1: 50, z2: 75 });

/** Resolve ideal-wire connectivity, including T junctions, from the exported drawing. */
function nets(items: DrawingItem[]) {
  const wires = items.filter(item => item.type === "wire");
  const points = items.flatMap(item => item.type === "wire" ? item.points : item.type === "element" ? [item.from, item.to] : [item.at]);
  const key = (p: Point) => `${p.x},${p.y}`;
  const parent = new Map(points.map(p => [key(p), key(p)]));
  const root = (p: string): string => parent.get(p) === p ? p : root(parent.get(p)!);
  for (const wire of wires) for (let i = 1; i < wire.points.length; i++) {
    const a = wire.points[i - 1], b = wire.points[i];
    for (const p of points) {
      const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
      if (Math.abs(cross) < 1e-8 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) parent.set(root(key(p)), root(key(a)));
    }
  }
  return (p: Point) => root(key(p));
}

describe("standalone circuit export", () => {
  it("follows electrical order despite reordered nodes and arbitrary canvas positions", () => {
    const sections: Section[] = [{ id: "l", kind: "L", connection: "series", value: 2e-6 }, { id: "c", kind: "C", connection: "shunt", value: 1e-9 }];
    const p = project(sections);
    const expected = circuitLatex(p, { symbols: "european", matrices: "none" });
    p.nodes.reverse().forEach((node, i) => { node.x = 900 - i * 400; node.y = i * 50; });
    p.wires.reverse();
    expect(circuitLatex(p, { symbols: "european", matrices: "none" })).toBe(expected);
    const elements = circuitDrawing(p).items.filter(item => item.type === "element").filter(item => !item.muted);
    expect(elements.map(item => item.kind)).toEqual(["L", "C"]);
    expect(elements[0].from.y).toBe(elements[0].to.y);
    expect(elements[1].from.x).toBe(elements[1].to.x);
    expect(expected).toContain("R_1=50");
    expect(expected).toContain("R_2=75");
  });

  for (const connection of ["series", "shunt"] as const) for (const resonator of ["series", "parallel"] as const) {
    it(`preserves ${resonator} LC connectivity in a ${connection} branch`, () => {
      const drawing = circuitDrawing(project([{ id: "lc", kind: "LC", connection, resonator, value: 1e-6, value2: 1e-9 }]));
      const net = nets(drawing.items);
      const elements = drawing.items.filter(item => item.type === "element").filter(item => !item.muted);
      const [l, c] = elements;
      const terminals = drawing.items.filter(item => item.type === "terminal");
      const input = net(terminals[0].at), output = net(terminals[2].at), ground = net(terminals[1].at);
      const far = connection === "shunt" ? ground : output;
      expect(elements.map(item => item.kind)).toEqual(["L", "C"]);
      expect(net(l.from)).toBe(input);
      expect(net(c.to)).toBe(far);
      expect(net(l.from)).not.toBe(net(l.to));
      if (resonator === "parallel") {
        expect(net(l.from)).toBe(net(c.from));
        expect(net(l.to)).toBe(net(c.to));
      } else {
        expect(net(l.to)).toBe(net(c.from));
        expect(net(l.to)).not.toBe(far);
      }
      expect(input === output).toBe(connection === "shunt");
      expect(ground).toBe(net(terminals[3].at));
    });
  }

  it("escapes user labels in both circuit and matrix pages", () => {
    const sections: Section[] = [{ id: "r", kind: "R", connection: "series", value: 50, label: "R_3 & 50% \\input{x}" }];
    const latex = circuitLatex(project(sections), { symbols: "american", matrices: "typeset" }, analysis(sections));
    expect(latex).toContain("\\usepackage[american]{circuitikz}");
    expect(latex).toContain("R\\_3 \\& 50\\% \\textbackslash{}input\\{x\\}");
    expect(latex).not.toContain("\\input{x}");
    expect(circuitSvg(project(sections), { symbols: "american", matrices: "none" }).source).not.toMatch(/merror|NaN|<script/);
  });

  it("includes matrix pages only when typesetting is selected and comments every source-only line", () => {
    const sections: Section[] = [{ id: "r", kind: "R", connection: "series", value: 50 }];
    const p = project(sections), n = analysis(sections);
    const plain = circuitLatex(p, { symbols: "european", matrices: "none" });
    const typeset = circuitLatex(p, { symbols: "european", matrices: "typeset" }, n);
    const source = circuitLatex(p, { symbols: "european", matrices: "source" }, n);
    const uncommented = source.split("\n").filter(line => !line.startsWith("% ")).join("\n");
    expect(plain).not.toContain("\\begin{tikzpicture}");
    expect(typeset.match(/\\begin\{tikzpicture\}/g)).toHaveLength(2);
    expect(uncommented).not.toContain("\\begin{tikzpicture}");
    expect(source).toContain("% \\begin{tikzpicture}");
    for (const formula of [n.latex.abcdDenominator, ...Object.values(n.latex.abcdEntries)]) expect(typeset).toContain(formula);
    expect(() => circuitLatex(p, { symbols: "european", matrices: "typeset" })).toThrow(/analysis/);
  });

  it("renders vector formulas for every filter family and response without missing glyphs or non-finite bounds", () => {
    for (const family of ["butterworth", "chebyshev", "cauer"] as const) for (const response of ["lowpass", "highpass", "bandpass", "bandstop"] as const) {
      const settings = { ...defaultSettings, family, response, bandwidth: 2e5 };
      const { sections } = synthesize(settings);
      const p = { ...project(sections), settings };
      const pages = [circuitSvg(p, { symbols: "european", matrices: "typeset" }), ...matrixExportBlocks(analysis(sections), sections).map(matrixBlockSvg)];
      for (const page of pages) {
        expect(page.width).toBeGreaterThan(0);
        expect(page.height).toBeGreaterThan(0);
        expect(page.source).not.toMatch(/merror|NaN|Infinity|<image|<text/);
        expect(page.source).toContain("<path");
      }
      expect(circuitSvg(p, { symbols: "american", matrices: "none" }).source).not.toBe(pages[0].source);
    }
  });
});
