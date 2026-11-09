import { describe, expect, it } from 'vitest';
import { buildWdf, createWdfProcessor, exportWdf } from './wdf';
import { createCircuit, defaultSettings, parseProject } from './project';
import { evaluateNetwork } from './network';
import { synthesize } from './synthesis';
import type { Project, Section } from './types';

const project = (sections: Section[], z1 = 50, z2 = 75): Project => ({ version: 1, name: 'WDF', settings: { ...defaultSettings, cutoff: 2000, impedance: z1 },
  ...createCircuit(sections), z2, sweep: { min: 100, max: 20000, points: 501 } });
const mixed: Section[] = [
  { id: 'r', kind: 'R', connection: 'series', value: 25 },
  { id: 'l', kind: 'L', connection: 'series', value: .002 },
  { id: 'c', kind: 'C', connection: 'shunt', value: 1e-6 },
  { id: 'lc1', kind: 'LC', connection: 'shunt', resonator: 'series', value: .001, value2: 1e-6 },
  { id: 'lc2', kind: 'LC', connection: 'series', resonator: 'parallel', value: .002, value2: 2e-6 },
];
const fs = 48000;

describe('wave digital circuit generation', () => {
  it('maps R, L, C and both LC resonator types with resistive source and load', () => {
    const model = buildWdf(project(mixed), fs);
    expect(model.adaptors).toHaveLength(7);
    expect(model.elements).toHaveLength(9);
    expect(model.elements.find(n => n.id === 'element:l')!.resistance).toBe(192);
    expect(model.elements.find(n => n.id === 'element:c')!.resistance).toBeCloseTo(1 / .096);
    expect(model.elements.find(n => n.id === 'source')!.resistance).toBe(50);
    expect(model.elements.find(n => n.id === 'load')!.resistance).toBe(75);
    expect(model.adaptors.find(n => n.id === 'resonator:lc1')!.kind).toBe('series');
    expect(model.adaptors.find(n => n.id === 'resonator:lc2')!.kind).toBe('parallel');
  });

  it('recomputes matching port resistances and lossless scattering for EVERY root', () => {
    const p = project(mixed);
    for (const candidate of buildWdf(p, fs).adaptors) {
      const model = buildWdf(p, fs, candidate.id);
      const nodes = new Map([...model.adaptors, ...model.elements].map(n => [n.id, n]));
      expect(model.adaptors.filter(a => a.adaptedPort === null).map(a => a.id)).toEqual([candidate.id]);
      for (const a of model.adaptors) {
        expect(a.ports.reduce((sum, p) => sum + p.coefficient, 0)).toBeCloseTo(2, 13);
        if (a.adaptedPort !== null) {
          expect(a.matrix[a.adaptedPort][a.adaptedPort]).toBe(0);
          const children = a.ports.filter((_, i) => i !== a.adaptedPort).map(p => p.resistance);
          const expected = a.kind === 'series' ? children.reduce((x, y) => x + y) : 1 / children.reduce((sum, r) => sum + 1 / r, 0);
          expect(a.ports[a.adaptedPort].resistance).toBeCloseTo(expected, 12);
        }
        for (const port of a.ports) {
          const neighbor = nodes.get(port.neighborId)!;
          const neighborR = neighbor.type === 'element' ? neighbor.resistance : neighbor.ports.find(p => p.neighborId === a.id)!.resistance;
          expect(port.resistance).toBe(neighborR);
        }
        // Energy conservation for voltage waves: Sᵀ diag(1/R) S = diag(1/R).
        for (let i = 0; i < a.ports.length; i++) for (let j = 0; j < a.ports.length; j++) {
          const energy = a.ports.reduce((sum, p, k) => sum + a.matrix[k][i] * a.matrix[k][j] / p.resistance, 0);
          expect(energy).toBeCloseTo(i === j ? 1 / a.ports[i].resistance : 0, 12);
        }
      }
    }
  });

  it('changes reactive port resistances with sample rate and preserves physical values', () => {
    const p = project(mixed), before = structuredClone(p);
    const a = buildWdf(p, fs), b = buildWdf(p, 2 * fs);
    a.elements.forEach((e, i) => expect(b.elements[i].resistance).toBeCloseTo(e.resistance * (e.kind === 'L' ? 2 : e.kind === 'C' ? .5 : 1), 12));
    expect(b.adaptors[0].matrix).not.toEqual(a.adaptors[0].matrix);
    expect(p).toEqual(before);
  });

  it('uses actual connectivity and handles direct connections, open circuits and stale roots', () => {
    const p = project(mixed);
    expect(buildWdf({ ...p, nodes: [...p.nodes].reverse(), wires: [...p.wires].reverse() }, fs)).toEqual(buildWdf(p, fs));
    expect(() => buildWdf({ ...p, wires: [] }, fs)).toThrow('offen');
    const fallback = buildWdf(p, fs, 'missing');
    expect(fallback.rootChanged).toBe(true);
    expect(fallback.rootId).toBe('adaptor:r');
    const direct = buildWdf(project([]), fs);
    expect(direct.adaptors).toHaveLength(1);
    expect(createWdfProcessor(direct).process(1)).toBeCloseTo(75 / 125, 14);
  });

  it('rejects invalid sample rates and nonfinite adapted resistances', () => {
    for (const invalid of [0, -1, Infinity, NaN, 1e16]) expect(() => buildWdf(project(mixed), invalid)).toThrow('Abtastrate');
    expect(() => buildWdf(project([{ ...mixed[1], value: 1e308 }]), fs)).toThrow('Torwiderstände');
  });

  it('supports high-order and Cauer band ladders without missing resonators or nonfinite coefficients', () => {
    for (const settings of [
      { ...defaultSettings, cutoff: 2000, order: 100, response: 'bandpass' as const, bandwidth: 1000 },
      { ...defaultSettings, cutoff: 2000, family: 'cauer' as const, order: 19, response: 'bandstop' as const, bandwidth: 1000, attenuation: 60 },
    ]) {
      const result = synthesize(settings);
      const p = { ...project(result.sections), settings, z2: result.z2 };
      const model = buildWdf(p, fs);
      // The Cauer band realization expands to 28 LC sections (56 states).
      expect(model.elements.filter(e => e.kind === 'L' || e.kind === 'C')).toHaveLength(settings.family === 'cauer' ? 56 : 200);
      for (const root of [model.adaptors[0].id, model.adaptors.at(-1)!.id]) {
        const rerooted = buildWdf(p, fs, root);
        expect(rerooted.adaptors.every(a => a.matrix.flat().every(Number.isFinite))).toBe(true);
        const processor = createWdfProcessor(rerooted);
        for (let i = 0; i < 512; i++) expect(Number.isFinite(processor.process(i === 0 ? 1 : 0))).toBe(true);
      }
    }
  });
});

