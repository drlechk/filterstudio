import { usePreferences } from '../lib/preferences';
import type { FilterSettings } from '../lib/types';

export function CauerVariantControl({ settings, onChange }: {
  settings: FilterSettings;
  onChange: (patch: Partial<FilterSettings>) => void;
}) {
  const { t } = usePreferences();
  if (settings.family !== 'cauer') return null;
  const selected = settings.cauerVariant ?? 'c';
  return <div className="parameter-field">
    <div className="field-label">{t('Cauer-Typ für gerade Ordnungen', 'Even-order elliptic class')}</div>
    <div className="segmented" role="group" aria-label={t('Cauer-Typ', 'Elliptic class')}>
      {(['b', 'c'] as const).map(variant => <button key={variant} type="button"
        className={selected === variant ? 'active' : ''} aria-pressed={selected === variant}
        onClick={() => onChange({ cauerVariant: variant })}>
        {t('Typ', 'Class')} {variant.toUpperCase()}
      </button>)}
    </div>
    <small className="field-help">{t(
      'Typ B benötigt ungleiche, Typ C gleiche Prototypabschlüsse. Die automatische Last berücksichtigt den Leiterbeginn. Bei ungeraden Ordnungen gilt der klassische Cauer-Prototyp.',
      'Class B requires unequal, class C equal prototype terminations. The automatic load accounts for the ladder start. Odd orders use the classical elliptic prototype.',
    )}</small>
  </div>;
}
