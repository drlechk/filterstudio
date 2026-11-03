import { useId, useMemo, useState } from "react";
import type { NetworkAnalysis } from "../lib/network";
import {
  sweepNetwork,
  decibels,
  phaseDegrees,
  formatEngineering as engineering,
} from "../lib/network";

import { usePreferences } from "../lib/preferences";

type Key = "s21" | "s11" | "s12" | "s22";
const traces: { key: Key; label: string; color: string; dashed?: boolean }[] = [
  { key: "s21", label: "S₂₁", color: "var(--trace-s21)" },
  { key: "s11", label: "S₁₁", color: "var(--trace-s11)" },
  { key: "s12", label: "S₁₂", color: "var(--trace-s12)", dashed: true },
  { key: "s22", label: "S₂₂", color: "var(--trace-s22)", dashed: true },
];
export function ResponsePlot({
  analysis,
  min,
  max,
  points,
  cutoff,
  band,
  mode,
  onExport,
}: {
  analysis: NetworkAnalysis;
  min: number;
  max: number;
  points: number;
  cutoff: number;
  band?: { lower: number; upper: number };
  mode: "magnitude" | "phase";
  onExport?: (text: string) => void;
}) {
  const { language, t, translate, number } = usePreferences();
  const id = useId();
  const formatEngineering = (value: number, unit = "") =>
    engineering(value, unit, 4, language === "de" ? "de-DE" : "en-US");
  const [enabled, setEnabled] = useState<Key[]>(["s21", "s11"]);
  const [hover, setHover] = useState<number | null>(null);
  const [dbRange, setDbRange] = useState(100);
  const sweep = useMemo(() => {
    try {
      const data = sweepNetwork(analysis, min, max, points);
      // Include the exact center and band edges, so an ideal notch cannot fall between samples.
      for (const frequency of band
        ? [band.lower, cutoff, band.upper]
        : [cutoff]) {
        if (
          frequency >= min &&
          frequency <= max &&
          !data.some((d) => Math.abs(d.frequency / frequency - 1) < 1e-13)
        )
          data.push({ frequency, ...analysis.evaluate(frequency) });
      }
      data.sort((a, b) => a.frequency - b.frequency);
      if (
        data.some((d) =>
          traces.some(
            (t) =>
              !Number.isFinite(d[t.key].re) || !Number.isFinite(d[t.key].im),
          ),
        )
      )
        throw new Error(
          "Der gewählte Wertebereich überschreitet die numerische Genauigkeit. Bitte Frequenzbereich oder Bauteilwerte anpassen.",
        );
      return { data, error: null };
    } catch (e) {
      return {
        data: [],
        error:
          e instanceof Error ? e.message : "Frequenzgang nicht berechenbar.",
      };
    }
  }, [analysis, min, max, points, cutoff, band?.lower, band?.upper]);
  const data = sweep.data;
  if (sweep.error)
    return (
      <div className="empty-analysis" role="status">
        <h3>{t("Frequenzbereich prüfen", "Check the frequency range")}</h3>
        <p>{translate(sweep.error)}</p>
      </div>
    );
  const width = 940,
    height = 285,
    margin = { left: 51, right: 22, top: 24, bottom: 43 };
  const pw = width - margin.left - margin.right,
    ph = height - margin.top - margin.bottom;
  const x = (f: number) =>
    margin.left + (Math.log10(f / min) / Math.log10(max / min)) * pw;
  const value = (i: number, key: Key) =>
    mode === "magnitude" ? decibels(data[i][key]) : phaseDegrees(data[i][key]);
  const y = (v: number) =>
    margin.top +
    (mode === "magnitude"
      ? -Math.min(0, Math.max(-dbRange, v)) / dbRange
      : (180 - v) / 360) *
      ph;
  const yTicks =
    mode === "magnitude"
      ? dbRange === 3
        ? [0, -0.5, -1, -1.5, -2, -2.5, -3]
        : Array.from({ length: 6 }, (_, i) => (-dbRange * i) / 5)
      : [180, 90, 0, -90, -180];
  const xticks: number[] = [];
  for (
    let exp = Math.floor(Math.log10(min));
    exp <= Math.ceil(Math.log10(max));
    exp++
  )
    for (const m of [1, 2, 5]) {
      const f = m * 10 ** exp;
      if (f >= min * 0.999 && f <= max * 1.001) xticks.push(f);
    }
  if (xticks.length < 2) {
    xticks.length = 0;
    xticks.push(min, Math.sqrt(min * max), max);
  }
  const paths = Object.fromEntries(
    traces.map((t) => [
      t.key,
      data
        .map(
          (d, i) =>
            `${i === 0 || (mode === "phase" && i > 0 && Math.abs(value(i, t.key) - value(i - 1, t.key)) > 180) ? "M" : "L"}${x(d.frequency).toFixed(2)},${y(value(i, t.key)).toFixed(2)}`,
        )
        .join(" "),
    ]),
  );
  const hi =
    hover === null
      ? null
      : (() => {
          const target = Math.exp(
            Math.log(min) + hover * (Math.log(max) - Math.log(min)),
          );
          let left = 0,
            right = data.length - 1;
          while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (data[mid].frequency < target) left = mid + 1;
            else right = mid;
          }
          return left > 0 &&
            Math.abs(Math.log(data[left - 1].frequency / target)) <
              Math.abs(Math.log(data[left].frequency / target))
            ? left - 1
            : left;
        })();
  const markers = band
    ? [
        { frequency: band.lower, label: "f₁" },
        { frequency: cutoff, label: "f₀" },
        { frequency: band.upper, label: "f₂" },
      ]
    : [{ frequency: cutoff, label: "f₀" }];
  function exportCsv() {
    onExport?.(
      [
        "frequency_Hz,S11_real,S11_imag,S21_real,S21_imag,S12_real,S12_imag,S22_real,S22_imag",
        ...data.map((d) =>
          [
            d.frequency,
            d.s11.re,
            d.s11.im,
            d.s21.re,
            d.s21.im,
            d.s12.re,
            d.s12.im,
            d.s22.re,
            d.s22.im,
          ].join(","),
        ),
      ].join("\n"),
    );
  }
  return (
    <div className="response-plot">
      <div className="plot-legend">
        <span className="axis-description">
          {mode === "magnitude" ? (
            <select
              aria-label={t("Darstellungsbereich in dB", "Display range in dB")}
              value={dbRange}
              onChange={(e) => setDbRange(Number(e.target.value))}
            >
              <option value={100}>
                {t("Betrag · 0 bis −100 dB", "Magnitude · 0 to −100 dB")}
              </option>
              <option value={60}>
                {t("Betrag · 0 bis −60 dB", "Magnitude · 0 to −60 dB")}
              </option>
              <option value={20}>
                {t("Betrag · 0 bis −20 dB", "Magnitude · 0 to −20 dB")}
              </option>
              <option value={3}>
                {t("Durchlass · 0 bis −3 dB", "Passband · 0 to −3 dB")}
              </option>
            </select>
          ) : (
            "Phase / °"
          )}
        </span>
        <div>
          {traces.map((t) => (
            <button
              key={t.key}
              className={`trace-button ${enabled.includes(t.key) ? "" : "trace-off"}`}
              aria-pressed={enabled.includes(t.key)}
              onClick={() =>
                setEnabled(
                  enabled.includes(t.key)
                    ? enabled.filter((k) => k !== t.key)
                    : [...enabled, t.key],
                )
              }
            >
              <span style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
        <button className="csv-button" onClick={exportCsv}>
          {t("CSV exportieren ↗", "Export CSV ↗")}
        </button>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t(
          `${mode === "magnitude" ? "Betrag" : "Phase"} der S-Parameter über der logarithmischen Frequenz`,
          `S-parameter ${mode === "magnitude" ? "magnitude" : "phase"} versus logarithmic frequency`,
        )}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(r.width / width, r.height / height);
          const offset = (r.width - width * scale) / 2;
          setHover(
            Math.max(
              0,
              Math.min(
                1,
                ((e.clientX - r.left - offset) / scale - margin.left) / pw,
              ),
            ),
          );
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={`${id}-plot-area`}>
            <rect
              x={margin.left}
              y={margin.top - 1}
              width={pw}
              height={ph + 2}
            />
          </clipPath>
          <linearGradient id={`${id}-passband`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.055" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--plot-grid)"
              strokeDasharray={t === 0 ? "" : "3 4"}
            />
            <text
              x={margin.left - 14}
              y={y(t) + 4}
              textAnchor="end"
              className="plot-label"
            >
              {number(t, 4)}
            </text>
          </g>
        ))}
        {xticks.map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={margin.top}
              y2={height - margin.bottom}
              stroke="var(--plot-grid-minor)"
            />
            <text
              x={x(t)}
              y={height - margin.bottom + 22}
              textAnchor="middle"
              className="plot-label"
            >
              {formatEngineering(t, "Hz")}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${id}-plot-area)`}>
          {markers
            .filter(
              (marker) => marker.frequency >= min && marker.frequency <= max,
            )
            .map((marker) => (
              <line
                key={marker.label}
                x1={x(marker.frequency)}
                x2={x(marker.frequency)}
                y1={margin.top}
                y2={height - margin.bottom}
                stroke={
                  marker.label === "f₀"
                    ? "var(--plot-marker)"
                    : "var(--plot-marker-secondary)"
                }
                strokeDasharray={marker.label === "f₀" ? "5 5" : "3 4"}
              />
            ))}
          {traces
            .filter((t) => enabled.includes(t.key))
            .map((t) => (
              <path
                key={t.key}
                d={paths[t.key]}
                stroke={t.color}
                strokeWidth="2.6"
                strokeDasharray={t.dashed ? "7 5" : undefined}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ))}
        </g>
        {markers
          .filter(
            (marker) => marker.frequency >= min && marker.frequency <= max,
          )
          .map((marker) => (
            <text
              key={marker.label}
              x={
                band
                  ? marker.label === "f₁"
                    ? margin.left
                    : marker.label === "f₂"
                      ? width - margin.right
                      : x(cutoff)
                  : Math.min(width - 140, x(cutoff) + 7)
              }
              y={14}
              textAnchor={
                band
                  ? marker.label === "f₁"
                    ? "start"
                    : marker.label === "f₂"
                      ? "end"
                      : "middle"
                  : "start"
              }
              className="cutoff-label"
            >
              {marker.label} = {formatEngineering(marker.frequency, "Hz")}
            </text>
          ))}
        {hi !== null && (
          <g>
            <line
              x1={x(data[hi].frequency)}
              x2={x(data[hi].frequency)}
              y1={margin.top}
              y2={height - margin.bottom}
              stroke="var(--plot-cursor)"
              strokeDasharray="3 3"
            />
            {traces
              .filter((t) => enabled.includes(t.key))
              .map((t) => (
                <circle
                  key={t.key}
                  cx={x(data[hi].frequency)}
                  cy={y(value(hi, t.key))}
                  r="4"
                  fill={t.color}
                  stroke="var(--surface)"
                  strokeWidth="2"
                />
              ))}
          </g>
        )}
        <text
          x={width - margin.right}
          y={height - 2}
          textAnchor="end"
          className="plot-label"
        >
          {t("Frequenz · logarithmisch", "Frequency · logarithmic")}
        </text>
      </svg>
      <div className="plot-readout">
        {hi !== null ? (
          <>
            <strong>{formatEngineering(data[hi].frequency, "Hz")}</strong>
            {traces
              .filter((t) => enabled.includes(t.key))
              .map((t) => (
                <span key={t.key} style={{ color: t.color }}>
                  {t.label}{" "}
                  <b>
                    {mode === "magnitude" && value(hi, t.key) <= -160
                      ? "≤ −160"
                      : value(hi, t.key).toLocaleString(
                          language === "de" ? "de-DE" : "en-US",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            useGrouping: false,
                          },
                        )}{" "}
                    {mode === "magnitude" ? "dB" : "°"}
                  </b>
                </span>
              ))}
          </>
        ) : (
          <span>
            {t(
              "Bewege den Mauszeiger über das Diagramm, um Messwerte abzulesen.",
              "Hover over the plot to read exact values.",
            )}
          </span>
        )}
      </div>
    </div>
  );
}
