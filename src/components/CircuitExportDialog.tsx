import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Code2, Download, X } from "lucide-react";
import type { Project } from "../lib/types";
import type { NetworkAnalysis } from "../lib/network";
import { circuitLatex, type CircuitExportOptions } from "../lib/circuit-export";
import { circuitSvg } from "../lib/circuit-export-svg";
import { downloadFile } from "../lib/project";
import { usePreferences } from "../lib/preferences";
import type { ExportPlotContext, ExportPlotSelection } from "../lib/export-plots";
import "./CircuitExportDialog.css";

export default function CircuitExportDialog({ project, analysis, plotContext, onClose }: {
  project: Project;
  analysis: NetworkAnalysis;
  plotContext: ExportPlotContext;
  onClose: () => void;
}) {
  const { t, language, circuitSymbols, showSourceAndLoad } = usePreferences();
  const [symbols, setSymbols] = useState<CircuitExportOptions["symbols"]>(circuitSymbols);
  const [matrices, setMatrices] = useState<CircuitExportOptions["matrices"]>("none");
  const [includeSourceAndLoad, setIncludeSourceAndLoad] = useState(showSourceAndLoad);
  const [plots, setPlots] = useState<ExportPlotSelection>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), id = useId();
  const preview = useMemo(() => {
    try { return { source: circuitSvg(project, { symbols, matrices: "none", includeSourceAndLoad }).source, error: false }; }
    catch { return { source: "", error: true }; }
  }, [project, symbols, includeSourceAndLoad]);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const filename = `${project.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "filter"}-circuit`;
  const toleranceAvailable = !plotContext.tolerance || !!plotContext.tolerance.preview || plotContext.tolerance.showActual;
  const options = { symbols, matrices, includeSourceAndLoad, language, plots: {
    ...plots, attenuation: toleranceAvailable && plots.attenuation, transmissionPhase: toleranceAvailable && plots.transmissionPhase,
  } };
  async function downloadPdf() {
    setBusy(true); setError("");
    try {
      const { circuitPdf } = await import("../lib/circuit-pdf");
      const pdf = await circuitPdf(project, options, analysis, plotContext);
      downloadFile(`${filename}.pdf`, pdf);
    } catch {
      setError(t("Das PDF konnte nicht erstellt werden. Bitte erneut versuchen; das LaTeX-Dokument kann weiterhin heruntergeladen werden.", "The PDF could not be created. Please try again; the LaTeX document can still be downloaded."));
    } finally { setBusy(false); }
  }
  function downloadTex() {
    setError("");
    try { downloadFile(`${filename}.tex`, circuitLatex(project, options, analysis, plotContext), "application/x-tex"); }
    catch { setError(t("Das LaTeX-Dokument konnte nicht erstellt werden.", "The LaTeX document could not be created.")); }
  }
  return <dialog ref={dialog} className="circuit-export-dialog" aria-labelledby={id} onCancel={onClose} onClick={event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose();
  }}>
    <div className="circuit-export-heading">
      <div>
        <h2 id={id}>{t("Schaltung exportieren", "Export circuit")}</h2>
        <p>{t("Eigenständiges TikZ-/CircuiTikZ-Dokument und PDF.", "Standalone TikZ/CircuiTikZ document and PDF.")}</p>
      </div>
      <button className="icon-button" aria-label={t("Schließen", "Close")} onClick={onClose}><X size={18} /></button>
    </div>
    <div className="circuit-export-options">
      <label>{t("Schaltzeichen", "Circuit symbols")}
        <select value={symbols} onChange={event => setSymbols(event.target.value as typeof symbols)} disabled={busy}>
          <option value="european">{t("Europäisch (IEC)", "European (IEC)")}</option>
          <option value="american">{t("Amerikanisch (ANSI)", "American (ANSI)")}</option>
        </select>
      </label>
      <label>{t("Matrizen", "Matrices")}
        <select value={matrices} onChange={event => setMatrices(event.target.value as typeof matrices)} disabled={busy}>
          <option value="none">{t("Ohne Matrizen", "No matrices")}</option>
          <option value="typeset">{t("Als Formeln setzen", "Typeset as equations")}</option>
          <option value="source">{t("Nur als LaTeX-Kommentare", "LaTeX comments only")}</option>
        </select>
      </label>
    </div>
    <label className="circuit-export-terminations">
      <span>{t("Quelle und Last", "Source and load")}<small>{t("Spannungsquelle, R1 und R2 anzeigen", "Show voltage source, R1 and R2")}</small></span>
      <input className="circuit-visibility-switch" type="checkbox" role="switch" checked={includeSourceAndLoad} onChange={event => setIncludeSourceAndLoad(event.target.checked)} disabled={busy} />
    </label>
    <p className="circuit-export-note">{matrices === "typeset"
      ? t("Gesamtmatrix und Teilkettenmatrizen werden auf eigenen Seiten gesetzt, einschließlich der eingesetzten Bauteilwerte.", "The overall matrix and section matrices are typeset on separate pages, including the component-value substitutions.")
      : matrices === "source"
        ? t("Die Matrixformeln stehen auskommentiert in der .tex-Datei und werden im PDF nicht gesetzt.", "The matrix formulas are included as comments in the .tex file and are not typeset in the PDF.")
        : includeSourceAndLoad
          ? t("Das Dokument enthält die Schaltung mit Spannungsquelle, R1 und Last R2.", "The document contains the circuit with voltage source, R1 and load R2.")
          : t("Das Dokument enthält die Schaltung zwischen Tor 1 und Tor 2.", "The document contains the circuit between Port 1 and Port 2.")}</p>
    {preview.error ? <p role="status">{t("Vorschau nicht verfügbar.", "Preview unavailable.")}</p>
      : <div className="circuit-export-preview" role="img" aria-label={t("Vorschau der exportierten Schaltung", "Exported circuit preview")} dangerouslySetInnerHTML={{ __html: preview.source }} />}
    <p className="circuit-export-note">{t(
      "Im PDF stehen nur die Bauteilbezeichnungen in der Schaltung. Eine separate Bauteilliste enthält alle Werte mit der gewählten Anzeigepräzision, einschließlich beider Bauteile jedes LC-Glieds. Der LaTeX-Export enthält die Werte weiterhin direkt in der Zeichnung.",
      "The PDF schematic shows component references only. A separate component list contains all values at the selected display precision, including both components of each LC block. The LaTeX export still includes values in the drawing.",
    )}</p>
    <fieldset className="circuit-export-plots">
      <legend>{t("Diagramme hinzufügen", "Include plots")}</legend>
      {([
        ["sMagnitude", t("S-Parameter: Betrag", "S-parameter magnitude")],
        ["sPhase", t("S-Parameter: Phase", "S-parameter phase")],
        ["attenuation", t("Dämpfungsverlauf S₂₁", "S₂₁ attenuation response")],
        ["transmissionPhase", t("Phasenverlauf S₂₁", "S₂₁ phase response")],
      ] as const).map(([key, label]) => <label key={key}>
        <input type="checkbox" checked={!!options.plots[key]}
          disabled={busy || ((key === "attenuation" || key === "transmissionPhase") && !toleranceAvailable)}
          onChange={event => setPlots(current => ({ ...current, [key]: event.target.checked }))} />
        {label}
      </label>)}
    </fieldset>
    <p className="circuit-export-note">{t(
      "Jedes gewählte Diagramm erhält eine eigene Seite in LaTeX und PDF. Die S-Parameter-Plots enthalten alle vier Parameter im eingestellten Frequenz- und Betragsbereich. Die Achsenskalierung wird übernommen.",
      "Each selected plot gets its own page in LaTeX and PDF. S-parameter plots contain all four parameters over the configured frequency and magnitude range. The selected axis scales are preserved.",
    )} {plotContext.tolerance ? t(
      "Dämpfungs- und Phasenverlauf zeigen die Toleranzvorschau einschließlich eines eingeschalteten Schaltungsvergleichs; die Dämpfung enthält auch die Toleranzmaske.",
      "Attenuation and phase show the tolerance preview, including the current circuit when comparison is enabled; attenuation also includes the tolerance mask.",
    ) : t("Dämpfungs- und Phasenverlauf zeigen die aktuelle Schaltung.", "Attenuation and phase show the current circuit.")}</p>
    {!toleranceAvailable && <p className="circuit-export-note" role="status">{t(
      "Für Dämpfungs- und Phasenverlauf einen gültigen Toleranzentwurf wählen oder den Schaltungsvergleich einschalten.",
      "For attenuation and phase plots, choose a valid tolerance design or enable the current circuit comparison.",
    )}</p>}
    <p className="circuit-export-note">{t(
      "Der Export ordnet die Bauelemente entlang des Signalwegs an. Das PDF wird lokal im Browser erzeugt; es ist eine Vektordarstellung, keine Kompilierung der .tex-Datei.",
      "The export arranges components along the signal path. The PDF is created locally in your browser as a vector drawing, rather than by compiling the .tex file.",
    )}</p>
    {error && <p className="circuit-export-error" role="alert">{error}</p>}
    <div className="circuit-export-actions">
      <button className="button secondary" onClick={downloadTex} disabled={busy}><Code2 size={16} />{t("LaTeX herunterladen", "Download LaTeX")}</button>
      <button className="button primary" onClick={() => void downloadPdf()} disabled={busy} aria-busy={busy}><Download size={16} />{busy ? t("PDF wird erstellt …", "Creating PDF …") : t("PDF herunterladen", "Download PDF")}</button>
    </div>
  </dialog>;
}
