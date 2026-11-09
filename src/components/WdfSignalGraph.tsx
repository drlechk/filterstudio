import { useId, useMemo, useState } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, getBezierPath, type Edge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { Maximize, Focus } from 'lucide-react';
import { usePreferences } from '../lib/preferences';
import { formatEngineering } from '../lib/network';
import type { WdfAdaptor, WdfElement, WdfModel } from '../lib/wdf';
import { buildWdfSignalFlow, type ScatteringBranch } from '../lib/wdf-signal-flow';
import './WdfSignalGraph.css';

type GraphNode = Node<{
  adaptor?: WdfAdaptor; element?: WdfElement; branches?: ScatteringBranch[];
  root: boolean; chosen: boolean;
}, 'signal'>;
type GraphEdge = Edge<{ routeY: number; reverse: boolean; active: boolean; caption: string }, 'signal'>;
const WIDTH = 580;
const rowY = (port: number) => 112 + port * 156;
const adaptorHeight = (count: number) => rowY(count - 1) + 96;

function SignalNode({ data }: NodeProps<GraphNode>) {
  const { t, number, language } = usePreferences();
  const marker = `signal-arrow-${useId().replace(/[^\w-]/g, '')}`;
  const { adaptor, element } = data;
  if (adaptor) {
    const count = adaptor.ports.length, height = adaptorHeight(count);
    return <div className={`wdf-signal-node wdf-signal-adaptor ${data.root ? 'root' : ''} ${data.chosen ? 'chosen' : ''}`}>
      <div className="wdf-signal-heading"><strong>{adaptor.label} · {adaptor.kind === 'series' ? t('Serienadaptor', 'Series adaptor') : t('Paralleladaptor', 'Parallel adaptor')}</strong>
        <span>{data.root ? t('Wurzel', 'Root') : t(`Tor ${adaptor.adaptedPort! + 1} angepasst`, `Port ${adaptor.adaptedPort! + 1} adapted`)}</span></div>
      <svg width={WIDTH} height={height} viewBox={`0 0 ${WIDTH} ${height}`} aria-label={t(`Signalfluss ${adaptor.label}`, `${adaptor.label} signal flow`)}>
        <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8Z" /></marker></defs>
        {data.branches!.map(branch => {
          const y = rowY(branch.output) + (branch.input - (count - 1) / 2) * 48;
          const busX = 70 + branch.input * 48;
          return <g key={branch.id} className="wdf-signal-branch" data-gain={branch.coefficient}>
            <title>{`S${branch.output + 1}${branch.input + 1} = ${branch.expression} = ${branch.coefficient}`}</title>
            <path className="wdf-signal-wire" d={`M24 ${rowY(branch.input)}H${busX}V${y}H278`} markerEnd={`url(#${marker})`} />
            <circle className="wdf-signal-junction" cx={busX} cy={y} r="2.5" />
            <path className="wdf-signal-gain" d={`M280 ${y - 12}L310 ${y}L280 ${y + 12}Z`} />
            <text className="wdf-signal-expression" x="294" y={y - 18} textAnchor="middle">{branch.expression}<tspan className="wdf-signal-value"> = {number(branch.coefficient, 5)}</tspan></text>
            <path className="wdf-signal-wire" d={`M310 ${y}C370 ${y} 398 ${rowY(branch.output)} 452 ${rowY(branch.output)}`} markerEnd={`url(#${marker})`} />
          </g>;
        })}
        {adaptor.ports.map((_, port) => <g key={port}>
          <path className="wdf-signal-wire" d={`M0 ${rowY(port)}H24M488 ${rowY(port)}H580`} markerEnd={`url(#${marker})`} />
          <circle className="wdf-signal-junction" cx="24" cy={rowY(port)} r="4" />
          <text x="22" y={rowY(port) - 15}>a{port + 1}[n]</text>
          <circle className="wdf-signal-sum" cx="470" cy={rowY(port)} r="17" />
          <text className="wdf-signal-plus" x="470" y={rowY(port) + 6} textAnchor="middle">+</text>
          <text x="510" y={rowY(port) - 15}>b{port + 1}[n]</text>
        </g>)}
      </svg>
      {adaptor.ports.map((_, port) => <div key={port}>
        <Handle type="target" id={`a-${port}`} position={Position.Left} style={{ top: rowY(port) }} isConnectable={false} />
        <Handle type="source" id={`b-${port}`} position={Position.Right} style={{ top: rowY(port) }} isConnectable={false} />
      </div>)}
    </div>;
  }
  const output = !element;
  const reactive = element?.kind === 'L' || element?.kind === 'C';
  const incidentY = reactive || output ? 68 : 120;
  return <div className="wdf-signal-node wdf-signal-element">
    <div className="wdf-signal-heading"><strong>{element?.label ?? 'Vout[n]'}</strong></div>
    <svg width={output ? 210 : 260} height={output ? 110 : 164} aria-label={element?.label ?? 'Vout[n]'}>
      {reactive ? <>
        <path className="wdf-signal-wire" d={element.kind === 'L' ? 'M0 68H50M120 68H164M192 68H260' : 'M0 68H70M150 68H260'} />
        <rect className="wdf-signal-delay" x={element.kind === 'L' ? 50 : 70} y="45" width={element.kind === 'L' ? 70 : 80} height="46" />
        <text className="wdf-signal-delay-label" x={element.kind === 'L' ? 85 : 110} y="75" textAnchor="middle">z⁻¹</text>
        {element.kind === 'L' && <><path className="wdf-signal-gain" d="M164 56L192 68L164 80Z" /><text x="177" y="47" textAnchor="middle">−1</text></>}
        <text x="130" y="126" textAnchor="middle">{formatEngineering(element.value, element.kind === 'C' ? 'F' : 'H', 5, language)}</text>
      </> : output ? <>
        <path className="wdf-signal-wire" d="M0 68H60M90 68H195" /><path className="wdf-signal-gain" d="M60 56L90 68L60 80Z" />
        <text x="73" y="47" textAnchor="middle">½</text><text x="128" y="51">Vout</text>
      </> : <>
        <rect className="wdf-signal-delay" x="65" y="45" width="90" height="46" /><path className="wdf-signal-wire" d="M155 68H260M0 120H55" />
        <text x="110" y="74" textAnchor="middle">{element!.kind === 'source' ? 'Vₛ[n]' : '0'}</text>
        <path className="wdf-signal-termination" d="M55 111V129M62 114V126" />
        <text x="75" y="124">{t('angepasst', 'matched')}</text>
        {element!.id === 'load' && <><path className="wdf-signal-wire" d="M25 120V148H260" /><circle className="wdf-signal-junction" cx="25" cy="120" r="3" /></>}
      </>}
    </svg>
    <Handle type="target" id="a" position={Position.Left} style={{ top: incidentY }} isConnectable={false} />
    {!output && <Handle type="source" id="b" position={Position.Right} style={{ top: 68 }} isConnectable={false} />}
    {element?.id === 'load' && <Handle type="source" id="voltage" position={Position.Right} style={{ top: 148 }} isConnectable={false} />}
  </div>;
}

