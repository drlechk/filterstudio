import { describe, it, expect } from 'vitest';
import { createCircuit, orderedSections, parseProject, defaultSettings } from './project';
import type { FilterFamily, FilterResponse, Project, Section } from './types';
import { synthesize } from './synthesis';
import { MIN_RELATIVE_BANDWIDTH } from './frequency';
const sections: Section[] = [{id:'L1',kind:'L',connection:'series',value:1e-6},{id:'C1',kind:'C',connection:'shunt',value:1e-9}];
const project: Project = {version:1,name:'Versuch',settings:defaultSettings,...createCircuit(sections),z2:50,sweep:{min:1e5,max:1e7,points:501}};
describe('project and topology', () => {
  it('round-trips a saved project including component values and layout',()=>expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project));
  it('uses connections rather than screen positions or array order',()=>expect(orderedSections([...project.nodes].reverse(), [...project.wires].reverse())).toEqual(sections));
  it('rejects an open circuit',()=>expect(()=>orderedSections(project.nodes,project.wires.slice(1))).toThrow('offen'));
  it('rejects ambiguous branching',()=>expect(()=>orderedSections(project.nodes,[...project.wires,{id:'x',source:'input',target:'output'}])).toThrow('genau eine'));
  it('rejects unattached elements',()=>expect(()=>orderedSections([...project.nodes,{id:'orphan',x:0,y:0,section:{...sections[0],id:'orphan'}}],project.wires)).toThrow('unverbundene'));
  it('rejects unsafe numerical values and unsupported versions',()=>{expect(()=>parseProject({...project,z2:-1})).toThrow();expect(()=>parseProject({...project,version:2})).toThrow();expect(()=>parseProject({...project,sweep:{min:0,max:10,points:1e9}})).toThrow();});
});

describe('JSON import boundary', () => {
  it('rejects coercible arrays in enum fields', () => {
    expect(() => parseProject({ ...project, settings: { ...project.settings, family: ['butterworth'] } })).toThrow();
    expect(() => parseProject({ ...project, settings: { ...project.settings, response: ['lowpass'] } })).toThrow();
    const nodes = structuredClone(project.nodes);
    expect(() => parseProject({ ...project, nodes: nodes.map(n => n.section ? { ...n, section: { ...n.section, kind: ['L'] } } : n) })).toThrow();
    expect(() => parseProject({ ...project, nodes: nodes.map(n => n.section ? { ...n, section: { ...n.section, connection: ['series'] } } : n) })).toThrow();
  });
  it('rejects numeric endpoints even when their string representation names a node', () => {
    const nodes = project.nodes.map(n => n.id === 'input' ? { ...n, id: '1' } : n);
    const wires = project.wires.map(w => w.source === 'input' ? { ...w, source: 1 } : w);
    expect(() => parseProject({ ...project, nodes, wires })).toThrow('Verbindung');
  });
  it('rejects sweep ranges that overflow logarithmic interpolation or exceed UI bounds', () => {
    for (const sweep of [{ min: 1e-300, max: 1e300, points: 50 }, { min: .0001, max: 100, points: 50 }, { min: 1, max: 1e16, points: 50 }]) {
      expect(() => parseProject({ ...project, sweep })).toThrow('Frequenzbereich');
    }
  });
  it('rejects unsupported Cauer settings and accepts supported boundary settings', () => {
    for (const patch of [{ order: 2 }, { order: 20 }, { order: 7, attenuation: 30 }, { order: 19, attenuation: 39 }, { ripple: .01 }, { ripple: 99 }, { attenuation: .01 }, { attenuation: 81 }]) {
      expect(() => parseProject({ ...project, settings: { ...project.settings, family: 'cauer', ...patch } })).toThrow();
    }
    expect(parseProject({ ...project, settings: { ...project.settings, family: 'cauer', order: 7, ripple: .1, attenuation: 40 } }).settings.order).toBe(7);
  });
  it('round-trips the highest orders for every family and response, including large Cauer band circuits', () => {
    for (const family of ['butterworth', 'chebyshev', 'cauer'] as const) for (const response of ['lowpass', 'highpass', 'bandpass', 'bandstop'] as const) {
      const settings = { ...defaultSettings, family, response, order: family === 'cauer' ? 19 : 100, bandwidth: .5e6 };
      const result = synthesize(settings);
      const generated = { ...project, settings, ...createCircuit(result.sections), z2: result.z2 };
      const reopened = parseProject(JSON.parse(JSON.stringify(generated)));
      expect(reopened).toEqual(generated);
      expect(orderedSections(reopened.nodes, reopened.wires)).toEqual(result.sections);
      if (family === 'cauer' && response.startsWith('band')) expect(reopened.nodes).toHaveLength(30);
    }
    expect(() => parseProject({ ...project, settings: { ...defaultSettings, order: 101 } })).toThrow();
    expect(() => parseProject({ ...project, nodes: Array.from({ length: 203 }, (_, i) => ({ id: `node-${i}`, x: i, y: 0 })) })).toThrow('202');
  });
  it('rejects physical parameters outside the supported input ranges', () => {
    for (const patch of [{ cutoff: .1 }, { cutoff: 1e13 }, { impedance: .001 }, { impedance: 1e7 }]) {
      expect(() => parseProject({ ...project, settings: { ...project.settings, ...patch } })).toThrow();
    }
    expect(() => parseProject({ ...project, z2: 1e10 })).toThrow();
    const nodes = project.nodes.map(n => n.section ? { ...n, section: { ...n.section, value: 1e16 } } : n);
    expect(() => parseProject({ ...project, nodes })).toThrow('Bauelement');
  });
  it('rebuilds known fields and drops unknown properties at every level', () => {
    const imported = parseProject({ ...project, extra: 'discard', settings: { ...project.settings, unknown: 1 }, sweep: { ...project.sweep, unknown: 1 }, nodes: project.nodes.map(n => ({ ...n, selected: true, ...(n.section ? { section: { ...n.section, unknown: 1 } } : {}) })), wires: project.wires.map(w => ({ ...w, animated: true })) });
    expect(imported).toEqual(project);
    expect(imported.nodes).not.toBe(project.nodes);
    expect(imported.settings).not.toBe(project.settings);
  });
  it('allows an incomplete but otherwise valid project to be saved and reopened', () => {
    expect(parseProject({ ...project, wires: [] }).wires).toEqual([]);
  });
});


