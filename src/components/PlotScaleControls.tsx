import type { FrequencyScale, MagnitudeScale } from "../lib/plot-scales";
import { usePreferences } from "../lib/preferences";
import type { PhaseMode } from "../lib/phase";

export type PlotScaleProps = {
  frequencyScale: FrequencyScale;
  magnitudeScale: MagnitudeScale;
  onFrequencyScaleChange: (scale: FrequencyScale) => void;
  onMagnitudeScaleChange: (scale: MagnitudeScale) => void;
  phaseMode?: PhaseMode;
  onPhaseModeChange?: (mode: PhaseMode) => void;
};

export function PlotScaleControls({ frequencyScale, magnitudeScale, onFrequencyScaleChange, onMagnitudeScaleChange, phaseMode = "unwrapped", onPhaseModeChange, quantity }: PlotScaleProps & { quantity: "scattering" | "attenuation" | "transfer" | "phase" }) {
  const { t } = usePreferences();
  return <div className="plot-scale-controls">
    <label>
      <span>{t("Frequenzachse", "Frequency axis")}</span>
      <select value={frequencyScale} onChange={event => onFrequencyScaleChange(event.target.value as FrequencyScale)}>
        <option value="log">{t("Logarithmisch", "Logarithmic")}</option>
        <option value="linear">{t("Linear", "Linear")}</option>
      </select>
    </label>
    {quantity !== "phase" && <label>
      <span>{quantity === "attenuation" ? t("Dämpfung", "Attenuation") : quantity === "transfer" ? t("Übertragung S₂₁", "Transmission S₂₁") : t("S-Parameter", "S-parameters")}</span>
      <select value={magnitudeScale} onChange={event => onMagnitudeScaleChange(event.target.value as MagnitudeScale)}>
        <option value="db">{t("Logarithmisch · dB", "Logarithmic · dB")}</option>
        <option value="linear">{quantity === "attenuation" ? "Linear · 1/|S₂₁|" : quantity === "transfer" ? "Linear · |S₂₁|" : "Linear · |S|"}</option>
      </select>
    </label>}
    {quantity === "phase" && <>
      {onPhaseModeChange && <div className="segmented plot-mode" role="group" aria-label={t("Phasendarstellung", "Phase display")}>
        <button type="button" className={phaseMode === "wrapped" ? "active" : ""} aria-pressed={phaseMode === "wrapped"} onClick={() => onPhaseModeChange("wrapped")}>{t("Nicht entfaltet", "Wrapped")}</button>
        <button type="button" className={phaseMode === "unwrapped" ? "active" : ""} aria-pressed={phaseMode === "unwrapped"} onClick={() => onPhaseModeChange("unwrapped")}>{t("Entfaltet", "Unwrapped")}</button>
      </div>}
      <span className="plot-scale-note">{t("Phase in Grad", "Phase in degrees")}</span>
    </>}
  </div>;
}
