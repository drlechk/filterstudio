import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WdfComparisonPlot, WdfResponse } from './WdfResponse';
import { PreferencesProvider } from '../lib/preferences';
import { analyzeNetwork } from '../lib/network';
import { createCircuit, defaultSettings } from '../lib/project';
import type { WdfComparisonSample } from '../lib/wdf-response';
import type { PlotScaleProps } from './PlotScaleControls';

const data: WdfComparisonSample[] = [{ frequency: 1, wdf: { re: .1, im: 0 }, analog: { re: .5, im: 0 } }, { frequency: 10, wdf: { re: .1, im: 0 }, analog: { re: .5, im: 0 } }];
const plotScales: PlotScaleProps = { frequencyScale: 'linear', magnitudeScale: 'linear', onFrequencyScaleChange() {}, onMagnitudeScaleChange() {} };
const controls = { plotScales, dbRange: 100, onDbRangeChange() {} };
function render(magnitudeScale: PlotScaleProps['magnitudeScale'], mode: 'magnitude' | 'phase' = 'magnitude', samples = data) {
  return renderToStaticMarkup(<PreferencesProvider><WdfComparisonPlot {...controls} plotScales={{ ...plotScales, magnitudeScale }} data={samples} mode={mode} min={1} max={10} sampleRate={100} cutoff={5} /></PreferencesProvider>);
}
const path = (markup: string, trace: string) => markup.match(new RegExp(`data-trace="${trace}" d="([^"]*)"`))![1];

it('plots both distinguishable traces with matching linear and dB geometry and display controls', () => {
  for (const scale of ['linear', 'db'] as const) {
    const html = render(scale);
    expect(html).toContain('Analog · reference');
    expect(html).toContain('stroke-dasharray="7 5"');
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(2);
    const heights = (key: string) => new Set([...path(html, key).matchAll(/[ML][\d.-]+,([\d.-]+)/g)].map(match => Number(match[1])));
    expect(heights('wdf')).toEqual(new Set([scale === 'linear' ? 220.2 : 67.6]));
    expect(heights('analog')).toEqual(new Set([scale === 'linear' ? 133 : 37.12]));
    expect(html).toContain(scale === 'linear' ? 'linear magnitude' : 'magnitude in dB');
    expect(html).not.toMatch(/NaN|Infinity/);
  }
});

it('leaves independent gaps for phase wraps, zeros and undefined values', () => {
  const samples = [
    { frequency: 1, wdf: { re: -1, im: .1 }, analog: { re: 1, im: 0 } },
    { frequency: 4, wdf: { re: -1, im: -.1 }, analog: { re: 0, im: 0 } },
    { frequency: 7, wdf: { re: NaN, im: 0 }, analog: { re: 1, im: 0 } },
    { frequency: 10, wdf: { re: 1, im: 0 }, analog: { re: 1, im: 0 } },
  ];
  const html = render('db', 'phase', samples);
  expect((path(html, 'wdf').match(/M/g) ?? []).length).toBe(3);
  expect((path(html, 'analog').match(/M/g) ?? []).length).toBe(2);
  expect(html).toContain('phase in degrees');
  expect(html).toContain('Undefined values are omitted');
  expect(html).not.toContain('Logarithmic · dB');
  expect(html).not.toMatch(/NaN|Infinity/);
});

it('shows magnitude and phase with a Nyquist-limited range even when the analog sweep lies entirely above it', () => {
  const circuit = createCircuit([{ id: 'r', kind: 'R', connection: 'series', value: 900 }]);
  const project = { version: 1 as const, name: 'Test', settings: defaultSettings, ...circuit, z2: 50, sweep: { min: 1e5, max: 1e7, points: 51 } };
  const analysis = analyzeNetwork([circuit.nodes[1].section!], { fRef: 1e6, z1: 50 });
  const html = renderToStaticMarkup(<PreferencesProvider><WdfResponse {...controls} project={project} analysis={analysis} sampleRate={48000} /></PreferencesProvider>);
  expect(html).toContain('WDF transfer function and analog reference');
  expect(html).toContain('aria-label="WDF start frequency (kHz)"');
  expect(html).toContain('value="0.024"');
  expect(html).toContain('value="24"');
  expect((html.match(/data-trace="wdf"/g) ?? []).length).toBe(2);
  expect((html.match(/data-trace="analog"/g) ?? []).length).toBe(2);
  expect(html).not.toMatch(/NaN|Infinity/);
});
