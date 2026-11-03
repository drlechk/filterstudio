import { useEffect, useId, useRef, useState } from "react";
import { usePreferences } from "../lib/preferences";
import { frequencyUnits, frequencyUnitScale, isFrequencyUnit, type FrequencyUnit } from "../lib/frequency-units";
import { formatUnitValue, parseUnitValue } from "../lib/unit-values";

export function FrequencyInput({ value, onChange, unit, onUnitChange, label, min = 1, max = 1e12 }: {
  value: number;
  onChange: (valueHz: number) => void;
  unit: FrequencyUnit;
  onUnitChange: (unit: FrequencyUnit) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  const { language, t } = usePreferences();
  const scale = frequencyUnitScale(unit);
  const [draft, setDraft] = useState(() => formatUnitValue(value, scale, language));
  const [invalid, setInvalid] = useState(false);
  const dirty = useRef(false);
  const errorId = useId();
  useEffect(() => {
    setDraft(formatUnitValue(value, scale, language));
    setInvalid(false);
    dirty.current = false;
  }, [value, scale, language]);

  function commit(): number | null {
    if (!dirty.current) return value;
    const next = parseUnitValue(draft, scale, min, max);
    if (next === null) {
      setInvalid(true);
      return null;
    }
    dirty.current = false;
    setInvalid(false);
    setDraft(formatUnitValue(next, scale, language));
    if (next !== value) onChange(next);
    return next;
  }

  return <div className="frequency-value-control">
    <div className={`number-field ${invalid ? "invalid" : ""}`}>
      <input
        aria-label={`${label} (${unit})`}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={event => {
          dirty.current = true;
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={() => commit()}
        onKeyDown={event => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            dirty.current = false;
            setDraft(formatUnitValue(value, scale, language));
            setInvalid(false);
          }
        }}
      />
      <select
        className="frequency-unit-select"
        aria-label={`${label}: ${t("Frequenzeinheit", "frequency unit")}`}
        value={unit}
        onChange={event => {
          const nextUnit = event.target.value;
          if (!isFrequencyUnit(nextUnit)) return;
          const currentValue = commit();
          if (currentValue === null) return;
          // The unit is view state: keep the stored Hz value and undo history untouched.
          onUnitChange(nextUnit);
          setDraft(formatUnitValue(currentValue, frequencyUnitScale(nextUnit), language));
        }}
      >
        {frequencyUnits.map(candidate => <option key={candidate.symbol} value={candidate.symbol}>{candidate.symbol}</option>)}
      </select>
    </div>
    {invalid && <small className="field-error" id={errorId} role="alert">
      {t("Zulässig:", "Allowed:")} {formatUnitValue(min, scale, language)}–{formatUnitValue(max, scale, language)} {unit}.
    </small>}
  </div>;
}
