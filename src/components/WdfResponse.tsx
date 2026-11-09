import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FrequencyInput } from './FrequencyInput';
import { PlotScaleControls, type PlotScaleProps } from './PlotScaleControls';
import { usePreferences } from '../lib/preferences';
import { formatEngineering, type NetworkAnalysis } from '../lib/network';
import { bandEdges, isBandResponse } from '../lib/frequency';
import type { FrequencyUnit } from '../lib/frequency-units';
import { frequencyPosition, frequencyTicks } from '../lib/plot-scales';
import { downloadFile, orderedSections } from '../lib/project';
import type { Project } from '../lib/types';
import { analogToDigitalFrequency, sweepWdfComparison, transferReadout, wdfComparisonCsv, wdfPlotRange, type WdfComparisonSample } from '../lib/wdf-response';

type PlotControls = { plotScales: PlotScaleProps; dbRange: number; onDbRangeChange: (range: number) => void };
const traces = [{ key: 'wdf', color: 'var(--trace-s21)' }, { key: 'analog', color: 'var(--trace-s11)' }] as const;

export function WdfComparisonPlot({ data, min, max, cutoff, sampleRate, mode, plotScales, dbRange, onDbRangeChange }: {
  data: WdfComparisonSample[]; min: number; max: number; cutoff: number; sampleRate: number; mode: 'magnitude' | 'phase';
} & PlotControls) {
  const { t, number, language } = usePreferences();
  const { frequencyScale, magnitudeScale } = plotScales;
  const id = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(940);
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const available = entries[0]?.contentRect.width ?? 0;
      if (available > 0) setWidth(Math.max(280, Math.min(940, Math.round(available))));
    });
    if (plotRef.current) observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, []);
  const [enabled, setEnabled] = useState<string[]>(['wdf', 'analog']);
  const [hover, setHover] = useState<number | null>(null);
  const label = (key: string) => key === 'wdf' ? 'WDF' : t('Analog · Referenz', 'Analog · reference');
  const engineering = (f: number) => formatEngineering(f, 'Hz', 5, language);
  const height = 285, left = 51, right = 22, top = width < 520 ? 42 : 24, bottom = 43;
  const pw = width - left - right, ph = height - top - bottom;
  const x = (frequency: number) => left + frequencyPosition(frequency, min, max, frequencyScale) * pw;
  let previousTickX = -Infinity;
  const xTicks = frequencyTicks(min, max, frequencyScale).filter(tick => {
    if (x(tick) - previousTickX < 70) return false;
    previousTickX = x(tick);
    return true;
  });
  const upper = mode === 'phase' ? 180 : magnitudeScale === 'db' ? 0 : 1;
  const lower = mode === 'phase' ? -180 : magnitudeScale === 'db' ? -dbRange : 0;
  const y = (value: number) => top + (upper - Math.max(lower, Math.min(upper, value))) / (upper - lower) * ph;
  const yTicks = mode === 'phase' ? [180, 90, 0, -90, -180] : magnitudeScale === 'db' && dbRange === 3
    ? [0, -.5, -1, -1.5, -2, -2.5, -3] : Array.from({ length: 6 }, (_, i) => upper + (lower - upper) * i / 5);
  const curves = traces.map(trace => {
    const values = data.map(point => {
      const readout = transferReadout(point[trace.key]);
      return mode === 'phase' ? readout.phase : magnitudeScale === 'db' ? readout.db : readout.amplitude;
    });
    const path = values.map((value, i) => {
      if (value === null) return '';
      const previous = values[i - 1];
      const move = i === 0 || previous === null || (mode === 'phase' && Math.abs(value - previous) > 180);
      return `${move ? 'M' : 'L'}${x(data[i].frequency).toFixed(2)},${y(value).toFixed(2)}`;
    }).join(' ');
    return { ...trace, values, path };
  });
  const hi = hover === null || !data.length ? null : data.reduce((best, point, i) =>
    Math.abs(frequencyPosition(point.frequency, min, max, frequencyScale) - hover) < Math.abs(frequencyPosition(data[best].frequency, min, max, frequencyScale) - hover) ? i : best, 0);
  const markers = [{ frequency: analogToDigitalFrequency(cutoff, sampleRate), label: 'f₀,WDF', color: traces[0].color },
    { frequency: cutoff, label: 'f₀,analog', color: traces[1].color }].filter(marker => marker.frequency >= min && marker.frequency <= max);
  const hasGaps = curves.some(curve => enabled.includes(curve.key) && curve.values.some(value => value === null));
  return <section className="wdf-response-plot" aria-label={mode === 'phase' ? t('WDF-Phasengang', 'WDF phase response') : t('WDF-Betragsgang', 'WDF magnitude response')}>
    <div className="response-heading"><h3>{mode === 'phase' ? t('Phasengang', 'Phase response') : t('Betragsgang', 'Magnitude response')}</h3></div>
    <div className="response-plot" ref={plotRef}>
      <PlotScaleControls {...plotScales} quantity={mode === 'phase' ? 'phase' : 'transfer'} />
      <div className="plot-legend">
        <span className="axis-description">{mode === 'phase' ? 'arg S₂₁ / °' : magnitudeScale === 'linear' ? '|S₂₁| · 0–1' :
          <select aria-label={t('Darstellungsbereich in dB', 'Display range in dB')} value={dbRange} onChange={e => onDbRangeChange(Number(e.target.value))}>
            {[100, 60, 20, 3].map(range => <option key={range} value={range}>{t('Betrag · 0 bis', 'Magnitude · 0 to')} −{range} dB</option>)}
          </select>}</span>
        <div>{curves.map(curve => <button key={curve.key} className={`trace-button ${enabled.includes(curve.key) ? '' : 'trace-off'}`} aria-pressed={enabled.includes(curve.key)}
          onClick={() => setEnabled(previous => previous.includes(curve.key) ? previous.filter(key => key !== curve.key) : [...previous, curve.key])}>
          <span className={curve.key === 'analog' ? 'wdf-reference-swatch' : ''} style={{ color: curve.color, background: curve.key === 'analog' ? 'none' : curve.color }} />{label(curve.key)}
        </button>)}</div>
        <button className="csv-button" onClick={() => downloadFile('filterstudio-wdf-comparison.csv', wdfComparisonCsv(data, sampleRate), 'text/csv')}>{t('CSV exportieren ↗', 'Export CSV ↗')}</button>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t(
        `WDF und analoge Referenz: ${mode === 'phase' ? 'Phase in Grad' : magnitudeScale === 'db' ? 'Betrag in dB' : 'linearer Betrag'} über ${frequencyScale === 'log' ? 'logarithmischer' : 'linearer'} Frequenz`,
        `WDF and analog reference: ${mode === 'phase' ? 'phase in degrees' : magnitudeScale === 'db' ? 'magnitude in dB' : 'linear magnitude'} versus ${frequencyScale === 'log' ? 'logarithmic' : 'linear'} frequency`)}
        onPointerMove={event => {
          const rect = event.currentTarget.getBoundingClientRect(), scale = Math.min(rect.width / width, rect.height / height);
          const offset = (rect.width - width * scale) / 2;
          setHover(Math.max(0, Math.min(1, ((event.clientX - rect.left - offset) / scale - left) / pw)));
        }} onPointerLeave={() => setHover(null)}>
        <defs><clipPath id={`${id}-area`}><rect x={left} y={top - 1} width={pw} height={ph + 2} /></clipPath></defs>
        {yTicks.map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="var(--plot-grid)" strokeDasharray={tick === 0 ? undefined : '3 4'} />
          <text x={left - 12} y={y(tick) + 4} textAnchor="end" className="plot-label">{number(tick, 4)}</text></g>)}
        {xTicks.map(tick => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height - bottom} stroke="var(--plot-grid-minor)" />
          <text x={x(tick)} y={height - bottom + 22} textAnchor="middle" className="plot-label">{engineering(tick)}</text></g>)}
        <g clipPath={`url(#${id}-area)`}>
          {markers.map(marker => <line key={marker.label} x1={x(marker.frequency)} x2={x(marker.frequency)} y1={top} y2={height - bottom} stroke={marker.color} opacity=".4" strokeDasharray="3 4" />)}
          {curves.filter(curve => enabled.includes(curve.key)).map(curve => <path key={curve.key} data-trace={curve.key} d={curve.path} stroke={curve.color} strokeWidth="2.6"
            strokeDasharray={curve.key === 'analog' ? '7 5' : undefined} fill="none" vectorEffect="non-scaling-stroke" />)}
          {hi !== null && <><line x1={x(data[hi].frequency)} x2={x(data[hi].frequency)} y1={top} y2={height - bottom} stroke="var(--plot-cursor)" strokeDasharray="3 3" />
            {curves.filter(curve => enabled.includes(curve.key) && curve.values[hi] !== null).map(curve => <circle key={curve.key} cx={x(data[hi].frequency)} cy={y(curve.values[hi]!)} r="4" fill={curve.color} stroke="var(--surface)" strokeWidth="2" />)}</>}
        </g>
        {markers.map((marker, i) => <text key={marker.label} x={width < 520 || i === 0 ? left : width - right} y={width < 520 ? 14 + 16 * i : 14} textAnchor={width < 520 || i === 0 ? 'start' : 'end'} className="cutoff-label">{marker.label} = {engineering(marker.frequency)}</text>)}
        <text x={width - right} y={height - 2} textAnchor="end" className="plot-label">{frequencyScale === 'log' ? t('Frequenz · logarithmisch', 'Frequency · logarithmic') : t('Frequenz · linear', 'Frequency · linear')}</text>
      </svg>
      <div className="plot-readout">{hi === null ? <span>{t('Bewege den Mauszeiger über das Diagramm, um Messwerte abzulesen.', 'Hover over the plot to read exact values.')}</span> : <>
        <strong>{engineering(data[hi].frequency)}</strong>{curves.filter(curve => enabled.includes(curve.key)).map(curve => <span key={curve.key} style={{ color: curve.color }}>{label(curve.key)}{' '}
          <b>{curve.values[hi] === null ? '—' : mode === 'magnitude' && magnitudeScale === 'db' && curve.values[hi]! <= -160 ? '≤ −160' : number(curve.values[hi]!, 7)}{mode === 'phase' ? '°' : magnitudeScale === 'db' ? ' dB' : ''}</b></span>)}</>}</div>
      {hasGaps && <p className="plot-scale-note">{t('Nicht berechenbare Werte werden ausgelassen. Bei S₂₁ = 0 ist die Phase unbestimmt.', 'Undefined values are omitted. The phase is undefined at S₂₁ = 0.')}</p>}
    </div>
  </section>;
}

