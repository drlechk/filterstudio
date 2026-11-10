import type { WdfAdaptor } from './wdf';
import { portSubscript, type CompactAdaptor } from './wdf-signal-flow';
import type { AdaptorDrawing, SignalPort, SignalSymbol, SignalTerminal } from './wdf-signal-layout';
import { routeSignalWires, signalWireGeometry, type Direction, type Point, type Rect, type RoutedWire, type WireRequest } from './signal-routing';

const delta: Record<Direction, Point> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
const opposite: Record<Direction, Direction> = { left: 'right', right: 'left', up: 'down', down: 'up' };
const direction = (a: Point, b: Point): Direction => a.x === b.x ? b.y < a.y ? 'up' : 'down' : b.x < a.x ? 'left' : 'right';
type Orientation = { xx: number; xy: number; yx: number; yy: number; shiftX?: number };
const orientations: Orientation[] = [1, -1].flatMap(mirror => [
  { xx: mirror, xy: 0, yx: 0, yy: 1 }, { xx: 0, xy: -1, yx: mirror, yy: 0 },
  { xx: -mirror, xy: 0, yx: 0, yy: -1 }, { xx: 0, xy: 1, yx: -mirror, yy: 0 },
]);
// Remove empty spans between the reference's operations, preserving the
// 20-unit symbol radius and the incoming/outgoing pins around each circle.
const compactX = new Map([[220, 280], [280, 340], [300, 360], [320, 380], [380, 420], [400, 440], [420, 460],
  [480, 500], [500, 520], [520, 540], [580, 580], [600, 600], [620, 620], [680, 660], [700, 680], [720, 700],
  [780, 740], [800, 760], [820, 780], [880, 820], [900, 840], [920, 860], [980, 920]]);
const compactY = new Map([[120, 160], [200, 220], [220, 240], [240, 260], [380, 380], [400, 400], [420, 420],
  [560, 540], [580, 560], [600, 580], [640, 620], [660, 640], [680, 660], [740, 700]]);
const orientedPoint = (o: Orientation, x: number, y: number, width: number, height: number) =>
  ({ x: width / 2 + (o.shiftX ?? 0) + o.xx * (compactX.get(x)! - 600) + o.xy * (compactY.get(y)! - 400),
    y: height / 2 + o.yx * (compactX.get(x)! - 600) + o.yy * (compactY.get(y)! - 400) });
const orientedDirection = (o: Orientation, d: Direction) => direction({ x: 0, y: 0 },
  { x: o.xx * delta[d].x + o.xy * delta[d].y, y: o.yx * delta[d].x + o.yy * delta[d].y });

/** The four diagrams in Table 4 retain their central spine and side branches.
 * Rotate/mirror the structure to face the physical ports before routing leads.
 * The largest gamma is still eliminated; the labels use actual port numbers.
 */
