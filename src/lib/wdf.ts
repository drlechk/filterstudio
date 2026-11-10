import { bandEdges, isBandResponse } from './frequency';
import { orderedSections } from './project';
import type { FilterSettings, Project, Section } from './types';

export const MAX_WDF_SAMPLE_RATE = 1e15;
export type WdfSettings = { sampleRate: number; rootId?: string };
export type WdfPort = {
  neighborId: string;
  resistance: number;
  /** Adaptor coefficient gamma_i for both series and parallel adaptors. */
  coefficient: number;
  /** Series voltage orientation: sum(sign_i * v_i) = 0. */
  sign: number;
  reflection: number;
};
export type WdfAdaptor = {
  type: 'adaptor'; id: string; label: string; kind: 'series' | 'parallel';
  sectionId?: string; parentId: string | null; adaptedPort: number | null;
  ports: WdfPort[]; matrix: number[][];
};
export type WdfElement = {
  type: 'element'; id: string; label: string; kind: 'R' | 'L' | 'C' | 'source';
  value: number; resistance: number; parentId: string; sectionId?: string;
};
export type WdfModel = {
  sampleRate: number; rootId: string; rootChanged: boolean;
  adaptors: WdfAdaptor[]; elements: WdfElement[];
};

type RawAdaptor = {
  type: 'adaptor'; id: string; kind: WdfAdaptor['kind'];
  sectionId?: string; neighbors: string[];
};
type RawElement = Omit<WdfElement, 'parentId'>;

export function defaultWdfSampleRate(settings: FilterSettings): number {
  const upper = isBandResponse(settings.response) ? bandEdges(settings).upper : settings.cutoff;
  return Math.min(MAX_WDF_SAMPLE_RATE, Math.max(48000, 20 * upper));
}

function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('WDF: Bauteilwerte und Torwiderstände müssen positiv und endlich sein.');
  return value;
}

/** Voltage waves a = v + Ri, b = v - Ri; trapezoidal (bilinear) discretization.
 * Sources: J. O. Smith, Physical Audio Signal Processing, Appendix F;
 * Werner, Smith & Abel, DAFx-15, Tables 2–3.
 * The signs on series ports belong to the physical circuit, NOT to its root.
 * Keeping these signs when rerooting is essential to preserve source polarity.
 */
export function buildWdf(project: Pick<Project, 'nodes' | 'wires' | 'settings' | 'z2'>, sampleRate: number, requestedRoot?: string): WdfModel {
  if (!Number.isFinite(sampleRate) || sampleRate < 1 || sampleRate > MAX_WDF_SAMPLE_RATE) throw new Error('WDF: Die Abtastrate muss zwischen 1 Hz und 1 PHz liegen.');
  const sections = orderedSections(project.nodes, project.wires);
  const raw = new Map<string, RawAdaptor | RawElement>();
  const addElement = (id: string, label: string, kind: WdfElement['kind'], value: number, sectionId?: string) => {
    positive(value);
    const resistance = positive(kind === 'C' ? 1 / (2 * sampleRate * value) : kind === 'L' ? 2 * sampleRate * value : value);
    raw.set(id, { type: 'element', id, label, kind, value, resistance, sectionId });
    return id;
  };
  const connectParent = (id: string, parent: string) => {
    const node = raw.get(id)!;
    if (node.type === 'adaptor') node.neighbors[0] = parent;
  };
  const addAdaptor = (id: string, kind: WdfAdaptor['kind'], children: string[], sectionId?: string) => {
    raw.set(id, { type: 'adaptor', id, kind, neighbors: ['', ...children], sectionId });
    children.forEach(child => connectParent(child, id));
    return id;
  };
  const component = (section: Section, index: number): string => {
    const label = section.label || `${section.kind}${index + 1}`;
    if (section.kind !== 'LC') return addElement(`element:${section.id}`, label, section.kind, section.value, section.id);
    if (section.resonator !== 'series' && section.resonator !== 'parallel') throw new Error('WDF: Der LC-Resonatortyp fehlt.');
    const l = addElement(`inductor:${section.id}`, `${label} · L`, 'L', section.value, section.id);
    const c = addElement(`capacitor:${section.id}`, `${label} · C`, 'C', section.value2!, section.id);
    return addAdaptor(`resonator:${section.id}`, section.resonator, [l, c], section.id);
  };
  const source = addElement('source', 'Vₛ / R₁', 'source', project.settings.impedance);
  let tail = addElement('load', 'R₂ / Vout', 'R', project.z2);
  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i];
    tail = addAdaptor(`adaptor:${section.id}`, section.connection === 'series' ? 'series' : 'parallel', [component(section, i), tail], section.id);
  }
  if (sections.length) connectParent(tail, source);
  else {
    // A directly connected, resistively terminated two-port still has a WDF.
    tail = 'termination';
    raw.set(tail, { type: 'adaptor', id: tail, kind: 'parallel', neighbors: [source, 'load'] });
  }
  // Number each adaptor type along the physical ladder, including resonators.
  // IDs and numbering are independent of the chosen scattering root.
  const adaptorIds = sections.length ? sections.flatMap(section => [`adaptor:${section.id}`, ...(section.kind === 'LC' ? [`resonator:${section.id}`] : [])]) : ['termination'];
  const adaptorOrder = new Map(adaptorIds.map((id, index) => [id, index]));
  const counts = { series: 0, parallel: 0 };
  const labels = new Map(adaptorIds.map(id => {
    const { kind } = raw.get(id) as RawAdaptor;
    return [id, `${kind === 'series' ? 'S' : 'P'}${++counts[kind]}`];
  }));
  const rootId = requestedRoot && raw.get(requestedRoot)?.type === 'adaptor' ? requestedRoot : tail;
  const resistances = new Map<string, number>();
  const parents = new Map<string, string | null>();
  function upwards(id: string, parent: string | null): number {
    const node = raw.get(id)!;
    parents.set(id, parent);
    if (node.type === 'element') { resistances.set(id, node.resistance); return node.resistance; }
    const children = node.neighbors.filter(neighbor => neighbor !== parent).map(child => upwards(child, id));
    // Scaling the parallel calculation avoids overflowing individual conductances.
    const minimum = Math.min(...children);
    const resistance = positive(node.kind === 'series' ? children.reduce((a, b) => a + b, 0) : minimum / children.reduce((sum, r) => sum + minimum / r, 0));
    resistances.set(id, resistance);
    return resistance;
  }
  upwards(rootId, null);
  const adaptors: WdfAdaptor[] = [], elements: WdfElement[] = [];
  for (const node of raw.values()) {
    const parentId = parents.get(node.id)!;
    if (node.type === 'element') { elements.push({ ...node, parentId: parentId! }); continue; }
    const adaptedPort = parentId === null ? null : node.neighbors.indexOf(parentId);
    const portR = node.neighbors.map((neighbor, i) => i === adaptedPort ? resistances.get(node.id)! : resistances.get(neighbor)!);
    const scale = node.kind === 'series' ? Math.max(...portR) : Math.min(...portR);
    const weights = portR.map(r => node.kind === 'series' ? r / scale : scale / r);
    const total = weights.reduce((a, b) => a + b, 0);
    const ports = node.neighbors.map((neighborId, i): WdfPort => {
      // Exact 1 at the adapted port prevents roundoff creating an algebraic loop.
      const coefficient = i === adaptedPort ? 1 : 2 * weights[i] / total;
      return { neighborId, resistance: portR[i], coefficient, sign: node.kind === 'series' && i === 0 ? -1 : 1,
        reflection: node.kind === 'series' ? 1 - coefficient : coefficient - 1 };
    });
    const matrix = ports.map((pi, i) => ports.map((pj, j) => node.kind === 'series'
      ? (i === j ? 1 : 0) - pi.coefficient * pi.sign * pj.sign
      : pj.coefficient - (i === j ? 1 : 0)));
    adaptors.push({ type: 'adaptor', id: node.id, label: labels.get(node.id)!, kind: node.kind, sectionId: node.sectionId, parentId, adaptedPort, ports, matrix });
  }
  // Display ordering follows the analog ladder; stable IDs survive value edits.
  adaptors.sort((a, b) => adaptorOrder.get(a.id)! - adaptorOrder.get(b.id)!);
  return { sampleRate, rootId, rootChanged: !!requestedRoot && requestedRoot !== rootId, adaptors, elements };
}

