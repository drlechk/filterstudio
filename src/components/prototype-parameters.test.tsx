import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrototypeParameterControls } from "./PrototypeParameterControls";
import { PreferencesProvider } from "../lib/preferences";
import { defaultSettings } from "../lib/project";
import type { FilterFamily } from "../lib/types";

const render = (family: FilterFamily) => renderToStaticMarkup(<PreferencesProvider>
  <PrototypeParameterControls settings={{ ...defaultSettings, family }} onChange={() => {}} />
</PreferencesProvider>);

it("offers reflection for Chebyshev I and Cauer and modular angle only for Cauer", () => {
  for (const family of ["chebyshev", "cauer"] as const) {
    const html = render(family);
    expect(html).toContain('aria-label="Maximum reflection coefficient in percent"');
    expect(html).toContain("Amplitude ratio, not power ratio");
    expect(html.includes('aria-label="Modular angle in degrees"')).toBe(family === "cauer");
  }
  expect(render("cauer")).toContain("Editing adjusts Rₛ at fixed n and Rₚ");
  for (const family of ["butterworth", "chebyshev2", "bessel", "legendre", "linkwitz-riley"] as const)
    expect(render(family)).toBe("");
});

it("renders small reflection limits without rejecting or clamping their modular-angle controls", () => {
  for (const [order, ripple, percent] of [[3, 0.0017375254558758232, 2], [5, 0.09883233932095582, 15]]) {
    const html = renderToStaticMarkup(<PreferencesProvider>
      <PrototypeParameterControls settings={{ ...defaultSettings, family: 'cauer', order, ripple }} onChange={() => {}} />
    </PreferencesProvider>);
    expect(html).toContain(`value="${percent}"`);
    expect(html).toContain('0.001–3 dB');
    expect(html).toContain('Modular angle in degrees');
  }
});