function SignalEdge(props: EdgeProps<GraphEdge>) {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, data } = props;
  const [forward, x, y] = getBezierPath(props);
  // Returning waves travel above the scalar blocks, rather than through them.
  const path = data!.reverse ? `M${sx} ${sy}H${sx + 22}V${data!.routeY}H${tx - 22}V${ty}H${tx}` : forward;
  return <g className={`wdf-signal-link ${data!.active ? 'active' : ''}`}>
    <title>{data!.caption}</title><path d={path} markerEnd={props.markerEnd} />
    <text x={data!.reverse ? (sx + tx) / 2 : x} y={(data!.reverse ? data!.routeY : y) - 7} textAnchor="middle">{data!.caption}</text>
  </g>;
}
const nodeTypes = { signal: SignalNode };
const edgeTypes = { signal: SignalEdge };

function graphLayout(model: WdfModel, selected: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const graph = buildWdfSignalFlow(model);
  const items = new Map<string, WdfAdaptor | WdfElement>([...model.adaptors, ...model.elements].map(item => [item.id, item]));
  const branches = new Map(graph.adaptors.map(adaptor => [adaptor.id, adaptor.branches]));
  type Layout = { points: { id: string; depth: number; y: number }[]; contour: { min: number; max: number }[] };
  function layout(id: string): Layout {
    const item = items.get(id)!;
    const height = item.type === 'adaptor' ? adaptorHeight(item.ports.length) : 164;
    const contour: Layout['contour'] = [];
    const children = item.type === 'adaptor' ? item.ports.filter((_, i) => i !== item.adaptedPort).map(port => port.neighborId) : [];
    const packed = children.map(child => {
      const branch = layout(child);
      const offset = branch.contour.reduce((shift, box, depth) => Math.max(shift, contour[depth] ? contour[depth].max + 110 - box.min : 0), 0);
      branch.contour.forEach((box, depth) => {
        const previous = contour[depth];
        contour[depth] = { min: Math.min(previous?.min ?? Infinity, box.min + offset), max: Math.max(previous?.max ?? -Infinity, box.max + offset) };
      });
      return { branch, offset };
    });
    const main = packed.reduce<typeof packed[number] | null>((best, child) => !best || child.branch.points.length > best.branch.points.length ? child : best, null);
    const pivot = main && main.branch.points.length > 1 ? main.offset : packed.length ? (packed[0].offset + packed.at(-1)!.offset) / 2 : 0;
    return { points: [{ id, depth: 0, y: 0 }, ...packed.flatMap(({ branch, offset }) => branch.points.map(point => ({ ...point, depth: point.depth + 1, y: point.y + offset - pivot })))],
      contour: [{ min: -height / 2, max: height / 2 }, ...contour.map(box => ({ min: box.min - pivot, max: box.max - pivot }))] };
  }
  const nodes: GraphNode[] = layout(model.rootId).points.map(point => {
    const item = items.get(point.id)!;
    const height = item.type === 'adaptor' ? adaptorHeight(item.ports.length) : 164;
    return { id: point.id, type: 'signal', position: { x: point.depth * 820, y: point.y - height / 2 },
      width: item.type === 'adaptor' ? WIDTH : 260, height, draggable: false, selectable: item.type === 'adaptor',
      data: { ...(item.type === 'adaptor' ? { adaptor: item, branches: branches.get(item.id) } : { element: item }), root: item.id === model.rootId, chosen: item.id === selected } };
  });
  const load = nodes.find(node => node.id === 'load')!;
  nodes.push({ id: 'voltage-output', type: 'signal', position: { x: load.position.x + 380, y: load.position.y + 80 }, width: 210, height: 110, draggable: false, selectable: false,
    data: { root: false, chosen: false } });
  const positioned = new Map(nodes.map(node => [node.id, node]));
  const edges: GraphEdge[] = graph.links.map((link, index) => {
    const source = positioned.get(link.source)!, target = positioned.get(link.target)!;
    const active = link.source === selected || link.target === selected;
    return { ...link, type: 'signal', data: { reverse: source.position.x > target.position.x,
      routeY: Math.min(source.position.y, target.position.y) - 32 - index % 4 * 15, active, caption: link.label },
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? 'var(--accent)' : 'var(--text-muted)' } };
  });
  return { nodes, edges };
}