/** Two tree passes per sample, with no delay-free loop. Input: source voltage;
 * output: voltage across the physical load R₂ (not power-normalized S₂₁).
 */
export function createWdfProcessor(model: WdfModel): { process: (input: number) => number; reset: () => void } {
  const nodes = new Map<string, WdfAdaptor | WdfElement>([...model.adaptors, ...model.elements].map(n => [n.id, n]));
  type Step = { node: WdfAdaptor | WdfElement; children: (Step | null)[]; a: number[]; state: number };
  function compile(id: string): Step {
    const node = nodes.get(id)!;
    return { node, state: 0, a: node.type === 'adaptor' ? node.ports.map(() => 0) : [], children: node.type === 'adaptor'
      ? node.ports.map((p, i) => i === node.adaptedPort ? null : compile(p.neighborId)) : [] };
  }
  const root = compile(model.rootId);
  const dot = (row: number[], a: number[]) => row.reduce((sum, coefficient, j) => sum + coefficient * a[j], 0);
  function up(step: Step, input: number): number {
    const node = step.node;
    if (node.type === 'element') return node.kind === 'source' ? input : node.kind === 'C' ? step.state : node.kind === 'L' ? -step.state : 0;
    step.children.forEach((child, i) => { step.a[i] = child ? up(child, input) : 0; });
    return node.adaptedPort === null ? 0 : dot(node.matrix[node.adaptedPort], step.a);
  }
  function down(step: Step, incident: number): number {
    const node = step.node;
    if (node.type === 'element') { step.state = incident; return node.id === 'load' ? incident / 2 : 0; }
    if (node.adaptedPort !== null) step.a[node.adaptedPort] = incident;
    return step.children.reduce((output, child, i) => output + (child ? down(child, dot(node.matrix[i], step.a)) : 0), 0);
  }
  function reset(step: Step) { step.state = 0; step.children.forEach(child => { if (child) reset(child); }); }
  return { process(input) { up(root, input); return down(root, 0); }, reset: () => reset(root) };
}

export function exportWdf(model: WdfModel): string {
  return JSON.stringify({ format: 'filterstudio-wdf', version: 1, waveConvention: 'a = v + R*i; b = v - R*i',
    coefficientConvention: 'coefficient = gamma_i; series: 2*R_i/sum(R_k); parallel: (2/R_i)/sum(1/R_k); adapted port: gamma_p = 1',
    input: 'source voltage Vs', output: 'load voltage (a_load + b_load)/2',
    elementReflections: { R: '0', source: 'Vs', C: 'z^-1', L: '-z^-1' },
    algorithm: 'upward pass to root; root scattering; downward pass; update element delays',
    portIndexBase: 0, ...model }, null, 2);
}
