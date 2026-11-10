import { describe, expect, it } from 'vitest';
import { buildWdf, createWdfProcessor } from './wdf';
import { buildWdfSignalFlow, compactAdaptor, createSignalFlowProcessor } from './wdf-signal-flow';
import { createCircuit, defaultSettings } from './project';
import { synthesize } from './synthesis';
import type { Project, Section } from './types';

const sections: Section[] = [
  { id: 'r', kind: 'R', connection: 'series', value: 25 },
  { id: 'l', kind: 'L', connection: 'series', value: .002 },
  { id: 'c', kind: 'C', connection: 'shunt', value: 1e-6 },
  { id: 'lc1', kind: 'LC', connection: 'shunt', resonator: 'series', value: .001, value2: 1e-6 },
  { id: 'lc2', kind: 'LC', connection: 'series', resonator: 'parallel', value: .002, value2: 2e-6 },
];
const project = (parts = sections): Project => ({ version: 1, name: 'Signal flow', settings: { ...defaultSettings, cutoff: 2000 },
  z2: 75, sweep: { min: 100, max: 20000, points: 501 }, ...createCircuit(parts) });

describe('scalar WDF signal-flow expansion', () => {
  it('uses one independent gamma at each adapted three-port and two at the root', () => {
    const model = buildWdf(project(), 48000, 'resonator:lc1'), graph = buildWdfSignalFlow(model);
    for (const adaptor of model.adaptors) {
      const compact = graph.adaptors.find(a => a.id === adaptor.id)!;
      expect(compact.multipliers).toHaveLength(adaptor.ports.length - (adaptor.adaptedPort === null ? 1 : 2));
      expect(compact.multipliers.map(node => node.expression)).toEqual(adaptor.adaptedPort === null ? ['−γ₁', '−γ₂'] : ['−γ₁']);
    }
    expect(graph.nodes.filter(n => n.kind === 'delay')).toHaveLength(model.elements.filter(e => e.kind === 'C' || e.kind === 'L').length);
    expect(new Set(graph.nodes.map(node => node.id)).size).toBe(graph.nodes.length);
    expect(graph.nodes.find(n => n.id === graph.outputId)).toMatchObject({ kind: 'output', coefficient: .5 });
  });

  it('reproduces every scattering column, including adapted-port zeros and physical polarities', () => {
    for (const root of buildWdf(project(), 48000).adaptors) {
      for (const adaptor of buildWdf(project(), 48000, root.id).adaptors) {
        const compact = compactAdaptor(adaptor);
        for (let column = 0; column < adaptor.ports.length; column++) {
          for (let row = 0; row < adaptor.ports.length; row++) {
            const graph = { nodes: compact.nodes.map(node => compact.inputs.includes(node.id)
              ? { ...node, kind: node.id === compact.inputs[column] ? 'input' as const : 'zero' as const } : node),
              edges: compact.edges, inputId: compact.inputs[column], outputId: compact.outputs[row], adaptors: [], links: [] };
            expect(createSignalFlowProcessor(graph).process(1)).toBeCloseTo(adaptor.matrix[row][column], 14);
          }
        }
      }
    }
  });

  it('makes every sign inversion an explicit multiplier, including the inductor delay outputs', () => {
    for (const root of buildWdf(project(), 48000).adaptors) {
      const model = buildWdf(project(), 48000, root.id), graph = buildWdfSignalFlow(model);
      expect(graph.edges.every(edge => edge.sign !== -1)).toBe(true);
      model.adaptors.forEach(adaptor => {
        const compact = graph.adaptors.find(a => a.id === adaptor.id)!;
        const polarityInversions = adaptor.kind === 'series' ? 2 * adaptor.ports.filter(p => p.sign < 0).length : 0;
        const referenceInversions = adaptor.kind === 'parallel' ? compact.multipliers.length : adaptor.adaptedPort === null ? 1 : 2;
        expect(compact.nodes.filter(n => n.kind === 'negate')).toHaveLength(polarityInversions + referenceInversions);
      });
      for (const element of model.elements.filter(e => e.kind === 'L')) {
        const delay = graph.nodes.find(n => n.ownerId === element.id && n.kind === 'delay')!;
        const negative = graph.nodes.find(n => n.ownerId === element.id && n.kind === 'negate')!;
        expect(negative.expression).toBe('−1');
        expect(graph.edges).toContainEqual({ source: delay.id, target: negative.id });
      }
    }
  });

  it.each([8000, 48000, 96000])('matches the independent tree processor sample by sample for every root at %i Hz', sampleRate => {
    const p = project();
    for (const root of buildWdf(p, sampleRate).adaptors) {
      const model = buildWdf(p, sampleRate, root.id);
      const tree = createWdfProcessor(model), graph = createSignalFlowProcessor(buildWdfSignalFlow(model));
      for (let i = 0; i < 1024; i++) {
        const input = i === 0 ? 1 : i < 256 ? 0 : .3 * Math.sin(i * .37) + .2 * Math.cos(i * .07);
        expect(graph.process(input)).toBeCloseTo(tree.process(input), 12);
      }
      graph.reset(); tree.reset();
      expect(graph.process(1)).toBeCloseTo(tree.process(1), 14);
    }
  });

  it('retains tiny but nonzero gains and voltage division for direct and resistive circuits', () => {
    for (const parts of [[], [{ id: 'r', kind: 'R', connection: 'series', value: 25 }] as Section[]]) {
      const model = buildWdf(project(parts), 48000), graph = createSignalFlowProcessor(buildWdfSignalFlow(model));
      expect(graph.process(1)).toBeCloseTo(75 / (125 + (parts.length ? 25 : 0)), 14);
      expect(graph.process(0)).toBe(0);
    }
    const model = buildWdf({ ...project([]), z2: 1e-12 }, 48000);
    const graph = buildWdfSignalFlow(model);
    expect(graph.adaptors[0].multipliers.some(node => Math.abs(node.coefficient!) < 1e-10)).toBe(true);
  });

  it('compiles high-order band ladders without algebraic loops or missing delays', () => {
    const settings = { ...defaultSettings, order: 100, response: 'bandpass' as const, cutoff: 2000, bandwidth: 1000 };
    const synthesis = synthesize(settings), p = { ...project(synthesis.sections), settings, z2: synthesis.z2 };
    const original = buildWdf(p, 48000);
    for (const rootId of [original.adaptors[0].id, original.adaptors.at(-1)!.id]) {
      const model = buildWdf(p, 48000, rootId), graph = buildWdfSignalFlow(model);
      expect(graph.nodes.filter(n => n.kind === 'delay')).toHaveLength(200);
      const scalar = createSignalFlowProcessor(graph), tree = createWdfProcessor(model);
      for (let i = 0; i < 256; i++) expect(scalar.process(i === 0 ? 1 : 0)).toBeCloseTo(tree.process(i === 0 ? 1 : 0), 12);
    }
  });

  it('detects invalid connections and delay-free cycles instead of evaluating a partial graph', () => {
    const graph = buildWdfSignalFlow(buildWdf(project(), 48000));
    expect(() => createSignalFlowProcessor({ ...graph, edges: [...graph.edges, { source: graph.outputId, target: graph.outputId }] })).toThrow('verzögerungsfreie Schleife');
    expect(() => createSignalFlowProcessor({ ...graph, edges: [...graph.edges, { source: 'missing', target: graph.outputId }] })).toThrow('Ungültige Verbindung');
  });
});
