import type { WdfAdaptor } from './wdf';
import type { PortSide } from './wdf-layout';
import { compactAdaptor, type CompactAdaptor, type SignalOperation } from './wdf-signal-flow';
import { routeSignalWires, signalWireGeometry, type Direction, type Point, type Rect, type WireRequest } from './signal-routing';
import { referenceAdaptorDrawing } from './wdf-signal-template';

export type SignalSymbol = { operation: SignalOperation; position: Point; labelSide?: 'top' | 'right' | 'left' };
export type SignalTerminal = { position: Point; label: string; anchor: 'start' | 'end' };
export type SignalPort = { id: string; waveId: string; port: number; direction: 'a' | 'b'; side: PortSide; position: Point };
export type AdaptorDrawing = {
  width: number; height: number; compact: CompactAdaptor; symbols: SignalSymbol[]; ports: SignalPort[]; terminals: SignalTerminal[];
  requests: WireRequest[]; wires: ReturnType<typeof signalWireGeometry>;
};

const drawingCache = new Map<string, AdaptorDrawing>();
// Fixed dimensions keep physical ladder placement stable when the root changes.
export const COMPACT_ADAPTOR_SIZE = { width: 1040, height: 800 };
export const SIGNAL_WAVE_OFFSET = 120;
export const SIGNAL_PORT_LEAD = 80;
export const LADDER_SIGNAL_ELEMENT_SIZE = { width: 280, height: 440 };
// Keep the routing grid independent of the displayed size. Labels retain a
// readable screen size while the circuit and the space between nodes shrink.
export const SIGNAL_DRAWING_SCALE = .5;
export const SIGNAL_NODE_GAP = 40;

