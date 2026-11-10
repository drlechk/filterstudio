import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { SignalNode, signalGraphLayout } from './WdfSignalGraph';
import { SignalMultiplier } from './WdfSignalDrawing';
import { PreferencesProvider } from '../lib/preferences';
import { buildWdf } from '../lib/wdf';
import { createCircuit, defaultSettings } from '../lib/project';
import { portSubscript } from '../lib/wdf-signal-flow';
import { formatNumber } from '../lib/preference-storage';

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

it('uses the reference gamma label with the numerical coefficient available as a tooltip', () => {
  const html = renderToStaticMarkup(<svg><SignalMultiplier position={{ x: 60, y: 60 }} label="−γ₁" coefficient={-.23456789} value="−0.234568" /></svg>);
  expect(html).toContain('<title>−γ₁ = −0.234568</title>');
  expect(html).toContain('aria-label="−γ₁ = −0.234568"');
  expect(html).toContain('data-gain="-0.23456789"');
  expect(html).toContain('>−γ₁</text>');
  expect(html).not.toContain('<tspan');
});

it('shows all current port coefficients in the adaptor footer, including adapted and eliminated coefficients', () => {
  const project = { settings: defaultSettings, z2: 50, ...createCircuit([
    { id: 'l', kind: 'L' as const, connection: 'series' as const, value: .002 },
    { id: 'lc', kind: 'LC' as const, connection: 'shunt' as const, resonator: 'series' as const, value: .002, value2: 2e-6 },
  ]) };
  for (const root of ['adaptor:l', 'resonator:lc']) {
    for (const node of signalGraphLayout(buildWdf(project, 48000, root)).nodes.filter(n => n.data.adaptor)) {
      const html = render(node.data);
      const footer = html.match(/<g class="wdf-signal-coefficients">([\s\S]*?)<\/g>/)![1];
      expect(footer.match(/<text /g)).toHaveLength(node.data.adaptor!.ports.length);
      node.data.adaptor!.ports.forEach((port, i) => {
        expect(footer).toContain(`γ${portSubscript(i)} = ${formatNumber(port.coefficient, 'en', 6)}`);
        expect(footer).toContain(`data-coefficient="${port.coefficient}"`);
      });
    }
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
