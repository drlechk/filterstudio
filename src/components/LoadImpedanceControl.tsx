import { usePreferences } from '../lib/preferences';
import { MIN_LOAD_IMPEDANCE } from '../lib/filter-limits';
import { prototypeLoadImpedance } from '../lib/synthesis';
import type { FilterSettings } from '../lib/types';
import { PositiveInput } from './PositiveInput';

export function LoadImpedanceControl({ settings, onChange }: {
  settings: FilterSettings; onChange: (patch: Partial<FilterSettings>) => void;
}) {
  const { t, number } = usePreferences();
  const automatic = settings.loadImpedance === undefined;
  const nominal = prototypeLoadImpedance(settings);
  return <div className="parameter-field">
    <div className="field-label">{t('Lastimpedanz', 'Load impedance')} <span>Rₗ</span></div>
    <div className="segmented" role="group" aria-label={t('Lastimpedanz-Modus', 'Load impedance mode')}>
      <button type="button" className={automatic ? 'active' : ''} aria-pressed={automatic}
        onClick={() => onChange({ loadImpedance: undefined })}>{t('Automatisch', 'Automatic')}</button>
      <button type="button" className={!automatic ? 'active' : ''} aria-pressed={!automatic}
        onClick={() => onChange({ loadImpedance: settings.loadImpedance ?? nominal })}>{t('Frei wählen', 'Custom')}</button>
    </div>
    {automatic ? <small className="field-help">{t('Prototypabschluss', 'Prototype termination')}: {number(nominal, 7)} Ω</small> : <>
      <PositiveInput label={t('Lastimpedanz in Ohm', 'Load impedance in ohms')} value={settings.loadImpedance!}
        unit="Ω" min={MIN_LOAD_IMPEDANCE} max={1e9} onChange={loadImpedance => onChange({ loadImpedance })} />
      <small className="field-help">{t('Eine abweichende Last verändert Frequenzgang, Welligkeit und Reflexion. Die LC-Werte werden für den Prototypabschluss berechnet; es wird kein Anpassungsnetzwerk ergänzt.',
        'A different load changes the response, ripple and reflection. LC values are calculated for the prototype termination; no matching network is added.')}</small>
    </>}
  </div>;
}
