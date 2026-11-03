import { CIRCUIT_NODE_HEIGHT, COMPONENT_WIDTH, SIGNAL_Y } from "./ground-geometry";
import type { CircuitNode, CircuitWire } from "./types";

export const CIRCUIT_GRID = 12;
// Leave a small selectable wire gap without shrinking the component symbols.
export const CIRCUIT_SPACING = 11 * CIRCUIT_GRID;
export const CIRCUIT_PORT_SPACING = 8 * CIRCUIT_GRID;
export const CIRCUIT_INITIAL_Y = 8 * CIRCUIT_GRID;
export const CIRCUIT_SNAP_GRID: [number, number] = [CIRCUIT_GRID, CIRCUIT_GRID];
type Position = { x: number; y: number };

export const circuitNodeSpacing = (node: CircuitNode) =>
  node.port ? CIRCUIT_PORT_SPACING : CIRCUIT_SPACING;

export const snapCircuitCoordinate = (value: number) =>
  Math.round(value / CIRCUIT_GRID) * CIRCUIT_GRID;

/** All signal handles have the same local Y, so matching node rows aligns them.
 * Preserve nearby off-grid rows from imported projects instead of moving their ports.
 * Callers exclude nodes being moved so they cannot snap back to themselves.
 */
export function snapCircuitPosition(
  position: Position,
  stationaryNodes: readonly CircuitNode[] = [],
): Position {
  let alignedY: number | undefined;
  let distance = CIRCUIT_GRID / 2;
  const candidates = [
    ...stationaryNodes.filter((node) => node.port),
    ...stationaryNodes.filter((node) => !node.port),
  ];
  for (const node of candidates) {
    const candidateDistance = Math.abs(position.y - node.y);
    if (
      candidateDistance <= CIRCUIT_GRID / 2 &&
      (alignedY === undefined || candidateDistance < distance)
    ) {
      alignedY = node.y;
      distance = candidateDistance;
    }
  }
  return {
    x: snapCircuitCoordinate(position.x),
    y: alignedY ?? snapCircuitCoordinate(position.y),
  };
}

/** The drop cursor marks the center of the component's signal conductor. */
export function droppedComponentPosition(
  pointer: Position,
  stationaryNodes: readonly CircuitNode[],
): Position {
  return snapCircuitPosition(
    { x: pointer.x - COMPONENT_WIDTH / 2, y: pointer.y - SIGNAL_Y },
    stationaryNodes,
  );
}

/** Follow the signal connections, keeping disconnected chains visibly separate.
 * Only coordinates change; array order, IDs, component data and wires stay intact.
 */
export function straightenCircuit(nodes: CircuitNode[], wires: readonly CircuitWire[]): CircuitNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const outgoing = new Map<string, string>();
  const incoming = new Set<string>();
  for (const wire of wires) {
    if (!byId.has(wire.source) || !byId.has(wire.target)) continue;
    if (!outgoing.has(wire.source)) outgoing.set(wire.source, wire.target);
    incoming.add(wire.target);
  }
  const visited = new Set<string>(), chains: CircuitNode[][] = [];
  const follow = (start: CircuitNode) => {
    const chain: CircuitNode[] = [];
    let node: CircuitNode | undefined = start;
    while (node && !visited.has(node.id)) {
      visited.add(node.id);
      chain.push(node);
      node = byId.get(outgoing.get(node.id) ?? "");
    }
    if (chain.length) chains.push(chain);
  };
  nodes.filter(node => !incoming.has(node.id)).forEach(follow);
  // Imported invalid circuits may contain cycles: retain every node and terminate.
  nodes.forEach(follow);
  const priority = (chain: CircuitNode[]) => chain.some(node => node.port === "input") ? -1
    : chain.some(node => node.port === "output") ? 1 : 0;
  chains.sort((a, b) => priority(a) - priority(b));
  const positions = new Map<string, Position>();
  let x = 0, row = CIRCUIT_INITIAL_Y;
  for (const chain of chains) {
    for (const node of chain) {
      positions.set(node.id, { x, y: row });
      x += circuitNodeSpacing(node);
    }
    if (chain.some(node => node.port === "input") && chain.some(node => node.port === "output")) {
      // A complete signal path stays on its own row; loose parts cannot sit on its wires.
      x = 0;
      row += CIRCUIT_NODE_HEIGHT + 6 * CIRCUIT_GRID;
    } else x += CIRCUIT_SPACING;
  }
  const result = nodes.map(node => {
    const position = positions.get(node.id)!;
    return node.x === position.x && node.y === position.y ? node : { ...node, ...position };
  });
  return result.every((node, i) => node === nodes[i]) ? nodes : result;
}
