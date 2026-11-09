import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FilterCatalog } from "./FilterCatalog";
import { PreferencesProvider } from "../lib/preferences";
import { defaultSettings } from "../lib/project";
import type { ToleranceSpec } from "../lib/types";

const spec: ToleranceSpec = { response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 };
const render = (mask: ToleranceSpec, previewError: string | null = null) => renderToStaticMarkup(<PreferencesProvider>
  <FilterCatalog spec={mask} settings={{ ...defaultSettings, family: "butterworth" }} onSelect={() => {}}
    onGenerate={() => {}} onShowMask={() => {}} generating={false} previewError={previewError} />
</PreferencesProvider>);

it("compares independently calculated orders and exposes the normalized selected prototype", () => {
  const html = render(spec);
  expect(html).toContain("prototype n = 8");
  expect(html).toContain("prototype n = 5");
  expect(html).toContain("ω₀ = 1 rad/s");
  expect(html).toContain("Z₂ / Z₁ = 1");
  expect(html).toContain('aria-pressed="true"');
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
