import type { CircuitNode } from "./types";

export const CIRCUIT_NODE_HEIGHT = 144;
export const COMPONENT_WIDTH = 126;
export const PORT_WIDTH = 76;
export const SIGNAL_Y = 48;
export const GROUND_CLEARANCE = 28;

/** Local coordinates keep each shunt body halfway down its actual return path. */
export function shuntGeometry(returnY: number) {
  const centerY = (SIGNAL_Y + returnY) / 2;
  return { centerY, terminalY: centerY + 32 };
}

export type GroundConnection = {
  nodeId: string;
  x: number;
  fromY: number;
  kind: "port" | "shunt";
};
export type GroundGeometry = {
  rail: { left: number; right: number; y: number };
  connections: GroundConnection[];
  bounds: { x: number; y: number; width: number; height: number };
};

/** The common return is implicit; no ground nodes or wires enter the saved model. */
export function groundGeometry(
  nodes: readonly CircuitNode[],
): GroundGeometry | null {
  if (!nodes.length) return null;
  const y =
    Math.max(...nodes.map((node) => node.y + CIRCUIT_NODE_HEIGHT)) +
    GROUND_CLEARANCE;
  const connections: GroundConnection[] = [];
  const centers: number[] = [];
  for (const node of nodes) {
    const x =
      node.x +
      (node.port === "input"
        ? 24
        : node.port === "output"
          ? 52
          : COMPONENT_WIDTH / 2);
    centers.push(x);
    if (node.port)
      connections.push({
        nodeId: node.id,
        x,
        // Both lower port terminals sit directly on the straight return rail.
        fromY: y,
        kind: "port",
      });
    else if (node.section?.connection === "shunt")
      connections.push({
        nodeId: node.id,
        x,
        fromY: node.y + shuntGeometry(y - node.y).terminalY,
        kind: "shunt",
      });
  }
  let left = Math.min(...centers),
    right = Math.max(...centers);
  // A rail remains visible even when both ports have the same horizontal position.
  if (right - left < 64) {
    const center = (right + left) / 2;
    left = center - 32;
    right = center + 32;
  }
  const boundsLeft = Math.min(left - 12, ...nodes.map((node) => node.x - 12));
  const boundsRight = Math.max(
    right + 12,
    ...nodes.map(
      (node) => node.x + (node.port ? PORT_WIDTH : COMPONENT_WIDTH) + 12,
    ),
  );
  const boundsTop = Math.min(...nodes.map((node) => node.y - 12));
  return {
    rail: { left, right, y },
    connections,
    bounds: {
      x: boundsLeft,
      y: boundsTop,
      width: boundsRight - boundsLeft,
      height: y + 18 - boundsTop,
    },
  };
}
