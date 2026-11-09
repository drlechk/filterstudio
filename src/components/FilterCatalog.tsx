import { useMemo } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { usePreferences } from "../lib/preferences";
import { designTolerance, toleranceEdges } from "../lib/tolerance";
import { synthesize } from "../lib/synthesis";
import { filterDegree } from "../lib/frequency";
import { formatEngineering } from "../lib/network";
import { toleranceIssueLabels } from "./ToleranceControls";
import type { FilterFamily, FilterSettings, ToleranceSpec } from "../lib/types";

const families: [FilterFamily, string][] = [
  ["butterworth", "Butterworth"], ["chebyshev", "Chebyshev I"],
  ["chebyshev2", "Chebyshev II"], ["cauer", "Cauer"],
  ["bessel", "Bessel"], ["legendre", "Legendre"],
  ["linkwitz-riley", "Linkwitz–Riley"],
];

export function FilterCatalog({ spec, settings, onSelect, onGenerate, onShowMask, generating, previewError }: {
  spec: ToleranceSpec;
  settings: FilterSettings;
  onSelect: (family: FilterFamily) => void;
  onGenerate: () => void;
  onShowMask: () => void;
  generating: boolean;
  previewError: string | null;
}) {
  const { t, number, language, translate } = usePreferences();
  const engineering = (value: number, unit: string) =>
    formatEngineering(value, unit, 4, language === "de" ? "de-DE" : "en-US");
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
  const descriptions: Record<FilterFamily, string> = {
    butterworth: t("Maximal flacher Durchlassbereich", "Maximally flat passband"),
    chebyshev: t("Welligkeit im Durchlassbereich", "Passband ripple"),
    chebyshev2: t("Welligkeit im Sperrbereich", "Stopband ripple"),
    cauer: t("Elliptisch · steile Filterflanken", "Elliptic · steep roll-off"),
    bessel: t("Flache Gruppenlaufzeit", "Flat group delay"),
    legendre: t("Monoton ohne Welligkeit", "Monotonic, no ripple"),
    "linkwitz-riley": t("Butterworth² · Übernahme bei −6 dB", "Butterworth² · crossover at −6 dB"),
  };
  const proposed = selected.design.settings;
  const error = selected.design.issue ? t(...toleranceIssueLabels[selected.design.issue])
    : previewError ? translate(previewError) : null;
  return <section className="filter-catalog" aria-label={t("Interaktiver Filterkatalog", "Interactive filter catalog")}>
    <div className="response-heading">
      <div>
        <h2>{t("Katalogentwurf", "Catalog design")}</h2>
        <p>{t("Vorgaben links einstellen, Charakteristiken vergleichen und den gewählten Entwurf als Schaltung übernehmen.", "Set specifications in the sidebar, compare characteristics and generate the selected circuit.")}</p>
      </div>
      <button className="small-button" onClick={onShowMask}>
        {t("Dämpfungsverlauf ansehen", "View attenuation response")} <ArrowRight size={14} />
      </button>
    </div>
    <dl className="catalog-specs" aria-label={t("Aktuelle Spezifikationen", "Current specifications")}>
      {toleranceEdges(spec).map(edge => <div key={edge.symbol}>
        <dt>{edge.symbol}</dt><dd>{engineering(edge.frequency, "Hz")}</dd>
      </div>)}
      <div><dt>{t("Durchlass Aₚ ≤", "Passband Aₚ ≤")}</dt><dd>{number(spec.passbandLoss)} dB</dd></div>
      <div><dt>{t("Sperrbereich Aₛ ≥", "Stopband Aₛ ≥")}</dt><dd>{number(spec.stopbandLoss)} dB</dd></div>
      <div><dt>Z₀</dt><dd>{engineering(settings.impedance, "Ω")}</dd></div>
    </dl>
    <h3>{t("Passende Prototypen", "Matching prototypes")}</h3>
    <p>{t("Je Familie wird der kleinste unterstützte Prototypgrad für dieselben Vorgaben ermittelt. Wähle eine Karte für deinen Entwurf.", "Each family uses the smallest supported prototype order for the same specifications. Select a card for your design.")}</p>
    <div className="catalog-candidates" role="group" aria-label={t("Filterfamilie für Katalogentwurf", "Filter family for catalog design")}>
      {candidates.map(({ family, name, design }) => <button key={family}
        className={`catalog-candidate ${family === settings.family ? "selected" : ""}`}
        aria-pressed={family === settings.family} disabled={!design.settings}
        onClick={() => onSelect(family)}>
        <span className="catalog-candidate-title"><strong>{name}</strong>{family === settings.family && <Check size={15} aria-hidden="true" />}</span>
        <small>{descriptions[family]}</small>
        <span>{design.settings
          ? t(`Grad ${filterDegree(design.settings)} · Prototyp n = ${design.settings.order}`, `Order ${filterDegree(design.settings)} · prototype n = ${design.settings.order}`)
          : t("Mit diesen Vorgaben nicht verfügbar", "Unavailable for these specifications")}</span>
      </button>)}
    </div>
    <div className="catalog-design">
      <div className="catalog-design-heading">
        <div>
          <h3>{selected.name} · {t("Gewählter Entwurf", "Selected design")}</h3>
          {proposed && <p>
            {t("Filtergrad", "Filter order")} {filterDegree(proposed)} · f₀ = {engineering(proposed.cutoff, "Hz")}
            {proposed.bandwidth !== undefined && ` · B = ${engineering(proposed.bandwidth, "Hz")}`}
            {prototype && ` · Z₂ = ${engineering(prototype.z2 * settings.impedance, "Ω")}`}
          </p>}
        </div>
        <button className="button primary" onClick={onGenerate} disabled={generating || !proposed || Boolean(error)}>
          <Sparkles size={15} />{generating ? t("Berechne Schaltung …", "Calculating circuit …") : t("Schaltung generieren", "Generate circuit")}
        </button>
      </div>
      {error && <p className="catalog-error" role="status">{error}</p>}
      <p>{t("Generieren skaliert den Prototyp auf die Vorgaben und ersetzt die aktuelle Schaltung. Rückgängig stellt sie wieder her.", "Generating scales the prototype to the specifications and replaces the current circuit. Undo restores it.")}</p>
    {prototype && <details className="catalog-prototype">
      <summary>{t("Katalogeintrag: normierter Tiefpass", "Catalog entry: normalized low-pass")}</summary>
      <p>{t("Normierung: ω₀ = 1 rad/s, Z₁ = 1 Ω. L und C sind normierte Prototypwerte. Bandfilter werden aus diesem Tiefpass transformiert; ihre Ordnung ist 2n.", "Normalization: ω₀ = 1 rad/s, Z₁ = 1 Ω. L and C are normalized prototype values. Band filters are transformed from this low-pass; their order is 2n.")}</p>
      <div className="table-scroll"><table>
        <thead><tr><th>#</th><th>{t("Anordnung", "Configuration")}</th><th>{t("Normierte Werte", "Normalized values")}</th></tr></thead>
        <tbody>{prototype.sections.map((section, index) => <tr key={section.id}>
          <td>{index + 1}</td>
          <td>{section.connection === "series" ? t("Serienzweig", "Series branch") : t("Querzweig", "Shunt branch")}
            {section.kind === "LC" && ` · ${section.resonator === "series" ? t("LC-Serienkreis", "Series LC resonator") : t("LC-Parallelkreis", "Parallel LC resonator")}`}</td>
          <td>{section.kind === "LC" ? `L = ${number(section.value, 7)}, C = ${number(section.value2!, 7)}` : `${section.kind} = ${number(section.value, 7)}`}</td>
        </tr>)}</tbody>
      </table></div>
      <p>Z₂ / Z₁ = {number(prototype.z2, 7)}</p>
      <p>{t("Tiefpass-Skalierung: L = Lₙ · Z₀ / ω₀, C = Cₙ / (Z₀ · ω₀), mit ω₀ = 2πf₀. Hochpass und Bandfilter nutzen die entsprechende Frequenztransformation.", "Low-pass scaling: L = Lₙ · Z₀ / ω₀, C = Cₙ / (Z₀ · ω₀), with ω₀ = 2πf₀. High-pass and band filters use the corresponding frequency transformation.")}</p>
    </details>}
    </div>
    <p className="catalog-note">{t("Berechnete Katalogprototypen · Die LC-Synthese wird für den gewählten Entwurf geprüft. Es sind keine Tabellen eines bestimmten historischen Filterhandbuchs hinterlegt.", "Calculated catalog prototypes · LC synthesis is checked for the selected design. Entries are not transcribed from a particular historical filter handbook.")}</p>
  </section>;
}
