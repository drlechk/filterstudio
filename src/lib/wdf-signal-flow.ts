import type { WdfAdaptor, WdfModel } from './wdf';

export type SignalOperation = {
  id: string; ownerId: string;
  kind: 'input' | 'zero' | 'wave' | 'sum' | 'gain' | 'delay' | 'output';
  coefficient?: number; expression?: string;
};
export type SignalConnection = { source: string; target: string };
export type ScatteringBranch = {
  id: string; input: number; output: number; coefficient: number; expression: string;
};
export type WaveLink = {
  id: string; source: string; target: string; sourceHandle: string; targetHandle: string;
  label: string;
};
export type WdfSignalFlow = {
  nodes: SignalOperation[]; edges: SignalConnection[];
  adaptors: { id: string; branches: ScatteringBranch[] }[];
  links: WaveLink[]; inputId: string; outputId: string;
};

const wave = (owner: string, direction: 'a' | 'b', port?: number) => JSON.stringify([owner, direction, port ?? null]);
const operation = (owner: string, kind: string, row?: number, column?: number) => JSON.stringify([owner, kind, row ?? null, column ?? null]);
const subscript = (port: number) => String(port + 1).replace(/\d/g, digit => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)]);

function expression(adaptor: WdfAdaptor, row: number, column: number): string {
  const gamma = `γ${subscript(adaptor.kind === 'series' ? row : column)}`;
  if (row === column) return adaptor.kind === 'series' ? `1 − ${gamma}` : `${gamma} − 1`;
  return adaptor.kind === 'series' && adaptor.ports[row].sign * adaptor.ports[column].sign > 0 ? `−${gamma}` : gamma;
}

/** Expand b = S a into scalar multipliers and sums. Only exact zero branches
 * disappear; no approximate threshold may change the circuit's transfer function.
 * Connected ports exchange waves: an adaptor's b drives its neighbor's a.
 */
export function buildWdfSignalFlow(model: WdfModel): WdfSignalFlow {
  const nodes: SignalOperation[] = [], edges: SignalConnection[] = [], links: WaveLink[] = [];
  const adaptors: WdfSignalFlow['adaptors'] = [];
  const byId = new Map(model.adaptors.map(a => [a.id, a]));
  const elements = new Map(model.elements.map(e => [e.id, e]));
  const add = (node: SignalOperation) => { nodes.push(node); return node.id; };
  const connect = (source: string, target: string) => edges.push({ source, target });
  const link = (source: string, target: string, sourceHandle: string, targetHandle: string, label: string) =>
    links.push({ id: JSON.stringify([source, target, sourceHandle, targetHandle]), source, target, sourceHandle, targetHandle, label });
  for (const adaptor of model.adaptors) {
    const ownerId = adaptor.id;
    const branches: ScatteringBranch[] = [];
    adaptor.ports.forEach((_, port) => {
      add({ id: wave(ownerId, 'a', port), ownerId, kind: 'wave' });
      add({ id: wave(ownerId, 'b', port), ownerId, kind: 'sum' });
    });
    adaptor.matrix.forEach((row, i) => row.forEach((coefficient, j) => {
      if (coefficient === 0) return;
      const id = operation(ownerId, 'multiply', i, j), label = expression(adaptor, i, j);
      add({ id, ownerId, kind: 'gain', coefficient, expression: label });
      connect(wave(ownerId, 'a', j), id);
      connect(id, wave(ownerId, 'b', i));
      branches.push({ id, input: j, output: i, coefficient, expression: label });
    }));
    adaptors.push({ id: ownerId, branches });
  }
  for (const element of model.elements) {
    const ownerId = element.id;
    // Every element also has an incident wave, including matched terminations.
    add({ id: wave(ownerId, 'a'), ownerId, kind: 'wave' });
    const reflected = wave(ownerId, 'b');
    if (element.kind === 'C') {
      add({ id: reflected, ownerId, kind: 'delay' });
      connect(wave(ownerId, 'a'), reflected);
    } else if (element.kind === 'L') {
      const delay = add({ id: operation(ownerId, 'delay'), ownerId, kind: 'delay' });
      add({ id: reflected, ownerId, kind: 'gain', coefficient: -1, expression: '−1' });
      connect(wave(ownerId, 'a'), delay); connect(delay, reflected);
    } else add({ id: reflected, ownerId, kind: element.kind === 'source' ? 'input' : 'zero' });
  }
  for (const adaptor of model.adaptors) adaptor.ports.forEach((port, i) => {
    const neighbor = byId.get(port.neighborId);
    if (neighbor) {
      const j = neighbor.ports.findIndex(p => p.neighborId === adaptor.id);
      if (j < 0) throw new Error('WDF: Ungültige Verbindung im Signalflussgraphen.');
      connect(wave(adaptor.id, 'b', i), wave(neighbor.id, 'a', j));
      link(adaptor.id, neighbor.id, `b-${i}`, `a-${j}`, `b${subscript(i)} → a${subscript(j)}`);
    } else {
      if (!elements.has(port.neighborId)) throw new Error('WDF: Ungültige Verbindung im Signalflussgraphen.');
      connect(wave(adaptor.id, 'b', i), wave(port.neighborId, 'a'));
      connect(wave(port.neighborId, 'b'), wave(adaptor.id, 'a', i));
      link(adaptor.id, port.neighborId, `b-${i}`, 'a', `b${subscript(i)} → a`);
      link(port.neighborId, adaptor.id, 'b', `a-${i}`, `b → a${subscript(i)}`);
    }
  });
  const outputId = add({ id: operation('load', 'voltage'), ownerId: 'voltage-output', kind: 'output', coefficient: .5, expression: '½' });
  connect(wave('load', 'a'), outputId);
  link('load', 'voltage-output', 'voltage', 'a', 'aR₂');
  return { nodes, edges, adaptors, links, inputId: wave('source', 'b'), outputId };
}

/** Execute the displayed scalar graph independently of the tree processor.
 * Delay outputs are read first, the acyclic instantaneous graph follows, and all
 * delay inputs are latched together at the end of the sample.
 */
export function createSignalFlowProcessor(graph: WdfSignalFlow) {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const incoming = graph.nodes.map(() => [] as number[]), outgoing = graph.nodes.map(() => [] as number[]);
  const indegree = graph.nodes.map(() => 0);
  for (const edge of graph.edges) {
    const source = index.get(edge.source), target = index.get(edge.target);
    if (source === undefined || target === undefined) throw new Error('WDF: Ungültige Verbindung im Signalflussgraphen.');
    incoming[target].push(source);
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
        const sum = () => incoming[i].reduce((total, source) => total + values[source], 0);
        values[i] = node.kind === 'input' ? input : node.kind === 'zero' ? 0 : node.kind === 'delay' ? states[i]
          : node.kind === 'gain' || node.kind === 'output' ? sum() * node.coefficient! : sum();
      }
      for (const i of delays) states[i] = incoming[i].reduce((total, source) => total + values[source], 0);
      return values[output];
    },
    reset() { values.fill(0); states.fill(0); },
  };
}
