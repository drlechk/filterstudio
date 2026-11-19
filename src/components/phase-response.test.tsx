import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PreferencesProvider } from '../lib/preferences';
import { analyzeNetwork } from '../lib/network';
import { designTolerance } from '../lib/tolerance';
import { createCircuit, defaultSettings } from '../lib/project';
import { exportPlots } from '../lib/export-plots';
import { wdfComparisonCsv } from '../lib/wdf-response';
import type { PhaseMode } from '../lib/phase';
import type { ToleranceSpec } from '../lib/types';
import { ResponsePlot } from './ResponsePlot';
import { FrequencyResponsePlot } from './FrequencyResponsePlot';
import { TolerancePlot } from './TolerancePlot';
import { WdfComparisonPlot } from './WdfResponse';

const base = analyzeNetwork([], { fRef: 2, z1: 50 });
// Two complete negative turns across the plotted range; the true phase is known.
const transfer = (f: number) => ({ re: Math.cos(-4 * Math.PI * (f - 1) / 7), im: Math.sin(-4 * Math.PI * (f - 1) / 7) });
const analysis = { ...base, evaluate: (f: number) => ({ ...base.evaluate(f), s21: transfer(f), s12: transfer(f) }) };
const scales = { frequencyScale: 'linear' as const, magnitudeScale: 'db' as const, onFrequencyScaleChange() {}, onMagnitudeScaleChange() {}, onPhaseModeChange() {} };
const range = { min: 1, max: 8, points: 101, cutoff: 2 };
const controls = { dbRange: 100, onDbRangeChange() {} };
const spec: ToleranceSpec = { response: 'lowpass', passband: [2], stopband: [4], passbandLoss: 1, stopbandLoss: 40 };
const data = Array.from({ length: 101 }, (_, i) => { const frequency = 1 + 7 * i / 100; return { frequency, wdf: transfer(frequency), analog: transfer(frequency) }; });
const views = {
  scattering: (phaseMode: PhaseMode) => <ResponsePlot {...scales} {...range} {...controls} phaseMode={phaseMode} analysis={analysis} mode="phase" />,
  transmission: (phaseMode: PhaseMode) => <FrequencyResponsePlot {...scales} {...range} phaseMode={phaseMode} analysis={analysis} mode="phase" onModeChange={() => {}} onExport={() => {}} />,
  tolerance: (phaseMode: PhaseMode) => <TolerancePlot {...scales} phaseMode={phaseMode} spec={spec} design={designTolerance(spec, 'butterworth', 50)} preview={analysis} actual={analysis} previewError={null} normalized={false} onNormalizedChange={() => {}} showActual onShowActualChange={() => {}} onChange={() => {}} />,
  wdf: (phaseMode: PhaseMode) => <WdfComparisonPlot {...range} {...controls} plotScales={{ ...scales, phaseMode }} data={data} sampleRate={100} mode="phase" />,
};

describe('phase display integration', () => {
  it.each(Object.keys(views) as (keyof typeof views)[])('switches %s between broken wrapped paths and continuous full turns', view => {
    for (const phaseMode of ['wrapped', 'unwrapped'] as const) {
      const html = renderToStaticMarkup(<PreferencesProvider>{views[view](phaseMode)}</PreferencesProvider>);
      const phaseSection = view === 'tolerance' ? html.slice(html.indexOf('aria-label="S₂₁ phase response"')) : html;
      const paths = [...phaseSection.matchAll(/<path[^>]* d="([^"]*)"/g)].map(match => match[1].trim()).filter(Boolean);
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) expect((path.match(/M/g) ?? []).length).toBe(phaseMode === 'unwrapped' ? 1 : 3);
      expect(phaseSection).toContain(`aria-pressed="${phaseMode === 'unwrapped'}">Unwrapped</button>`);
      expect(phaseSection).toContain(`aria-pressed="${phaseMode === 'wrapped'}">Wrapped</button>`);
      if (phaseMode === 'unwrapped') expect(phaseSection).toContain('>-720</text>');
      expect(html).not.toMatch(/NaN|Infinity/);
    }
  });

  it('exports the selected phase mode in vector plots and CSV', () => {
    const project = { version: 1 as const, name: 'Phase', z2: 50, settings: { ...defaultSettings, cutoff: 2 }, ...createCircuit([]), sweep: range };
    for (const phaseMode of ['wrapped', 'unwrapped'] as const) {
      const plots = exportPlots(project, { sPhase: true, transmissionPhase: true }, analysis, { ...scales, phaseMode });
      const curves = plots[1].curves.filter(shape => shape.type === 'line' && shape.width === 1.4);
      expect(curves).toHaveLength(phaseMode === 'unwrapped' ? 1 : 3);
      if (phaseMode === 'unwrapped') {
        expect(plots[1].decorations.some(shape => shape.type === 'label' && shape.latex === '-720')).toBe(true);
        for (const curve of curves) if (curve.type === 'line') for (const point of curve.points) {
          expect(point.y).toBeGreaterThanOrEqual(plots[1].frame.y);
          expect(point.y).toBeLessThanOrEqual(plots[1].frame.y + plots[1].frame.height);
        }
      }
      const last = wdfComparisonCsv(data, 100, phaseMode).split('\n').at(-1)!.split(',').map(Number);
      expect(last[6]).toBeCloseTo(phaseMode === 'unwrapped' ? -720 : 0, 8);
      expect(last[11]).toBeCloseTo(last[6], 8);
    }
  });

  it('preserves independent gaps in unwrapped WDF traces', () => {
    const samples = data.map((point, i) => ({ ...point, wdf: i === 50 ? { re: 0, im: 0 } : point.wdf }));
    const html = renderToStaticMarkup(<PreferencesProvider><WdfComparisonPlot {...range} {...controls} plotScales={{ ...scales, phaseMode: 'unwrapped' }} data={samples} sampleRate={100} mode="phase" /></PreferencesProvider>);
    const path = (key: string) => html.match(new RegExp(`data-trace="${key}" d="([^"]*)"`))![1];
    expect(path('wdf').match(/M/g)).toHaveLength(2);
    expect(path('analog').match(/M/g)).toHaveLength(1);
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
