import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  decibels,
  magnitude,
  formatEngineering,
  type NetworkAnalysis,
} from "../lib/network";
import { usePreferences } from "../lib/preferences";
import { isBandResponse } from "../lib/frequency";
import {
  moveToleranceEdge,
  toleranceEdges,
  toleranceRegions,
  type Edge,
  type ToleranceDesign,
} from "../lib/tolerance";
import type { ToleranceSpec } from "../lib/types";
import { toleranceIssueLabels } from "./ToleranceControls";
import { attenuationAt, attenuationDb, attenuationPosition, attenuationValue, frequencyAt, frequencyPosition, frequencyTicks, linearTicks } from "../lib/plot-scales";
import { PlotScaleControls, type PlotScaleProps } from "./PlotScaleControls";

type Drag = {
  edge?: Edge;
  loss?: "passbandLoss" | "stopbandLoss";
  min: number;
  max: number;
  maximumLoss: number;
};
export function TolerancePlot({
  spec,
  design,
  preview,
  previewError,
  actual,
  onChange,
  ...scales
}: {
  spec: ToleranceSpec;
  design: ToleranceDesign;
  preview: NetworkAnalysis | null;
  previewError: string | null;
  actual: NetworkAnalysis | null;
  onChange: (spec: ToleranceSpec) => void;
} & PlotScaleProps) {
  const { t, language, number, translate } = usePreferences();
  const { frequencyScale, magnitudeScale } = scales;
  const [normalized, setNormalized] = useState(false),
    [showActual, setShowActual] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null),
    [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    id = useId().replace(/:/g, "");
  const edges = toleranceEdges(spec);
  const min = drag?.min ?? edges[0].frequency / 2,
    max = drag?.max ?? edges[edges.length - 1].frequency * 2;
  const reference = isBandResponse(spec.response)
    ? Math.sqrt(spec.passband[0] * spec.passband[1])
    : spec.passband[0];
  const width = 820,
    height = 340,
    left = magnitudeScale === "linear" ? 90 : 65,
    right = 20,
    top = 42,
    bottom = 50;
  const plotW = width - left - right,
    plotH = height - top - bottom;
  const maximumLoss =
    drag?.maximumLoss ?? Math.ceil((spec.stopbandLoss + 20) / 10) * 10;
  const x = (f: number) =>
    left + frequencyPosition(f, min, max, frequencyScale) * plotW;
  const y = (loss: number) => top + plotH * (1 - attenuationPosition(loss, maximumLoss, magnitudeScale));
  const yTicks = magnitudeScale === "db" ? Array.from({ length: maximumLoss / 10 + 1 }, (_, i) => i * 10)
    : [...new Set([1, ...linearTicks(1, attenuationValue(maximumLoss, "linear"))])];
  const lossText = (loss: number) => magnitudeScale === "db" ? `${number(loss)} dB` : `${number(attenuationValue(loss, "linear"), 5)}×`;
  const engineering = (v: number) =>
    formatEngineering(v, "Hz", 4, language === "de" ? "de-DE" : "en-US");
  const regions = toleranceRegions(spec, min, max);
  const samples = useMemo(() => {
    const frequencies = Array.from(
      { length: 701 },
      (_, i) => frequencyAt(i / 700, min, max, frequencyScale),
    );
    frequencies.push(...spec.passband, ...spec.stopband);
    if (preview && preview.fRef >= min && preview.fRef <= max)
      frequencies.push(preview.fRef);
    const sorted = [...new Set(frequencies)].sort((a, b) => a - b);
    return sorted.map((f) => ({
      f,
      proposed: preview ? -decibels(preview.evaluate(f).s21) : null,
      actual: showActual && actual ? -decibels(actual.evaluate(f).s21) : null,
    }));
  }, [min, max, preview, actual, showActual, spec.passband, spec.stopband, frequencyScale]);
  const path = (key: "proposed" | "actual") =>
    samples
      .map((sample, i) =>
        sample[key] !== null && Number.isFinite(sample[key])
          ? `${i === 0 || samples[i - 1][key] === null || !Number.isFinite(samples[i - 1][key]) ? "M" : "L"}${x(sample.f).toFixed(2)},${y(sample[key]!).toFixed(2)}`
          : "",
      )
      .join(" ");
  const tickReference = normalized ? reference : 1;
  const visibleTicks = frequencyTicks(min / tickReference, max / tickReference, frequencyScale).map(tick => tick * tickReference);
  const beginDrag = (
    event: PointerEvent<SVGGElement>,
    handle: Pick<Drag, "edge" | "loss">,
  ) => {
    event.preventDefault();
    svg.current?.setPointerCapture(event.pointerId);
    setDrag({ ...handle, min, max, maximumLoss });
  };
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(),
      scale = Math.min(rect.width / width, rect.height / height);
    return {
      x: (event.clientX - rect.left - (rect.width - width * scale) / 2) / scale,
      y:
        (event.clientY - rect.top - (rect.height - height * scale) / 2) / scale,
    };
  };
  const finishDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
  };
  return (
    <div className="tolerance-content">
      <div className="response-heading">
        <div>
          <h2>
            {t("Entwurf mit Toleranzschema", "Design from a tolerance mask")}
          </h2>
          <p>
            {t(
              "Grenzen verschieben und den zulässigen Dämpfungsverlauf festlegen.",
              "Move the boundaries to specify the allowed attenuation response.",
            )}
          </p>
        </div>
        <div
          className="segmented tolerance-axis"
          aria-label={t("Frequenzachse", "Frequency axis")}
        >
          <button
            className={!normalized ? "active" : ""}
            aria-pressed={!normalized}
            onClick={() => setNormalized(false)}
          >
            f / Hz
          </button>
          <button
            className={normalized ? "active" : ""}
            aria-pressed={normalized}
            onClick={() => setNormalized(true)}
          >
            Ω = f/fᵣₑ𝒻
          </button>
        </div>
      </div>
      <PlotScaleControls {...scales} quantity="attenuation" />
      <div className="tolerance-legend">
        <span>
          <i className="mask-swatch" />
          {t("Schraffiert: unzulässig", "Hatched: forbidden")}
        </span>
        <span>
          <i className="preview-swatch" />
          {t("Vorschau des Entwurfs", "Design preview")}
        </span>
        <label>
          <input
            type="checkbox"
            checked={showActual}
            onChange={(e) => setShowActual(e.target.checked)}
          />
          {t("Aktuelle Schaltung vergleichen", "Compare current circuit")}
        </label>
      </div>
      <svg
        ref={svg}
        className="tolerance-plot"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={t(
          `Interaktives Toleranzschema: Dämpfung ${magnitudeScale === "db" ? "in dB" : "als linearer Faktor"} über ${frequencyScale === "log" ? "logarithmischer" : "linearer"} Frequenz`,
          `Interactive tolerance mask: attenuation ${magnitudeScale === "db" ? "in dB" : "as a linear factor"} versus ${frequencyScale === "log" ? "logarithmic" : "linear"} frequency`,
        )}
        onPointerMove={(event) => {
          const p = point(event),
            ratio = Math.max(0, Math.min(1, (p.x - left) / plotW));
          const frequency = frequencyAt(ratio, min, max, frequencyScale);
          if (drag?.edge)
            onChange(
              moveToleranceEdge(
                spec,
                drag.edge.band,
                drag.edge.index,
                frequency,
              ),
            );
          else if (drag?.loss) {
            const low = drag.loss === "passbandLoss" ? 0.1 : 20,
              high = drag.loss === "passbandLoss" ? 3 : 80;
            const loss =
              Math.round(
                Math.max(
                  low,
                  Math.min(high, attenuationAt((top + plotH - p.y) / plotH, maximumLoss, magnitudeScale)),
                ) * 100,
              ) / 100;
            onChange({ ...spec, [drag.loss]: loss });
          } else setHover(frequency);
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={() => setDrag(null)}
        onPointerLeave={() => {
          if (!drag) setHover(null);
        }}
      >
        <defs>
          <pattern
            id={`${id}-hatch`}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <rect width="7" height="7" fill="var(--warning-soft)" />
            <path d="M0 0V7" stroke="var(--warning)" opacity=".32" />
          </pattern>
          <clipPath id={`${id}-clip`}>
            <rect x={left} y={top} width={plotW} height={plotH} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-clip)`}>
          {regions.passband.map(([from, to], i) => (
            <rect
              key={`p${i}`}
              x={x(from)}
              y={top}
              width={Math.max(0, x(to) - x(from))}
              height={y(spec.passbandLoss) - top}
              fill={`url(#${id}-hatch)`}
            />
          ))}
          {regions.stopband.map(([from, to], i) => (
            <rect
              key={`s${i}`}
              x={x(from)}
              y={y(spec.stopbandLoss)}
              width={Math.max(0, x(to) - x(from))}
              height={y(0) - y(spec.stopbandLoss)}
              fill={`url(#${id}-hatch)`}
            />
          ))}
          {yTicks.map(
            (tick) => (
              <line
                key={tick}
                x1={left}
                x2={width - right}
                y1={y(attenuationDb(tick, magnitudeScale))}
                y2={y(attenuationDb(tick, magnitudeScale))}
                stroke="var(--plot-grid)"
                strokeDasharray="3 5"
              />
            ),
          )}
          {visibleTicks.map((f) => (
            <line
              key={f}
              x1={x(f)}
              x2={x(f)}
              y1={top}
              y2={top + plotH}
              stroke="var(--plot-grid-minor)"
            />
          ))}
          <line
            x1={left}
            x2={width - right}
            y1={y(spec.passbandLoss)}
            y2={y(spec.passbandLoss)}
            stroke="var(--success-text)"
            strokeDasharray="5 4"
          />
          <line
            x1={left}
            x2={width - right}
            y1={y(spec.stopbandLoss)}
            y2={y(spec.stopbandLoss)}
            stroke="var(--trace-s22)"
            strokeDasharray="5 4"
          />
          {preview && (
            <path
              d={path("proposed")}
              fill="none"
              stroke="var(--trace-s21)"
              strokeWidth="2.2"
            />
          )}
          {showActual && actual && (
            <path
              d={path("actual")}
              fill="none"
              stroke="var(--trace-s11)"
              strokeWidth="1.6"
              strokeDasharray="5 4"
            />
          )}
        </g>
        <text x="9" y="17" className="mask-axis-label">
          {magnitudeScale === "db" ? "A / dB" : "A = 1/|S₂₁|"}
        </text>
        {yTicks.map(
          (tick) => (
            <text
              key={tick}
              x={left - 32}
              y={y(attenuationDb(tick, magnitudeScale)) + 4}
              textAnchor="end"
              className="mask-tick"
            >
              {number(tick, 5)}
            </text>
          ),
        )}
        {visibleTicks.map((f) => (
          <text
            key={f}
            x={x(f)}
            y={height - bottom + 22}
            textAnchor="middle"
            className="mask-tick"
          >
            {normalized ? number(f / reference, 3) : engineering(f)}
          </text>
        ))}
        <text
          x={left + plotW / 2}
          y={height - 7}
          textAnchor="middle"
          className="mask-axis-label"
        >
          {normalized
            ? `Ω = f / f_ref · f_ref = ${engineering(reference)} · ${frequencyScale === "log" ? t("logarithmisch", "logarithmic") : "linear"}`
            : frequencyScale === "log" ? t("Frequenz f · logarithmisch", "Frequency f · logarithmic") : t("Frequenz f · linear", "Frequency f · linear")}
        </text>
        {edges.map((edge, i) => (
          <g
            key={`${edge.band}-${edge.index}`}
            role="slider"
            aria-orientation="horizontal"
            tabIndex={0}
            aria-label={`${edge.band === "passband" ? t("Grenzfrequenz", "Passband edge") : t("Sperrfrequenz", "Stopband edge")} ${edge.symbol}`}
            aria-valuemin={1}
            aria-valuemax={1e12}
            aria-valuenow={edge.frequency}
            aria-valuetext={engineering(edge.frequency)}
            className="mask-frequency-handle"
            onPointerDown={(event) => beginDrag(event, { edge })}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                onChange(
                  moveToleranceEdge(
                    spec,
                    edge.band,
                    edge.index,
                    event.key === "Home"
                      ? 1
                      : event.key === "End"
                        ? 1e12
                        : frequencyAt(frequencyPosition(edge.frequency, min, max, frequencyScale) + (event.key === "ArrowLeft" ? -.01 : .01), min, max, frequencyScale),
                  ),
                );
              }
            }}
          >
            <line
              x1={x(edge.frequency)}
              x2={x(edge.frequency)}
              y1={top - 4}
              y2={top + plotH}
              stroke={
                edge.band === "passband"
                  ? "var(--success-text)"
                  : "var(--trace-s22)"
              }
              strokeDasharray="4 4"
            />
            <line
              x1={x(edge.frequency)}
              x2={x(edge.frequency)}
              y1={top - 20}
              y2={top + plotH + 4}
              stroke="transparent"
              strokeWidth="16"
            />
            <circle
              cx={x(edge.frequency)}
              cy={top + plotH}
              r="5"
              fill="var(--surface)"
              stroke={
                edge.band === "passband"
                  ? "var(--success-text)"
                  : "var(--trace-s22)"
              }
              strokeWidth="2"
            />
            <text
              x={x(edge.frequency)}
              y={i % 2 ? top - 11 : top - 26}
              textAnchor="middle"
              className="mask-edge-label"
            >
              {edge.symbol} ={" "}
              {normalized
                ? number(edge.frequency / reference, 4)
                : engineering(edge.frequency)}
            </text>
          </g>
        ))}
        {(["passbandLoss", "stopbandLoss"] as const).map((key) => {
          const pass = key === "passbandLoss",
            color = pass ? "var(--success-text)" : "var(--trace-s22)";
          return (
            <g
              key={key}
              role="slider"
              aria-orientation="vertical"
              tabIndex={0}
              aria-label={
                pass
                  ? t("Maximale Durchlassdämpfung", "Maximum passband loss")
                  : t("Minimale Sperrdämpfung", "Minimum stopband attenuation")
              }
              aria-valuemin={pass ? 0.1 : 20}
              aria-valuemax={pass ? 3 : 80}
              aria-valuenow={spec[key]}
              aria-valuetext={magnitudeScale === "db" ? lossText(spec[key]) : `${lossText(spec[key])} (${number(spec[key])} dB)`}
              className="mask-loss-handle"
              onPointerDown={(event) => beginDrag(event, { loss: key })}
              onKeyDown={(event) => {
                if (
                  ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const min = pass ? 0.1 : 20,
                    max = pass ? 3 : 80;
                  onChange({
                    ...spec,
                    [key]:
                      event.key === "Home"
                        ? min
                        : event.key === "End"
                          ? max
                          : Math.max(
                              min,
                              Math.min(
                                max,
                                Math.round(
                                  (spec[key] +
                                    (event.key === "ArrowUp" ? 1 : -1) *
                                      (pass ? 0.05 : 1)) *
                                    100,
                                ) / 100,
                              ),
                            ),
                  });
                }
              }}
            >
              <circle
                cx={left - 14}
                cy={y(spec[key])}
                r="13"
                fill="transparent"
              />
              <circle
                cx={left - 14}
                cy={y(spec[key])}
                r="5"
                fill="var(--surface)"
                stroke={color}
                strokeWidth="2"
              />
              <text
                x={left + 8}
                y={y(spec[key]) - 8}
                className="mask-edge-label"
                fill={color}
              >
                {pass ? "Aₚ" : "Aₛ"} = {lossText(spec[key])}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mask-readout">
        {hover && preview ? (
          <span>
            f = {engineering(hover)} · A ={" "}
            {magnitudeScale === "db" ? `${number(Math.max(0, -decibels(preview.evaluate(hover).s21)), 5)} dB`
              : `${number(1 / magnitude(preview.evaluate(hover).s21), 6)}×`}
          </span>
        ) : (
          <span>
            {t(
              "Linien und Kreise ziehen · Pfeiltasten für fokussierte Grenzen · Schieber links für genaue Vorgaben.",
              "Drag lines and circles · arrow keys adjust focused boundaries · use the sliders on the left for precise requirements.",
            )}
          </span>
        )}
      </div>
      <p className="mask-equation">
        {magnitudeScale === "db" ? "A(f) = −20 log₁₀|S₂₁(f)|" : "A(f) = 1/|S₂₁(f)|"} ·{" "}
        {t(
          "Durchlass: A ≤ Aₚ · Sperrbereich: A ≥ Aₛ",
          "Passband: A ≤ Aₚ · stopband: A ≥ Aₛ",
        )}
      </p>
      {design.issue ? (
        <p className="band-validation" role="status">
          {t(...toleranceIssueLabels[design.issue])}
        </p>
      ) : previewError ? (
        <p className="band-validation" role="status">
          {translate(previewError)}
        </p>
      ) : (
        <p className="mask-footnote">
          {t(
            "Die Vorschau zeigt den Entwurf. Erst „Schaltung generieren“ übernimmt ihn in den Editor.",
            "The preview shows the design. Choose “Generate circuit” to apply it to the editor.",
          )}
        </p>
      )}
      {isBandResponse(spec.response) && (
        <p className="mask-footnote">
          {t(
            "Für die Bandtransformation bleiben beide Durchlassgrenzen fest; die strengere Sperrseite bestimmt den Prototypgrad. Übergangsbereiche sind frei.",
            "The band transformation keeps both passband edges fixed; the stricter stopband edge determines the prototype order. Transition bands are unconstrained.",
          )}
        </p>
      )}
    </div>
  );
}
