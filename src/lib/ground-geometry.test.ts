import { describe, expect, it } from "vitest";
import {
  CIRCUIT_NODE_HEIGHT,
  COMPONENT_WIDTH,
  groundGeometry,
  GROUND_CLEARANCE,
  PORT_WIDTH,
  SOURCE_BRANCH_X,
  LOAD_BRANCH_X,
  SIGNAL_Y,
} from "./ground-geometry";
import type { CircuitNode } from "./types";
const ports: CircuitNode[] = [
  { id: "in", x: 0, y: 100, port: "input" },
  { id: "out", x: 600, y: 100, port: "output" },
];
const series: CircuitNode = {
  id: "L",
  x: 155,
  y: 100,
  section: { id: "L", kind: "L", connection: "series", value: 1e-6 },
};
const shunt: CircuitNode = {
  id: "C",
  x: 310,
  y: 100,
  section: { id: "C", kind: "C", connection: "shunt", value: 1e-9 },
};

describe("implicit continuous return conductor", () => {
  it("places both lower port terminals directly on the straight rail in an empty circuit", () => {
    const geometry = groundGeometry(ports)!;
    expect(geometry.connections).toEqual([
      { nodeId: "in", x: 24, fromY: geometry.rail.y, kind: "port" },
      { nodeId: "out", x: 652, fromY: geometry.rail.y, kind: "port" },
    ]);
    expect(geometry.rail.left).toBe(24);
    expect(geometry.rail.right).toBe(652);
    expect(geometry.rail.y).toBeGreaterThan(100 + SIGNAL_Y);
  });
  it("joins shunt terminals to the rail without grounding series elements", () => {
    const geometry = groundGeometry([...ports, series, shunt])!;
    expect(geometry.connections.map((c) => c.nodeId)).toEqual([
      "in",
      "out",
      "C",
    ]);
    expect(geometry.connections.find((c) => c.nodeId === "C")?.fromY).toBe(
      shunt.y + 142,
    );
    expect(geometry.rail.y).toBe(100 + CIRCUIT_NODE_HEIGHT + GROUND_CLEARANCE);
    expect(
      geometry.connections.every((c) =>
        c.kind === "port"
          ? c.fromY === geometry.rail.y
          : c.fromY < geometry.rail.y,
      ),
    ).toBe(true);
  });
  it("keeps the rail below all components and labels when arbitrary nodes are moved", () => {
    const moved: CircuitNode[] = [
      { ...ports[0], x: 900, y: -250 },
      { ...ports[1], x: -400, y: 520 },
      { ...series, x: 1200, y: 900 },
      { ...shunt, x: -800, y: 0 },
    ];
    const geometry = groundGeometry(moved)!;
    expect(geometry.rail.y).toBe(900 + CIRCUIT_NODE_HEIGHT + GROUND_CLEARANCE);
    expect(geometry.rail.left).toBe(-800 + 63);
    expect(geometry.rail.right).toBe(1200 + 63);
    expect(geometry.connections.find((c) => c.nodeId === "C")?.fromY).toBe(592);
    expect(
      geometry.connections.every(
        (c) =>
          c.x >= geometry.rail.left &&
          c.x <= geometry.rail.right &&
          (c.kind === "port"
            ? c.fromY === geometry.rail.y
            : c.fromY < geometry.rail.y),
      ),
    ).toBe(true);
    expect(geometry.bounds.y).toBeLessThan(-250);
    expect(geometry.bounds.y + geometry.bounds.height).toBeGreaterThan(
      geometry.rail.y + 5,
    );
  });
  it("tracks the whole model translation, including straight terminals and fitting bounds", () => {
    const nodes = [...ports, series, shunt],
      before = groundGeometry(nodes)!;
    const after = groundGeometry(
      nodes.map((n) => ({ ...n, x: n.x - 71, y: n.y + 43 })),
    )!;
    expect(after.rail).toEqual({
      left: before.rail.left - 71,
      right: before.rail.right - 71,
      y: before.rail.y + 43,
    });
    expect(after.bounds).toEqual({
      ...before.bounds,
      x: before.bounds.x - 71,
      y: before.bounds.y + 43,
    });
  });
  it("supports LC shunt branches and port overlap without needing signal wires", () => {
    const nodes = [
      { ...ports[0], x: 100 },
      { ...ports[1], x: 72 },
      {
        ...shunt,
        x: 61,
        section: {
          ...shunt.section!,
          kind: "LC" as const,
          value2: 1e-9,
          resonator: "series" as const,
        },
      },
    ];
    const geometry = groundGeometry(nodes)!;
    expect(geometry.connections).toHaveLength(3);
    expect(geometry.rail.right - geometry.rail.left).toBeGreaterThanOrEqual(64);
  });
  it("does not mutate or extend the serialized model", () => {
    const nodes = [...ports, series, shunt],
      original = structuredClone(nodes);
    groundGeometry(nodes);
    expect(nodes).toEqual(original);
    expect(groundGeometry([])).toBeNull();
  });
  it("fits visible source/load branches only, keeping the ports, shunts and common return intact", () => {
    const nodes = [...ports, series, shunt], original = structuredClone(nodes);
    const visible = groundGeometry(nodes, true)!;
    const hidden = groundGeometry(nodes, false)!;
    expect(visible.bounds.x).toBeLessThan(ports[0].x + SOURCE_BRANCH_X);
    expect(visible.bounds.x + visible.bounds.width).toBeGreaterThan(ports[1].x + LOAD_BRANCH_X);
    expect(hidden.bounds.x).toBe(ports[0].x - 12);
    expect(hidden.bounds.x + hidden.bounds.width).toBe(ports[1].x + PORT_WIDTH + 12);
    expect(hidden.rail).toEqual(visible.rail);
    expect(hidden.connections).toEqual(visible.connections);
    expect(hidden.bounds.y).toBe(visible.bounds.y);
    expect(hidden.bounds.height).toBe(visible.bounds.height);
    expect(nodes).toEqual(original);
    const withLooseParts = groundGeometry([
      ...nodes, { ...series, id: "left", x: -500 }, { ...shunt, id: "right", x: 1200 },
    ], false)!;
    expect(withLooseParts.bounds.x).toBe(-512);
    expect(withLooseParts.bounds.x + withLooseParts.bounds.width).toBe(1200 + COMPONENT_WIDTH + 12);
  });
});
