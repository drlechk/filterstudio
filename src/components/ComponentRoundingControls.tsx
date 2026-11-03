import { useMemo, useState } from "react";
import { usePreferences } from "../lib/preferences";
import {
  componentPrecisionOptions,
  DEFAULT_COMPONENT_PRECISION,
  roundComponentValues,
} from "../lib/component-rounding";
import type { CircuitNode, ComponentPrecision } from "../lib/types";

export function ComponentRoundingControls({
  id,
  open,
  nodes,
  precision,
  disabled,
  onPrecisionChange,
  onRound,
}: {
  id: string;
  open: boolean;
  nodes: CircuitNode[];
  precision: ComponentPrecision;
  disabled: boolean;
  onPrecisionChange: (precision: ComponentPrecision) => void;
  onRound: (nodes: CircuitNode[]) => void;
}) {
  const { t } = usePreferences();
  const [digits, setDigits] = useState(DEFAULT_COMPONENT_PRECISION);
  const preview = useMemo(() => roundComponentValues(nodes, digits), [nodes, digits]);
  const digitsLabel = (n: number) => n === 1
    ? t("1 signifikante Stelle", "1 significant digit")
    : t(`${n} signifikante Stellen`, `${n} significant digits`);

  return (
    <div className="component-rounding" id={id} hidden={!open}>
      <div className="rounding-setting">
        <label>
          <span>{t("Anzeige", "Display")}</span>
          <select
            aria-label={t("Anzeigegenauigkeit der Bauteilwerte", "Component display precision")}
            value={precision}
            onChange={(event) => onPrecisionChange(
              event.target.value === "full" ? "full" : Number(event.target.value),
            )}
          >
            <option value="full">{t("Ohne Rundung · volle Genauigkeit", "No rounding · full precision")}</option>
            {componentPrecisionOptions.map((n) => (
              <option value={n} key={n}>{digitsLabel(n)}</option>
            ))}
          </select>
        </label>
        <p>{t(
          "Gilt für Schaltplan und Bauteilliste. Rechenwerte bleiben erhalten; Eingabefelder zeigen die volle Genauigkeit.",
          "Applies to the circuit and component list. Calculation values are preserved; input fields show full precision.",
        )}</p>
      </div>
      <div className="rounding-setting">
        <label>
          <span>{t("Bauteilwerte runden", "Round component values")}</span>
          <select
            aria-label={t("Rundungsgenauigkeit der Bauteilwerte", "Component rounding precision")}
            value={digits}
            onChange={(event) => setDigits(Number(event.target.value))}
          >
            {componentPrecisionOptions.map((n) => (
              <option value={n} key={n}>{digitsLabel(n)}</option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          disabled={disabled || preview.changedValues === 0}
          onClick={() => onRound(preview.nodes)}
        >
          {t("Auf Schaltung anwenden", "Apply to circuit")}
        </button>
        <p aria-live="polite">{preview.changedValues
          ? t(
              `${preview.changedValues} Werte werden geändert. Frequenzgang und Exporte verwenden danach die gerundeten Werte. Rückgängig ist möglich.`,
              `${preview.changedValues} values will change. The response and exports will then use the rounded values. This can be undone.`,
            )
          : t("Keine Werte zu runden.", "No values to round.")}</p>
      </div>
      <p className="rounding-example">{t(
        "Signifikante Stellen zählen ab der ersten Ziffer ungleich null: 4,918158 µH → 4,92 µH bei 3 Stellen. Die gewählte Einheit beeinflusst die Rundung nicht.",
        "Significant digits start at the first nonzero digit: 4.918158 µH → 4.92 µH with 3 digits. The selected unit does not affect rounding.",
      )}</p>
    </div>
  );
}