export function referenceAdaptorDrawing(adaptor: WdfAdaptor, compact: CompactAdaptor, ports: SignalPort[], width: number, height: number): AdaptorDrawing {
  const independent = adaptor.ports.map((_, i) => i).filter(i => i !== compact.referencePort && i !== adaptor.adaptedPort);
  const orders = independent.length === 2 ? [independent, [...independent].reverse()] : [independent];
  const candidates = orders.flatMap(order => orientations.map(orientation => {
    const verticalReference = ports.find(p => p.port === compact.referencePort && (p.side === 'top' || p.side === 'bottom')
      && orientedDirection(orientation, p.direction === 'a' ? 'up' : 'down') === (p.side === 'top' ? 'up' : 'down'));
    // Align the central reference wave with its vertical physical pin instead
    // of introducing a short sideways jog just below/above the border.
    orientation = { ...orientation, shiftX: verticalReference ? verticalReference.position.x - width / 2 : 0 };
    const anchors: [number, 'a' | 'b', number, number, Direction][] = [
      [compact.referencePort, 'a', 600, 120, 'up'], [compact.referencePort, 'b', 600, 740, 'down'],
      ...order.flatMap((i, index): typeof anchors => [[i, 'a', index === 0 ? 220 : 980, 220, index === 0 ? 'left' : 'right'],
        [i, 'b', index === 0 ? 220 : 980, 580, index === 0 ? 'left' : 'right']]),
      ...(adaptor.adaptedPort === null ? [] : [[adaptor.adaptedPort, 'a', 980, 580, 'right'], [adaptor.adaptedPort, 'b', 980, 220, 'right']] as typeof anchors),
    ];
    const score = anchors.reduce((sum, [i, wave, x, y, side]) => {
      const port = ports.find(p => p.port === i && p.direction === wave)!, p = orientedPoint(orientation, x, y, width, height);
      const outward = orientedDirection(orientation, side), target = port.side === 'top' ? 'up' : port.side === 'bottom' ? 'down' : port.side;
      const aligned = p.x === port.position.x || p.y === port.position.y;
      const bends = outward === target ? aligned ? 0 : 2 : outward === opposite[target] ? 4 : 1;
      return sum + 200 * bends + Math.abs(port.position.x - p.x) + Math.abs(port.position.y - p.y);
    }, 0);
    return { orientation, independent: order, score };
  })).sort((a, b) => a.score - b.score);
  let failure: unknown;
  for (const candidate of candidates) {
    try { return drawReference(adaptor, compact, ports, width, height, candidate.orientation, candidate.independent); }
    catch (error) { if (!(error instanceof Error) || !error.message.startsWith('Cannot route signal wire')) throw error; failure = error; }
  }
  throw failure;
}

