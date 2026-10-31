import { describe, expect, it } from "vitest";
import {
  createCircuit,
  orderedSections,
  parseProject,
  defaultSettings,
} from "./project";
import { COMPONENT_WIDTH, SIGNAL_Y } from "./ground-geometry";
import {
  CIRCUIT_GRID,
  CIRCUIT_SPACING,
  droppedComponentPosition,
  snapCircuitPosition,
} from "./circuit-layout";
import type { CircuitNode, Project, Section } from "./types";

const sections: Section[] = [
  { id: "L1", kind: "L", connection: "series", value: 1e-6 },
  { id: "C1", kind: "C", connection: "shunt", value: 1e-9 },
  { id: "R1", kind: "R", connection: "series", value: 50 },
  {
    id: "LC1",
    kind: "LC",
    connection: "shunt",
    resonator: "series",
    value: 1e-6,
    value2: 1e-9,
  },
];
const legacyPorts: CircuitNode[] = [
  { id: "in", port: "input", x: 0, y: 100 },
  { id: "out", port: "output", x: 930, y: 100 },
];

describe("circuit grid and signal alignment", () => {
  it("generates ports and every component on a common grid row without changing topology", () => {
    const circuit = createCircuit(sections);
    for (const node of circuit.nodes) {
      expect(node.x % CIRCUIT_GRID).toBe(0);
      expect(node.y % CIRCUIT_GRID).toBe(0);
      expect(node.y + SIGNAL_Y).toBe(circuit.nodes[0].y + SIGNAL_Y);
      expect(snapCircuitPosition(node)).toEqual({ x: node.x, y: node.y });
    }
    expect(CIRCUIT_SPACING % CIRCUIT_GRID).toBe(0);
    expect(orderedSections(circuit.nodes, circuit.wires)).toEqual(sections);
  });

  it("drops on the port signal line using the conductor center rather than the node corner", () => {
    const { nodes } = createCircuit([]);
    const target = { x: 312, y: nodes[0].y };
    const pointer = {
      x: target.x + COMPONENT_WIDTH / 2,
      y: target.y + SIGNAL_Y,
    };
    expect(droppedComponentPosition(pointer, nodes)).toEqual(target);
    expect(
      droppedComponentPosition({ x: pointer.x + 2, y: pointer.y - 2 }, nodes),
    ).toEqual(target);
  });

  it("aligns drops and horizontal drags to legacy port heights outside the grid", () => {
    const position = droppedComponentPosition({ x: 375, y: 148 }, legacyPorts);
    expect(position.y + SIGNAL_Y).toBe(legacyPorts[0].y + SIGNAL_Y);
    expect(position.y + SIGNAL_Y).toBe(legacyPorts[1].y + SIGNAL_Y);
    // React Flow supplies the nearest grid row (96) during a horizontal drag.
    expect(snapCircuitPosition({ x: 324, y: 96 }, legacyPorts)).toEqual({
      x: 324,
      y: 100,
    });
  });

  it("can align with either port and leaves intentional rows away from the ports available", () => {
    const ports = [legacyPorts[0], { ...legacyPorts[1], y: 205 }];
    expect(snapCircuitPosition({ x: 312, y: 204 }, ports).y).toBe(205);
    expect(snapCircuitPosition({ x: 312, y: 96 }, ports).y).toBe(100);
    expect(snapCircuitPosition({ x: 312, y: 120 }, ports).y).toBe(120);
    expect(snapCircuitPosition({ x: -25, y: -13 })).toEqual({ x: -24, y: -12 });
  });

  it("prefers the closest signal row and prioritizes ports at equal distance", () => {
    const component: CircuitNode = {
      id: "L1",
      x: 156,
      y: 92,
      section: sections[0],
    };
    expect(
      snapCircuitPosition({ x: 312, y: 96 }, [component, ...legacyPorts]).y,
    ).toBe(100);
    expect(
      snapCircuitPosition({ x: 312, y: 93 }, [component, ...legacyPorts]).y,
    ).toBe(92);
  });

  it("preserves imported coordinates and does not move existing nodes while inserting", () => {
    const project: Project = {
      version: 1,
      name: "Legacy layout",
      settings: defaultSettings,
      nodes: legacyPorts,
      wires: [],
      z2: 50,
      sweep: { min: 1e5, max: 1e7, points: 601 },
    };
    const imported = parseProject(JSON.parse(JSON.stringify(project)));
    const original = structuredClone(imported.nodes);
    droppedComponentPosition({ x: 375, y: 148 }, imported.nodes);
    expect(imported.nodes).toEqual(original);
    expect(imported.nodes).toEqual(legacyPorts);
  });
});
