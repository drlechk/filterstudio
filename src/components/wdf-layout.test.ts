import { describe, expect, it } from 'vitest';
import { wdfDiagram } from './WdfView';
import { signalGraphLayout } from './WdfSignalGraph';
import { buildWdf } from '../lib/wdf';
import { createCircuit, defaultSettings, orderedSections } from '../lib/project';
import { synthesize } from '../lib/synthesis';
import type { Section } from '../lib/types';

const sections: Section[] = [
  { id: 'z', kind: 'L', connection: 'series', value: .002 },
  { id: 'a', kind: 'C', connection: 'shunt', value: 1e-6 },
  { id: 'res1', kind: 'LC', connection: 'shunt', resonator: 'series', value: .001, value2: 1e-6 },
  { id: 'res2', kind: 'LC', connection: 'series', resonator: 'parallel', value: .002, value2: 2e-6 },
  { id: 'r', kind: 'R', connection: 'shunt', value: 30 },
];
const project = (parts = sections) => ({ settings: defaultSettings, z2: 75, ...createCircuit(parts) });
type Box = { id: string; position: { x: number; y: number }; width?: number; height?: number };
const center = (node: Box) => ({ x: node.position.x + node.width! / 2, y: node.position.y + node.height! / 2 });
function checkPlacement(nodes: Box[], parts: Section[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const main = ['source', ...parts.map(s => `adaptor:${s.id}`), 'load'].map(id => byId.get(id)!);
  expect(main.every(node => center(node).y === 0)).toBe(true);
  for (let i = 1; i < main.length; i++) expect(main[i].position.x).toBeGreaterThan(main[i - 1].position.x + main[i - 1].width!);
  for (const section of parts) {
    const adaptor = byId.get(`adaptor:${section.id}`)!;
    const branch = byId.get(`${section.kind === 'LC' ? 'resonator' : 'element'}:${section.id}`)!;
    expect(center(branch).x).toBe(center(adaptor).x);
    expect(branch.position.y + branch.height!).toBeLessThan(adaptor.position.y);
    if (section.kind === 'LC') {
      const l = byId.get(`inductor:${section.id}`)!, c = byId.get(`capacitor:${section.id}`)!;
      expect(center(l).y).toBe(center(branch).y);
      expect(center(c).y).toBe(center(branch).y);
      expect(l.position.x + l.width!).toBeLessThan(branch.position.x);
      expect(c.position.x).toBeGreaterThan(branch.position.x + branch.width!);
    }
  }
  for (let i = 0; i < nodes.length; i++) for (const b of nodes.slice(i + 1)) {
    const a = nodes[i];
    expect(a.position.x + a.width! <= b.position.x || b.position.x + b.width! <= a.position.x
      || a.position.y + a.height! <= b.position.y || b.position.y + b.height! <= a.position.y, `overlap: ${a.id} / ${b.id}`).toBe(true);
  }
}

describe('physical WDF ladder layout', () => {
  it('keeps the displayed signal adaptors compact and close together with aligned wave leads', () => {
    const graph = signalGraphLayout(buildWdf(project(sections.slice(0, 2)), 48000));
    const main = ['source', 'adaptor:z', 'adaptor:a', 'load'].map(id => graph.nodes.find(n => n.id === id)!);
    for (const node of main.filter(n => n.data.adaptor)) {
      expect(node.width).toBeLessThanOrEqual(520);
      expect(node.height).toBeLessThanOrEqual(400);
    }
    for (const node of graph.nodes.filter(n => n.data.element)) expect(node.height).toBeLessThanOrEqual(220);
    for (let i = 1; i < main.length; i++) {
      const gap = main[i].position.x - main[i - 1].position.x - main[i - 1].width!;
      expect(gap).toBeGreaterThanOrEqual(20);
      expect(gap).toBeLessThanOrEqual(40);
    }
    for (const edge of graph.edges) {
      const points = edge.data!.points;
      expect(points).toHaveLength(2);
      expect(points[0].x === points[1].x || points[0].y === points[1].y).toBe(true);
    }
  });

  it('swaps the source wave lanes together with the first adaptor, retaining the load orientation', () => {
    const graph = signalGraphLayout(buildWdf(project(sections.slice(0, 2)), 48000));
    const first = graph.nodes.find(n => n.id === 'adaptor:z')!.data.drawing!;
    const a = first.ports.find(p => p.id === 'a-0')!, b = first.ports.find(p => p.id === 'b-0')!;
    expect(a.position.y).toBeGreaterThan(b.position.y);
    for (const port of [a, b]) {
      const request = first.requests.find(r => port.direction === 'a'
        ? r.start.x === port.position.x && r.start.y === port.position.y
        : r.end.x === port.position.x && r.end.y === port.position.y)!;
      expect(request.start.y).toBe(request.end.y);
    }
    const sourceIncident = graph.edges.find(e => e.target === 'source' && e.targetHandle === 'a')!.data!.points;
    const sourceReflected = graph.edges.find(e => e.source === 'source' && e.sourceHandle === 'b')!.data!.points;
    expect(sourceIncident[0].y).toBeLessThan(sourceReflected[0].y);
    expect(sourceIncident[0].y).toBe(sourceIncident[1].y);
    expect(sourceReflected[0].y).toBe(sourceReflected[1].y);
    const loadIncident = graph.edges.find(e => e.target === 'load' && e.targetHandle === 'a')!.data!.points;
    const loadReflected = graph.edges.find(e => e.source === 'load' && e.sourceHandle === 'b')!.data!.points;
    expect(loadIncident[0].y).toBeLessThan(loadReflected[0].y);
  });

  it('preserves all positions, port sides and external wires through every root change', () => {
    const p = project(), initial = buildWdf(p, 48000);
    const original = wdfDiagram(initial, initial.rootId), signal = signalGraphLayout(initial);
    const geometry = (nodes: Box[]) => nodes.map(({ id, position, width, height }) => ({ id, position, width, height }));
    checkPlacement(original.nodes, sections);
    checkPlacement(signal.nodes, sections);
    for (const root of initial.adaptors) {
      const model = buildWdf(p, 48000, root.id), diagram = wdfDiagram(model, root.id), graph = signalGraphLayout(model);
      expect(geometry(diagram.nodes)).toEqual(geometry(original.nodes));
      expect(geometry(graph.nodes)).toEqual(geometry(signal.nodes));
      expect(diagram.nodes.map(n => n.data.portSides)).toEqual(original.nodes.map(n => n.data.portSides));
      expect(graph.nodes.map(n => n.data.drawing?.ports)).toEqual(signal.nodes.map(n => n.data.drawing?.ports));
      expect(graph.edges.map(e => e.data!.points)).toEqual(signal.edges.map(e => e.data!.points));
      expect(diagram.nodes.filter(n => n.data.root).map(n => n.id)).toEqual([root.id]);
      expect(graph.nodes.filter(n => n.data.root).map(n => n.id)).toEqual([root.id]);
      for (const node of diagram.nodes.filter(n => n.data.item.type === 'adaptor')) {
        expect(node.data.portSides).toEqual(node.id.startsWith('resonator:') ? ['bottom', 'left', 'right'] : ['left', 'top', 'right']);
      }
      expect(diagram.edges).toHaveLength(diagram.nodes.length - 1);
      expect(graph.edges).toHaveLength(2 * (diagram.nodes.length - 1) + 1);
    }
  });

  it('follows electrical order even when the stored node order and canvas positions change', () => {
    const p = project();
    const reordered = { ...p, nodes: [...p.nodes].reverse().map((node, i) => ({ ...node, position: { x: 1000 - i * 10, y: i * 30 } })) };
    const model = buildWdf(reordered, 48000, 'resonator:res2');
    checkPlacement(wdfDiagram(model, model.rootId).nodes, orderedSections(reordered.nodes, reordered.wires));
    checkPlacement(signalGraphLayout(model).nodes, sections);
  });

  it.each(['lowpass', 'highpass', 'bandpass', 'bandstop'] as const)('keeps Cauer %s resonators above the analog ladder without collisions', response => {
    const settings = { ...defaultSettings, family: 'cauer' as const, order: 7, attenuation: 60, response, bandwidth: .5e6 };
    const result = synthesize(settings), p = { ...project(result.sections), settings, z2: result.z2 };
    const model = buildWdf(p, 48000), root = model.adaptors.find(a => a.id.startsWith('resonator:'))!.id;
    const rerooted = buildWdf(p, 48000, root);
    for (const m of [model, rerooted]) {
      checkPlacement(wdfDiagram(m, root).nodes, result.sections);
      checkPlacement(signalGraphLayout(m).nodes, result.sections);
    }
  });

  it('supports direct source/load connections and retains the root-dependent tree option', () => {
    const direct = buildWdf(project([]), 48000);
    expect(wdfDiagram(direct, direct.rootId).nodes.find(n => n.id === 'termination')!.data.portSides).toEqual(['left', 'right']);
    expect(signalGraphLayout(direct).nodes).toHaveLength(4);
    const p = project(), model = buildWdf(p, 48000, 'resonator:res1');
    for (const nodes of [wdfDiagram(model, model.rootId, 'tree').nodes, signalGraphLayout(model, 'tree').nodes]) {
      expect(nodes.find(n => n.id === model.rootId)!.position.x).toBe(0);
      expect(nodes.filter(n => n.id !== model.rootId).every(n => n.position.x > 0)).toBe(true);
    }
  });
});
