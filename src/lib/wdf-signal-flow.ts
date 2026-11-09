import type { WdfAdaptor, WdfModel } from './wdf';

export type SignalOperation = {
  id: string; ownerId: string;
  kind: 'input' | 'zero' | 'wave' | 'sum' | 'gain' | 'negate' | 'delay' | 'output';
  coefficient?: number; expression?: string;
};
export type SignalConnection = { source: string; target: string; sign?: 1 | -1 };
export type CompactAdaptor = {
  id: string; nodes: SignalOperation[]; edges: SignalConnection[];
  inputs: string[]; outputs: string[]; referencePort: number;
  multipliers: SignalOperation[];
};
export type WaveLink = {
  id: string; source: string; target: string; sourceHandle: string; targetHandle: string;
  label: string;
};
export type WdfSignalFlow = {
  nodes: SignalOperation[]; edges: SignalConnection[];
  adaptors: CompactAdaptor[];
  links: WaveLink[]; inputId: string; outputId: string;
};

const wave = (owner: string, direction: 'a' | 'b', port?: number) => JSON.stringify([owner, direction, port ?? null]);
const operation = (owner: string, kind: string) => JSON.stringify([owner, kind]);
export const portSubscript = (port: number) => String(port + 1).replace(/\d/g, digit => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)]);

/** Table 4 (pp. 9–10), Lech Kolonko, Einführung in Wellendigitalfilter,
 * WS 2025/26: shared sums/differences, n−1 gamma multipliers at a general
 * adaptor, n−2 at an adapted adaptor. For three ports these are two and one.
 * Series waves retain the physical port orientations of buildWdf; sign changes
 * are explicit negations, not additional gamma multiplications.
 */
export function compactAdaptor(adaptor: WdfAdaptor): CompactAdaptor {
  const ownerId = adaptor.id, nodes: SignalOperation[] = [], edges: SignalConnection[] = [];
  const add = (id: string, kind: SignalOperation['kind'], extra: Partial<SignalOperation> = {}) => {
    nodes.push({ id, ownerId, kind, ...extra }); return id;
  };
  const connect = (source: string, target: string, sign: 1 | -1 = 1) => edges.push({ source, target, sign });
  type Term = string | [string, 1 | -1];
  const sum = (name: string, terms: Term[]) => {
    // No more than three distinct summing inputs in the drawing.
    while (terms.length > 3) terms = [sum(`${name}:partial`, terms.slice(0, 3)), ...terms.slice(3)];
    const id = add(operation(ownerId, name), 'sum');
    terms.forEach(term => typeof term === 'string' ? connect(term, id) : connect(term[0], id, term[1]));
    return id;
  };
  const negate = (name: string, source: string) => {
    const id = add(operation(ownerId, name), 'negate', { expression: '−1' }); connect(source, id); return id;
  };
  const multiply = (port: number, source: string) => {
    const id = add(operation(ownerId, `gamma:${port}`), 'gain', {
      coefficient: -adaptor.ports[port].coefficient, expression: `−γ${portSubscript(port)}`,
    });
    connect(source, id); return id;
  };
  const inputs = adaptor.ports.map((_, port) => add(wave(ownerId, 'a', port), 'wave'));
  const outputs = adaptor.ports.map((_, port) => add(wave(ownerId, 'b', port), 'wave'));
  const adapted = adaptor.adaptedPort;
  const free = adaptor.ports.map((_, i) => i).filter(i => i !== adapted);
  // Eliminate the largest coefficient, retaining tiny independent coefficients
  // explicitly rather than recovering them by a cancellation such as 1−gamma.
  const referencePort = free.reduce((best, i) => adaptor.ports[i].coefficient > adaptor.ports[best].coefficient ? i : best);
  const independent = free.filter(i => i !== referencePort);
  const a = inputs.map((id, i) => adaptor.kind === 'series' && adaptor.ports[i].sign < 0 ? negate(`polarity:a:${i}`, id) : id);
  const b: string[] = [];
  if (adaptor.kind === 'parallel') {
    const differences = independent.map(i => sum(`difference:${i}`, [a[referencePort], [a[i], -1]]));
    const gains = independent.map((i, j) => multiply(i, differences[j]));
    if (adapted === null) {
      // d_i = a_r − a_i; b_r = a_r − sum(gamma_i d_i).
      b[referencePort] = sum('reference', [a[referencePort], ...gains]);
      independent.forEach((i, j) => { b[i] = sum(`out:${i}`, [differences[j], b[referencePort]]); });
    } else {
      // The upward result has no dependency on the incident adapted-port wave.
      b[adapted] = sum('up', [a[referencePort], ...gains]);
      b[referencePort] = sum('reference', [a[adapted], ...gains]);
      independent.forEach((i, j) => { b[i] = sum(`out:${i}`, [differences[j], b[referencePort]]); });
    }
  } else {
    if (adapted === null) {
      const total = sum('total', a);
      independent.forEach(i => { b[i] = sum(`out:${i}`, [a[i], multiply(i, total)]); });
      // gamma_r = 2 − sum(gamma_i): b_r = −total − sum(b_i).
      b[referencePort] = sum('reference', [[total, -1], ...independent.map(i => [b[i], -1] as Term)]);
    } else {
      const upward = sum('up', free.map(i => a[i]));
      b[adapted] = negate('up:negative', upward);
      const total = sum('total', [upward, a[adapted]]);
      independent.forEach(i => { b[i] = sum(`out:${i}`, [a[i], multiply(i, total)]); });
      // gamma_r = 1 − sum(gamma_i): b_r = −a_p − sum(b_i).
      b[referencePort] = sum('reference', [[a[adapted], -1], ...independent.map(i => [b[i], -1] as Term)]);
    }
  }
  b.forEach((source, i) => connect(adaptor.kind === 'series' && adaptor.ports[i].sign < 0 ? negate(`polarity:b:${i}`, source) : source, outputs[i]));
  return { id: ownerId, nodes, edges, inputs, outputs, referencePort, multipliers: nodes.filter(node => node.kind === 'gain') };
}

