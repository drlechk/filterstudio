import { useId, useMemo, useState } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { Maximize, Focus } from 'lucide-react';
import { usePreferences } from '../lib/preferences';
import { formatEngineering } from '../lib/network';
import type { WdfAdaptor, WdfElement, WdfModel } from '../lib/wdf';
import { buildWdfSignalFlow } from '../lib/wdf-signal-flow';
import { AdaptorSignalDrawing, SignalMultiplier } from './WdfSignalDrawing';
import { adaptorSignalLayout, COMPACT_ADAPTOR_SIZE, type AdaptorDrawing } from '../lib/wdf-signal-layout';
import { wdfLadderLayout, type PortSide, type WdfLayoutMode } from '../lib/wdf-layout';
import { bridgedPath, signalWireGeometry, type Point, type RoutedWire, type WireSegment } from '../lib/signal-routing';
import './WdfSignalGraph.css';

type GraphNode = Node<{
  adaptor?: WdfAdaptor; element?: WdfElement; drawing?: AdaptorDrawing;
  root: boolean; chosen: boolean; elementSide?: PortSide;
}, 'signal'>;
type GraphEdge = Edge<{ segments: WireSegment[]; points: Point[]; active: boolean; caption: string }, 'signal'>;
const polyline = (points: Point[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
const sidePosition = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };
function elementPort(side: PortSide, handle: string): Point {
  if (handle === 'voltage') return { x: 280, y: 220 };
  if (side === 'bottom') return { x: handle === 'a' ? 180 : 100, y: 260 };
  return { x: side === 'right' ? 280 : 0, y: (handle === 'a') === (side === 'left') ? 90 : 170 };
}

function LadderSignalElement({ element, side, marker }: { element: WdfElement; side: PortSide; marker: string }) {
  const { t, language } = usePreferences();
  const reactive = element.kind === 'L' || element.kind === 'C';
  const bottom = side === 'bottom', right = side === 'right';
  const p = (x: number, y: number) => right ? { x: 280 - x, y: 260 - y } : { x, y };
  const label = (x: number, y: number, text: string, className?: string) => <text {...p(x, y)} textAnchor="middle" className={className}>{text}</text>;
  const a = elementPort(side, 'a'), b = elementPort(side, 'b');
  return <>
    <svg width="280" height="260" aria-label={element.label}>
      {bottom ? <>
        {reactive ? <>
          <path className="wdf-signal-wire" d="M180 260V210H220V102H190" markerEnd={`url(#${marker})`} />
          <rect className="wdf-signal-delay" x="90" y="80" width="100" height="44" />
          <text className="wdf-signal-delay-label" x="140" y="109" textAnchor="middle">z⁻¹</text>
          {element.kind === 'L' && <path className="wdf-signal-wire" d="M90 102H60V140" markerEnd={`url(#${marker})`} />}
          <path className="wdf-signal-wire" d={element.kind === 'L' ? 'M60 180V220H100V260' : 'M90 102H60V220H100V260'} markerEnd={`url(#${marker})`} />
          {element.kind === 'L' && <SignalMultiplier position={{ x: 60, y: 160 }} label="−1" coefficient={-1} labelSide="right" />}
          <text x="140" y="60" textAnchor="middle">{formatEngineering(element.value, element.kind === 'C' ? 'F' : 'H', 5, language)}</text>
        </> : <>
          <path className="wdf-signal-wire" d="M180 260V150" /><path className="wdf-signal-termination" d="M171 150H189M174 143H186" />
          <rect className="wdf-signal-delay" x="55" y="80" width="90" height="44" /><text x="100" y="108" textAnchor="middle">0</text>
          <path className="wdf-signal-wire" d="M100 124V260" markerEnd={`url(#${marker})`} />
          <text x="180" y="128" textAnchor="middle">{t('angepasst', 'matched')}</text>
        </>}
        <text x="194" y="246">a[n]</text><text x="86" y="246" textAnchor="end">b[n]</text>
      </> : <>
        <g transform={right ? 'translate(280 260) rotate(180)' : undefined}>
          {reactive ? <>
            <path className="wdf-signal-wire" d="M0 90H70" markerEnd={`url(#${marker})`} /><rect className="wdf-signal-delay" x="70" y="68" width="80" height="44" />
            {element.kind === 'L' && <path className="wdf-signal-wire" d="M150 90H180" markerEnd={`url(#${marker})`} />}
            <path className="wdf-signal-wire" d={element.kind === 'L' ? 'M220 90H250V170H0' : 'M150 90H250V170H0'} markerEnd={`url(#${marker})`} />
          </> : <>
            <rect className="wdf-signal-delay" x="100" y="148" width="90" height="44" />
            <path className="wdf-signal-wire" d="M100 170H0" markerEnd={`url(#${marker})`} /><path className="wdf-signal-wire" d="M0 90H70" />
            <path className="wdf-signal-termination" d="M70 81V99M77 84V96" />
            {element.id === 'load' && <><path className="wdf-signal-wire" d="M30 90V50H240V220H280" markerEnd={`url(#${marker})`} /><circle className="wdf-signal-junction" cx="30" cy="90" r="3.5" /></>}
          </>}
        </g>
        {reactive ? <>
          {label(110, right ? 83 : 97, 'z⁻¹', 'wdf-signal-delay-label')}
          {element.kind === 'L' && <SignalMultiplier position={p(200, 90)} label="−1" coefficient={-1} />}
          {label(140, 220, formatEngineering(element.value, element.kind === 'C' ? 'F' : 'H', 5, language))}
        </> : <>{label(145, right ? 164 : 176, element.kind === 'source' ? 'Vₛ[n]' : '0')}{label(140, 95, t('angepasst', 'matched'))}</>}
        <text x={right ? 268 : 12} y={a.y - 16} textAnchor={right ? 'end' : 'start'}>a[n]</text>
        <text x={right ? 268 : 12} y={b.y - 16} textAnchor={right ? 'end' : 'start'}>b[n]</text>
      </>}
    </svg>
    {(['a', 'b'] as const).map(handle => { const point = elementPort(side, handle); return <Handle key={handle} id={handle} type={handle === 'a' ? 'target' : 'source'}
      position={sidePosition[side]} style={bottom ? { left: point.x } : { top: point.y }} isConnectable={false} />; })}
    {element.id === 'load' && <Handle type="source" id="voltage" position={Position.Right} style={{ top: 220 }} isConnectable={false} />}
  </>;
}
function arrowTail(end: Point, previous: Point, length = 14) {
  return { x: end.x + Math.sign(previous.x - end.x) * length, y: end.y + Math.sign(previous.y - end.y) * length };
}
export function SignalNode({ data }: NodeProps<GraphNode>) {
  const { t, number, language } = usePreferences();
  const marker = `signal-arrow-${useId().replace(/[^\w-]/g, '')}`;
  const { adaptor, element, drawing } = data;
  const markerDef = <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8Z" /></marker></defs>;
  if (adaptor && drawing) {
    return <div className={`wdf-signal-node wdf-signal-adaptor ${data.root ? 'root' : ''} ${data.chosen ? 'chosen' : ''}`}>
      <div className="wdf-signal-heading"><strong>{adaptor.label} · {adaptor.kind === 'series' ? t('Serienadaptor', 'Series adaptor') : t('Paralleladaptor', 'Parallel adaptor')}</strong>
        <span>{drawing.compact.multipliers.length} γ · {data.root ? t('Wurzel', 'Root') : t(`Tor ${adaptor.adaptedPort! + 1} angepasst`, `Port ${adaptor.adaptedPort! + 1} adapted`)}</span></div>
      <svg width={drawing.width} height={drawing.height} viewBox={`0 0 ${drawing.width} ${drawing.height}`} aria-label={t(`Signalfluss ${adaptor.label}`, `${adaptor.label} signal flow`)}>
        {markerDef}
        <AdaptorSignalDrawing drawing={drawing} adaptedPort={adaptor.adaptedPort} marker={marker} format={value => number(value, 6)} />
      </svg>
      {drawing.ports.map(port => <Handle key={port.id} type={port.direction === 'a' ? 'target' : 'source'} id={port.id}
        position={sidePosition[port.side]} style={port.side === 'top' || port.side === 'bottom' ? { left: port.position.x } : { top: port.position.y }} isConnectable={false} />)}
    </div>;
  }
  if (element && data.elementSide) return <div className="wdf-signal-node wdf-signal-element">
    <div className="wdf-signal-heading"><strong>{element.label}</strong></div>
    <svg width="0" height="0">{markerDef}</svg>
    <LadderSignalElement element={element} side={data.elementSide} marker={marker} />
  </div>;
  const output = !element, reactive = element?.kind === 'L' || element?.kind === 'C';
  return <div className="wdf-signal-node wdf-signal-element">
    <div className="wdf-signal-heading"><strong>{element?.label ?? 'Vout[n]'}</strong></div>
    <svg width={output ? 240 : 280} height={output ? 160 : 260} aria-label={element?.label ?? 'Vout[n]'}>
      {markerDef}
      {reactive ? <>
        <path className="wdf-signal-wire" d="M0 80H70" markerEnd={`url(#${marker})`} />
        <rect className="wdf-signal-delay" x="70" y="58" width="80" height="44" />
        <text className="wdf-signal-delay-label" x="110" y="87" textAnchor="middle">z⁻¹</text>
        {element.kind === 'L' && <path className="wdf-signal-wire" d="M150 80H180" markerEnd={`url(#${marker})`} />}
        <path className="wdf-signal-wire" d={element.kind === 'L' ? 'M220 80H250V160H0' : 'M150 80H250V160H0'} markerEnd={`url(#${marker})`} />
        {element.kind === 'L' && <SignalMultiplier position={{ x: 200, y: 80 }} label="−1" coefficient={-1} />}
        <text x="140" y="220" textAnchor="middle">{formatEngineering(element.value, element.kind === 'C' ? 'F' : 'H', 5, language)}</text>
        <text x="12" y="64">a[n]</text><text x="12" y="144">b[n]</text>
      </> : output ? <>
        <path className="wdf-signal-wire" d="M0 80H70M110 80H220" markerEnd={`url(#${marker})`} /><path className="wdf-signal-gain" d="M70 62L110 80L70 98Z" />
        <text x="87" y="119" textAnchor="middle">½</text><text x="164" y="62">Vout</text>
      </> : <>
        <rect className="wdf-signal-delay" x="100" y="58" width="90" height="44" />
        <path className="wdf-signal-wire" d="M100 80H0" markerEnd={`url(#${marker})`} /><path className="wdf-signal-wire" d="M0 160H70" />
        <text x="145" y="86" textAnchor="middle">{element!.kind === 'source' ? 'Vₛ[n]' : '0'}</text>
        <path className="wdf-signal-termination" d="M70 151V169M77 154V166" />
        <text x="93" y="165">{t('angepasst', 'matched')}</text>
        <text x="12" y="64">b[n]</text><text x="12" y="144">a[n]</text>
        {element!.id === 'load' && <><path className="wdf-signal-wire" d="M30 160V220H280" markerEnd={`url(#${marker})`} /><circle className="wdf-signal-junction" cx="30" cy="160" r="3.5" /></>}
      </>}
    </svg>
    <Handle type="target" id="a" position={Position.Left} style={{ top: reactive || output ? 80 : 160 }} isConnectable={false} />
    {!output && <Handle type="source" id="b" position={Position.Left} style={{ top: reactive ? 160 : 80 }} isConnectable={false} />}
    {element?.id === 'load' && <Handle type="source" id="voltage" position={Position.Right} style={{ top: 220 }} isConnectable={false} />}
  </div>;
}

function SignalEdge({ data, markerEnd }: EdgeProps<GraphEdge>) {
  const points = data!.points, end = points.at(-1)!, previous = points.at(-2)!;
  return <g className={`wdf-signal-link ${data!.active ? 'active' : ''}`}>
    <title>{data!.caption}</title>
    {data!.segments.map((segment, i) => <path key={i} data-bridges={segment.bridges.length} d={bridgedPath(segment)} />)}
    <path d={polyline([arrowTail(end, previous), end])} markerEnd={markerEnd} />
  </g>;
}
const nodeTypes = { signal: SignalNode }, edgeTypes = { signal: SignalEdge };

export function signalGraphLayout(model: WdfModel, mode: WdfLayoutMode = 'ladder'): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const graph = buildWdfSignalFlow(model);
  const items = new Map<string, WdfAdaptor | WdfElement>([...model.adaptors, ...model.elements].map(item => [item.id, item]));
  const ladder = mode === 'ladder' ? wdfLadderLayout(model, id => items.get(id)?.type === 'adaptor'
    ? COMPACT_ADAPTOR_SIZE : { width: 280, height: 260 }, 200) : null;
  const drawings = new Map(model.adaptors.map(a => [a.id, adaptorSignalLayout(a, ladder?.get(a.id)?.portSides)]));
  const size = (id: string) => drawings.get(id) ?? (id === 'voltage-output' ? { width: 240, height: 160 } : { width: 280, height: 260 });
  type Layout = { points: { id: string; depth: number; y: number }[]; contour: { min: number; max: number }[] };
  function layout(id: string): Layout {
    const item = items.get(id), { height } = size(id), contour: Layout['contour'] = [];
    const children = item?.type === 'adaptor' ? item.ports.filter((_, i) => i !== item.adaptedPort).map(port => port.neighborId) : id === 'load' ? ['voltage-output'] : [];
    const packed = children.map(child => {
      const branch = layout(child);
      const offset = branch.contour.reduce((shift, box, depth) => Math.max(shift, contour[depth] ? contour[depth].max + 160 - box.min : 0), 0);
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
  const points = ladder ? [] : layout(model.rootId).points;
  const depthById = new Map(points.map(p => [p.id, p.depth]));
  const widths: number[] = [], gaps: number[] = [], offsets = [0];
  points.forEach(p => { widths[p.depth] = Math.max(widths[p.depth] ?? 0, size(p.id).width); });
  if (!ladder) graph.links.forEach(link => { const d = Math.min(depthById.get(link.source)!, depthById.get(link.target)!); gaps[d] = (gaps[d] ?? 0) + 1; });
  widths.forEach((w, d) => { offsets[d + 1] = offsets[d] + w + Math.max(200, (gaps[d] ?? 0) * 24 + 100); });
  const nodes: GraphNode[] = ladder ? [...ladder].map(([id, placement]) => {
    const item = items.get(id)!, { width, height } = size(id);
    return { id, type: 'signal', position: placement.position, width, height,
      draggable: false, selectable: item.type === 'adaptor', data: { ...(item.type === 'adaptor' ? { adaptor: item, drawing: drawings.get(id) }
        : { element: item, elementSide: placement.portSides[0] }), root: id === model.rootId, chosen: false } };
  }) : points.map(point => {
    const item = items.get(point.id), { width, height } = size(point.id);
    return { id: point.id, type: 'signal', position: { x: offsets[point.depth], y: point.y - height / 2 }, width, height,
      draggable: false, selectable: item?.type === 'adaptor', data: { ...(item?.type === 'adaptor' ? { adaptor: item, drawing: drawings.get(item.id) } : { element: item }), root: item?.id === model.rootId, chosen: false } };
  });
  if (ladder) {
    const load = nodes.find(node => node.id === 'load')!;
    nodes.push({ id: 'voltage-output', type: 'signal', position: { x: load.position.x + load.width! + 200, y: load.position.y + 140 },
      width: 240, height: 160, draggable: false, selectable: false, data: { root: false, chosen: false } });
  }
  const positioned = new Map(nodes.map(node => [node.id, node]));
  const portPosition = (id: string, handle: string): Point => {
    const node = positioned.get(id)!, drawing = drawings.get(id), item = items.get(id);
    if (drawing) { const port = drawing.ports.find(p => p.id === handle)!; return { x: node.position.x + port.position.x, y: node.position.y + port.position.y }; }
    if (node.data.elementSide) { const p = elementPort(node.data.elementSide, handle); return { x: node.position.x + p.x, y: node.position.y + p.y }; }
    const reactive = item?.type === 'element' && (item.kind === 'L' || item.kind === 'C');
    return { x: node.position.x + (handle === 'voltage' ? 280 : 0),
      y: node.position.y + (handle === 'voltage' ? 220 : handle === 'a' ? reactive || !item ? 80 : 160 : reactive ? 160 : 80) };
  };
  const used = new Map<number, number>();
  const routes: RoutedWire[] = graph.links.map(link => {
    const start = portPosition(link.source, link.sourceHandle), end = portPosition(link.target, link.targetHandle);
    if (ladder) {
      // Opposing wave pins align in the physical ladder, including vertical branches.
      return { id: link.id, net: link.id, points: [start, end] };
    }
    const depth = Math.min(depthById.get(link.source)!, depthById.get(link.target)!);
    const lane = used.get(depth) ?? 0; used.set(depth, lane + 1);
    const x = offsets[depth] + widths[depth] + 40 + lane * 24;
    return { id: link.id, net: link.id, points: [start, { x, y: start.y }, { x, y: end.y }, end] };
  });
  const geometry = signalWireGeometry(routes);
  const edges: GraphEdge[] = graph.links.map((link, index) => ({ ...link, type: 'signal', data: {
    segments: geometry.segments.filter(s => s.net === link.id), points: routes[index].points, active: false, caption: link.label },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-muted)' } }));
  return { nodes, edges };
}

export function WdfSignalGraph({ model, selectedId, onSelect, onRoot, layoutMode = 'ladder' }: {
  model: WdfModel; selectedId: string; onSelect: (id: string) => void; onRoot: (id: string) => void; layoutMode?: WdfLayoutMode;
}) {
  const { t, theme } = usePreferences();
  const [instance, setInstance] = useState<ReactFlowInstance<GraphNode, GraphEdge> | null>(null);
  const layout = useMemo(() => signalGraphLayout(model, layoutMode), [model, layoutMode]);
  const flow = useMemo(() => ({ nodes: layout.nodes.map(node => ({ ...node, data: { ...node.data, chosen: node.id === selectedId } })),
    edges: layout.edges.map(edge => { const active = edge.source === selectedId || edge.target === selectedId;
      return { ...edge, data: { ...edge.data!, active }, markerEnd: { type: MarkerType.ArrowClosed, color: active ? 'var(--accent)' : 'var(--text-muted)' } }; }) }), [layout, selectedId]);
  return <div className="wdf-diagram wdf-signal-diagram" aria-label={t('WDF-Signalflussgraph', 'WDF signal-flow graph')}>
    <ReactFlow<GraphNode, GraphEdge> key={layoutMode + (layoutMode === 'tree' ? model.rootId : '') + model.adaptors.map(a => a.id).join(',')} nodes={flow.nodes} edges={flow.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onInit={setInstance} colorMode={theme} fitView fitViewOptions={{ ...(layoutMode === 'tree' ? { nodes: [{ id: model.rootId }] } : {}), padding: .12, maxZoom: 1 }}
      minZoom={.001} maxZoom={2.5} nodesDraggable={false} nodesConnectable={false} zoomOnDoubleClick={false} deleteKeyCode={null} onlyRenderVisibleElements
      onNodeClick={(_, node) => { if (node.data.adaptor) onSelect(node.id); }}
      onNodeDoubleClick={(_, node) => { if (node.data.adaptor) onRoot(node.id); }} proOptions={{ hideAttribution: true }}>
      <Background gap={20} size={1} /><Controls showInteractive={false} />
    </ReactFlow>
    <div className="wdf-signal-tools">
      <button className="button" onClick={() => void instance?.fitView({ padding: .12, maxZoom: 1, duration: 200 })}><Maximize size={14} />{t('Gesamtgraph', 'Whole graph')}</button>
      <button className="button" onClick={() => void instance?.fitView({ nodes: [{ id: selectedId }], padding: .12, maxZoom: 1, duration: 200 })}><Focus size={14} />{t('Ausgewählter Adaptor', 'Selected adaptor')}</button>
    </div>
    <div className="wdf-signal-note">{t('γ / −1: Multiplikation · +: Summe · Punkt: Verzweigung · Sprung: keine Verbindung · z⁻¹: ein Abtastschritt', 'γ / −1: multiply · +: sum · dot: branch · bridge: no connection · z⁻¹: one sample delay')}</div>
  </div>;
}
