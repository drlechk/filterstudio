export type Language = "de" | "en";
export type Theme = "light" | "dark";
export type CircuitSymbols = "european" | "american";
export type PreferenceSnapshot = {
  language: Language;
  theme: Theme;
  circuitSymbols: CircuitSymbols;
  showSourceAndLoad: boolean;
  themeIsExplicit: boolean;
};
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export const preferenceKeys = {
  language: "filterstudio.language",
  theme: "filterstudio.theme",
  circuitSymbols: "filterstudio.circuitSymbols",
  showSourceAndLoad: "filterstudio.showSourceAndLoad",
} as const;
export const themeColors = { light: "#f7f8f5", dark: "#10151c" } as const;
export const validLanguage = (value: unknown): value is Language =>
  value === "de" || value === "en";
export const validTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark";
export const validCircuitSymbols = (value: unknown): value is CircuitSymbols =>
  value === "european" || value === "american";

export function readPreference(
  storage: PreferenceStorage | undefined,
  key: string,
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function loadPreferences(
  storage: PreferenceStorage | undefined,
  systemDark = false,
): PreferenceSnapshot {
  const language = readPreference(storage, preferenceKeys.language);
  const theme = readPreference(storage, preferenceKeys.theme);
  const circuitSymbols = readPreference(storage, preferenceKeys.circuitSymbols);
  return {
    language: validLanguage(language) ? language : "en",
    theme: validTheme(theme) ? theme : systemDark ? "dark" : "light",
    circuitSymbols: validCircuitSymbols(circuitSymbols) ? circuitSymbols : "european",
    showSourceAndLoad: readPreference(storage, preferenceKeys.showSourceAndLoad) !== "false",
    themeIsExplicit: validTheme(theme),
  };
}

/** Persisting is best effort: browser privacy settings must not disable controls. */
export function savePreference(
  storage: PreferenceStorage | undefined,
  key: string,
  value: string,
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function formatNumber(
  value: number,
  language: Language,
  digits = 4,
): string {
  return new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US", {
    maximumSignificantDigits: Math.max(
      1,
      Math.min(21, Math.floor(digits) || 4),
    ),
  }).format(value);
}
