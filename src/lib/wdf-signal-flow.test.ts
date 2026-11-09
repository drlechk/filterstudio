import { describe, expect, it } from 'vitest';
import { buildWdf, createWdfProcessor } from './wdf';
import { buildWdfSignalFlow, createSignalFlowProcessor } from './wdf-signal-flow';
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
  it('keeps every nonzero scattering branch and omits only exact zero multipliers', () => {
    const model = buildWdf(project(), 48000, 'resonator:lc1'), graph = buildWdfSignalFlow(model);
    for (const adaptor of model.adaptors) {
      const branches = graph.adaptors.find(a => a.id === adaptor.id)!.branches;
      expect(branches).toHaveLength(adaptor.matrix.flat().filter(value => value !== 0).length);
      for (const branch of branches) {
        expect(branch.coefficient).toBe(adaptor.matrix[branch.output][branch.input]);
        expect(branch.expression).toContain('γ');
        expect(graph.nodes.find(node => node.id === branch.id)?.kind).toBe('gain');
      }
      if (adaptor.adaptedPort !== null) expect(branches.some(b => b.input === adaptor.adaptedPort && b.output === adaptor.adaptedPort)).toBe(false);
    }
    expect(graph.nodes.filter(n => n.kind === 'delay')).toHaveLength(model.elements.filter(e => e.kind === 'C' || e.kind === 'L').length);
    expect(new Set(graph.nodes.map(node => node.id)).size).toBe(graph.nodes.length);
    expect(graph.nodes.find(n => n.id === graph.outputId)).toMatchObject({ kind: 'output', coefficient: .5 });
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
    expect(graph.adaptors[0].branches.some(branch => Math.abs(branch.coefficient) < 1e-10)).toBe(true);
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
