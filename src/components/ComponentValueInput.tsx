import { useEffect, useId, useRef, useState } from "react";
import { usePreferences } from "../lib/preferences";
import {
  componentUnits,
  formatComponentValue,
  initialComponentUnit,
  MAX_COMPONENT_VALUE,
  parseComponentValue,
  type ComponentQuantity,
} from "../lib/component-units";

export function ComponentValueInput({
  quantity,
  value,
  onChange,
  label,
}: {
  quantity: ComponentQuantity;
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const { language, t } = usePreferences();
  const units = componentUnits[quantity];
  const [scale, setScale] = useState(
    () => initialComponentUnit(quantity, value).scale,
  );
  const [draft, setDraft] = useState(() =>
    formatComponentValue(value, scale, language),
  );
  const [invalid, setInvalid] = useState(false);
  const dirty = useRef(false);
  const errorId = useId();
  const unit = units.find((candidate) => candidate.scale === scale)!;

  useEffect(() => {
    setDraft(formatComponentValue(value, scale, language));
    setInvalid(false);
    dirty.current = false;
  }, [value, scale, language]);

  function commit(): number | null {
    if (!dirty.current) return value;
    const next = parseComponentValue(draft, scale);
    if (next === null) {
      setInvalid(true);
      return null;
    }
    dirty.current = false;
    setInvalid(false);
    setDraft(formatComponentValue(next, scale, language));
    if (next !== value) onChange(next);
    return next;
  }

  return (
    <div className="component-value-control">
      <div className={`number-field ${invalid ? "invalid" : ""}`}>
        <input
          aria-label={label}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(event) => {
            dirty.current = true;
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              dirty.current = false;
              setDraft(formatComponentValue(value, scale, language));
              setInvalid(false);
            }
          }}
        />
        <select
          className="component-unit-select"
          aria-label={`${label}: ${t("Einheit", "unit")}`}
          value={scale}
          onChange={(event) => {
            const nextScale = Number(event.target.value);
            if (!units.some((candidate) => candidate.scale === nextScale))
              return;
            const currentValue = commit();
            if (currentValue === null) return;
            // Changing only the display unit must not round or commit the SI value.
            setScale(nextScale);
            setDraft(formatComponentValue(currentValue, nextScale, language));
          }}
        >
          {units.map((candidate) => (
            <option key={candidate.symbol} value={candidate.scale}>
              {candidate.symbol}
            </option>
          ))}
        </select>
      </div>
      {invalid && (
        <small className="field-error" id={errorId} role="alert">
          {t(
            "Positiven Wert eingeben, höchstens",
            "Enter a positive value, at most",
          )}{" "}
          {formatComponentValue(MAX_COMPONENT_VALUE, scale, language)}{" "}
          {unit.symbol}.
        </small>
      )}
    </div>
  );
}
