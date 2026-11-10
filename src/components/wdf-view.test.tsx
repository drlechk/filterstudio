import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WdfView } from './WdfView';
import { PreferencesProvider } from '../lib/preferences';
import { createCircuit, defaultSettings } from '../lib/project';
import type { Project } from '../lib/types';

const project: Project = { version: 1, name: 'WDF test', settings: defaultSettings, z2: 50, sweep: { min: 1e5, max: 1e7, points: 501 },
  ...createCircuit([{ id: 'res', kind: 'LC', connection: 'shunt', resonator: 'series', value: 1e-5, value2: 1e-9 }]) };
const render = (p: Project) => renderToStaticMarkup(<PreferencesProvider><WdfView project={p} onChange={() => {}} /></PreferencesProvider>);

it('exposes sample rate, every root including resonators, port coefficients, and the discretization convention', () => {
  const html = render(project);
  expect(html).toContain('aria-label="WDF sample rate (MHz)"');
  expect(html).toContain('value="adaptor:res" selected=""');
  expect(html).toContain('value="resonator:res"');
  expect(html).toContain('Port resistances and coefficients');
  expect(html).toContain('Numerical scattering matrix');
  expect(html).toContain('Export WDF');
  expect(html).toContain('aria-label="WDF layout"');
  expect(html).toContain('aria-pressed="true">Ladder layout');
  expect(html).toContain('aria-pressed="false">Tree layout');
  expect(html).toContain('Bilinear without prewarping · result tabs: analog circuit');
  expect(html).not.toContain('class="wdf-response"');
  expect(html).not.toContain('WDF magnitude response');
  expect(html).not.toContain('WDF phase response');
  expect(html).not.toContain('katex-error');
});

it('offers the same default ladder and optional tree in the signal-flow representation', () => {
  const html = renderToStaticMarkup(<PreferencesProvider><WdfView project={project} representation="signal" onChange={() => {}} /></PreferencesProvider>);
  expect(html).toContain('aria-label="WDF signal-flow graph"');
  expect(html).toContain('aria-pressed="true">Ladder layout');
  expect(html).toContain('aria-pressed="false">Tree layout');
});

it('renders a persisted resonator root and sample rate', () => {
  const html = render({ ...project, wdf: { sampleRate: 96000, rootId: 'resonator:res' } });
  expect(html).toContain('aria-label="WDF sample rate (kHz)"');
  expect(html).toContain('value="96"');
  expect(html).toContain('value="resonator:res" selected=""');
  expect(html).toContain('S1 · Series adaptor');
});

it('does not display or export a stale WDF when the analog circuit is incomplete', () => {
  const html = render({ ...project, wires: [] });
  expect(html).toContain('The analog circuit is not ready yet.');
  expect(html).not.toContain('Port resistances and coefficients');
  expect(html).not.toContain('WDF transfer function and analog reference');
  expect(html).toContain('<button class="button" disabled=""');
});

it('explains a missing stored root instead of silently retaining stale parameters', () => {
  expect(render({ ...project, wdf: { sampleRate: 48000, rootId: 'removed' } })).toContain('The saved adaptor no longer exists.');
});
