import type { AdaptorDrawing } from '../lib/wdf-signal-layout';
import { portSubscript } from '../lib/wdf-signal-flow';
import { bridgedPath, type Direction, type Point } from '../lib/signal-routing';
import { WdfAdaptedPort } from './WdfAdaptedPort';

export const SIGNAL_DELAY_SIZE = 60;
export function SignalDelay({ position: p }: { position: Point }) {
  return <g data-operation="delay">
    <rect className="wdf-signal-delay" x={p.x - SIGNAL_DELAY_SIZE / 2} y={p.y - SIGNAL_DELAY_SIZE / 2} width={SIGNAL_DELAY_SIZE} height={SIGNAL_DELAY_SIZE} />
    <text className="wdf-signal-delay-label" x={p.x} y={p.y + 10} textAnchor="middle">z⁻¹</text>
  </g>;
}

/** A matched wave ends at the flat face; an emitted wave starts at the arc. */
export function SignalMatchedPort({ position, direction, kind }: {
  position: Point; direction: Direction; kind: 'sink' | 'source';
}) {
  const angle = { right: 0, down: 90, left: 180, up: -90 }[direction];
  const x = kind === 'source' ? -20 : 0;
  return <path className="wdf-signal-termination" data-symbol="matched-port" data-wave-role={kind}
    transform={`translate(${position.x} ${position.y}) rotate(${angle})`} d={`M${x} -20A20 20 0 0 1 ${x} 20Z`} />;
}

/** Multipliers use the labelled circles in the reference, distinct from sums. */
export function SignalMultiplier({ position: p, label, value, coefficient, labelSide = 'top' }: {
  position: Point; label: string; value?: string; coefficient: number; labelSide?: 'top' | 'bottom' | 'right' | 'left';
}) {
  const description = value ? `${label} = ${value}` : `× ${label}`;
  return <g data-operation={coefficient === -1 && label === '−1' ? 'negate' : 'gain'} data-gain={coefficient} aria-label={description}>
    <title>{description}</title>
    <circle className="wdf-signal-gain" cx={p.x} cy={p.y} r="20" />
    <text className="wdf-signal-expression" x={p.x + (labelSide === 'right' ? 32 : labelSide === 'left' ? -32 : 0)} y={p.y + (labelSide === 'top' ? -32 : labelSide === 'bottom' ? 44 : 10)}
      textAnchor={labelSide === 'right' ? 'start' : labelSide === 'left' ? 'end' : 'middle'}>{label}</text>
  </g>;
}

export function AdaptorSignalDrawing({ drawing, adaptedPort, marker, format }: {
  drawing: AdaptorDrawing; adaptedPort: number | null; marker: string; format: (value: number) => string;
}) {
  return <>
    <g className="wdf-signal-wires">{drawing.wires.segments.map((segment, i) => <path key={i} className="wdf-signal-wire" data-net={segment.net}
      data-bridges={segment.bridges.length} d={bridgedPath(segment)} />)}</g>
    {drawing.requests.map(request => {
      const p = request.end, direction = request.endDirection;
      const tail = { x: p.x + (direction === 'left' ? -14 : direction === 'right' ? 14 : 0), y: p.y + (direction === 'up' ? -14 : direction === 'down' ? 14 : 0) };
      return <path key={request.id} className="wdf-signal-wire" d={`M${tail.x} ${tail.y}L${p.x} ${p.y}`} markerEnd={`url(#${marker})`} />;
    })}
    {drawing.wires.junctions.map(p => <circle key={`${p.x}:${p.y}`} className="wdf-signal-junction" cx={p.x} cy={p.y} r="3.5" />)}
    {drawing.symbols.map(({ operation: node, position: p, labelSide }) => node.kind === 'gain' || node.kind === 'negate'
      ? <SignalMultiplier key={node.id} position={p} label={node.expression!} coefficient={node.kind === 'negate' ? -1 : node.coefficient!}
        value={node.kind === 'gain' ? format(node.coefficient!) : undefined} labelSide={labelSide} />
      : <g key={node.id} data-operation={node.kind}>
        <circle className="wdf-signal-sum" cx={p.x} cy={p.y} r="20" />
        <text className="wdf-signal-plus" x={p.x} y={p.y + 10} textAnchor="middle">+</text>
      </g>)}
    {drawing.terminals.map((terminal, i) => <text key={i} className="wdf-signal-terminal" {...terminal.position} textAnchor={terminal.anchor}>{terminal.label}</text>)}
    {drawing.ports.map(port => <g key={port.id}>
      <circle className="wdf-signal-port" cx={port.position.x} cy={port.position.y} r="4" />
      {port.port === adaptedPort && port.direction === 'b' && <WdfAdaptedPort position={port.position} side={port.side} port={port.port} depth={40} halfWidth={16} />}
      <text x={port.position.x + (port.side === 'left' || ((port.side === 'top' || port.side === 'bottom') && port.position.x > drawing.width / 2) ? 10 : -10)}
        y={port.side === 'top' ? 28 : port.position.y - (port.port === adaptedPort && port.direction === 'b' && port.side !== 'bottom' ? 24 : 12)}
        textAnchor={port.side === 'left' || ((port.side === 'top' || port.side === 'bottom') && port.position.x > drawing.width / 2) ? 'start' : 'end'}>
        {port.direction}{portSubscript(port.port)}[n]{port.port === adaptedPort ? '*' : ''}</text>
    </g>)}
  </>;
}
