import { useEffect, useId, useRef, useState } from "react";
import { usePreferences } from "../lib/preferences";
import { formatEngineering } from "../lib/network";
import { filterDegree, isBandResponse } from "../lib/frequency";
import {
  moveToleranceEdge,
  toleranceEdges,
  type ToleranceDesign,
  type ToleranceIssue,
} from "../lib/tolerance";
import type { FilterFamily, ToleranceSpec } from "../lib/types";
import { frequencyUnits, frequencyUnitScale, isFrequencyUnit, type FrequencyUnit } from "../lib/frequency-units";
import { formatUnitValue, parseUnitValue } from "../lib/unit-values";

export const toleranceIssueLabels: Record<ToleranceIssue, [string, string]> = {
  frequencies: [
    "Die Frequenzgrenzen müssen in der zum Filtertyp passenden Reihenfolge zwischen 1 Hz und 1 THz liegen.",
    "Frequency edges must be ordered for the selected response type and lie between 1 Hz and 1 THz.",
  ],
  attenuation: [
    "Unterstützt: Durchlassdämpfung 0,1–3 dB und Sperrdämpfung 20–80 dB.",
    "Supported: passband loss 0.1–3 dB and stopband attenuation 20–80 dB.",
  ],
  order: [
    "Mit den verfügbaren Filterordnungen ist dieses Toleranzschema nicht realisierbar. Übergangsbereich verbreitern, Sperrdämpfung verringern oder die Filterfamilie wechseln.",
    "This mask cannot be realized with the available filter orders. Widen the transition band, reduce stopband attenuation, or change the filter family.",
  ],
  range: [
    "Die abgeleiteten Bauteilfrequenzen oder die Bandbreite liegen außerhalb des unterstützten Bereichs. Frequenzen oder Bandbreite anpassen.",
    "The derived component frequencies or bandwidth are outside the supported range. Adjust the frequencies or bandwidth.",
  ],
};

function SpecSlider({
  label,
  symbol,
  value,
  min,
  max,
  step,
  unit,
  scale = 1,
  logarithmic = false,
  onChange,
}: {
  label: string;
  symbol: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  scale?: number;
  logarithmic?: boolean;
  onChange: (value: number) => void;
}) {
  const { language, t, number } = usePreferences();
  const id = useId();
  const format = (value: number) => formatUnitValue(value, scale, language);
  const [draft, setDraft] = useState(() => format(value));
  const [invalid, setInvalid] = useState(false);
  const dirty = useRef(false);
  useEffect(() => {
    setDraft(format(value));
    setInvalid(false);
    dirty.current = false;
  }, [value, scale, language]);
  const commit = () => {
    if (!dirty.current) return;
    const next = parseUnitValue(draft, scale, min, max);
    if (next === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    dirty.current = false;
    setDraft(format(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className={`spec-slider ${invalid ? "is-invalid" : ""}`}>
      <label htmlFor={id}>
        {label}
        <span>{symbol}</span>
      </label>
      <div className="spec-value">
        <input
          aria-label={`${label} (${unit})`}
          aria-invalid={invalid}
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            dirty.current = true;
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              dirty.current = false;
              setDraft(format(value));
              setInvalid(false);
            }
          }}
        />
        <span>{unit}</span>
      </div>
      <input
        id={id}
        type="range"
        aria-label={label}
        min={logarithmic ? Math.log10(min) : min}
        max={logarithmic ? Math.log10(max) : max}
        step={step}
        value={logarithmic ? Math.log10(value) : value}
        aria-valuetext={`${number(value / scale, 6)} ${unit}`}
        onChange={(e) =>
          onChange(
            logarithmic ? 10 ** Number(e.target.value) : Number(e.target.value),
          )
        }
      />
      {invalid && (
        <small role="status">
          {t("Zulässig:", "Allowed:")} {number(min / scale)}–
          {number(max / scale)} {unit}
        </small>
      )}
    </div>
  );
}

