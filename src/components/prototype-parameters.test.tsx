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
