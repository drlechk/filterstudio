import type { AdaptorDrawing } from '../lib/wdf-signal-layout';
import { portSubscript } from '../lib/wdf-signal-flow';
import { bridgedPath, type Point } from '../lib/signal-routing';

/** Multipliers use the labelled circles in the reference, distinct from sums. */
export function SignalMultiplier({ position: p, label, value, coefficient, labelSide = 'top' }: {
  position: Point; label: string; value?: string; coefficient: number; labelSide?: 'top' | 'right';
}) {
  return <g data-operation={coefficient === -1 && label === '−1' ? 'negate' : 'gain'} data-gain={coefficient}>
    <title>{value ? `${label} = ${coefficient}` : `× ${label}`}</title>
    <circle className="wdf-signal-gain" cx={p.x} cy={p.y} r="20" />
    <text className="wdf-signal-expression" x={p.x + (labelSide === 'right' ? 32 : 0)} y={p.y + (labelSide === 'right' ? 6 : -32)}
      textAnchor={labelSide === 'right' ? 'start' : 'middle'}>{label}{value && <tspan className="wdf-signal-value"> = {value}</tspan>}</text>
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
        <text className="wdf-signal-plus" x={p.x} y={p.y + 7} textAnchor="middle">+</text>
      </g>)}
    {drawing.terminals.map((terminal, i) => <text key={i} className="wdf-signal-terminal" {...terminal.position} textAnchor={terminal.anchor}>{terminal.label}</text>)}
    {drawing.ports.map(port => <g key={port.id}>
      <circle className="wdf-signal-port" cx={port.position.x} cy={port.position.y} r="4" />
      <text x={port.position.x + (port.side === 'left' || ((port.side === 'top' || port.side === 'bottom') && port.position.x > drawing.width / 2) ? 10 : -10)}
        y={port.side === 'top' ? 28 : port.position.y - 12}
        textAnchor={port.side === 'left' || ((port.side === 'top' || port.side === 'bottom') && port.position.x > drawing.width / 2) ? 'start' : 'end'}>
        {port.direction}{portSubscript(port.port)}[n]{port.port === adaptedPort ? '*' : ''}</text>
    </g>)}
  </>;
}
