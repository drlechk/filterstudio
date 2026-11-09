import { useMemo, useState } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, getBezierPath, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { Download, Network } from 'lucide-react';
import { FrequencyInput } from './FrequencyInput';
import { Formula } from './MathView';
import { usePreferences } from '../lib/preferences';
import type { FrequencyUnit } from '../lib/frequency-units';
import { formatEngineering } from '../lib/network';
import { downloadFile } from '../lib/project';
import type { Project } from '../lib/types';
import { buildWdf, defaultWdfSampleRate, exportWdf, MAX_WDF_SAMPLE_RATE, type WdfAdaptor, type WdfElement, type WdfModel, type WdfSettings } from '../lib/wdf';
import './WdfView.css';

type WdfNode = Node<{ item: WdfAdaptor | WdfElement; root: boolean; selected: boolean }, 'wdf'>;
type WdfEdge = Edge<{ resistance: number }, 'waves'>;
const childY = (index: number, count: number) => count === 1 ? 64 : 30 + index * 68 / (count - 1);

function WdfSymbol({ data }: NodeProps<WdfNode>) {
  const { t, language } = usePreferences();
  const { item, root, selected } = data;
  const eng = (n: number, unit: string) => formatEngineering(n, unit, 4, language);
  const adaptor = item.type === 'adaptor';
  const childPorts = adaptor ? item.ports.map((_, i) => i).filter(i => i !== item.adaptedPort) : [];
  return <div className={`wdf-symbol ${adaptor ? 'adaptor' : 'element'} ${root ? 'root' : ''} ${selected ? 'chosen' : ''}`}>
    <div className="wdf-node-heading">{item.label}{root && <span>{t('Wurzel', 'Root')}</span>}</div>
    <svg width="196" height="128" viewBox="0 0 196 128" aria-hidden="true">
      <rect className="wdf-block" x="44" y="18" width="106" height="92" rx="2" />
      {adaptor ? <>
        <text className="wdf-kind" x="97" y="58" textAnchor="middle">{item.kind === 'series' ? 'S' : 'P'}</text>
        {item.kind === 'series' ? <path className="wdf-glyph" d="M77 75H117" /> : <path className="wdf-glyph" d="M91 68V84M103 68V84" />}
        {childPorts.map((port, index) => {
          const y = childY(index, childPorts.length);
          return <g key={port}><path d={`M150 ${y - 3}H196M150 ${y + 3}H196`} />
            <path className="wdf-arrow" d={`M174 ${y - 6}l-5 3 5 3M179 ${y}l5 3-5 3`} />
            <text x="157" y={y - 8}>{port + 1}{item.ports[port].sign < 0 ? '−' : ''}</text></g>;
        })}
        {item.adaptedPort !== null && <>
          <path d="M0 61H44M0 67H44" />
          <circle className="wdf-adapted-port" cx="44" cy="64" r="5" />
          <text x="10" y="50">{item.adaptedPort + 1}{item.ports[item.adaptedPort].sign < 0 ? '−' : ''} *</text>
        </>}
      </> : <>
        <path d="M0 61H44M0 67H44" />
        <text className="wdf-delay" x="97" y="57" textAnchor="middle">{item.kind === 'C' ? 'z⁻¹' : item.kind === 'L' ? '−z⁻¹' : item.kind === 'source' ? 'Vₛ[n]' : '0'}</text>
        <text x="97" y="84" textAnchor="middle">{eng(item.value, item.kind === 'C' ? 'F' : item.kind === 'L' ? 'H' : 'Ω')}</text>
      </>}
    </svg>
    {item.parentId !== null && <Handle type="target" id="parent" position={Position.Left} style={{ top: 88 }} isConnectable={false} />}
    {childPorts.map((port, i) => <Handle key={port} type="source" id={`port-${port}`} position={Position.Right}
      style={{ top: 24 + childY(i, childPorts.length) }} isConnectable={false} />)}
    <div className="wdf-node-footer">{adaptor ? root ? t('freie Streuung', 'Root scattering') : `ρ${item.adaptedPort! + 1} = 0`
      : item.kind === 'source' ? 'b = Vₛ[n]' : item.kind === 'R' ? 'b = 0' : 'b[n] = ' + (item.kind === 'L' ? '−' : '') + 'a[n−1]'}</div>
  </div>;
}

