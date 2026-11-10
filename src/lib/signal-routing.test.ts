import { describe, expect, it } from 'vitest';
import { bridgedPath, signalWireGeometry, type WireSegment } from './signal-routing';
import { adaptorSignalLayout } from './wdf-signal-layout';
import type { AdaptorDrawing } from './wdf-signal-layout';
import { buildWdf, type WdfAdaptor } from './wdf';
import { createCircuit, defaultSettings } from './project';
import { signalGraphLayout } from '../components/WdfSignalGraph';
import { synthesize } from './synthesis';
import type { PortSide } from './wdf-layout';

function separated(segments: WireSegment[]) {
  for (let i = 0; i < segments.length; i++) for (const b of segments.slice(i + 1)) {
    const a = segments[i]; if (a.net === b.net) continue;
    const horizontalA = a.start.y === a.end.y, horizontalB = b.start.y === b.end.y;
    if (horizontalA === horizontalB) {
      const fixed = horizontalA ? 'y' : 'x', along = horizontalA ? 'x' : 'y';
      if (a.start[fixed] === b.start[fixed]) expect(Math.min(a.end[along], b.end[along]) - Math.max(a.start[along], b.start[along]), `${a.net} overlaps ${b.net}`).toBeLessThanOrEqual(0);
    } else {
      const h = horizontalA ? a : b, v = horizontalA ? b : a, p = { x: v.start.x, y: h.start.y };
      if (p.x < h.start.x || p.x > h.end.x || p.y < v.start.y || p.y > v.end.y) continue;
      expect(h.bridges, `unmarked crossing ${h.net} / ${v.net}`).toContainEqual(p);
      expect(v.gaps).toContainEqual(p);
    }
  }
}

// Check the drawing against the executable graph, including the peripheral
// polarity conversions. This catches a missing/incorrect template connection
// even if its remaining wires are routed cleanly.
function matchesOperations(drawing: AdaptorDrawing) {
  expect(drawing.symbols.map(s => s.operation.id).sort()).toEqual(drawing.compact.nodes.filter(n => n.kind !== 'wave').map(n => n.id).sort());
  for (const symbol of drawing.symbols) {
    const { x, y } = symbol.position;
    const incoming = drawing.requests.filter(r => Math.abs(r.end.x - x) + Math.abs(r.end.y - y) === 20).map(r => r.net);
    const expected = drawing.compact.edges.filter(e => e.target === symbol.operation.id).map(e => e.source);
    expect(incoming.sort(), symbol.operation.id).toEqual(expected.sort());
  }
  for (const port of drawing.ports.filter(p => p.direction === 'b')) {
    expect(drawing.requests.filter(r => r.end.x === port.position.x && r.end.y === port.position.y).map(r => r.net))
      .toEqual(drawing.compact.edges.filter(e => e.target === port.waveId).map(e => e.source));
  }
}

