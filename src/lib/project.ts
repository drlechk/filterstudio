import type { CircuitNode, CircuitWire, FilterSettings, Project, Section } from './types';
import { bandEdges, isBandResponse, MIN_RELATIVE_BANDWIDTH } from './frequency';
import { parseTolerance } from './tolerance';
import { CIRCUIT_INITIAL_Y, CIRCUIT_SPACING } from './circuit-layout';

export const defaultSettings: FilterSettings = { family: 'butterworth', response: 'lowpass', order: 5, cutoff: 1e6, impedance: 50, ripple: 0.5, attenuation: 40 };
export function createCircuit(sections: Section[]): { nodes: CircuitNode[]; wires: CircuitWire[] } {
  const nodes: CircuitNode[] = [{ id: 'input', port: 'input', x: 0, y: CIRCUIT_INITIAL_Y }, ...sections.map((section, i) => ({ id: section.id, section, x: CIRCUIT_SPACING * (i + 1), y: CIRCUIT_INITIAL_Y })), { id: 'output', port: 'output', x: CIRCUIT_SPACING * (sections.length + 1), y: CIRCUIT_INITIAL_Y }];
  return { nodes, wires: nodes.slice(1).map((node, i) => ({ id: `wire-${nodes[i].id}-${node.id}`, source: nodes[i].id, target: node.id })) };
}
export function orderedSections(nodes: CircuitNode[], wires: CircuitWire[]): Section[] {
  const input = nodes.find(n => n.port === 'input');
  const output = nodes.find(n => n.port === 'output');
  if (!input || !output) throw new Error('Die Schaltung braucht einen Eingang und einen Ausgang.');
  const map = new Map(nodes.map(n => [n.id, n]));
  const outgoing = new Map<string, string>();
  const incoming = new Set<string>();
  for (const wire of wires) {
    if (!map.has(wire.source) || !map.has(wire.target)) throw new Error('Eine Verbindung endet an einem fehlenden Bauelement.');
    if (outgoing.has(wire.source) || incoming.has(wire.target)) throw new Error('Jeder Anschluss darf genau eine Verbindung haben. Parallelzweige werden als Shunt-Bauelement angelegt.');
    if (wire.source === output.id || wire.target === input.id) throw new Error('Verbindungen müssen vom Eingang zum Ausgang verlaufen.');
    outgoing.set(wire.source, wire.target); incoming.add(wire.target);
  }
  const seen = new Set<string>();
  const sections: Section[] = [];
  let current = input.id;
  while (current !== output.id) {
    if (seen.has(current)) throw new Error('Die Schaltung enthält einen geschlossenen Verbindungskreis.');
    seen.add(current);
    const next = outgoing.get(current);
    if (!next) throw new Error('Schaltung noch offen. Verbinde die Anschlüsse vom Eingang bis zum Ausgang.');
    const node = map.get(next)!;
    if (node.section) sections.push(node.section);
    current = next;
  }
  seen.add(output.id);
  if (seen.size !== nodes.length) throw new Error('Es gibt unverbundene Bauelemente. Verbinde oder entferne sie für die Auswertung.');
  return sections;
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const range = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e15;
const oneOf = <T extends string>(v: unknown, choices: readonly T[]): v is T => typeof v === 'string' && choices.includes(v as T);
const identifier = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128;
export function parseProject(raw: unknown): Project {
  if (!object(raw) || raw.version !== 1 || typeof raw.name !== 'string' || raw.name.length > 120) throw new Error('Keine gültige Filterstudio-Datei (Version 1).');
  const s = raw.settings;
  if (!object(s) || !oneOf(s.family, ['butterworth', 'chebyshev', 'cauer'] as const) || !oneOf(s.response, ['lowpass', 'highpass', 'bandpass', 'bandstop'] as const) || !range(s.order, 1, 9) || !Number.isInteger(s.order) || !range(s.cutoff, 1, 1e12) || !range(s.impedance, .01, 1e6) || !range(s.ripple, .1, 3) || !range(s.attenuation, 20, 80) || !range(raw.z2, .01, 1e9)) throw new Error('Ungültige Filterparameter in der Datei.');
  if (s.family === 'cauer' && (![3, 5, 7].includes(s.order) || (s.order === 7 && s.attenuation < 40))) throw new Error('Cauer benötigt Grad 3, 5 oder 7; bei Grad 7 mindestens 40 dB Sperrdämpfung.');
  const settings: FilterSettings = { family: s.family, response: s.response, order: s.order, cutoff: s.cutoff, impedance: s.impedance, ripple: s.ripple, attenuation: s.attenuation };
  if (s.bandwidth !== undefined) {
    if (!range(s.bandwidth, Number.MIN_VALUE, 1e12)) throw new Error('Die Bandbreite muss positiv, endlich und höchstens 1 THz sein.');
    settings.bandwidth = s.bandwidth;
  }
  if (isBandResponse(settings.response)) {
    if (settings.bandwidth === undefined || settings.bandwidth / settings.cutoff < MIN_RELATIVE_BANDWIDTH * (1 - 1e-12)) throw new Error(`Bandfilter benötigen eine Bandbreite von mindestens ${(MIN_RELATIVE_BANDWIDTH * 100).toLocaleString('de-DE')} % der Mittenfrequenz.`);
    const { lower, upper } = bandEdges(settings);
    // Roundoff in the quadratic roots must not reject a mathematically exact edge limit.
    if (!range(lower, 1 - 1e-12, 1e12) || !range(upper, 1, 1e12 * (1 + 1e-12)) || !(upper > lower)) throw new Error('Beide Bandgrenzen müssen zwischen 1 Hz und 1 THz liegen.');
  }
  if (!Array.isArray(raw.nodes) || raw.nodes.length < 2 || raw.nodes.length > 26 || !Array.isArray(raw.wires) || raw.wires.length > 26) throw new Error('Die Datei muss 2 bis 26 Schaltungsknoten enthalten.');
  const ids = new Set<string>();
  const nodes: CircuitNode[] = [];
  let inputs = 0, outputs = 0;
  for (const n of raw.nodes) {
    if (!object(n) || !identifier(n.id) || ids.has(n.id) || !range(n.x, -1e6, 1e6) || !range(n.y, -1e6, 1e6)) throw new Error('Ungültige oder doppelte Schaltungsknoten.');
    ids.add(n.id);
    if (n.port === 'input' || n.port === 'output') {
      if (n.section !== undefined) throw new Error('Ein Tor darf kein Bauelement sein.');
      if (n.port === 'input') inputs++; else outputs++;
      nodes.push({ id: n.id, x: n.x, y: n.y, port: n.port });
      continue;
    }
    if (n.port !== undefined) throw new Error('Unbekanntes Tor.');
    const e = n.section;
    if (!object(e) || e.id !== n.id || !oneOf(e.kind, ['R', 'L', 'C', 'LC'] as const) || !oneOf(e.connection, ['series', 'shunt'] as const) || !positive(e.value) || (e.label !== undefined && (typeof e.label !== 'string' || e.label.length > 40))) throw new Error('Ungültiger Bauelementwert oder Bauelementtyp.');
    const section: Section = { id: n.id, kind: e.kind, connection: e.connection, value: e.value };
    if (typeof e.label === 'string') section.label = e.label;
    if (e.kind === 'LC') {
      if (!positive(e.value2) || !oneOf(e.resonator, ['series', 'parallel'] as const)) throw new Error('Ungültiger Resonator in der Datei.');
      section.value2 = e.value2;
      section.resonator = e.resonator;
    }
    nodes.push({ id: n.id, x: n.x, y: n.y, section });
  }
  if (inputs !== 1 || outputs !== 1) throw new Error('Genau ein Eingang und ein Ausgang sind erforderlich.');
  const wireIds = new Set<string>();
  const wires: CircuitWire[] = [];
  for (const w of raw.wires) {
    if (!object(w) || !identifier(w.id) || wireIds.has(w.id) || typeof w.source !== 'string' || typeof w.target !== 'string' || !ids.has(w.source) || !ids.has(w.target) || w.source === w.target) throw new Error('Ungültige Verbindung in der Datei.');
    wireIds.add(w.id);
    wires.push({ id: w.id, source: w.source, target: w.target });
  }
  const sweep = raw.sweep;
  if (!object(sweep) || !range(sweep.min, .001, 1e15) || !range(sweep.max, .001, 1e15) || sweep.max <= sweep.min || !Number.isFinite(sweep.max / sweep.min) || !range(sweep.points, 50, 2001) || !Number.isInteger(sweep.points)) throw new Error('Ungültiger Frequenzbereich.');
  const tolerance = raw.tolerance === undefined ? undefined : parseTolerance(raw.tolerance);
  if (tolerance && tolerance.response !== settings.response) throw new Error('Ungültiges Toleranzschema in der Datei.');
  return { version: 1, name: raw.name, settings, nodes, wires, z2: raw.z2, ...(tolerance ? { tolerance } : {}), sweep: { min: sweep.min, max: sweep.max, points: sweep.points } };
}
export function downloadFile(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