export function adaptorSignalLayout(adaptor: WdfAdaptor, portSides?: PortSide[]): AdaptorDrawing {
  const compact = compactAdaptor(adaptor);
  const sourcePort = portSides ? adaptor.ports.findIndex(p => p.neighborId === 'source') : -1;
  const cacheKey = JSON.stringify([adaptor.kind, adaptor.ports.map(p => p.sign), adaptor.adaptedPort, compact.referencePort, portSides, sourcePort]);
  const cached = drawingCache.get(cacheKey);
  if (cached) {
    const rename = (id: string) => { const parts = JSON.parse(id); parts[0] = adaptor.id; return JSON.stringify(parts); };
    const operations = new Map(compact.nodes.map(node => [node.id, node]));
    return { ...cached, compact, symbols: cached.symbols.map(symbol => ({ ...symbol, operation: operations.get(rename(symbol.operation.id))! })),
      ports: cached.ports.map(port => ({ ...port, waveId: rename(port.waveId) })),
      requests: cached.requests.map((request, i) => ({ ...request, id: `${adaptor.id}:${i}`, net: rename(request.net) })),
      wires: { ...cached.wires, segments: cached.wires.segments.map(segment => ({ ...segment, net: rename(segment.net) })) } };
  }
  const depth = new Map(compact.inputs.map(id => [id, 0]));
  const incoming = new Map(compact.nodes.map(node => [node.id, compact.edges.filter(e => e.target === node.id)]));
  const level = (id: string): number => {
    if (!depth.has(id)) depth.set(id, 1 + Math.max(0, ...incoming.get(id)!.map(e => level(e.source))));
    return depth.get(id)!;
  };
  const operations = compact.nodes.filter(n => n.kind !== 'wave');
  const layers: SignalOperation[][] = [];
  operations.forEach(n => { const d = level(n.id) - 1; (layers[d] ??= []).push(n); });
  const height = adaptor.ports.length <= 3 ? COMPACT_ADAPTOR_SIZE.height : Math.max(640, ...layers.map(layer => layer.length * 160 + 160));
  const width = adaptor.ports.length <= 3 ? COMPACT_ADAPTOR_SIZE.width : (layers.length + 1) * 180 + 140;
  const ports: SignalPort[] = [];
  let child = 0;
  adaptor.ports.forEach((_, i) => {
    const side = portSides?.[i] ?? (i === adaptor.adaptedPort ? 'left' : 'right');
    const aY = side === 'left' ? height / 2 - 40 : 120 + child++ * 160;
    for (const direction of ['a', 'b'] as const) {
      const first = (direction === (side === 'left' || side === 'top' ? 'a' : 'b')) !== (i === sourcePort);
      const position = portSides ? side === 'top' || side === 'bottom'
        ? { x: width / 2 + (first ? -40 : 40), y: side === 'top' ? 0 : height }
        : { x: side === 'left' ? 0 : width, y: height / 2 + (first ? -SIGNAL_WAVE_OFFSET : SIGNAL_WAVE_OFFSET) }
        : { x: side === 'left' ? 0 : width, y: aY + (direction === 'a' ? 0 : 60) };
      ports.push({ id: `${direction}-${i}`, waveId: (direction === 'a' ? compact.inputs : compact.outputs)[i], port: i, direction, side, position });
    }
  });
  if (adaptor.ports.length <= 3) {
    const drawing = referenceAdaptorDrawing(adaptor, compact, ports, width, height);
    drawingCache.set(cacheKey, drawing);
    return drawing;
  }
  const positions = new Map(ports.filter(p => p.direction === 'a').map(p => [p.waveId, p.position]));
  const symbols: SignalSymbol[] = [];
  layers.forEach((layer, col) => {
    const desired = (node: SignalOperation) => incoming.get(node.id)!.reduce((sum, e) => sum + (positions.get(e.source)?.y ?? height / 2), 0) / incoming.get(node.id)!.length;
    layer.sort((a, b) => desired(a) - desired(b));
    layer.forEach((node, row) => {
      const position = { x: 160 + col * 180, y: Math.round((height / 2 + (row - (layer.length - 1) / 2) * 180) / 20) * 20 };
      positions.set(node.id, position); symbols.push({ operation: node, position });
    });
  });
  const portByWave = new Map(ports.map(p => [p.waveId, p]));
  const obstacles: Rect[] = symbols.flatMap(({ position: p, operation: node }) => [
    { x: p.x - 20, y: p.y - 20, width: 40, height: 40 },
    ...(node.kind === 'gain' || node.kind === 'negate' ? [{ x: p.x - 90, y: p.y - 60, width: 180, height: 35 }] : []),
  ]);
  obstacles.push(...ports.map(port => port.side === 'top' || port.side === 'bottom'
    ? { x: port.position.x + (port.position.x < width / 2 ? -100 : 10), y: port.side === 'top' ? 10 : height - 40, width: 90, height: 30 }
    : { x: port.side === 'left' ? 0 : width - 80, y: port.position.y - 35, width: 80, height: 30 }));
  if (portSides) obstacles.push({ x: 0, y: 0, width: 360, height: 40 }, { x: width - 320, y: 0, width: 320, height: 40 });
  const inward: Record<PortSide, Direction> = { left: 'right', right: 'left', top: 'down', bottom: 'up' };
  const requests: WireRequest[] = compact.edges.map((edge, i) => {
    const source = portByWave.get(edge.source), target = portByWave.get(edge.target);
    const sourcePosition = source?.position ?? positions.get(edge.source)!;
    const targetPosition = target?.position ?? positions.get(edge.target)!;
    const inputIndex = incoming.get(edge.target)!.indexOf(edge);
    const targetDirection: Direction = target ? inward[target.side] : inputIndex === 0 ? 'left' : inputIndex === 1 ? 'up' : 'down';
    const offset = targetDirection === 'left' ? { x: -20, y: 0 } : targetDirection === 'up' ? { x: 0, y: -20 } : { x: 0, y: 20 };
    return { id: `${adaptor.id}:${i}`, net: edge.source, sign: edge.sign,
      start: source ? sourcePosition : { x: sourcePosition.x + 20, y: sourcePosition.y }, startDirection: source ? inward[source.side] : 'right',
      end: target ? targetPosition : { x: targetPosition.x + offset.x, y: targetPosition.y + offset.y }, endDirection: targetDirection };
  });
  const wires = signalWireGeometry(routeSignalWires(width, height, obstacles, requests, 20, portSides ? 0 : 40));
  const drawing = { width, height, compact, symbols, terminals: [], ports, requests, wires };
  drawingCache.set(cacheKey, drawing);
  return drawing;
}
