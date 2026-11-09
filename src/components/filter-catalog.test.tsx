import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FilterCatalog } from "./FilterCatalog";
import { PreferencesProvider } from "../lib/preferences";
import { defaultSettings } from "../lib/project";
import type { FilterSettings, ToleranceSpec } from "../lib/types";

const spec: ToleranceSpec = { response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 };
const render = (mask: ToleranceSpec, previewError: string | null = null, settings: FilterSettings = defaultSettings) => renderToStaticMarkup(<PreferencesProvider>
  <FilterCatalog spec={mask} settings={settings} onSelect={() => {}}
    onSpecChange={() => {}} onSettingsChange={() => {}} frequencyUnit="MHz" onFrequencyUnitChange={() => {}}
    onGenerate={() => {}} onShowMask={() => {}} generating={false} previewError={previewError} />
</PreferencesProvider>);

it("compares independently calculated orders and exposes the normalized selected prototype", () => {
  const html = render(spec);
  expect(html).toContain("prototype n = 8");
  expect(html).toContain("prototype n = 5");
  expect(html).toContain("ω₀ = 1 rad/s");
  expect(html).toContain("Z₂ / Z₁ = 1");
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-label="Catalog parameters"');
  expect(html).toContain('aria-label="Passband edge (MHz)"');
  expect(html).toContain('aria-label="Reference impedance (Ω)"');
  expect(html).not.toContain('B 08');
  expect(html).not.toContain('Alternative P/T/C notation:');
  expect(html).toContain('Table 1, column n = 8');
  expect(html).toContain('Open evidence for this specific entry');
  expect(html).toContain('No documented catalog reference');
  expect(html).toContain('target="_blank" rel="noopener noreferrer"');
});

it('shows both ladder choices and uses the selected topology in the normalized catalog prototype', () => {
  const series = render(spec, null, { ...defaultSettings, ladderStart: 'series' });
  const shunt = render(spec, null, { ...defaultSettings, ladderStart: 'shunt' });
  expect(shunt).toContain('aria-label="Ladder start"');
  expect(shunt).toContain('aria-pressed="true" title="Shunt branch first">Shunt First');
  expect(shunt).toContain('aria-pressed="false" title="Series branch first">Series First');
  expect(series).toContain('aria-pressed="true" title="Series branch first">Series First');
  expect(series).toContain('<tr><td>1</td><td>Series branch</td><td>L = ');
  expect(shunt).toContain('<tr><td>1</td><td>Shunt branch</td><td>C = ');
});

it("disables entries for an invalid mask and hides the prototype", () => {
  const html = render({ ...spec, stopband: [0.5e6] });
  expect((html.match(/disabled=""/g) ?? []).length).toBe(8);
  expect(html).not.toContain("<details");
});

it("shows synthesis errors and disables generation in the catalog view", () => {
  const html = render(spec, "Synthesis failed");
  expect(html).toContain('class="catalog-error" role="status">Synthesis failed');
  expect(html).toContain('class="button primary" disabled=""');
});

it("offers all four frequency edges directly for band designs", () => {
  const html = render({ ...spec, response: "bandpass", passband: [0.8e6, 1.2e6], stopband: [0.4e6, 2e6] });
  for (const label of ["Lower passband edge", "Upper passband edge", "Lower stopband edge", "Upper stopband edge"])
    expect(html).toContain(`aria-label="${label} (MHz)"`);
  expect(html).toContain('value="bandpass" selected=""');
  expect(html).toContain('aria-label="Max. passband loss (dB)"');
  expect(html).toContain('aria-label="Min. stopband attenuation (dB)"');
});

it("identifies unmatched designs without fabricating or rounding a catalog number", () => {
  const html = render({ ...spec, stopband: [1.5e6] });
  expect(html).toContain("No documented catalog entry is registered.");
  expect(html).not.toContain('class="catalog-code"');
  expect(html).not.toContain("Computed lookup key");
  expect(html).toContain("Calculated low-pass prototype");
});
