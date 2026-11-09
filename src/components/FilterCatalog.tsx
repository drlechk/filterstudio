import { useMemo } from "react";
import { ArrowRight, Check, ExternalLink, Sparkles } from "lucide-react";
import { usePreferences } from "../lib/preferences";
import { designTolerance, toleranceEdges } from "../lib/tolerance";
import { synthesize } from "../lib/synthesis";
import { filterDegree } from "../lib/frequency";
import { formatEngineering } from "../lib/network";
import { SpecSlider, ToleranceControls, toleranceIssueLabels } from "./ToleranceControls";
import { catalogReference, catalogSources, catalogTableSource } from "../lib/filter-catalog";
import type { FrequencyUnit } from "../lib/frequency-units";
import type { FilterFamily, FilterSettings, ToleranceSpec } from "../lib/types";

const families: [FilterFamily, string][] = [
  ["butterworth", "Butterworth"], ["chebyshev", "Chebyshev I"],
  ["chebyshev2", "Chebyshev II"], ["cauer", "Cauer"],
  ["bessel", "Bessel"], ["legendre", "Legendre"],
  ["linkwitz-riley", "Linkwitz–Riley"],
];

export function FilterCatalog({ spec, settings, onSelect, onGenerate, onShowMask, generating, previewError,
  onSpecChange, onSettingsChange, frequencyUnit, onFrequencyUnitChange }: {
  spec: ToleranceSpec;
  settings: FilterSettings;
  onSelect: (family: FilterFamily) => void;
  onGenerate: () => void;
  onShowMask: () => void;
  generating: boolean;
  previewError: string | null;
  onSpecChange: (spec: ToleranceSpec) => void;
  onSettingsChange: (patch: Partial<FilterSettings>) => void;
  frequencyUnit: FrequencyUnit;
  onFrequencyUnitChange: (unit: FrequencyUnit) => void;
}) {
  const { t, number, language, translate } = usePreferences();
  const engineering = (value: number, unit: string) =>
    formatEngineering(value, unit, 4, language === "de" ? "de-DE" : "en-US");
  const candidates = useMemo(() => families.map(([family, name]) => {
    const design = designTolerance(spec, family, settings.impedance);
    return { family, name, design, reference: design.settings ? catalogReference(design.settings) : null };
  }), [spec, settings.impedance]);
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
  const reference = selected.reference;
  const tableSource = catalogTableSource(settings.family);
  const tableLabels = {
    lcTables: t("LC-Tabellen: Butterworth / Chebyshev (LibreTexts)", "LC tables: Butterworth / Chebyshev (LibreTexts)"),
    poleTables: t("Poltabellen: Butterworth / Chebyshev / Bessel (Analog Devices)", "Pole tables: Butterworth / Chebyshev / Bessel (Analog Devices)"),
    zverev: t("Zverev: Filterkatalog (Verlagsseite, Buch kostenpflichtig)", "Zverev: filter catalog (publisher, paid book)"),
    cauerTables: t("Cauer-Pol-/Nullstellentabellen 3.25–3.30 (Winder, PDF, S. 117–120)", "Cauer pole/zero tables 3.25–3.30 (Winder, PDF, pp. 117–120)"),
    inverseTables: t("Chebyshev-II-LC-Tabellen 2.22/2.23 (Winder, PDF, S. 72)", "Chebyshev II LC tables 2.22/2.23 (Winder, PDF, p. 72)"),
  };
  const error = selected.design.issue ? t(...toleranceIssueLabels[selected.design.issue])
    : previewError ? translate(previewError) : null;
  return <section className="filter-catalog" aria-label={t("Interaktiver Filterkatalog", "Interactive filter catalog")}>
    <div className="response-heading">
      <div>
        <h2>{t("Katalogentwurf", "Catalog design")}</h2>
        <p>{t("Vorgaben hier einstellen, Katalogreferenzen vergleichen und den gewählten Entwurf als Schaltung übernehmen.", "Enter specifications here, compare catalog references and generate the selected circuit.")}</p>
      </div>
      <button className="small-button" onClick={onShowMask}>
        {t("Dämpfungsverlauf ansehen", "View attenuation response")} <ArrowRight size={14} />
      </button>
    </div>
    <section className="catalog-inputs" aria-label={t("Katalogparameter", "Catalog parameters")}>
      <h3>{t("Spezifikationen", "Specifications")}</h3>
      <div className="catalog-input-basics">
        <label className="catalog-response-field">
          {t("Filtertyp", "Response type")}
          <select value={spec.response} onChange={event => onSettingsChange({ response: event.target.value as ToleranceSpec["response"] })}>
            <option value="lowpass">{t("Tiefpass", "Low-pass")}</option>
            <option value="highpass">{t("Hochpass", "High-pass")}</option>
            <option value="bandpass">{t("Bandpass", "Band-pass")}</option>
            <option value="bandstop">{t("Bandsperre", "Band-stop")}</option>
          </select>
        </label>
        <SpecSlider label={t("Bezugsimpedanz", "Reference impedance")} symbol="Z₀" unit="Ω"
          value={settings.impedance} min={0.01} max={1e6} step={0.001} logarithmic
          onChange={impedance => onSettingsChange({ impedance })} />
      </div>
      <ToleranceControls spec={spec} design={selected.design} family={settings.family}
        frequencyUnit={frequencyUnit} onFrequencyUnitChange={onFrequencyUnitChange}
        onChange={onSpecChange} showSummary={false} />
    </section>
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
    <p>{t("Kennungen nach Zverev: B / C / CC. Zahlenwerte werden berechnet; Dezimalwerte sind Zwischenwerte für den Katalogvergleich.", "Zverev designations: B / C / CC. Numerical values are calculated; decimals indicate intermediate values for catalog comparison.")}</p>
    <div className="catalog-candidates" role="group" aria-label={t("Filterfamilie für Katalogentwurf", "Filter family for catalog design")}>
      {candidates.map(({ family, name, design, reference: candidateReference }) => <button key={family}
        className={`catalog-candidate ${family === settings.family ? "selected" : ""}`}
        aria-pressed={family === settings.family} disabled={!design.settings}
        onClick={() => onSelect(family)}>
        <span className="catalog-candidate-title"><strong>{name}</strong>{family === settings.family && <Check size={15} aria-hidden="true" />}</span>
        <small>{descriptions[family]}</small>
        {candidateReference && <code className="catalog-code">{candidateReference.code}</code>}
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
      {proposed && <div className="catalog-reference">
        <h3>{t("Katalogreferenz nach Zverev", "Catalog reference using Zverev notation")}</h3>
        {reference ? <>
          <code className="catalog-code">{reference.code}</code>
          <p>{t("Alternative P/T/C-Schreibweise:", "Alternative P/T/C notation:")} <code>{reference.alternative}</code></p>
          <dl className="catalog-reference-values">
            <div><dt>n</dt><dd>{reference.order} · {t("Tiefpass-Prototypgrad", "Low-pass prototype order")}</dd></div>
            {reference.reflectionPercent !== undefined && <div><dt>ρ</dt><dd>{number(reference.reflectionPercent, 8)} % · {t("max. Durchlassreflexion", "max. passband reflection")}</dd></div>}
            {reference.modularAngle !== undefined && <div><dt>θ</dt><dd>{number(reference.modularAngle, 8)}° · {t("Modulwinkel", "Modular angle")}</dd></div>}
            {reference.stopbandRatio !== undefined && <div><dt>Ωₛ</dt><dd>{number(reference.stopbandRatio, 8)} · {t("Sperrgrenze des berechneten Prototyps", "Stopband edge of the calculated prototype")}</dd></div>}
          </dl>
          <p>{t("B = Butterworth, C = Chebyshev I, CC = Cauer. Die folgenden Zahlen stehen für n, gegebenenfalls ρ in Prozent und θ in Grad. Bei Bandfiltern bezieht sich n auf den Tiefpass-Prototyp.", "B = Butterworth, C = Chebyshev I, CC = Cauer. The numbers specify n, followed where applicable by ρ in percent and θ in degrees. For band filters, n refers to the low-pass prototype.")}</p>
          <p>{reference.fractional
            ? t("Berechneter Suchschlüssel mit Zwischenwerten (Anzeige auf vier Nachkommastellen gerundet), kein bestätigter gedruckter Tabelleneintrag. Zum Vergleich im Katalog n, ρ und θ sowie Normierung, Schaltungstopologie und Abschlussverhältnis abgleichen.", "Computed lookup key with intermediate values (display rounded to four decimal places), not a verified printed table entry. Compare n, ρ and θ along with normalization, circuit topology and termination ratio in the catalog.")
            : t("Kennung aus den berechneten Prototypdaten; ein konkreter gedruckter Tabelleneintrag wurde nicht geprüft. Zum Vergleich auch Normierung, Schaltungstopologie und Abschlussverhältnis beachten.", "Designation derived from the calculated prototype; a specific printed table entry has not been verified. Also compare normalization, circuit topology and termination ratio.")}</p>
          {reference.modularAngle !== undefined && <p>ρ = 100 √(1 − 10<sup>−Aₚ/10</sup>) %, θ = arcsin(1/Ωₛ).</p>}
        </> : <p>{t("Für diese Familie ist hier keine B/C/CC-Katalogkennung hinterlegt. Vergleiche den Prototypgrad und die normierten Bauteilwerte.", "No B/C/CC catalog designation is provided for this family. Compare the prototype order and normalized component values.")}</p>}
        <div className="catalog-source-links">
          {tableSource && <a href={catalogSources[tableSource]} target="_blank" rel="noopener noreferrer">{tableLabels[tableSource]} <ExternalLink size={13} /></a>}
          {reference && tableSource !== "zverev" && <a href={catalogSources.zverev} target="_blank" rel="noopener noreferrer">{tableLabels.zverev} <ExternalLink size={13} /></a>}
          {reference && <a href={catalogSources.notation} target="_blank" rel="noopener noreferrer">{t("P/T/C-Kennungen erklärt (PDF, S. 18)", "P/T/C notation explained (PDF, p. 18)")} <ExternalLink size={13} /></a>}
          {settings.family === "cauer" && <a href={catalogSources.cauerNotation} target="_blank" rel="noopener noreferrer">{t("Cauer: Modulwinkel und Kennung (Analog Devices, PDF)", "Cauer: modular angle and designation (Analog Devices, PDF)")} <ExternalLink size={13} /></a>}
        </div>
      </div>}
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
    <p className="catalog-note">{t("Die LC-Werte werden berechnet. Die Referenzkennungen dienen zum Abgleich mit Katalogen; verlinkte Tabellen können andere Normierungen, Topologien oder Abschlussimpedanzen verwenden.", "LC values are calculated. Reference designations support catalog comparisons; linked tables may use different normalizations, topologies or termination impedances.")}</p>
  </section>;
}
