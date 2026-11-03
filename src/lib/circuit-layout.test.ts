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
  CIRCUIT_INITIAL_Y,
  CIRCUIT_SPACING,
  droppedComponentPosition,
  snapCircuitPosition,
  straightenCircuit,
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

describe("automatic circuit alignment", () => {
  it("straightens a scrambled cascade in electrical order without changing its data or array order", () => {
    const circuit = createCircuit(sections);
    const nodes = [...circuit.nodes].reverse().map((node, i) => ({ ...node, x: 900 - i * 91, y: i % 2 ? 420 : -30 }));
    const original = structuredClone(nodes), wires = structuredClone(circuit.wires);
    const aligned = straightenCircuit(nodes, circuit.wires);
    expect(nodes).toEqual(original);
    expect(circuit.wires).toEqual(wires);
    expect(aligned.map(node => node.id)).toEqual(nodes.map(node => node.id));
    expect(orderedSections(aligned, circuit.wires)).toEqual(sections);
    const order = ["input", ...sections.map(section => section.id), "output"];
    for (const [i, id] of order.entries()) {
      const node = aligned.find(node => node.id === id)!;
      expect(node.x).toBe(i * CIRCUIT_SPACING);
      expect(node.y).toBe(CIRCUIT_INITIAL_Y);
      expect(node.section).toBe(nodes.find(node => node.id === id)!.section);
    }
    expect(straightenCircuit(aligned, circuit.wires)).toBe(aligned);
  });

  it("keeps open chains separated and ordered by their existing connections", () => {
    const circuit = createCircuit(sections);
    const wires = circuit.wires.filter(wire => wire.source !== "C1");
    const aligned = straightenCircuit([...circuit.nodes].reverse(), wires);
    for (const wire of wires) {
      const source = aligned.find(node => node.id === wire.source)!;
      const target = aligned.find(node => node.id === wire.target)!;
      expect(target.x - source.x).toBe(CIRCUIT_SPACING);
      expect(target.y).toBe(source.y);
    }
    expect(aligned.find(node => node.id === "R1")!.x - aligned.find(node => node.id === "C1")!.x).toBe(2 * CIRCUIT_SPACING);
  });

  it("places loose parts away from a complete signal path and retains all nodes", () => {
    const circuit = createCircuit(sections);
    const loose: CircuitNode = { id: "loose", section: { ...sections[0], id: "loose" }, x: 200, y: 40 };
    const aligned = straightenCircuit([loose, ...circuit.nodes], circuit.wires);
    expect(aligned).toHaveLength(circuit.nodes.length + 1);
    expect(aligned[0].y).toBeGreaterThan(aligned[1].y);
    expect(aligned.slice(1)).toEqual(circuit.nodes);
    expect(straightenCircuit(aligned, circuit.wires)).toBe(aligned);
  });

  it("handles empty or disconnected circuits and terminates on imported cycles", () => {
    expect(straightenCircuit([], [])).toEqual([]);
    const circuit = createCircuit(sections);
    const disconnected = straightenCircuit([...circuit.nodes].reverse(), []);
    expect(disconnected.find(node => node.port === "input")!.x).toBe(0);
    expect(disconnected.find(node => node.port === "output")!.x).toBe(Math.max(...disconnected.map(node => node.x)));
    const cyclicWires = [...circuit.wires.slice(1, -1), { id: "cycle", source: "LC1", target: "L1" }];
    const cyclic = straightenCircuit(circuit.nodes, cyclicWires);
    expect(cyclic.map(node => node.id)).toEqual(circuit.nodes.map(node => node.id));
    expect(new Set(cyclic.map(node => `${node.x},${node.y}`)).size).toBe(cyclic.length);
    expect(straightenCircuit(cyclic, cyclicWires)).toBe(cyclic);
  });
});