function drawReference(adaptor: WdfAdaptor, compact: CompactAdaptor, ports: SignalPort[], width: number, height: number, orientation: Orientation, independent: number[]): AdaptorDrawing {
  const symbols: SignalSymbol[] = [], terminals: SignalTerminal[] = [], requests: WireRequest[] = [], routes: RoutedWire[] = [], outer: WireRequest[] = [];
  const nodes = new Map(compact.nodes.map(node => [node.id, node]));
  const id = (name: string) => JSON.stringify([adaptor.id, name]);
  const point = (x: number, y: number): Point => orientedPoint(orientation, x, y, width, height);
  const symbol = (name: string, x: number, y: number, labelSide: 'top' | 'right' = 'top') => {
    const operation = nodes.get(id(name));
    if (!operation) throw new Error(`Missing signal operation ${name}`);
    symbols.push({ operation, position: point(x, y), labelSide: orientation.xx === 0 ? labelSide === 'top' ? 'right' : 'top' : labelSide });
    return operation.id;
  };
  const line = (net: string, coordinates: number[][]) => {
    const points = coordinates.map(([x, y]) => point(x, y));
    const request: WireRequest = { id: `${adaptor.id}:${requests.length}`, net, start: points[0], end: points.at(-1)!,
      startDirection: direction(points[0], points[1]), endDirection: direction(points.at(-1)!, points.at(-2)!) };
    requests.push(request); routes.push({ id: request.id, net, points });
  };
  const perimeter = (net: string, start: Point, end: Point, startDirection: Direction, endDirection: Direction) => {
    const request = { id: `${adaptor.id}:outer:${outer.length}`, net, start, end, startDirection, endDirection };
    outer.push(request);
  };
  const pin = (p: Point, side: Direction) => ({ x: p.x + 20 * delta[side].x, y: p.y + 20 * delta[side].y });
  const a = (i: number) => adaptor.kind === 'series' && adaptor.ports[i].sign < 0 ? id(`polarity:a:${i}`) : compact.inputs[i];
  const terminal = (i: number, wave: 'a' | 'b', source: string, x: number, y: number, outward: Direction) => {
    const position = point(x, y), port = ports.find(p => p.port === i && p.direction === wave)!;
    const negative = adaptor.kind === 'series' && adaptor.ports[i].sign < 0;
    outward = orientedDirection(orientation, outward);
    const portOutward = port.side === 'top' ? 'up' : port.side === 'bottom' ? 'down' : port.side, portInward = opposite[portOutward];
    terminals.push({ position: { x: position.x + (outward === 'left' ? 8 : outward === 'right' ? -8 : 16), y: position.y + (outward === 'up' ? 24 : -16) },
      label: `${negative ? '−' : ''}${wave}${portSubscript(i)}`, anchor: outward === 'right' ? 'end' : 'start' });
    if (negative) {
      // Keep a polarity conversion inline with the core when it already faces
      // the port. Otherwise place it on the physical lead before the turn.
      const facesPort = outward === portOutward;
      const distance = port.side === 'top' || port.side === 'bottom' ? 120 : 240;
      const p = facesPort
        ? { x: position.x + delta[outward].x * 80, y: position.y + delta[outward].y * 60 }
        : { x: port.position.x + delta[portInward].x * distance, y: port.position.y + delta[portInward].y * distance };
      const polarity = id(`polarity:${wave}:${i}`);
      symbols.push({ operation: nodes.get(polarity)!, position: p, labelSide: port.side === 'top' || port.side === 'bottom'
        ? p.x < width / 2 ? 'left' : 'right' : 'top' });
      if (wave === 'a') {
        perimeter(compact.inputs[i], port.position, pin(p, portOutward), portInward, portOutward);
        perimeter(polarity, pin(p, portInward), position, portInward, outward);
      } else {
        perimeter(source, position, pin(p, portInward), outward, portInward);
        perimeter(polarity, pin(p, portOutward), port.position, portOutward, portInward);
      }
    } else if (wave === 'a') perimeter(source, port.position, position, portInward, outward);
    else perimeter(source, position, port.position, outward, portInward);
  };
  const ref = compact.referencePort, adapted = adaptor.adaptedPort;
  terminal(ref, 'a', a(ref), 600, 120, 'up');
  independent.forEach((i, index) => terminal(i, 'a', a(i), index === 0 ? 220 : 980, 220, index === 0 ? 'left' : 'right'));
  if (adapted !== null) terminal(adapted, 'a', a(adapted), 980, 580, 'right');

  if (adaptor.kind === 'parallel') {
    independent.forEach((i, index) => {
      const left = index === 0, column = left ? 400 : 800, input = left ? 220 : 980, neg = left ? 300 : 900;
      symbol(`negative:${i}`, neg, 220);
      symbol(`difference:${i}`, column, 220);
      const gain = adapted === null ? left ? 500 : 700 : 600;
      symbol(`gamma:${i}`, gain, 400);
      symbol(`out:${i}`, column, 580);
      line(a(i), [[input, 220], [neg + (left ? -20 : 20), 220]]);
      line(id(`negative:${i}`), [[neg + (left ? 20 : -20), 220], [column + (left ? -20 : 20), 220]]);
      line(a(ref), [[600, 120], [600, 220], [column + (left ? 20 : -20), 220]]);
      line(id(`difference:${i}`), [[column, 240], [column, 400], [gain + (left ? -20 : 20), 400]]);
      line(id(`difference:${i}`), [[column, 240], [column, 560]]);
      line(id(`out:${i}`), [[column + (left ? -20 : 20), 580], [input, 580]]);
      terminal(i, 'b', id(`out:${i}`), input, 580, left ? 'left' : 'right');
    });
    if (adapted === null) {
      symbol('reference', 600, 400);
      line(a(ref), [[600, 120], [600, 380]]);
      independent.forEach((i, index) => {
        const left = index === 0;
        line(id(`gamma:${i}`), [[left ? 520 : 680, 400], [left ? 580 : 620, 400]]);
        line(id('reference'), [[600, 420], [600, 580], [left ? 420 : 780, 580]]);
      });
      line(id('reference'), [[600, 420], [600, 740]]);
    } else {
      symbol('up', 800, 220); symbol('reference', 800, 580);
      line(a(ref), [[600, 120], [600, 220], [780, 220]]);
      independent.forEach(i => {
        line(id(`gamma:${i}`), [[620, 400], [800, 400], [800, 240]]);
        line(id(`gamma:${i}`), [[620, 400], [800, 400], [800, 560]]);
        line(id('reference'), [[780, 580], [420, 580]]);
      });
      line(a(adapted), [[980, 580], [820, 580]]);
      line(id('reference'), [[780, 580], [600, 580], [600, 740]]);
      line(id('up'), [[820, 220], [980, 220]]);
      terminal(adapted, 'b', id('up'), 980, 220, 'right');
    }
    terminal(ref, 'b', id('reference'), 600, 740, 'down');
  } else {
    if (adapted === null) {
      symbol('total', 600, 220);
      line(a(ref), [[600, 120], [600, 200]]);
      independent.forEach((i, index) => {
        const left = index === 0;
        line(a(i), [[left ? 220 : 980, 220], [left ? 580 : 620, 220]]);
        line(id('total'), [[600, 240], [600, 400], [left ? 520 : 680, 400]]);
      });
      line(id('total'), [[600, 240], [600, 560]]);
    } else {
      symbol('up', 600, 220); symbol('up:negative', 900, 220); symbol('total', 800, 400);
      line(a(ref), [[600, 120], [600, 200]]);
      independent.forEach(i => line(a(i), [[220, 220], [580, 220]]));
      line(id('up'), [[620, 220], [880, 220]]);
      line(id('up'), [[620, 220], [800, 220], [800, 380]]);
      line(id('up:negative'), [[920, 220], [980, 220]]);
      terminal(adapted, 'b', id('up:negative'), 980, 220, 'right');
      line(a(adapted), [[980, 580], [800, 580], [800, 420]]);
      line(a(adapted), [[980, 580], [620, 580]]);
      if (independent.length) line(id('total'), [[780, 400], [620, 400]]);
    }
    independent.forEach((i, index) => {
      const left = index === 0, column = left ? 400 : 800, input = left ? 220 : 980;
      const gain = adapted === null ? left ? 500 : 700 : 600;
      symbol(`gamma:${i}`, gain, 400); symbol(`out:${i}`, column, 400);
      line(a(i), [[input, 220], [column, 220], [column, 380]]);
      line(id(`gamma:${i}`), [[gain + (left ? -20 : 20), 400], [column + (left ? 20 : -20), 400]]);
      line(id(`out:${i}`), [[column, 420], [column, 580], [input, 580]]);
      line(id(`out:${i}`), [[column, 420], [column, 580], [left ? 580 : 620, 580]]);
      terminal(i, 'b', id(`out:${i}`), input, 580, left ? 'left' : 'right');
    });
    symbol('reference', 600, 580); symbol('reference:negative', 600, 660, 'right');
    line(id('reference'), [[600, 600], [600, 640]]);
    line(id('reference:negative'), [[600, 680], [600, 740]]);
    terminal(ref, 'b', id('reference:negative'), 600, 740, 'down');
  }

  const corners = [point(220, 120), point(980, 740)];
  const obstacles: Rect[] = [
    // Keep perimeter leads outside the reference diagram, including its labels.
    { x: Math.min(...corners.map(p => p.x)), y: Math.min(...corners.map(p => p.y)), width: Math.abs(corners[0].x - corners[1].x), height: Math.abs(corners[0].y - corners[1].y) },
    { x: 0, y: 0, width: 360, height: 64 }, { x: width - 320, y: 0, width: 320, height: 64 },
    ...symbols.filter(s => JSON.parse(s.operation.id)[1].startsWith('polarity:')).flatMap(({ position: p, labelSide }) => [
      { x: p.x - 20, y: p.y - 20, width: 40, height: 40 },
      labelSide === 'right' ? { x: p.x + 28, y: p.y - 16, width: 50, height: 32 }
        : labelSide === 'left' ? { x: p.x - 78, y: p.y - 16, width: 50, height: 32 } : { x: p.x - 30, y: p.y - 60, width: 60, height: 30 },
    ]),
    ...ports.map(port => port.side === 'top' || port.side === 'bottom'
      ? { x: port.position.x + (port.position.x < width / 2 ? -100 : 10), y: port.side === 'top' ? 10 : height - 40, width: 90, height: 30 }
      : { x: port.side === 'left' ? 0 : width - 80, y: port.position.y - 35, width: 80, height: 30 }),
  ];
  const wires = signalWireGeometry([...routes, ...routeSignalWires(width, height, obstacles, outer, 20, 0,
    { boundaryLead: 160, bendPenalty: 12, trackSpacing: 60 })]);
  return { width, height, compact, symbols, terminals, ports, requests: [...requests, ...outer], wires };
}
