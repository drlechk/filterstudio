/** Orthogonal signal nets: distinct nets never share a segment. Crossings are
 * bridged; only branches of the SAME source net receive a junction dot. */
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Direction = 'left' | 'right' | 'up' | 'down';
export type WireRequest = { id: string; net: string; start: Point; end: Point; startDirection: Direction; endDirection: Direction; sign?: number };
export type RoutedWire = { id: string; net: string; points: Point[] };
export type WireSegment = { net: string; start: Point; end: Point; bridges: Point[]; gaps: Point[] };
const delta: Record<Direction, Point> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
const key = (p: Point) => `${p.x},${p.y}`;
const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;

class Heap {
  private items: { state: number; score: number }[] = [];
  push(item: { state: number; score: number }) {
    const a = this.items; let i = a.length; a.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].score <= item.score) break; a[i] = a[p]; i = p; }
    a[i] = item;
  }
  pop() {
    const a = this.items, result = a[0], last = a.pop();
    if (a.length && last) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1].score < a[c].score) c++;
        if (a[c].score >= last.score) break; a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return result;
  }
  get length() { return this.items.length; }
}

export function routeSignalWires(width: number, height: number, obstacles: Rect[], requests: WireRequest[], step = 20, topPadding = 40): RoutedWire[] {
  const columns = Math.round(width / step) + 1, rows = Math.round(height / step) + 1, size = columns * rows;
  const cell = (p: Point) => Math.round(p.y / step) * columns + Math.round(p.x / step);
  const point = (id: number) => ({ x: id % columns * step, y: Math.floor(id / columns) * step });
  const blocked = new Uint8Array(size);
  for (let id = 0; id < size; id++) {
    const p = point(id);
    if (obstacles.some(r => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height)) blocked[id] = 1;
  }
  const pins = new Map<number, Set<string>>();
  requests.forEach(r => [[r.start, r.startDirection], [r.end, r.endDirection]].forEach(([pointValue, directionValue]) => {
    const p = pointValue as Point, d = delta[directionValue as Direction];
    for (const q of [p, { x: p.x + step * d.x, y: p.y + step * d.y }]) {
      const id = cell(q); if (!pins.has(id)) pins.set(id, new Set()); pins.get(id)!.add(r.net);
    }
  }));
  const usedEdges = new Map<string, string>(), usedCells = new Map<number, Map<string, number>>();
  const moves = [{ dx: -1, dy: 0, bit: 1, opposite: 2, axis: 1 }, { dx: 1, dy: 0, bit: 2, opposite: 1, axis: 1 },
    { dx: 0, dy: -1, bit: 4, opposite: 8, axis: 2 }, { dx: 0, dy: 1, bit: 8, opposite: 4, axis: 2 }];
  const addMask = (id: number, net: string, bit: number) => {
    if (!usedCells.has(id)) usedCells.set(id, new Map());
    const nets = usedCells.get(id)!; nets.set(net, (nets.get(net) ?? 0) | bit);
  };
  const canCross = (id: number, net: string, axis: number) => [...(usedCells.get(id) ?? [])].every(([other, mask]) => other === net || mask === (axis === 1 ? 12 : 3));
  const routes: RoutedWire[] = [];
  for (const request of requests) {
    const start = cell(request.start), end = cell(request.end), sd = delta[request.startDirection], ed = delta[request.endDirection];
    const startLead = start + sd.x + sd.y * columns, endLead = end + ed.x + ed.y * columns;
    const initialAxis = sd.x ? 1 : 2, endAxis = ed.x ? 1 : 2;
    const distance = new Float64Array(size * 3).fill(Infinity), previous = new Int32Array(size * 3).fill(-1), queue = new Heap();
    const initial = startLead * 3 + initialAxis; distance[initial] = 0; queue.push({ state: initial, score: 0 });
    let found = -1;
    while (queue.length) {
      const { state } = queue.pop()!, id = Math.floor(state / 3), axis = state % 3;
      if (id === endLead && canCross(id, request.net, endAxis) && (axis === endAxis || ![...(usedCells.get(id)?.keys() ?? [])].some(n => n !== request.net))) { found = state; break; }
      const x = id % columns, y = Math.floor(id / columns);
      for (const move of moves) {
        const nx = x + move.dx, ny = y + move.dy;
        if (nx <= 0 || nx >= columns - 1 || ny * step <= topPadding || ny >= rows - 1) continue;
        const next = ny * columns + nx;
        if ((blocked[next] && next !== endLead && next !== startLead) || ([...pins.get(next) ?? []].some(net => net !== request.net))) continue;
        const used = usedEdges.get(edgeKey(id, next));
        if (used && used !== request.net) continue;
        if (!canCross(id, request.net, move.axis) || !canCross(next, request.net, move.axis)) continue;
        const crossing = [...(usedCells.get(id)?.keys() ?? [])].some(n => n !== request.net);
        if (crossing && axis !== move.axis) continue;
        const nextState = next * 3 + move.axis;
        const cost = distance[state] + (used === request.net ? .25 : 1) + (axis !== move.axis ? .8 : 0) + (crossing ? 4 : 0);
        if (cost >= distance[nextState]) continue;
        distance[nextState] = cost; previous[nextState] = state;
        const endPoint = point(endLead), heuristic = (Math.abs(nx * step - endPoint.x) + Math.abs(ny * step - endPoint.y)) / step * .25;
        queue.push({ state: nextState, score: cost + heuristic });
      }
    }
    if (found < 0) throw new Error(`Cannot route signal wire ${request.id}`);
    const ids = [end];
    for (let state = found; state !== -1; state = previous[state]) ids.push(Math.floor(state / 3));
    ids.push(start); ids.reverse();
    for (let i = 1; i < ids.length; i++) {
      const a = ids[i - 1], b = ids[i], pa = point(a), pb = point(b);
      const move = moves.find(m => m.dx === (pb.x - pa.x) / step && m.dy === (pb.y - pa.y) / step)!;
      const existing = usedEdges.get(edgeKey(a, b));
      if (existing && existing !== request.net) throw new Error(`Overlapping signal nets at ${request.id}`);
      usedEdges.set(edgeKey(a, b), request.net); addMask(a, request.net, move.bit); addMask(b, request.net, move.opposite);
    }
    routes.push({ id: request.id, net: request.net, points: ids.map(point) });
  }
  return routes;
}

