import { useId, useMemo, useState } from "react";
import { decibels, formatEngineering, magnitude, phaseDegrees, sweepNetwork, type NetworkAnalysis } from "../lib/network";
import { frequencyPosition, frequencyTicks, linearTicks } from "../lib/plot-scales";
import { usePreferences } from "../lib/preferences";
import { PlotScaleControls, type PlotScaleProps } from "./PlotScaleControls";

export function FrequencyResponsePlot({ analysis, min, max, points, cutoff, band, mode, onModeChange, onExport, ...scales }: {
  analysis: NetworkAnalysis;
  min: number;
  max: number;
  points: number;
  cutoff: number;
  band?: { lower: number; upper: number };
  mode: "magnitude" | "phase";
  onModeChange: (mode: "magnitude" | "phase") => void;
  onExport: (csv: string) => void;
} & PlotScaleProps) {
  const { t, number, language, translate } = usePreferences();
  const { frequencyScale, magnitudeScale } = scales;
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [dbRange, setDbRange] = useState(100);
  const engineering = (value: number, unit = "Hz") => formatEngineering(value, unit, 4, language === "de" ? "de-DE" : "en-US");
  const samples = useMemo(() => {
    try {
      const data = sweepNetwork(analysis, min, max, points, frequencyScale);
      for (const frequency of band ? [band.lower, cutoff, band.upper] : [cutoff]) {
        if (frequency >= min && frequency <= max && !data.some(point => point.frequency === frequency))
          data.push({ frequency, ...analysis.evaluate(frequency) });
      }
      return {
        error: null,
        data: data.sort((a, b) => a.frequency - b.frequency).map(point => {
          const value = point.s21, amplitude = magnitude(value);
          const finite = Number.isFinite(value.re) && Number.isFinite(value.im) && Number.isFinite(amplitude);
          return { frequency: point.frequency, value, amplitude: finite ? amplitude : null,
            db: finite ? decibels(value) : null, phase: finite && amplitude > 0 ? phaseDegrees(value) : null };
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Frequenzgang nicht berechenbar.", data: [] };
    }
  }, [analysis, min, max, points, cutoff, band?.lower, band?.upper, frequencyScale]);
  const { data } = samples;
  const values = data.map(point => mode === "phase" ? point.phase : magnitudeScale === "db" ? point.db : point.amplitude);
  const finiteValues = values.filter((value): value is number => value !== null);
  const upper = mode === "phase" ? 180 : magnitudeScale === "db" ? 0 : 1;
  const lower = mode === "phase" ? -180 : magnitudeScale === "db" ? -dbRange : 0;
  const width = 940, height = 285, left = 65, right = 22, top = 24, bottom = 43;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (frequency: number) => left + frequencyPosition(frequency, min, max, frequencyScale) * plotWidth;
  const y = (value: number) => top + (1 - (Math.min(upper, Math.max(lower, value)) - lower) / (upper - lower)) * plotHeight;
  const yTicks = mode === "phase" ? [-180, -90, 0, 90, 180] : linearTicks(lower, upper);
  const path = values.map((value, i) => {
    if (value === null) return "";
    const previous = values[i - 1];
    const move = i === 0 || previous === null || (mode === "phase" && Math.abs(value - previous) > 180);
    return `${move ? "M" : "L"}${x(data[i].frequency).toFixed(2)},${y(value).toFixed(2)}`;
  }).join(" ");
  const hi = hover === null || data.length === 0 ? null : data.reduce((best, point, i) =>
    Math.abs(frequencyPosition(point.frequency, min, max, frequencyScale) - hover)
      < Math.abs(frequencyPosition(data[best].frequency, min, max, frequencyScale) - hover) ? i : best, 0);
  const markers = band ? [{ f: band.lower, label: "f₁" }, { f: cutoff, label: "f₀" }, { f: band.upper, label: "f₂" }]
    : [{ f: cutoff, label: "f₀" }];
  const visibleMarkers = markers.filter(marker => marker.f >= min && marker.f <= max);
  const formatted = (value: number | null, suffix = "") => value === null ? "—" : `${number(value, 6)}${suffix}`;
  const hasGaps = finiteValues.length < values.length;

  return <section className="frequency-response-section" aria-label={t("Frequenzgang S₂₁", "Frequency response S₂₁")}>
    <div className="response-heading">
      <div>
        <h2>{t("Frequenzgang S₂₁", "Frequency response S₂₁")}</h2>
        <p>{t("Übertragung von Tor 1 zu Tor 2. Der Frequenzbereich gilt für beide Diagramme.", "Transmission from port 1 to port 2. Both plots share the frequency range.")}</p>
      </div>
      <div className="segmented plot-mode" role="group" aria-label={t("Frequenzgang-Darstellung", "Frequency response view")}>
        <button className={mode === "magnitude" ? "active" : ""} aria-pressed={mode === "magnitude"} onClick={() => onModeChange("magnitude")}>{t("Betrag", "Magnitude")}</button>
        <button className={mode === "phase" ? "active" : ""} aria-pressed={mode === "phase"} onClick={() => onModeChange("phase")}>Phase</button>
      </div>
    </div>
    <div className="response-plot">
      <PlotScaleControls {...scales} quantity={mode === "phase" ? "phase" : "transfer"} />
      {samples.error ? <p className="empty-analysis" role="status">{translate(samples.error)}</p> : <>
        <div className="plot-legend">
          <span className="axis-description">
            {mode === "phase" ? "arg S₂₁ / °" : magnitudeScale === "linear" ? "|S₂₁|" : <label>
              20 log₁₀ |S₂₁| / dB · <select aria-label={t("Dämpfungsbereich des Frequenzgangs", "Frequency response attenuation range")} value={dbRange} onChange={event => setDbRange(Number(event.target.value))}>
                {[20, 60, 100, 160].map(range => <option key={range} value={range}>{t("bis", "to")} −{range} dB</option>)}
              </select>
            </label>}
          </span>
          <div><span className="frequency-response-legend"><i />S₂₁(f)</span></div>
          <button className="csv-button" onClick={() => onExport([
            "frequency_Hz,S21_real,S21_imag,S21_magnitude,S21_dB,S21_phase_deg",
            ...data.map(point => [point.frequency, point.amplitude === null ? "" : point.value.re, point.amplitude === null ? "" : point.value.im,
              point.amplitude ?? "", point.db ?? "", point.phase ?? ""].join(",")),
          ].join("\n"))}>{t("CSV exportieren ↗", "Export CSV ↗")}</button>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} role="img"
          aria-label={t(`Frequenzgang S₂₁ ${mode === "phase" ? "Phase in Grad" : magnitudeScale === "db" ? "Betrag in dB" : "linearer Betrag"} über ${frequencyScale === "log" ? "logarithmischer" : "linearer"} Frequenz`,
            `Frequency response S₂₁ ${mode === "phase" ? "phase in degrees" : magnitudeScale === "db" ? "magnitude in dB" : "linear magnitude"} versus ${frequencyScale === "log" ? "logarithmic" : "linear"} frequency`)}
          onPointerMove={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            const scale = Math.min(rect.width / width, rect.height / height);
            const offset = (rect.width - width * scale) / 2;
            const position = Math.max(0, Math.min(1, ((event.clientX - rect.left - offset) / scale - left) / plotWidth));
            setHover(position);
          }} onPointerLeave={() => setHover(null)}>
          <defs><clipPath id={`${id}-transfer-area`}><rect x={left} y={top - 1} width={plotWidth} height={plotHeight + 2} /></clipPath></defs>
          {yTicks.map(tick => <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="var(--plot-grid)" strokeDasharray={tick === 0 ? undefined : "3 4"} />
            <text x={left - 12} y={y(tick) + 4} textAnchor="end" className="plot-label">{number(tick, 4)}</text>
          </g>)}
          {frequencyTicks(min, max, frequencyScale).map(tick => <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={top} y2={height - bottom} stroke="var(--plot-grid-minor)" />
            <text x={x(tick)} y={height - bottom + 22} textAnchor="middle" className="plot-label">{engineering(tick)}</text>
          </g>)}
          <g clipPath={`url(#${id}-transfer-area)`}>
            {visibleMarkers.map(marker => <line key={marker.label} x1={x(marker.f)} x2={x(marker.f)} y1={top} y2={height - bottom} stroke="var(--plot-marker)" strokeDasharray="5 5" />)}
            <path d={path} stroke="var(--accent)" strokeWidth="2.6" fill="none" vectorEffect="non-scaling-stroke" />
            {hi !== null && <>
              <line x1={x(data[hi].frequency)} x2={x(data[hi].frequency)} y1={top} y2={height - bottom} stroke="var(--plot-cursor)" strokeDasharray="3 3" />
              {values[hi] !== null && <circle cx={x(data[hi].frequency)} cy={y(values[hi])} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
            </>}
          </g>
          {visibleMarkers.map(marker => <text key={marker.label} x={band ? marker.label === "f₁" ? left : marker.label === "f₂" ? width - right : x(cutoff) : Math.min(width - 140, x(cutoff) + 7)}
            y={14} textAnchor={band ? marker.label === "f₁" ? "start" : marker.label === "f₂" ? "end" : "middle" : "start"} className="cutoff-label">{marker.label} = {engineering(marker.f)}</text>)}
          <text x={width - right} y={height - 2} textAnchor="end" className="plot-label">{frequencyScale === "log" ? t("Frequenz · logarithmisch", "Frequency · logarithmic") : t("Frequenz · linear", "Frequency · linear")}</text>
        </svg>
        <div className="plot-readout">
          {hi === null ? <span>{t("Bewege den Mauszeiger über das Diagramm, um Messwerte abzulesen.", "Hover over the plot to read exact values.")}</span> : <>
            <strong>{engineering(data[hi].frequency)}</strong>
            <span>|S₂₁| <b>{formatted(data[hi].amplitude)}</b></span>
            <span><b>{data[hi].db !== null && data[hi].db <= -160 ? "≤ −160 dB" : formatted(data[hi].db, " dB")}</b></span>
            <span>φ <b>{formatted(data[hi].phase, "°")}</b></span>
          </>}
        </div>
        {hasGaps && <p className="plot-scale-note">{t("Nicht berechenbare Werte werden ausgelassen. Bei S₂₁ = 0 ist die Phase unbestimmt.", "Undefined values are omitted. The phase is undefined at S₂₁ = 0.")}</p>}
      </>}
    </div>
  </section>;
}
