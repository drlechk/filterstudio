import { useMemo, useState } from "react";
import katex from "katex";
import { Check, Copy, Code2 } from "lucide-react";
import { usePreferences } from "../lib/preferences";
export function Formula({ latex }: { latex: string }) {
  const html = useMemo(
    () =>
      katex.renderToString(latex, {
        throwOnError: false,
        displayMode: true,
        trust: false,
        strict: false,
      }),
    [latex],
  );
  return (
    <div className="math-render" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
export function MathView({
  latex,
  title,
  description,
  formulaGroups,
}: {
  latex: string;
  title: string;
  description?: string;
  formulaGroups?: string[][];
}) {
  const { t } = usePreferences();
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(latex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setShowCode(true);
    }
  }
  return (
    <div className="math-card">
      <div className="math-card-top">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        <div className="math-actions">
          <button
            className={`icon-button ${showCode ? "active" : ""}`}
            aria-label={
              showCode
                ? t("LaTeX-Code ausblenden", "Hide LaTeX code")
                : t("LaTeX-Code anzeigen", "Show LaTeX code")
            }
            title={
              showCode
                ? t("LaTeX-Code ausblenden", "Hide LaTeX code")
                : t("LaTeX-Code anzeigen", "Show LaTeX code")
            }
            aria-pressed={showCode}
            onClick={() => setShowCode(!showCode)}
          >
            <Code2 size={16} />
          </button>
          <button className="small-button" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
            {copied
              ? t("Kopiert", "Copied")
              : t("LaTeX kopieren", "Copy LaTeX")}
          </button>
        </div>
      </div>
      {formulaGroups ? (
        <div className="math-formula-groups">
          {formulaGroups.map((group, i) => (
            <div className="math-formula-group" key={i}>
              {group.map((formula, j) => <Formula key={j} latex={formula} />)}
            </div>
          ))}
        </div>
      ) : <Formula latex={latex} />}
      {showCode && (
        <textarea
          className="latex-code"
          readOnly
          value={latex}
          aria-label={`LaTeX: ${title}`}
          onFocus={(e) => e.target.select()}
        />
      )}
    </div>
  );
}
