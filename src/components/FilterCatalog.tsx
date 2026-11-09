import { useMemo } from "react";
import { usePreferences } from "../lib/preferences";
import { designTolerance } from "../lib/tolerance";
import { synthesize } from "../lib/synthesis";
import { filterDegree } from "../lib/frequency";
import type { FilterFamily, FilterSettings, ToleranceSpec } from "../lib/types";

const families: [FilterFamily, string][] = [
  ["butterworth", "Butterworth"], ["chebyshev", "Chebyshev I"],
  ["chebyshev2", "Chebyshev II"], ["cauer", "Cauer"],
  ["bessel", "Bessel"], ["legendre", "Legendre"],
  ["linkwitz-riley", "Linkwitz–Riley"],
];

export function FilterCatalog({ spec, settings, onSelect }: {
  spec: ToleranceSpec;
  settings: FilterSettings;
  onSelect: (family: FilterFamily) => void;
}) {
  const { t, number } = usePreferences();
  const candidates = useMemo(() => families.map(([family, name]) => ({
    family, name, design: designTolerance(spec, family, settings.impedance),
  })), [spec, settings.impedance]);
  const selected = candidates.find(candidate => candidate.family === settings.family)!;
  const prototype = useMemo(() => {
    if (!selected.design.settings) return null;
    try {
      return synthesize({ ...selected.design.settings, response: "lowpass", cutoff: 1 / (2 * Math.PI), bandwidth: undefined, impedance: 1 });
    } catch {
      return null;
    }
  }, [selected.design.settings]);
  return <section className="filter-catalog" aria-label={t("Interaktiver Filterkatalog", "Interactive filter catalog")}>
    <h3>{t("Vom Pflichtenheft zur Schaltung", "From specifications to circuit")}</h3>
    <p>{t("1. Frequenzgrenzen und Dämpfung oben festlegen. 2. Eine passende Charakteristik wählen. 3. Mit „Schaltung generieren“ den Prototyp auf Frequenz und Impedanz skalieren.", "1. Set frequency edges and attenuation above. 2. Choose a suitable characteristic. 3. Use Generate circuit to scale the prototype to frequency and impedance.")}</p>
    <div className="catalog-candidates">
      {candidates.map(({ family, name, design }) => <button key={family}
        className={`catalog-candidate ${family === settings.family ? "selected" : ""}`}
        aria-pressed={family === settings.family} disabled={!design.settings}
        onClick={() => onSelect(family)}>
        <strong>{name}</strong>
        <span>{design.settings
          ? t(`Grad ${filterDegree(design.settings)} · Prototyp n = ${design.settings.order}`, `Order ${filterDegree(design.settings)} · prototype n = ${design.settings.order}`)
          : t("Mit diesen Vorgaben nicht verfügbar", "Unavailable for these specifications")}</span>
      </button>)}
    </div>
    <p>{t("Berechnet wird je Familie der kleinste unterstützte Prototypgrad. Die LC-Synthese wird für den gewählten Entwurf geprüft. Der Katalog verwendet berechnete Prototypen, keine abgeschriebenen Buchtabellen.", "Each family uses its smallest supported prototype order. LC synthesis is checked for the selected design. This catalog uses calculated prototypes rather than transcribed handbook tables.")}</p>
    {prototype && <details>
      <summary>{t("Katalogeintrag: normierter Tiefpass", "Catalog entry: normalized low-pass")}</summary>
      <p>{t("Normierung: ω₀ = 1 rad/s, Z₁ = 1 Ω. L und C sind normierte Prototypwerte. Bandfilter werden aus diesem Tiefpass transformiert; ihre Ordnung ist 2n.", "Normalization: ω₀ = 1 rad/s, Z₁ = 1 Ω. L and C are normalized prototype values. Band filters are transformed from this low-pass; their order is 2n.")}</p>
      <ol>{prototype.sections.map((section, index) => <li key={section.id}>
        {index + 1}: {section.connection === "series" ? t("Serie", "Series") : t("Querzweig", "Shunt")} · {section.kind === "LC"
          ? `${t("Resonator", "Resonator")} (${section.resonator === "series" ? t("Serie", "series") : t("parallel", "parallel")}): L = ${number(section.value, 7)}, C = ${number(section.value2!, 7)}`
          : `${section.kind} = ${number(section.value, 7)}`}
      </li>)}</ol>
      <p>Z₂ / Z₁ = {number(prototype.z2, 7)}</p>
      <p>{t("Tiefpass-Skalierung: L = Lₙ · Z₀ / ω₀, C = Cₙ / (Z₀ · ω₀), mit ω₀ = 2πf₀. Hochpass und Bandfilter nutzen die entsprechende Frequenztransformation.", "Low-pass scaling: L = Lₙ · Z₀ / ω₀, C = Cₙ / (Z₀ · ω₀), with ω₀ = 2πf₀. High-pass and band filters use the corresponding frequency transformation.")}</p>
    </details>}
  </section>;
}