export function WdfResponse({ project, analysis, sampleRate, ...controls }: {
  project: Project; analysis: NetworkAnalysis; sampleRate: number;
} & PlotControls) {
  const { t, translate, language } = usePreferences();
  const [requested, setRequested] = useState<{ min: number; max: number } | null>(null);
  const [unit, setUnit] = useState<FrequencyUnit>(() => sampleRate >= 1e9 ? 'GHz' : sampleRate >= 1e6 ? 'MHz' : sampleRate >= 1e3 ? 'kHz' : 'Hz');
  const nyquist = sampleRate / 2;
  const range = wdfPlotRange(requested ?? project.sweep, sampleRate, controls.plotScales.frequencyScale);
  const sampled = useMemo(() => {
    try {
      const landmarks = [project.settings.cutoff];
      if (isBandResponse(project.settings.response)) landmarks.push(...Object.values(bandEdges(project.settings)));
      for (const section of orderedSections(project.nodes, project.wires)) {
        if (section.kind === 'LC') landmarks.push(1 / (2 * Math.PI * Math.sqrt(section.value) * Math.sqrt(section.value2!)));
      }
      return { data: sweepWdfComparison(analysis, sampleRate, { ...range, points: project.sweep.points }, controls.plotScales.frequencyScale, landmarks), error: null };
    } catch (e) { return { data: [], error: e instanceof Error ? e.message : String(e) }; }
  }, [analysis, sampleRate, range.min, range.max, project.sweep.points, controls.plotScales.frequencyScale, project.settings, project.nodes, project.wires]);
  return <section className="wdf-response" aria-label={t('WDF-Übertragungsfunktion und analoge Referenz', 'WDF transfer function and analog reference')}>
    <div className="response-heading"><div><h2>{t('WDF-Übertragungsfunktion und analoge Referenz', 'WDF transfer function and analog reference')}</h2>
      <p>{t('S₂₁ mit derselben Normierung wie in der analogen Analyse. Beide Kurven werden bei derselben Frequenz verglichen; die bilineare Frequenzverzerrung bleibt sichtbar.',
        'S₂₁ uses the same normalization as the analog analysis. Both curves are compared at the same frequency, revealing the bilinear frequency warping.')}</p></div></div>
    <div className="wdf-response-range">
      <label><span>{t('Startfrequenz', 'Start frequency')}</span><FrequencyInput label={t('WDF-Startfrequenz', 'WDF start frequency')} value={range.min} unit={unit} onUnitChange={setUnit}
        min={controls.plotScales.frequencyScale === 'linear' ? 0 : Math.min(.001, range.max / 1000)} max={range.max * .999} onChange={min => setRequested({ ...range, min })} /></label>
      <label><span>{t('Endfrequenz', 'End frequency')}</span><FrequencyInput label={t('WDF-Endfrequenz', 'WDF end frequency')} value={range.max} unit={unit} onUnitChange={setUnit}
        min={Math.max(.001, range.min * 1.001)} max={nyquist} onChange={max => setRequested({ ...range, max })} /></label>
      <div><span>Nyquist · fₛ/2 = {formatEngineering(nyquist, 'Hz', 5, language)}</span>
        <button className="button" onClick={() => setRequested({ min: controls.plotScales.frequencyScale === 'linear' ? 0 : nyquist / 1000, max: nyquist })}>{t('Bis Nyquist', 'Up to Nyquist')}</button></div>
    </div>
    {sampled.error ? <p className="empty-analysis" role="status">{translate(sampled.error)}</p> : <>
      <WdfComparisonPlot {...controls} {...range} data={sampled.data} sampleRate={sampleRate} cutoff={project.settings.cutoff} mode="magnitude" />
      <WdfComparisonPlot {...controls} {...range} data={sampled.data} sampleRate={sampleRate} cutoff={project.settings.cutoff} mode="phase" />
    </>}
  </section>;
}
