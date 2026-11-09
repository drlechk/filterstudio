import { usePreferences } from '../lib/preferences';
import { defaultLadderStart } from '../lib/filter-limits';
import type { FilterSettings, Section } from '../lib/types';

export function LadderStartControl({ settings, onChange }: {
  settings: Pick<FilterSettings, 'family' | 'ladderStart'>;
  onChange: (start: Section['connection']) => void;
}) {
  const { t } = usePreferences();
  const selected = settings.ladderStart ?? defaultLadderStart(settings.family);
  return <div className="parameter-field ladder-start-control">
    <div className="field-label">{t('Leiterbeginn', 'Ladder start')}</div>
    <div className="segmented" role="group" aria-label={t('Leiterbeginn', 'Ladder start')}>
      <button type="button" className={selected === 'shunt' ? 'active' : ''} aria-pressed={selected === 'shunt'}
        title={t('Querzweig zuerst', 'Shunt branch first')} onClick={() => onChange('shunt')}>Shunt First</button>
      <button type="button" className={selected === 'series' ? 'active' : ''} aria-pressed={selected === 'series'}
        title={t('Längszweig zuerst', 'Series branch first')} onClick={() => onChange('series')}>Series First</button>
    </div>
  </div>;
}