export function WdfSignalGraph({ model, selectedId, onSelect, onRoot }: {
  model: WdfModel; selectedId: string; onSelect: (id: string) => void; onRoot: (id: string) => void;
}) {
  const { t, theme } = usePreferences();
  const [instance, setInstance] = useState<ReactFlowInstance<GraphNode, GraphEdge> | null>(null);
  const flow = useMemo(() => graphLayout(model, selectedId), [model, selectedId]);
  return <div className="wdf-diagram wdf-signal-diagram" aria-label={t('WDF-Signalflussgraph', 'WDF signal-flow graph')}>
    <ReactFlow<GraphNode, GraphEdge> key={model.rootId + model.adaptors.map(a => a.id).join(',')} nodes={flow.nodes} edges={flow.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onInit={setInstance} colorMode={theme} fitView fitViewOptions={{ nodes: [{ id: model.rootId }], padding: .2, maxZoom: 1 }}
      minZoom={.001} maxZoom={2.5} nodesDraggable={false} nodesConnectable={false} zoomOnDoubleClick={false} deleteKeyCode={null} onlyRenderVisibleElements
      onNodeClick={(_, node) => { if (node.data.adaptor) onSelect(node.id); }}
      onNodeDoubleClick={(_, node) => { if (node.data.adaptor) onRoot(node.id); }} proOptions={{ hideAttribution: true }}>
      <Background gap={20} size={1} /><Controls showInteractive={false} />
    </ReactFlow>
    <div className="wdf-signal-tools">
      <button className="button" onClick={() => void instance?.fitView({ padding: .12, maxZoom: 1, duration: 200 })}><Maximize size={14} />{t('Gesamtgraph', 'Whole graph')}</button>
      <button className="button" onClick={() => void instance?.fitView({ nodes: [{ id: selectedId }], padding: .2, maxZoom: 1, duration: 200 })}><Focus size={14} />{t('Ausgewählter Adaptor', 'Selected adaptor')}</button>
    </div>
    <div className="wdf-signal-note">{t('Dreieck: Multiplikation · Kreis: Summe · Punkt: Verzweigung · z⁻¹: ein Abtastschritt', 'Triangle: multiply · circle: sum · dot: branch · z⁻¹: one sample delay')}</div>
  </div>;
}
