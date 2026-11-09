import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WdfPlotPanel } from './WdfPlotPanel';
import { PreferencesProvider } from '../lib/preferences';
import { createCircuit, defaultSettings, orderedSections } from '../lib/project';
import { analyzeNetwork } from '../lib/network';
import type { Project } from '../lib/types';

const project: Project = { version: 1, name: 'WDF plots', settings: defaultSettings, z2: 50,
  sweep: { min: 1e5, max: 1e7, points: 50 },
  ...createCircuit([{ id: 'L1', kind: 'L', connection: 'series', value: 1e-5 }]) };
const analysis = analyzeNetwork(orderedSections(project.nodes, project.wires), { fRef: project.settings.cutoff, z1: 50, z2: 50 });
const render = (p = project, detached = false) => renderToStaticMarkup(<PreferencesProvider>
  <WdfPlotPanel project={p} analysis={analysis} onDetach={detached ? undefined : () => {}}
    plotScales={{ frequencyScale: 'log', magnitudeScale: 'db', onFrequencyScaleChange() {}, onMagnitudeScaleChange() {} }}
    dbRange={100} onDbRangeChange={() => {}} />
</PreferencesProvider>);

it('renders standalone magnitude and phase comparisons without circuit controls or adaptors', () => {
  const html = render();
  expect(html).toContain('Detach plots');
  expect(html).toContain('WDF magnitude response');
  expect(html).toContain('WDF phase response');
  expect(html.match(/data-trace=/g)).toHaveLength(4);
  expect(html).not.toContain('react-flow');
  expect(html).not.toContain('WDF root element');
  expect(html).not.toContain('WDF sample rate (');
  expect(render(project, true)).not.toContain('Detach plots');
});

it('shows no stale comparison when the circuit or WDF parameters are invalid', () => {
  for (const p of [{ ...project, wires: [] }, { ...project, wdf: { sampleRate: 0 } }]) {
    const html = render(p);
    expect(html).toContain('The analog circuit is not ready yet.');
    expect(html).not.toContain('data-trace=');
  }
});