it('round-trips an even Chebyshev at the maximum input impedance and ripple', () => {
  const settings = { ...defaultSettings, family: 'chebyshev' as const, order: 8, impedance: 1e6, ripple: 3 };
  const result = synthesize(settings);
  const generated: Project = { ...project, settings, ...createCircuit(result.sections), z2: result.z2 };
  expect(result.z2).toBeGreaterThan(1e6);
  expect(parseProject(JSON.parse(JSON.stringify(generated)))).toEqual(generated);
});


describe('band-filter project format', () => {
  it.each(['bandpass', 'bandstop'] as const)('round-trips generated %s structures for every family', response => {
    for (const family of ['butterworth', 'chebyshev', 'cauer'] as FilterFamily[]) {
      const settings = { ...defaultSettings, family, response, order: family === 'chebyshev' ? 4 : 3, cutoff: 1e6, bandwidth: .5e6 };
      const result = synthesize(settings);
      const generated: Project = { ...project, name: `${family} ${response}`, settings, ...createCircuit(result.sections), z2: result.z2 };
      const reopened = parseProject(JSON.parse(JSON.stringify(generated)));
      expect(reopened).toEqual(generated);
      expect(orderedSections(reopened.nodes, reopened.wires)).toEqual(result.sections);
      expect(reopened.settings.bandwidth).toBe(.5e6);
    }
  });
  it('keeps legacy low/high-pass files without a bandwidth and preserves optional bandwidth', () => {
    for (const response of ['lowpass', 'highpass'] as FilterResponse[]) {
      const legacy = { ...project, settings: { ...project.settings, response } };
      expect(parseProject(legacy)).toEqual(legacy);
      const remembered = { ...legacy, settings: { ...legacy.settings, bandwidth: .5e6 } };
      expect(parseProject(remembered)).toEqual(remembered);
    }
  });
  it('rejects missing, non-numeric, nonfinite and nonpositive bandwidths', () => {
    for (const bandwidth of [undefined, null, '500000', [500000], 0, -1, Number.NaN, Infinity, 1e13]) {
      expect(() => parseProject({ ...project, settings: { ...defaultSettings, response: 'bandpass', bandwidth } })).toThrow();
    }
  });
  it('enforces the minimum relative bandwidth for both band responses', () => {
    for (const response of ['bandpass', 'bandstop'] as const) {
      const minimum = defaultSettings.cutoff * MIN_RELATIVE_BANDWIDTH;
      expect(() => parseProject({ ...project, settings: { ...defaultSettings, response, bandwidth: minimum * .99999 } })).toThrow('%');
      expect(parseProject({ ...project, settings: { ...defaultSettings, response, bandwidth: minimum } }).settings.bandwidth).toBe(minimum);
      const roundoff = minimum * (1 - 5e-13);
      expect(parseProject({ ...project, settings: { ...defaultSettings, response, bandwidth: roundoff } }).settings.bandwidth).toBe(roundoff);
    }
  });
  it('rejects band edges outside the supported frequency range', () => {
    for (const patch of [{ cutoff: 1, bandwidth: .5 }, { cutoff: 1e12, bandwidth: 5e10 }, { cutoff: 10, bandwidth: 1000 }]) {
      expect(() => parseProject({ ...project, settings: { ...defaultSettings, response: 'bandstop', ...patch } })).toThrow('Bandgrenzen');
    }
    // These settings encode lower=1 Hz, upper=2 Hz without additional edge fields.
    expect(parseProject({ ...project, settings: { ...defaultSettings, response: 'bandpass', cutoff: Math.sqrt(2), bandwidth: 1 } }).settings.cutoff).toBe(Math.sqrt(2));
  });
  it('drops redundant edge fields instead of trusting inconsistent imported limits', () => {
    const reopened = parseProject({ ...project, settings: { ...defaultSettings, response: 'bandpass', bandwidth: .5e6, lowerEdge: 1, upperEdge: 2 } });
    expect(reopened.settings).toEqual({ ...defaultSettings, response: 'bandpass', bandwidth: .5e6 });
  });
});