function WaveEdge(props: EdgeProps<WdfEdge>) {
  const { language } = usePreferences();
  const [up, x, y] = getBezierPath({ ...props, sourceY: props.sourceY - 3, targetY: props.targetY - 3 });
  const [down] = getBezierPath({ ...props, sourceY: props.sourceY + 3, targetY: props.targetY + 3 });
  return <g className="wdf-wave-edge">
    <path d={up} markerStart={props.markerStart} /><path d={down} markerEnd={props.markerEnd} />
    <rect x={x - 49} y={y - 26} width="98" height="19" rx="3" />
    <text x={x} y={y - 13} textAnchor="middle">{formatEngineering(props.data!.resistance, 'Ω', 4, language)}</text>
  </g>;
}
const nodeTypes = { wdf: WdfSymbol };
const edgeTypes = { waves: WaveEdge };

function diagram(model: WdfModel, selected: string): { nodes: WdfNode[]; edges: WdfEdge[] } {
  const map = new Map<string, WdfAdaptor | WdfElement>([...model.adaptors, ...model.elements].map(n => [n.id, n]));
  const nodes: WdfNode[] = [], edges: WdfEdge[] = [];
  type Layout = { points: { id: string; depth: number; y: number }[]; contour: { min: number; max: number }[] };
  function layout(id: string): Layout {
    const item = map.get(id)!;
    const children = item.type === 'adaptor' ? item.ports.map((port, i) => ({ port, i })).filter(({ i }) => i !== item.adaptedPort) : [];
    const contour: Layout['contour'] = [];
    const branches = children.map(({ port, i }) => {
      const branch = layout(port.neighborId);
      // Pack subtrees using their occupied vertical extent at each depth.
      // A ladder's long branch stays horizontal; its leaves share a compact row.
      const offset = branch.contour.reduce((shift, c, depth) => Math.max(shift, contour[depth] ? contour[depth].max + 192 - c.min : 0), 0);
      branch.contour.forEach((c, depth) => {
        const previous = contour[depth];
        contour[depth] = { min: Math.min(previous?.min ?? Infinity, c.min + offset), max: Math.max(previous?.max ?? -Infinity, c.max + offset) };
      });
      edges.push({ id: `${id}:${i}`, source: id, target: port.neighborId, sourceHandle: `port-${i}`, targetHandle: 'parent', type: 'waves',
        data: { resistance: port.resistance }, markerStart: { type: MarkerType.ArrowClosed, color: 'var(--text-muted)' }, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-muted)' } });
      return { branch, offset };
    });
    const mainBranch = branches.reduce<typeof branches[number] | null>((best, branch) => !best || branch.branch.points.length > best.branch.points.length ? branch : best, null);
    const pivot = mainBranch && mainBranch.branch.points.length > 1 ? mainBranch.offset : branches.length ? (branches[0].offset + branches.at(-1)!.offset) / 2 : 0;
    return { points: [{ id, depth: 0, y: 0 }, ...branches.flatMap(({ branch, offset }) => branch.points.map(p => ({ ...p, depth: p.depth + 1, y: p.y + offset - pivot })))],
      contour: [{ min: 0, max: 0 }, ...contour.map(c => ({ min: c.min - pivot, max: c.max - pivot }))] };
  }
  for (const { id, depth, y } of layout(model.rootId).points) {
    const item = map.get(id)!;
    nodes.push({ id, type: 'wdf', position: { x: depth * 270, y }, data: { item, root: id === model.rootId, selected: id === selected },
      width: 196, height: 176, draggable: false, selectable: item.type === 'adaptor',
      ariaLabel: `${item.label}, ${item.kind}${id === model.rootId ? ', root' : ''}` });
  }
  return { nodes, edges };
}

function AdaptorDetails({ adaptor, model, onRoot }: { adaptor: WdfAdaptor; model: WdfModel; onRoot: (id: string) => void }) {
  const { t, number, language } = usePreferences();
  const name = (id: string) => model.adaptors.find(n => n.id === id)?.label ?? model.elements.find(n => n.id === id)?.label ?? id;
  const root = adaptor.id === model.rootId;
  return <aside className="wdf-inspector" aria-label={t('Adaptordetails', 'Adaptor details')}>
    <div className="wdf-inspector-title"><strong>{adaptor.label} · {adaptor.kind === 'series' ? t('Serienadaptor', 'Series adaptor') : t('Paralleladaptor', 'Parallel adaptor')}</strong>
      <button className="button" disabled={root} onClick={() => onRoot(adaptor.id)}>{root ? t('Wurzelelement', 'Root element') : t('Als Wurzel festlegen', 'Set as root')}</button></div>
    <p>{root ? t('An der Wurzel ist kein Tor als reflexionsfrei vorgegeben.', 'No port is constrained to be reflection-free at the root.')
      : t(`Tor ${adaptor.adaptedPort! + 1} ist zur Wurzel hin angepasst (ρ = 0).`, `Port ${adaptor.adaptedPort! + 1} is adapted toward the root (ρ = 0).`)}</p>
    <div className="wdf-table-scroll"><table><caption>{t('Torwiderstände und Koeffizienten', 'Port resistances and coefficients')}</caption><thead><tr>
      <th>{t('Tor → Element', 'Port → element')}</th><th>Rᵢ / Ω</th><th>γᵢ</th><th>ρᵢ</th>
    </tr></thead><tbody>{adaptor.ports.map((port, i) => <tr key={i} className={i === adaptor.adaptedPort ? 'adapted' : ''}>
      <th>{i + 1}{i === adaptor.adaptedPort ? '*' : ''} → {name(port.neighborId)}</th>
      <td title={String(port.resistance)}>{formatEngineering(port.resistance, '', 7, language)}</td>
      <td title={String(port.coefficient)}>{number(port.coefficient, 8)}</td><td>{number(port.reflection, 6)}</td>
    </tr>)}</tbody></table></div>
    <div className="wdf-matrix-section"><strong className="wdf-matrix-title">{t('Streumatrix', 'Scattering matrix')} · b = S a</strong>
    <div className="wdf-matrix" aria-label={t('Numerische Streumatrix', 'Numerical scattering matrix')}>
      {adaptor.matrix.map((row, i) => <div key={i}>{row.map((value, j) => <span key={j} title={`S${i + 1}${j + 1} = ${value}`}>{number(value, 7)}</span>)}</div>)}
    </div></div>
    <p>{t('Zeilen: b₁…bₙ · Spalten: a₁…aₙ. Zahlen im Schaubild sind Tornummern; * markiert das angepasste Tor.', 'Rows: b₁…bₙ · columns: a₁…aₙ. Numbers in the diagram are port numbers; * marks the adapted port.')}</p>
  </aside>;
}

export function WdfView({ project, onChange }: {
  project: Project; onChange: (settings: WdfSettings) => void;
}) {
  const { t, translate, language, theme } = usePreferences();
  const sampleRate = project.wdf?.sampleRate ?? defaultWdfSampleRate(project.settings);
  const [unit, setUnit] = useState<FrequencyUnit>(() => sampleRate >= 1e9 ? 'GHz' : sampleRate >= 1e6 ? 'MHz' : sampleRate >= 1e3 ? 'kHz' : 'Hz');
  const [selectedId, setSelectedId] = useState('');
  const result = useMemo(() => {
    try { return { model: buildWdf(project, sampleRate, project.wdf?.rootId), error: null }; }
    catch (e) { return { model: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [project.nodes, project.wires, project.settings, project.z2, sampleRate, project.wdf?.rootId]);
  const model = result.model;
  const selected = model?.adaptors.find(a => a.id === selectedId) ?? model?.adaptors.find(a => a.id === model.rootId);
  const flow = useMemo(() => model ? diagram(model, selected?.id ?? '') : null, [model, selected?.id]);
  const eng = (n: number, unit: string) => formatEngineering(n, unit, 5, language);
  const chooseRoot = (rootId: string) => { setSelectedId(rootId); onChange({ sampleRate, rootId }); };
  return <div className="wdf-view">
    <div className="wdf-controls">
      <div className="wdf-sample-rate"><span>{t('Abtastrate', 'Sample rate')} fₛ</span><FrequencyInput value={sampleRate} onChange={sampleRate => onChange({ sampleRate, rootId: model?.rootId ?? project.wdf?.rootId })}
        label={t('WDF-Abtastrate', 'WDF sample rate')} unit={unit} onUnitChange={setUnit} min={1} max={MAX_WDF_SAMPLE_RATE} /></div>
      <label>{t('Wurzelelement', 'Root element')}<select aria-label={t('WDF-Wurzelelement', 'WDF root element')} value={model?.rootId ?? ''} disabled={!model} onChange={e => chooseRoot(e.target.value)}>
        {!model && <option value="">—</option>}{model?.adaptors.map(a => <option key={a.id} value={a.id}>{a.label} · {a.kind === 'series' ? t('Serie', 'Series') : t('Parallel', 'Parallel')}</option>)}
      </select></label>
      <div className="wdf-timing"><span>T = {eng(1 / sampleRate, 's')}</span><span>Nyquist = {eng(sampleRate / 2, 'Hz')}</span></div>
      <button className="button" disabled={!model} onClick={() => model && downloadFile(`${project.name}-wdf.json`, exportWdf(model), 'application/json')}><Download size={14} />{t('WDF exportieren', 'Export WDF')}</button>
    </div>
    {result.error ? <div className="wdf-error" role="status"><Network size={22} /><strong>{t('Die analoge Schaltung ist noch nicht bereit.', 'The analog circuit is not ready yet.')}</strong><p>{translate(result.error)}</p></div> : model && selected && flow && <>
      {model.rootChanged && <p className="wdf-notice" role="status">{t('Der gespeicherte Adaptor existiert nicht mehr. Der erste Adaptor dient jetzt als Wurzel.', 'The saved adaptor no longer exists. The first adaptor is now the root.')}</p>}
      <div className="wdf-main">
        <div className="wdf-diagram" aria-label={t('Wellen-Digitalfilter mit Adaptoren', 'Wave digital filter with adaptors')}>
          <ReactFlow key={model.rootId + model.adaptors.map(a => a.id).join(',')} colorMode={theme} nodes={flow.nodes} edges={flow.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            fitView fitViewOptions={{ padding: .15, maxZoom: 1 }} minZoom={.02} maxZoom={2.5} nodesDraggable={false} nodesConnectable={false} zoomOnDoubleClick={false}
            onNodeClick={(_, node) => { if (node.data.item.type === 'adaptor') setSelectedId(node.id); }}
            onNodeDoubleClick={(_, node) => { if (node.data.item.type === 'adaptor') chooseRoot(node.id); }}
            deleteKeyCode={null} proOptions={{ hideAttribution: true }}>
            <Background gap={20} size={1} /><Controls showInteractive={false} />
          </ReactFlow>
          <div className="wdf-diagram-hint">{t('Adaptor anklicken · Doppelklick setzt die Wurzel', 'Select an adaptor · double-click to set the root')}</div>
        </div>
        <AdaptorDetails adaptor={selected} model={model} onRoot={chooseRoot} />
      </div>
      <div className="wdf-legend"><span><b>S —</b> {t('Serie', 'Series')}</span><span><b>P ∥</b> Parallel</span><span><b>*</b> ρ = 0</span><span><b>z⁻¹</b> C</span><span><b>−z⁻¹</b> L</span><span>{model.adaptors.length} {t('Adaptoren', 'adaptors')} · {model.elements.filter(e => e.kind === 'L' || e.kind === 'C').length} {t('Speicher', 'delays')}</span>
        <span>{t('Bilinear ohne Vorverzerrung · Ergebnis-Tabs: analoge Schaltung', 'Bilinear without prewarping · result tabs: analog circuit')}</span></div>
    </>}
    <details className="wdf-method"><summary>{t('Wellenvariablen, Anpassung und Frequenzabbildung', 'Wave variables, adaptation and frequency mapping')}</summary>
      <p>{t('Spannungswellen: a = v + Ri, b = v − Ri. Die Doppellinien führen die beiden Wellenrichtungen. An jedem verbundenen Tor gilt a₁ = b₂ und a₂ = b₁. Die Quelle enthält R₁; die Ausgangsspannung wird an R₂ abgegriffen.',
        'Voltage waves: a = v + Ri, b = v − Ri. The double lines carry the two wave directions. At connected ports a₁ = b₂ and a₂ = b₁. The source includes R₁; output voltage is measured across R₂.')}</p>
      <Formula latex={String.raw`R_C=\frac{1}{2f_sC},\quad R_L=2f_sL,\quad R_R=R`} />
      <p>{t('Die Adaptor-Koeffizienten werden für Serien- und Paralleladaptoren einheitlich mit γᵢ bezeichnet, sowohl bei reflexionsfreien als auch bei nicht-reflexionsfreien Toren. Der Torreflexionsfaktor ist ρᵢ = Sᵢᵢ.',
        'Adaptor coefficients are denoted by γᵢ for both series and parallel adaptors, at both reflection-free and reflective ports. The port reflection coefficient is ρᵢ = Sᵢᵢ.')}</p>
      <Formula latex={String.raw`\gamma_i=\frac{2R_i}{\sum_kR_k},\qquad S^{\mathrm{series}}_{ij}=\delta_{ij}-\gamma_i\sigma_i\sigma_j`} />
      <Formula latex={String.raw`\gamma_i=\frac{2/R_i}{\sum_k1/R_k},\qquad S^{\mathrm{parallel}}_{ij}=\gamma_j-\delta_{ij}`} />
      <p>{t('Beim Serienadaptor kennzeichnet − das Tor mit σ = −1; alle anderen Tore haben σ = +1. Diese Spannungspolarität bleibt beim Wechsel der Wurzel erhalten. Das angepasste Tor hat Rₚ = Σ Rₖ (Serie) bzw. Rₚ = 1 / Σ(1/Rₖ) (Parallel), jeweils über die übrigen Tore. Somit gilt γₚ = 1 und ρₚ = Sₚₚ = 0.',
        'For series adaptors, − marks the port with σ = −1; all other ports have σ = +1. This voltage polarity is preserved when changing the root. The adapted port has Rₚ = Σ Rₖ (series) or Rₚ = 1 / Σ(1/Rₖ) (parallel), summing over the other ports. Thus γₚ = 1 and ρₚ = Sₚₚ = 0.')}</p>
      <p>{t('Bilineare Transformation ohne Vorverzerrung: Die analogen Bauteilwerte bleiben erhalten. Analoge Frequenzen werden nicht linear auf die digitale Frequenzachse abgebildet. Die Ergebnis-Tabs unterhalb zeigen weiterhin die analoge Schaltung.',
        'Bilinear transform without prewarping: analog component values are retained. Analog frequencies map nonlinearly to the digital frequency axis. The result tabs below continue to show the analog circuit.')}</p>
      <Formula latex={String.raw`s=2f_s\frac{1-z^{-1}}{1+z^{-1}},\qquad f_d=\frac{f_s}{\pi}\arctan\!\left(\frac{\pi f_a}{f_s}\right)`} />
      <p>{t('Die Vergleichsdiagramme verwenden dieselbe S₂₁-Normierung wie die analoge Analyse. Der WDF-Frequenzgang wird über die bilineare Abbildung ausgewertet; die analoge Referenz bleibt auf der ursprünglichen Frequenzachse.',
        'The comparison plots use the same S₂₁ normalization as the analog analysis. The WDF frequency response is evaluated via the bilinear mapping; the analog reference remains on the original frequency axis.')}</p>
      <Formula latex={String.raw`S_{21}=2\sqrt{\frac{R_1}{R_2}}\,\frac{V_{\mathrm{out}}}{V_s}`} />
      <p>{t('Abbildung der analogen Bezugsfrequenz:', 'Mapping of the analog reference frequency:')} {eng(project.settings.cutoff, 'Hz')} → {eng(sampleRate / Math.PI * Math.atan(Math.PI * project.settings.cutoff / sampleRate), 'Hz')}.</p>
      <div className="wdf-source-links"><a href="https://www.dsprelated.com/freebooks/pasp/Adaptors_Wave_Digital_Elements.html" target="_blank" rel="noopener noreferrer">J. O. Smith · {t('WDF-Adaptoren', 'WDF adaptors')}</a>
        <a href="https://dafx.de/paper-archive/2015/DAFx-15_submission_53.pdf" target="_blank" rel="noopener noreferrer">Werner, Smith &amp; Abel · DAFx-15</a></div>
    </details>
  </div>;
}