/** The displayed compact operations are also the executable signal graph. */
export function buildWdfSignalFlow(model: WdfModel): WdfSignalFlow {
  const nodes: SignalOperation[] = [], edges: SignalConnection[] = [], links: WaveLink[] = [];
  const adaptors = model.adaptors.map(compactAdaptor);
  adaptors.forEach(adaptor => { nodes.push(...adaptor.nodes); edges.push(...adaptor.edges); });
  const byId = new Map(model.adaptors.map(a => [a.id, a]));
  const elements = new Map(model.elements.map(e => [e.id, e]));
  const add = (node: SignalOperation) => { nodes.push(node); return node.id; };
  const connect = (source: string, target: string) => edges.push({ source, target });
  const link = (source: string, target: string, sourceHandle: string, targetHandle: string, label: string) =>
    links.push({ id: JSON.stringify([source, target, sourceHandle, targetHandle]), source, target, sourceHandle, targetHandle, label });
  for (const element of model.elements) {
    const ownerId = element.id;
    add({ id: wave(ownerId, 'a'), ownerId, kind: 'wave' });
    const reflected = wave(ownerId, 'b');
    if (element.kind === 'C') {
      add({ id: reflected, ownerId, kind: 'delay' }); connect(wave(ownerId, 'a'), reflected);
    } else if (element.kind === 'L') {
      const delay = add({ id: operation(ownerId, 'delay'), ownerId, kind: 'delay' });
      add({ id: reflected, ownerId, kind: 'negate', expression: '−1' });
      connect(wave(ownerId, 'a'), delay); connect(delay, reflected);
    } else add({ id: reflected, ownerId, kind: element.kind === 'source' ? 'input' : 'zero' });
  }
  for (const adaptor of model.adaptors) adaptor.ports.forEach((port, i) => {
    const neighbor = byId.get(port.neighborId);
    if (neighbor) {
      const j = neighbor.ports.findIndex(p => p.neighborId === adaptor.id);
      if (j < 0) throw new Error('WDF: Ungültige Verbindung im Signalflussgraphen.');
      connect(wave(adaptor.id, 'b', i), wave(neighbor.id, 'a', j));
      link(adaptor.id, neighbor.id, `b-${i}`, `a-${j}`, `b${portSubscript(i)} → a${portSubscript(j)}`);
    } else {
      if (!elements.has(port.neighborId)) throw new Error('WDF: Ungültige Verbindung im Signalflussgraphen.');
      connect(wave(adaptor.id, 'b', i), wave(port.neighborId, 'a'));
      connect(wave(port.neighborId, 'b'), wave(adaptor.id, 'a', i));
      link(adaptor.id, port.neighborId, `b-${i}`, 'a', `b${portSubscript(i)} → a`);
      link(port.neighborId, adaptor.id, 'b', `a-${i}`, `b → a${portSubscript(i)}`);
    }
  });
  const outputId = add({ id: operation('load', 'voltage'), ownerId: 'voltage-output', kind: 'output', coefficient: .5, expression: '½' });
  connect(wave('load', 'a'), outputId);
  link('load', 'voltage-output', 'voltage', 'a', 'aR₂');
  return { nodes, edges, adaptors, links, inputId: wave('source', 'b'), outputId };
}

/** Read old delay states, evaluate the instantaneous DAG, then latch all delays. */
export function createSignalFlowProcessor(graph: WdfSignalFlow) {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const incoming = graph.nodes.map(() => [] as { source: number; sign: number }[]), outgoing = graph.nodes.map(() => [] as number[]);
  const indegree = graph.nodes.map(() => 0);
  for (const edge of graph.edges) {
    const source = index.get(edge.source), target = index.get(edge.target);
    if (source === undefined || target === undefined) throw new Error('WDF: Ungültige Verbindung im Signalflussgraphen.');
    incoming[target].push({ source, sign: edge.sign ?? 1 });
    if (graph.nodes[target].kind !== 'delay') { outgoing[source].push(target); indegree[target]++; }
  }
  const order = indegree.flatMap((count, i) => count === 0 ? [i] : []);
  for (let cursor = 0; cursor < order.length; cursor++) {
    for (const target of outgoing[order[cursor]]) if (--indegree[target] === 0) order.push(target);
  }
  if (order.length !== graph.nodes.length) throw new Error('WDF: Der Signalflussgraph enthält eine verzögerungsfreie Schleife.');
  const output = index.get(graph.outputId);
  if (output === undefined) throw new Error('WDF: Ungültige Verbindung im Signalflussgraphen.');
  const values = new Float64Array(graph.nodes.length), states = new Float64Array(graph.nodes.length);
  const delays = graph.nodes.flatMap((node, i) => node.kind === 'delay' ? [i] : []);
  return {
    process(input: number) {
      for (const i of order) {
        const node = graph.nodes[i];
        const sum = () => incoming[i].reduce((total, edge) => total + edge.sign * values[edge.source], 0);
        values[i] = node.kind === 'input' ? input : node.kind === 'zero' ? 0 : node.kind === 'delay' ? states[i]
          : node.kind === 'negate' ? -sum() : node.kind === 'gain' || node.kind === 'output' ? sum() * node.coefficient! : sum();
      }
      for (const i of delays) states[i] = incoming[i].reduce((total, edge) => total + edge.sign * values[edge.source], 0);
      return values[output];
    },
    reset() { values.fill(0); states.fill(0); },
  };
}
