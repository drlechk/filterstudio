import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CauerVariantControl } from './CauerVariantControl';
import { LoadImpedanceControl } from './LoadImpedanceControl';
import { PreferencesProvider } from '../lib/preferences';
import { defaultSettings } from '../lib/project';
import type { FilterSettings } from '../lib/types';

const render = (settings: FilterSettings) => renderToStaticMarkup(<PreferencesProvider>
  <CauerVariantControl settings={settings} onChange={() => {}} />
</PreferencesProvider>);

it('offers B/C for Cauer, defaults to C, and keeps the selection available for odd-order tolerance designs', () => {
  expect(render(defaultSettings)).toBe('');
  const settings = { ...defaultSettings, family: 'cauer' as const, order: 4 };
  expect(render(settings)).toContain('aria-pressed="true">Class C');
  expect(render({ ...settings, cauerVariant: 'b' })).toContain('aria-pressed="true">Class B');
  expect(render({ ...settings, order: 5 })).toContain('Odd orders use the classical elliptic prototype');
});

it('shows the class-B prototype load in the existing impedance control', () => {
  const html = renderToStaticMarkup(<PreferencesProvider>
    <LoadImpedanceControl settings={{ ...defaultSettings, family: 'cauer', order: 4, cauerVariant: 'b' }} onChange={() => {}} />
  </PreferencesProvider>);
  expect(html).toContain('25.2');
  expect(html).toContain('Prototype termination');
});