export function signalWireGeometry(routes: RoutedWire[]): { segments: WireSegment[]; junctions: Point[] } {
  const groups = new Map<string, { net: string; horizontal: boolean; fixed: number; intervals: [number, number][] }>();
  for (const route of routes) for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], horizontal = a.y === b.y;
    if (a.x !== b.x && a.y !== b.y) throw new Error('Signal routes must be orthogonal');
    if (a.x === b.x && a.y === b.y) continue;
    const fixed = horizontal ? a.y : a.x, id = JSON.stringify([route.net, horizontal, fixed]);
    if (!groups.has(id)) groups.set(id, { net: route.net, horizontal, fixed, intervals: [] });
    groups.get(id)!.intervals.push([Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y), Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y)]);
  }
  const segments: WireSegment[] = [];
  for (const group of groups.values()) {
    const merged: [number, number][] = [];
    for (const interval of group.intervals.sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]); else merged.push([...interval]);
    }
    merged.forEach(([a, b]) => segments.push({ net: group.net, start: group.horizontal ? { x: a, y: group.fixed } : { x: group.fixed, y: a },
      end: group.horizontal ? { x: b, y: group.fixed } : { x: group.fixed, y: b }, bridges: [], gaps: [] }));
  }
  const junctions = new Map<string, Point>();
  for (const h of segments.filter(s => s.start.y === s.end.y)) for (const v of segments.filter(s => s.start.x === s.end.x)) {
    const p = { x: v.start.x, y: h.start.y };
    if (p.x < h.start.x || p.x > h.end.x || p.y < v.start.y || p.y > v.end.y) continue;
    const innerH = p.x > h.start.x && p.x < h.end.x, innerV = p.y > v.start.y && p.y < v.end.y;
    if (h.net === v.net) { if (innerH || innerV) junctions.set(key(p), p); }
    else if (innerH && innerV) { h.bridges.push(p); v.gaps.push(p); }
  }
  return { segments, junctions: [...junctions.values()] };
}

export function bridgedPath(segment: WireSegment, radius = 6): string {
  let path = `M${segment.start.x} ${segment.start.y}`;
  for (const p of [...segment.bridges].sort((a, b) => a.x - b.x)) path += `H${p.x - radius}a${radius} ${radius} 0 0 1 ${radius * 2} 0`;
  for (const p of [...segment.gaps].sort((a, b) => a.y - b.y)) path += `V${p.y - radius - 2}M${p.x} ${p.y + radius + 2}`;
  return path + `L${segment.end.x} ${segment.end.y}`;
}
