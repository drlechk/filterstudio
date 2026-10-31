import { COMPONENT_WIDTH, SIGNAL_Y } from "./ground-geometry";
import type { CircuitNode } from "./types";

export const CIRCUIT_GRID = 12;
export const CIRCUIT_SPACING = 13 * CIRCUIT_GRID;
export const CIRCUIT_INITIAL_Y = 8 * CIRCUIT_GRID;
export const CIRCUIT_SNAP_GRID: [number, number] = [CIRCUIT_GRID, CIRCUIT_GRID];
type Position = { x: number; y: number };

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