export function ToleranceControls({
  spec,
  design,
  family,
  frequencyUnit,
  onFrequencyUnitChange,
  onChange,
}: {
  spec: ToleranceSpec;
  design: ToleranceDesign;
  family: FilterFamily;
  frequencyUnit: FrequencyUnit;
  onFrequencyUnitChange: (unit: FrequencyUnit) => void;
  onChange: (spec: ToleranceSpec) => void;
}) {
  const { t, language } = usePreferences();
  const band = isBandResponse(spec.response);
  return (
    <div className="tolerance-controls">
      <div className="spec-section-title">
        <span>{t("Frequenzgrenzen", "Frequency edges")}</span>
        <select
          aria-label={t("Frequenzeinheit", "Frequency unit")}
          value={frequencyUnit}
          onChange={(e) => {
            if (isFrequencyUnit(e.target.value)) onFrequencyUnitChange(e.target.value);
          }}
        >
          {frequencyUnits.map((u) => (
            <option key={u.symbol} value={u.symbol}>
              {u.symbol}
            </option>
          ))}
        </select>
      </div>
      {toleranceEdges(spec).map((edge) => (
        <SpecSlider
          key={`${edge.band}-${edge.index}`}
          label={
            edge.band === "passband"
              ? band
                ? edge.index === 0
                  ? t("Untere Durchlassgrenze", "Lower passband edge")
                  : t("Obere Durchlassgrenze", "Upper passband edge")
                : t("Grenzfrequenz", "Passband edge")
              : band
                ? edge.index === 0
                  ? t("Untere Sperrfrequenz", "Lower stopband edge")
                  : t("Obere Sperrfrequenz", "Upper stopband edge")
                : t("Sperrfrequenz", "Stopband edge")
          }
          symbol={edge.symbol}
          value={edge.frequency}
          min={1}
          max={1e12}
          step={0.001}
          unit={frequencyUnit}
          scale={frequencyUnitScale(frequencyUnit)}
          logarithmic
          onChange={(f) =>
            onChange(moveToleranceEdge(spec, edge.band, edge.index, f))
          }
        />
      ))}
      <p className="spec-hint">
        {t(
          "Frequenzschieber logarithmisch · Werte auch direkt eingebbar.",
          "Frequency sliders use a logarithmic scale · exact values can also be typed.",
        )}
      </p>
      <div className="spec-section-title">
        {t("Dämpfungsvorgaben", "Attenuation requirements")}
      </div>
      <SpecSlider
        label={t("Max. Durchlassdämpfung", "Max. passband loss")}
        symbol="Aₚ"
        value={spec.passbandLoss}
        min={0.1}
        max={3}
        step={0.05}
        unit="dB"
        onChange={(passbandLoss) => onChange({ ...spec, passbandLoss })}
      />
      <SpecSlider
        label={t("Min. Sperrdämpfung", "Min. stopband attenuation")}
        symbol="Aₛ"
        value={spec.stopbandLoss}
        min={20}
        max={80}
        step={1}
        unit="dB"
        onChange={(stopbandLoss) => onChange({ ...spec, stopbandLoss })}
      />
      <div
        className={`tolerance-order ${design.issue ? "is-warning" : ""}`}
        role="status"
      >
        {design.minimumOrder !== null && (
          <span>
            {t("Rechnerischer Prototypgrad", "Calculated prototype order")}{" "}
            <b>n ≥ {design.minimumOrder}</b>
          </span>
        )}
        {design.settings && (
          <span>
            {t("Erzeugter Filtergrad", "Realized filter order")}{" "}
            <b>
              {filterDegree(design.settings)}
              {band ? ` (n = ${design.settings.order})` : ""}
            </b>
          </span>
        )}
        {design.issue && <p>{t(...toleranceIssueLabels[design.issue])}</p>}
        <small>
          {family === "cauer"
            ? t(
                "Verfügbare Cauer-Prototypgrade: ungerade 3–19; ab n = 7 mindestens 40 dB.",
                "Available Cauer prototype orders: odd 3–19; at least 40 dB for n ≥ 7.",
              )
            : family === "chebyshev2" ? t(
                "Chebyshev-II-Leiter: ungerade Grade 1–11. Mindest-Sperrdämpfung: 20 dB (n = 1/3), 30 dB (5), 60 dB (7/9), 80 dB (11).",
                "Chebyshev II ladder: odd orders 1–11. Minimum attenuation: 20 dB (n = 1/3), 30 dB (5), 60 dB (7/9), 80 dB (11).",
              ) : t(
                "Verfügbare Prototypgrade: 1–20.",
                "Available prototype orders: 1–20.",
              )}
        </small>
        {(design.settings?.family === "butterworth" || design.settings?.family === "chebyshev2") && (
          <small>
            {design.settings.family === "chebyshev2"
              ? band ? t("Abgeleitete Sperrbandbreite", "Derived stopband width") : t("Abgeleitete Sperrbandgrenze", "Derived stopband edge")
              : band
              ? t("Abgeleitete −3-dB-Bandbreite", "Derived −3 dB bandwidth")
              : t("Abgeleitete −3-dB-Frequenz", "Derived −3 dB frequency")}
            :{" "}
            {formatEngineering(
              band ? design.settings.bandwidth! : design.settings.cutoff,
              "Hz",
              4,
              language === "de" ? "de-DE" : "en-US",
            )}
          </small>
        )}
      </div>
    </div>
  );
}
