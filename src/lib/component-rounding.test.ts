import { describe, expect, it } from "vitest";
import { formatComponentLabel, formatComponentValue } from "./component-units";
import { isComponentPrecision, roundComponentValues } from "./component-rounding";
import { createCircuit, defaultSettings, orderedSections, parseProject } from "./project";
import { analyzeNetwork } from "./network";
import { synthesize } from "./synthesis";
import type { Project, Section } from "./types";

const sections: Section[] = [
  { id: "R1", kind: "R", connection: "series", value: 49.186123 },
  { id: "L1", kind: "L", connection: "series", value: 4.9186123e-6 },
  { id: "C1", kind: "C", connection: "shunt", value: 4.9186123e-9 },
  { id: "LC1", kind: "LC", connection: "shunt", resonator: "series", value: 15.915494309e-6, value2: 3.18309886e-9 },
];
const project: Project = {
  version: 1, name: "Precision test", settings: defaultSettings,
  ...createCircuit(sections), z2: 50, sweep: { min: 1e5, max: 1e7, points: 601 },
};

describe("component display precision", () => {
  it("formats significant digits across quantities and languages without changing values", () => {
    expect(formatComponentLabel(sections[0].value, "R", "en", 3)).toBe("49.2 Ω");
    expect(formatComponentLabel(sections[1].value, "L", "en", 3)).toBe("4.92 µH");
    expect(formatComponentLabel(sections[2].value, "C", "de", 3)).toBe("4,92 nF");
    expect(formatComponentValue(sections[2].value, 1e-12, "en", 3)).toBe("4920");
    expect(formatComponentValue(sections[2].value, 1e-6, "de", 3)).toBe("0,00492");
    expect(sections[2].value).toBe(4.9186123e-9);
  });

  it("shows the full available value instead of silently limiting input fields to ten digits", () => {
    const value = 1.2345678901234567;
    expect(formatComponentValue(value, 1, "en")).toBe(String(value));
    expect(formatComponentValue(value, 1, "de", "full")).toBe("1,2345678901234567");
    expect(formatComponentValue(value, 1, "en", 12)).toBe("1.23456789012");
    expect(formatComponentValue(1e-30, 1e-12, "en", "full")).not.toBe("0");
  });

  it("uses the same rounding as the physical operation near decimal ties", () => {
    const value = 1.005;
    const rounded = Number(value.toPrecision(3));
    expect(Number(formatComponentValue(value, 1, "en", 3))).toBe(rounded);
    expect(Number(formatComponentValue(value, 1e3, "en", 3))).toBe(rounded / 1e3);
  });

  it("does not add binary unit-conversion artifacts to already rounded values", () => {
    expect(formatComponentValue(5.15e-9, 1e-9, "en", "full")).toBe("5.15");
    expect(formatComponentValue(15.92e-6, 1e-6, "de", "full")).toBe("15,92");
    expect(formatComponentValue(1.2345678901234567e-6, 1e-6, "en", "full")).toBe("1.2345678901234567");
  });

  it("saves display precision while preserving all circuit values, including legacy imports", () => {
    for (const componentPrecision of ["full", 1, 4, 15] as const) {
      const reopened = parseProject(JSON.parse(JSON.stringify({ ...project, componentPrecision })));
      expect(reopened.componentPrecision).toBe(componentPrecision);
      expect(reopened.nodes).toEqual(project.nodes);
    }
    expect(parseProject(project)).toEqual(project);
    for (const value of [0, 16, 3.5, "4", null, [4], {}, Infinity]) {
      expect(isComponentPrecision(value)).toBe(false);
      expect(() => parseProject({ ...project, componentPrecision: value })).toThrow("Anzeigegenauigkeit");
    }
  });
});

describe("explicit component rounding", () => {
  it("rounds every RLC value immutably, preserving topology, layout, and the undo snapshot", () => {
    const original = structuredClone(project);
    const result = roundComponentValues(project.nodes, 3);
    expect(result.changedValues).toBe(5);
    const rounded = result.nodes.flatMap((node) => node.section ? [node.section] : []);
    expect(rounded.map((s) => s.value)).toEqual([49.2, 4.92e-6, 4.92e-9, 15.9e-6]);
    expect(rounded[3].value2).toBe(3.18e-9);
    expect(result.nodes[0]).toBe(project.nodes[0]);
    expect(result.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual(project.nodes.map(({ id, x, y }) => ({ id, x, y })));
    expect(project).toEqual(original);
    expect(parseProject({ ...project, nodes: result.nodes }).nodes).toEqual(result.nodes);
    const repeated = roundComponentValues(result.nodes, 3);
    expect(repeated.changedValues).toBe(0);
    expect(repeated.nodes).toBe(result.nodes);
  });

  it("handles empty circuits, decade boundaries, and very small positive values", () => {
    const ports = project.nodes.filter((node) => node.port);
    expect(roundComponentValues(ports, 1)).toEqual({ nodes: ports, changedValues: 0 });
    for (const [value, expected] of [[9.999e-6, 1e-5], [9.999e14, 1e15], [Number.MIN_VALUE, Number.MIN_VALUE]]) {
      const nodes = createCircuit([{ ...sections[1], value }]).nodes;
      const rounded = roundComponentValues(nodes, 3).nodes.find((node) => node.section)!.section!.value;
      expect(rounded).toBe(expected);
      expect(rounded).toBeGreaterThan(0);
    }
    expect(() => roundComponentValues(project.nodes, 0)).toThrow(RangeError);
    expect(() => roundComponentValues(project.nodes, 16)).toThrow(RangeError);
  });

  it("changes the actual network response only when rounded nodes are applied", () => {
    const generated = createCircuit(synthesize(defaultSettings).sections);
    const options = { fRef: defaultSettings.cutoff, z1: 50, z2: 50 };
    const original = analyzeNetwork(orderedSections(generated.nodes, generated.wires), options);
    const before = original.evaluate(defaultSettings.cutoff).s21;
    const result = roundComponentValues(generated.nodes, 1);
    const rounded = analyzeNetwork(orderedSections(result.nodes, generated.wires), options);
    expect(rounded.evaluate(defaultSettings.cutoff).s21).not.toEqual(before);
    expect(original.evaluate(defaultSettings.cutoff).s21).toEqual(before);
  });
});
