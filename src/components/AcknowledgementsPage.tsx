import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, ExternalLink, Heart, Search } from "lucide-react";
import { acknowledgements, acknowledgementGroups, referenceLibraries } from "../lib/acknowledgements";
import packages from "../data/third-party-packages.json";
import { usePreferences } from "../lib/preferences";
import { downloadFile } from "../lib/project";
import licenseText from "../../LICENSE?raw";
import "./AcknowledgementsPage.css";

export default function AcknowledgementsPage({ onBack }: { onBack: () => void }) {
  const { language, setLanguage, t } = usePreferences();
  const heading = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase();
  const filteredPackages = packages.filter(item => `${item.name} ${item.version} ${item.license}`.toLocaleLowerCase().includes(term));
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <main className="acknowledgements-page">
      <header className="acknowledgements-toolbar">
        <button className="small-button" onClick={onBack}><ArrowLeft size={15} /> {t("Zurück ins Studio", "Back to the studio")}</button>
        <label>
          <select className="language-select" aria-label={t("Sprache", "Language")} value={language} onChange={event => setLanguage(event.target.value === "de" ? "de" : "en")}>
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
      </header>
      <div className="acknowledgements-intro">
        <span className="acknowledgements-icon"><Heart size={24} aria-hidden="true" /></span>
        <p className="section-eyebrow">FILTERSTUDIO · {t("LIZENZ & CREDITS", "LICENSE & CREDITS")}</p>
        <h1 ref={heading} tabIndex={-1}>Credits</h1>
        <p>{t("Diese Projekte machen Filterstudio möglich. Vielen Dank an die Menschen, die diese Bibliotheken, Schriften und Werkzeuge entwickeln und pflegen.", "These projects make Filterstudio possible. Thank you to the people who build and maintain these libraries, fonts and tools.")}</p>
        <nav aria-label={t("Credits-Bereiche", "Credits sections")}>
          <a href="#acknowledgements-license">{t("Filterstudio-Lizenz", "Filterstudio license")}</a>
          {acknowledgementGroups.map(group => <a key={group.id} href={`#acknowledgements-${group.id}`}>{t(group.de, group.en)}</a>)}
          <a href="#acknowledgements-packages">{t("Alle Pakete", "All packages")}</a>
        </nav>
      </div>
      <section className="acknowledgements-section" id="acknowledgements-license" aria-labelledby="acknowledgements-license-title">
        <h2 id="acknowledgements-license-title">{t("Filterstudio-Lizenz", "Filterstudio license")}</h2>
        <article className="acknowledgement-card acknowledgements-license">
          <h3>Filterstudio No-Sale License 1.0</h3>
          <p>{t(
            "Du darfst Filterstudio kostenlos nutzen, untersuchen, kopieren, verändern und weitergeben, auch in Unternehmen. Die Software, veränderte Versionen und darin enthaltene Filterstudio-Codeanteile dürfen nicht verkauft oder gegen Bezahlung zugänglich gemacht werden. Weitergegebene Änderungen und übernommener Code behalten dieselbe Lizenz, das Verkaufsverbot und die Pflicht zur Namensnennung.",
            "You may use, study, copy, modify, and share Filterstudio without license fees, including in a business. The software, modified versions, and included Filterstudio code must not be sold or made available for payment. Redistributed modifications and reused code retain the same license, no-sale condition, and attribution requirements.",
          )}</p>
          <p>{t("Urheberhinweis:", "Attribution:")} <a href="https://github.com/drlechk/filterstudio" target="_blank" rel="noopener noreferrer">Filterstudio by drlechk and contributors</a>. {t(
            "Bei Weitergabe die Dateien LICENSE und NOTICE beilegen, Änderungen kennzeichnen und den Hinweis samt Projektlink und Lizenz in Credits, Info oder der Dokumentation zugänglich halten. Auch private Kopien müssen die Hinweise behalten; eigene Berechnungsergebnisse übernehmen die Softwarelizenz nicht.",
            "Include LICENSE and NOTICE when redistributing, identify modifications, and keep this credit, project link, and license accessible in Credits, About, or the documentation. Private copies must also retain the notices; your own calculation results do not inherit the software license.",
          )}</p>
          <p>{t(
            "Eigene Schaltungsentwürfe, Ergebnisse und Exporte darfst du auch kommerziell nutzen und verkaufen. Freiwillige Spenden und unabhängige Support- oder Schulungsleistungen sind erlaubt, sofern die Software ohne Zahlung zugänglich bleibt. Für die unten aufgeführten Bibliotheken, Schriften und Werkzeuge gelten deren eigene Lizenzen.",
            "Your own circuit designs, results, and exports may be used commercially and sold. Voluntary donations and independent support or training are allowed if the software remains accessible without payment. The libraries, fonts, and tools below retain their own licenses.",
          )}</p>
          <p>{t(
            "Projektspezifische Lizenz mit offen zugänglichem Quellcode und Verkaufsverbot. Maßgeblich ist der vollständige englische Lizenztext.",
            "Custom source-available license with a no-sale restriction. The complete English license text is authoritative.",
          )}</p>
          <details>
            <summary>{t("Vollständigen Lizenztext anzeigen (Englisch)", "Read the full license (English)")}</summary>
            <pre>{licenseText}</pre>
          </details>
          <button className="small-button" onClick={() => downloadFile("Filterstudio-LICENSE.txt", licenseText, "text/plain;charset=utf-8")}>
            <Download size={15} aria-hidden="true" /> {t("Lizenz herunterladen", "Download license")}
          </button>
        </article>
      </section>
      {acknowledgementGroups.map(group => (
        <section className="acknowledgements-section" id={`acknowledgements-${group.id}`} key={group.id} aria-labelledby={`acknowledgements-heading-${group.id}`}>
          <h2 id={`acknowledgements-heading-${group.id}`}>{t(group.de, group.en)}</h2>
          <div className="acknowledgements-grid">
            {acknowledgements.filter(project => project.group === group.id).map(project => {
              const members = project.packages.map(name => packages.find(item => item.name === name && item.direct)!);
              return (
                <article className="acknowledgement-card" key={project.name}>
                  <h3><a href={project.url} target="_blank" rel="noopener noreferrer">{project.name} <ExternalLink size={14} aria-hidden="true" /></a></h3>
                  <p>{t(project.de, project.en)}</p>
                  <ul className="acknowledgement-packages">
                    {members.map(item => <li key={item.name}><a href={item.url} target="_blank" rel="noopener noreferrer"><code>{item.name}</code> <span>{item.version}</span></a></li>)}
                  </ul>
                  <div className="acknowledgement-links">
                    <span>{[...new Set(members.map(item => item.license))].join(" · ")}</span>
                    <a href={project.source} target="_blank" rel="noopener noreferrer">{t("Quellcode", "Source code")} <ExternalLink size={12} aria-hidden="true" /></a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      <section className="acknowledgements-section" id="acknowledgements-packages" aria-labelledby="acknowledgements-packages-title">
        <h2 id="acknowledgements-packages-title">{t("Vollständige Paketliste", "Complete package inventory")}</h2>
        <p className="acknowledgements-note">{t("Mit indirekten Abhängigkeiten sowie Entwicklungs- und plattformspezifischen Paketen. Die Lizenzangaben stammen aus den Paketmetadaten; vollständige Lizenztexte und Hinweise finden sich in den verlinkten Projekten.", "Includes transitive dependencies, development tools and platform-specific packages. License identifiers come from package metadata; full license texts and notices are available in the linked projects.")}</p>
        <label className="acknowledgements-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Nach Paket oder Lizenz suchen …", "Search packages or licenses …")} aria-label={t("Pakete durchsuchen", "Search packages")} />
        </label>
        <p className="acknowledgements-count" aria-live="polite">{t(`${filteredPackages.length} von ${packages.length} Paketen`, `${filteredPackages.length} of ${packages.length} packages`)}</p>
        <div className="table-scroll acknowledgements-inventory" tabIndex={0} role="region" aria-label={t("Paketliste", "Package inventory")}>
          <table>
            <thead><tr><th>{t("Paket", "Package")}</th><th>Version</th><th>{t("Abhängigkeit", "Dependency")}</th><th>{t("Lizenz", "License")}</th></tr></thead>
            <tbody>{filteredPackages.map(item => <tr key={`${item.name}@${item.version}`}>
              <td><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a></td>
              <td>{item.version}</td><td>{item.direct ? t("Direkt", "Direct") : t("Indirekt", "Transitive")}</td><td>{item.license}</td>
            </tr>)}</tbody>
          </table>
          {!filteredPackages.length && <p className="acknowledgements-empty">{t("Keine passenden Pakete gefunden.", "No matching packages found.")}</p>}
        </div>
      </section>
      <footer className="acknowledgements-footer">
        <p>{t("Referenzdaten für die Berechnungstests (nur zur Erzeugung der Testdaten benötigt):", "Numerical test reference data (only needed to generate the fixtures):")}</p>
        {referenceLibraries.map(project => <p key={project.name}><a href={project.url} target="_blank" rel="noopener noreferrer">{project.name} {project.version}</a> · <a href={project.source} target="_blank" rel="noopener noreferrer">{t("Quellcode", "Source")}</a> · {project.license} — {t(project.de, project.en)}</p>)}
        <p>{t("Laufzeit und Paketverwaltung:", "Runtime and package management:")} <a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer">Node.js</a> · <a href="https://www.npmjs.com/" target="_blank" rel="noopener noreferrer">npm</a></p>
        <button className="small-button" onClick={onBack}><ArrowLeft size={15} /> {t("Zurück ins Studio", "Back to the studio")}</button>
      </footer>
    </main>
  );
}
