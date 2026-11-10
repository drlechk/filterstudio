import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { SignalNode, signalGraphLayout } from './WdfSignalGraph';
import { PreferencesProvider } from '../lib/preferences';
import { buildWdf } from '../lib/wdf';
import { createCircuit, defaultSettings } from '../lib/project';

const model = buildWdf({ settings: defaultSettings, z2: 50, ...createCircuit([
  { id: 'l', kind: 'L', connection: 'shunt', value: .002 },
  { id: 'lc', kind: 'LC', connection: 'series', resonator: 'parallel', value: .002, value2: 2e-6 },
]) }, 48000);
function render(data: ComponentProps<typeof SignalNode>['data']) {
  return renderToStaticMarkup(<PreferencesProvider><ReactFlowProvider>
    <SignalNode id="test" data={data} type="signal" dragging={false} draggable={false} selectable={false} deletable={false}
      selected={false} zIndex={0} isConnectable={false} positionAbsoluteX={0} positionAbsoluteY={0} />
  </ReactFlowProvider></PreferencesProvider>);
}

it('renders a labelled multiplier for every explicit sign inversion in each adaptor', () => {
  for (const node of signalGraphLayout(model).nodes.filter(n => n.data.drawing)) {
    const html = render(node.data), drawing = node.data.drawing!;
    expect(html.match(/data-operation="negate" data-gain="-1"/g)?.length ?? 0)
      .toBe(drawing.symbols.filter(s => s.operation.kind === 'negate').length);
    expect(html.match(/data-operation="gain"/g)?.length ?? 0).toBe(drawing.compact.multipliers.length);
    expect(html).not.toContain('wdf-signal-input-sign');
  }
});

it('shows z⁻¹ followed by a separate −1 multiplier for inductors in all ladder orientations and in the tree', () => {
  const element = model.elements.find(e => e.kind === 'L')!;
  for (const elementSide of [undefined, 'left', 'right', 'bottom'] as const) {
    const html = render({ element, elementSide, root: false, chosen: false });
    expect(html).toContain('z⁻¹');
    expect(html.match(/data-operation="negate" data-gain="-1"/g)).toHaveLength(1);
    expect(html).toContain('<title>× −1</title>');
    expect(html).toContain('>−1</text>');
  }
  expect(render({ element: model.elements.find(e => e.kind === 'C')!, root: false, chosen: false })).not.toContain('data-operation="negate"');
});