describe('executable WDF', () => {
  it('preserves the complete impulse response for every root, including LC-internal roots', () => {
    const p = project(mixed);
    const impulse = (root?: string) => {
      const processor = createWdfProcessor(buildWdf(p, fs, root));
      return Array.from({ length: 2048 }, (_, i) => processor.process(i === 0 ? 1 : 0));
    };
    const expected = impulse();
    expect(Math.max(...expected.map(Math.abs))).toBeGreaterThan(.001);
    for (const a of buildWdf(p, fs).adaptors) impulse(a.id).forEach((v, i) => expect(v).toBeCloseTo(expected[i], 12));
  });

  it.each(['lowpass', 'highpass', 'bandpass', 'bandstop'] as const)('matches the bilinearly transformed analog %s magnitude AND phase', response => {
    const settings = { ...defaultSettings, cutoff: 2000, bandwidth: 1500, order: 5, response };
    const sections = synthesize(settings).sections;
    // Unequal terminations catch incorrect power-wave vs voltage-wave scaling.
    const p = project(sections, 50, 75);
    const model = buildWdf(p, fs);
    const processor = createWdfProcessor(buildWdf(p, fs, model.adaptors.at(-1)!.id));
    const impulse = Array.from({ length: 8192 }, (_, i) => processor.process(i === 0 ? 1 : 0));
    for (const f of [200, 1000, 2000, 5000, 16000, 22000]) {
      const omega = 2 * Math.PI * f / fs;
      const measured = impulse.reduce((sum, value, n) => ({ re: sum.re + value * Math.cos(omega * n), im: sum.im - value * Math.sin(omega * n) }), { re: 0, im: 0 });
      const analogFrequency = fs / Math.PI * Math.tan(Math.PI * f / fs);
      const s21 = evaluateNetwork(sections, analogFrequency, 50, 75).s21;
      const scale = Math.sqrt(75 / 50) / 2;
      expect(measured.re).toBeCloseTo(s21.re * scale, 9);
      expect(measured.im).toBeCloseTo(s21.im * scale, 9);
    }
    processor.reset();
    expect(processor.process(1)).toBe(impulse[0]);
  });

  it('matches the analog response of mixed lossy branches and resonators', () => {
    const processor = createWdfProcessor(buildWdf(project(mixed), fs, 'resonator:lc1'));
    const impulse = Array.from({ length: 8192 }, (_, i) => processor.process(i === 0 ? 1 : 0));
    for (const f of [100, 400, 1500, 3000, 12000]) {
      const w = 2 * Math.PI * f / fs;
      const re = impulse.reduce((sum, v, n) => sum + v * Math.cos(w * n), 0);
      const im = impulse.reduce((sum, v, n) => sum - v * Math.sin(w * n), 0);
      const expected = evaluateNetwork(mixed, fs / Math.PI * Math.tan(w / 2), 50, 75).s21;
      expect(re).toBeCloseTo(expected.re * Math.sqrt(1.5) / 2, 10);
      expect(im).toBeCloseTo(expected.im * Math.sqrt(1.5) / 2, 10);
    }
  });
});

describe('WDF persistence', () => {
  it('round-trips sample rate and root through the project format and exports a runnable model', () => {
    const p = { ...project(mixed), wdf: { sampleRate: 96000, rootId: 'resonator:lc2' } };
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
    const model = buildWdf(p, p.wdf.sampleRate, p.wdf.rootId);
    const exported = JSON.parse(exportWdf(model));
    expect(exported.rootId).toBe('resonator:lc2');
    expect(exported.sampleRate).toBe(96000);
    expect(exported.adaptors).toEqual(model.adaptors);
    expect(createWdfProcessor(exported).process(1)).toBe(createWdfProcessor(model).process(1));
  });
  it('validates imported WDF settings without breaking older analog files', () => {
    expect(parseProject(project(mixed)).wdf).toBeUndefined();
    for (const wdf of [null, {}, { sampleRate: '48000' }, { sampleRate: 0 }, { sampleRate: Infinity }, { sampleRate: fs, rootId: 1 }]) {
      expect(() => parseProject({ ...project(mixed), wdf })).toThrow('WDF');
    }
  });
});
