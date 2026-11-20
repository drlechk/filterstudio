import { usePreferences } from "../lib/preferences";
import { cauerMinimumAttenuation } from "../lib/filter-limits";
import { attenuationFromModularAngle, modularAngleFromAttenuation, modularAngleLimits,
  reflectionPercentFromRipple, rippleFromReflectionPercent } from "../lib/prototype-parameters";
import type { FilterSettings } from "../lib/types";
import { PositiveInput } from "./PositiveInput";

/** Alternative inputs; canonical dB settings remain the single source of truth. */
export function PrototypeParameterControls({ settings, onChange }: {
  settings: FilterSettings;
  onChange: (patch: Partial<FilterSettings>) => void;
}) {
  const { t, number } = usePreferences();
  if (settings.family !== "chebyshev" && settings.family !== "cauer") return null;
  const limits = settings.family === "cauer" ? modularAngleLimits(settings.order, settings.ripple, settings.cauerVariant) : null;
  return <>
    <div className="parameter-field">
      <label className="field-label">
        {t("Max. Reflexionsfaktor", "Max. reflection coefficient")} <span>ρₘₐₓ</span>
      </label>
      <PositiveInput
        label={t("Maximaler Reflexionsfaktor in Prozent", "Maximum reflection coefficient in percent")}
        value={reflectionPercentFromRipple(settings.ripple)} unit="%"
        min={reflectionPercentFromRipple(.1)} max={reflectionPercentFromRipple(3)}
        onChange={percent => onChange({ ripple: Math.max(.1, Math.min(3, rippleFromReflectionPercent(percent))) })}
      />
      <small className="field-help">{t(
        "Max. |S₁₁| im Durchlassbereich des verlustlosen Prototyps; gekoppelt an Rₚ (0,1–3 dB). Amplitudenanteil, kein Leistungsanteil.",
        "Max. |S₁₁| in the lossless prototype passband; linked to Rₚ (0.1–3 dB). Amplitude ratio, not power ratio.",
      )}</small>
    </div>
    {limits && <div className="parameter-field">
      <label className="field-label">{t("Modulwinkel", "Modular angle")} <span>θ</span></label>
      <PositiveInput
        label={t("Modulwinkel in Grad", "Modular angle in degrees")}
        value={modularAngleFromAttenuation(settings.order, settings.ripple, settings.attenuation, settings.cauerVariant)} unit="°"
        min={limits.min} max={limits.max}
        onChange={angle => onChange({ attenuation: attenuationFromModularAngle(settings.order, settings.ripple, angle, settings.cauerVariant) })}
      />
      <small className="field-help">{t(
        `θ = asin(1/Ωₛ) des Tiefpassprototyps. Ändern passt Rₛ bei gleichem n und Rₚ an. Bereich ${number(limits.min, 7)}–${number(limits.max, 7)}° für ${cauerMinimumAttenuation(settings.order)}–80 dB; gilt auch für Hochpass und Bandfilter.`,
        `θ = asin(1/Ωₛ) of the low-pass prototype. Editing adjusts Rₛ at fixed n and Rₚ. Range ${number(limits.min, 7)}–${number(limits.max, 7)}° for ${cauerMinimumAttenuation(settings.order)}–80 dB; also applies to high-pass and band filters.`,
      )}</small>
    </div>}
  </>;
}