describe('signal net routing', () => {
  it('bridges unrelated crossings, merges shared segments and dots only real branches', () => {
    const geometry = signalWireGeometry([
      { id: 'a1', net: 'a', points: [{ x: 0, y: 40 }, { x: 100, y: 40 }] },
      { id: 'a2', net: 'a', points: [{ x: 0, y: 40 }, { x: 20, y: 40 }, { x: 20, y: 80 }] },
      { id: 'b', net: 'b', points: [{ x: 60, y: 0 }, { x: 60, y: 80 }] },
    ]);
    expect(geometry.junctions).toEqual([{ x: 20, y: 40 }]);
    expect(geometry.segments).toHaveLength(3);
    expect(geometry.segments.flatMap(s => s.bridges)).toEqual([{ x: 60, y: 40 }]);
    expect(bridgedPath(geometry.segments[0])).toContain('a6 6');
    separated(geometry.segments);
  });

  const project = { settings: defaultSettings, z2: 75, ...createCircuit([
    { id: 'l', kind: 'L', connection: 'series', value: .002 },
    { id: 'c', kind: 'C', connection: 'shunt', value: 1e-6 },
    { id: 'lc1', kind: 'LC', connection: 'shunt', resonator: 'series', value: .001, value2: 1e-6 },
    { id: 'lc2', kind: 'LC', connection: 'series', resonator: 'parallel', value: .002, value2: 2e-6 },
  ]) };
  it('separates all internal and external nets across every root and both resonator kinds', () => {
    for (const root of buildWdf(project, 48000).adaptors) {
      const model = buildWdf(project, 48000, root.id);
      for (const adaptor of model.adaptors) {
        const drawing = adaptorSignalLayout(adaptor);
        separated(drawing.wires.segments);
        expect(drawing.symbols.filter(s => s.operation.kind === 'gain')).toHaveLength(adaptor.adaptedPort === null ? 2 : 1);
        expect(drawing.ports.filter(p => p.side === 'left')).toHaveLength(adaptor.adaptedPort === null ? 0 : 2);
      }
      for (const mode of ['ladder', 'tree'] as const) {
        const layout = signalGraphLayout(model, mode);
        separated(layout.edges.flatMap(e => e.data!.segments));
        layout.nodes.forEach(node => { if (node.data.drawing) separated(node.data.drawing.wires.segments); });
      }
    }
  });

  it('routes every gamma elimination and adapted-port permutation without stale cached labels', () => {
    for (const kind of ['series', 'parallel'] as const) for (const adaptedPort of [null, 0, 1, 2]) {
      for (const reference of [0, 1, 2].filter(i => i !== adaptedPort)) {
        for (const weight of [3, 9]) {
          const coefficients = [0, 1, 2].map(i => i === reference ? weight : 1);
          const total = coefficients.reduce((sum, value, i) => sum + (i === adaptedPort ? 0 : value), 0);
          const adaptor: WdfAdaptor = { id: `${kind}:${adaptedPort}:${reference}:${weight}`, label: 'Test', type: 'adaptor', kind, adaptedPort,
            parentId: adaptedPort === null ? null : 'parent', matrix: [], ports: coefficients.map((value, i) => ({ neighborId: String(i), resistance: 1,
              coefficient: i === adaptedPort ? 1 : value / total * (adaptedPort === null ? 2 : 1), reflection: 0, sign: kind === 'series' && i === 0 ? -1 : 1 })) };
          const orientations: (PortSide[] | undefined)[] = [undefined, ['left', 'top', 'right'], ['bottom', 'left', 'right']];
          for (const portSides of orientations) {
            const drawing = adaptorSignalLayout(adaptor, portSides);
            separated(drawing.wires.segments);
            matchesOperations(drawing);
            expect(drawing.compact.referencePort).toBe(reference);
            for (const symbol of drawing.symbols) {
              expect(symbol.operation.ownerId).toBe(adaptor.id);
              if (symbol.operation.kind === 'gain') expect(symbol.operation.coefficient).toBeCloseTo(-(adaptedPort === null ? 2 : 1) / total, 14);
            }
          }
        }
      }
    }
  });

  it('supports the direct two-port termination and extreme gamma ratios', () => {
    for (const z2 of [1e-12, 50, 1e12]) {
      const p = { settings: defaultSettings, z2, ...createCircuit([]) };
      const model = buildWdf(p, 48000), drawing = adaptorSignalLayout(model.adaptors[0]);
      separated(drawing.wires.segments);
      matchesOperations(drawing);
      expect(drawing.symbols.filter(s => s.operation.kind === 'gain')).toHaveLength(1);
      separated(signalGraphLayout(model).edges.flatMap(e => e.data!.segments));
    }
  });

  it('routes high-order band ladders without sharing unrelated wire tracks', () => {
    const settings = { ...defaultSettings, order: 30, response: 'bandpass' as const, cutoff: 2000, bandwidth: 1000 };
    const result = synthesize(settings), p = { settings, z2: result.z2, ...createCircuit(result.sections) };
    const model = buildWdf(p, 48000);
    separated(signalGraphLayout(model).edges.flatMap(e => e.data!.segments));
  });
});
