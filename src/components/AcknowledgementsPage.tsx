import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Heart, Search } from "lucide-react";
import { acknowledgements, acknowledgementGroups, referenceLibraries } from "../lib/acknowledgements";
import packages from "../data/third-party-packages.json";
import { usePreferences } from "../lib/preferences";
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
        <p className="section-eyebrow">FILTERSTUDIO · OPEN SOURCE</p>
        <h1 ref={heading} tabIndex={-1}>Acknowledgements</h1>
        <p>{t("Diese Projekte machen Filterstudio möglich. Vielen Dank an die Menschen, die diese Bibliotheken, Schriften und Werkzeuge entwickeln und pflegen.", "These projects make Filterstudio possible. Thank you to the people who build and maintain these libraries, fonts and tools.")}</p>
        <nav aria-label={t("Bereiche der Danksagung", "Acknowledgements sections")}>
          {acknowledgementGroups.map(group => <a key={group.id} href={`#acknowledgements-${group.id}`}>{t(group.de, group.en)}</a>)}
          <a href="#acknowledgements-packages">{t("Alle Pakete", "All packages")}</a>
        </nav>
      </div>
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
