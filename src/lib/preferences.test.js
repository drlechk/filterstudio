import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  formatNumber,
  loadPreferences,
  preferenceKeys,
  savePreference,
  themeColors,
} from "./preference-storage";
import { translateMessage } from "./messages";
import { synthesize } from "./synthesis";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("persistent display preferences", () => {
  it("defaults to German and the system theme without writing a preference", () => {
    const storage = memoryStorage();
    expect(loadPreferences(storage, true)).toEqual({
      language: "de",
      theme: "dark",
      themeIsExplicit: false,
    });
    expect(loadPreferences(storage, false)).toEqual({
      language: "de",
      theme: "light",
      themeIsExplicit: false,
    });
    expect(storage.getItem(preferenceKeys.theme)).toBeNull();
  });

  it("restores explicit choices across reloads and prioritizes them over the system", () => {
    const storage = memoryStorage();
    expect(savePreference(storage, preferenceKeys.language, "en")).toBe(true);
    expect(savePreference(storage, preferenceKeys.theme, "light")).toBe(true);
    expect(loadPreferences(storage, true)).toEqual({
      language: "en",
      theme: "light",
      themeIsExplicit: true,
    });
    savePreference(storage, preferenceKeys.theme, "dark");
    expect(loadPreferences(storage, false).theme).toBe("dark");
  });

  it("recovers from corrupt values and unavailable or denied browser storage", () => {
    expect(
      loadPreferences(
        memoryStorage({
          [preferenceKeys.language]: "fr",
          [preferenceKeys.theme]: "sepia",
        }),
        true,
      ),
    ).toEqual({ language: "de", theme: "dark", themeIsExplicit: false });
    const denied = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadPreferences(denied, true)).toEqual({
      language: "de",
      theme: "dark",
      themeIsExplicit: false,
    });
    expect(savePreference(denied, preferenceKeys.theme, "light")).toBe(false);
    expect(savePreference(undefined, preferenceKeys.language, "en")).toBe(
      false,
    );
    expect(loadPreferences(undefined, false).language).toBe("de");
  });

  it("formats decimal and grouping separators without discarding small component values", () => {
    expect(formatNumber(1234.5, "de", 5)).toBe("1.234,5");
    expect(formatNumber(1234.5, "en", 5)).toBe("1,234.5");
    expect(formatNumber(0.000012345, "en", 4)).toBe("0.00001235");
    expect(formatNumber(0.000012345, "de", 4)).toBe("0,00001235");
  });

  it("applies the saved or system theme before app rendering, even when storage is denied", () => {
    const html = readFileSync(
      new URL("../../index.html", import.meta.url),
      "utf8",
    );
    const bootstrap = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
    expect(bootstrap).toBeTruthy();
    for (const [storage, systemDark, expectedLanguage, expectedTheme] of [
      [
        memoryStorage({
          [preferenceKeys.language]: "en",
          [preferenceKeys.theme]: "light",
        }),
        true,
        "en",
        "light",
      ],
      [memoryStorage({ [preferenceKeys.theme]: "dark" }), false, "de", "dark"],
      [
        {
          getItem: () => {
            throw new Error("SecurityError");
          },
        },
        true,
        "de",
        "dark",
      ],
    ]) {
      const documentElement = { lang: "", dataset: {}, style: {} };
      const meta = { content: "" };
      runInNewContext(bootstrap, {
        localStorage: storage,
        matchMedia: () => ({ matches: systemDark }),
        document: { documentElement, querySelector: () => meta },
      });
      expect(documentElement.lang).toBe(expectedLanguage);
      expect(documentElement.dataset.theme).toBe(expectedTheme);
      expect(documentElement.style.colorScheme).toBe(expectedTheme);
      expect(documentElement.style.backgroundColor).toBe(
        themeColors[expectedTheme],
      );
      expect(meta.content).toBe(themeColors[expectedTheme]);
    }
  });
});

describe("canonical engine diagnostics", () => {
  it("translates every static engine error and preserves its German source", () => {
    const messages = [
      "network.ts",
      "project.ts",
      "frequency.ts",
      "synthesis.ts",
      "tolerance.ts",
    ].flatMap((file) => {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      return [...source.matchAll(/new Error\(\s*(?:'([^']*)'|"([^"]*)")/g)].map(
        (match) => match[1] ?? match[2],
      );
    });
    expect(messages.length).toBeGreaterThan(35);
    for (const message of messages) {
      expect(translateMessage(message, "de")).toBe(message);
      expect(translateMessage(message, "en"), message).not.toBe(message);
    }
  });

  it("translates all generated synthesis notes with dynamic frequencies and orders", () => {
    const settings = {
      family: "butterworth",
      response: "lowpass",
      order: 5,
      cutoff: 1e6,
      impedance: 50,
      ripple: 0.5,
      attenuation: 40,
      bandwidth: 5e5,
    };
    for (const family of ["butterworth", "chebyshev", "cauer"])
      for (const response of ["lowpass", "highpass", "bandpass", "bandstop"]) {
        const result = synthesize({
          ...settings,
          family,
          response,
          order: family === "chebyshev" ? 4 : 5,
        });
        for (const note of result.notes) {
          expect(translateMessage(note, "de")).toBe(note);
          expect(translateMessage(note, "en"), note).not.toBe(note);
        }
      }
    expect(
      translateMessage(
        "Tiefpass-Prototypgrad 7; resultierender Bandfiltergrad 14. Mittenfrequenz f₀ = √(f₁f₂), Bandbreite B = f₂ − f₁.",
        "en",
      ),
    ).toContain("order 14");
  });

  it("handles decimal-comma thresholds and all named positive-value errors", () => {
    expect(
      translateMessage(
        "Bandfilter benötigen eine Bandbreite von mindestens 0,1 % der Mittenfrequenz.",
        "en",
      ),
    ).toContain("0.1%");
    expect(
      translateMessage(
        "Die Bandbreite muss mindestens 0.1 % der Mittenfrequenz betragen.",
        "en",
      ),
    ).toContain("0.1%");
    for (const quantity of [
      "Bauteilwert",
      "Kapazität",
      "Bezugsfrequenz",
      "Eingangsimpedanz",
      "Ausgangsimpedanz",
      "Startfrequenz",
      "Endfrequenz",
    ]) {
      const message = `${quantity} muss eine endliche, positive Zahl sein.`;
      expect(translateMessage(message, "en")).toMatch(
        /must be a finite, positive number\.$/,
      );
      expect(translateMessage(message, "en")).not.toContain(quantity);
    }
  });

  it("keeps canonical strings unchanged and preserves unknown parser details", () => {
    const canonical = "Projekt als JSON heruntergeladen.";
    expect(translateMessage(canonical, "en")).toBe(
      "Project downloaded as JSON.",
    );
    expect(translateMessage(canonical, "de")).toBe(canonical);
    const unknown = "Unexpected token at position 17";
    expect(translateMessage(unknown, "en")).toBe(unknown);
  });
});
