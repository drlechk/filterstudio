import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadImpedanceControl } from './LoadImpedanceControl';
import { PreferencesProvider } from '../lib/preferences';
import { defaultSettings } from '../lib/project';
import type { FilterSettings } from '../lib/types';

const render = (settings: FilterSettings) => renderToStaticMarkup(<PreferencesProvider>
  <LoadImpedanceControl settings={settings} onChange={() => {}} />
</PreferencesProvider>);

it('keeps automatic prototype loads available and exposes a separate custom load input', () => {
  const automatic = render(defaultSettings);
  expect(automatic).toContain('Prototype termination');
  expect(automatic).toContain('50 Ω');
  expect(automatic).toContain('aria-pressed="true">Automatic');
  expect(automatic).not.toContain('aria-label="Load impedance in ohms"');
  const custom = render({ ...defaultSettings, loadImpedance: 600 });
  expect(custom).toContain('aria-label="Load impedance in ohms"');
  expect(custom).toContain('value="600"');
  expect(custom).toContain('aria-pressed="true">Custom');
  expect(custom).toContain('no matching network is added');
});
