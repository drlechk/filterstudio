import type { PortSide } from '../lib/wdf-layout';
import type { Point } from '../lib/signal-routing';
import { portSubscript } from '../lib/wdf-signal-flow';

/** Reference-script T: a transverse bar inside the outgoing b-wave lead. */
export function WdfAdaptedPort({ position, side, port, depth = 12, halfWidth = 7 }: {
  position: Point; side: PortSide; port: number; depth?: number; halfWidth?: number;
}) {
  const angle = { right: 0, bottom: 90, left: 180, top: -90 }[side];
  return <g data-adapted-port={port} transform={`translate(${position.x} ${position.y}) rotate(${angle})`}>
    <title>{`ρ${portSubscript(port)} = 0`}</title>
    <path className="wdf-adapted-port" d={`M0 0H${-depth}M${-depth} ${-halfWidth}V${halfWidth}`} />
  </g>;
}
