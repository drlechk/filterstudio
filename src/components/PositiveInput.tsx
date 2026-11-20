import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../lib/preferences";

export function PositiveInput({
  value,
  onChange,
  unit,
  min = 1e-12,
  max = 1e15,
  step = "any",
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  unit: string;
  min?: number;
  max?: number;
  step?: number | "any";
  label: string;
}) {
  const { t, number, language } = usePreferences();
  const [draft, setDraft] = useState(number(value, 7));
  const [invalid, setInvalid] = useState(false);
  const draftChanged = useRef(false);
  useEffect(() => {
    draftChanged.current = false;
    setDraft(number(value, 7));
    setInvalid(false);
  }, [value, language, number]);
  const commit = () => {
    if (!draftChanged.current) return;
    const n = Number(draft.replace(",", "."));
    if (Number.isFinite(n) && n >= min && n <= max) {
      setInvalid(false);
      draftChanged.current = false;
      onChange(n);
    } else {
      setInvalid(true);
    }
  };
  return (
    <div className={`number-field ${invalid ? "invalid" : ""}`}>
      <input
        aria-label={label}
        aria-invalid={invalid}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          draftChanged.current = true;
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            draftChanged.current = false;
            setDraft(number(value, 7));
            setInvalid(false);
          }
        }}
        data-step={step}
        title={
          invalid
            ? t(
                `Wert zwischen ${number(min, 7)} und ${number(max, 7)} eingeben`,
                `Enter a value between ${number(min, 7)} and ${number(max, 7)}`,
              )
            : undefined
        }
      />
      <span>{unit}</span>
      {invalid && (
        <small className="field-error">
          {number(min, 7)} {t("bis", "to")} {number(max, 7)}
        </small>
      )}
    </div>
  );
}
