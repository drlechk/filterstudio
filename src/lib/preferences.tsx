import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  formatNumber,
  loadPreferences,
  preferenceKeys,
  savePreference,
  themeColors,
  validLanguage,
  validTheme,
  type Language,
  type PreferenceSnapshot,
  type PreferenceStorage,
  type Theme,
} from "./preference-storage";
import { translateMessage } from "./messages";

export type { Language, Theme } from "./preference-storage";
export type Translator = (de: string, en: string) => string;
export type Preferences = {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: Translator;
  translate: (message: string) => string;
  /** Locale-aware formatting with up to `digits` significant digits (default 4). */
  number: (value: number, digits?: number) => string;
};

const PreferencesContext = createContext<Preferences | null>(null);
const storage = (): PreferenceStorage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};
const darkPreference = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : undefined;
const initialPreferences = () =>
  loadPreferences(storage(), darkPreference()?.matches ?? false);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] =
    useState<PreferenceSnapshot>(initialPreferences);
  const { language, theme, themeIsExplicit } = preferences;
  const setLanguage = useCallback((value: Language) => {
    if (!validLanguage(value)) return;
    setPreferences((previous) => ({ ...previous, language: value }));
    savePreference(storage(), preferenceKeys.language, value);
  }, []);
  const setTheme = useCallback((value: Theme) => {
    if (!validTheme(value)) return;
    setPreferences((previous) => ({
      ...previous,
      theme: value,
      themeIsExplicit: true,
    }));
    savePreference(storage(), preferenceKeys.theme, value);
  }, []);

  useLayoutEffect(() => {
    const html = document.documentElement;
    html.lang = language;
    html.dataset.theme = theme;
    html.style.colorScheme = theme;
    html.style.backgroundColor = themeColors[theme];
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeColors[theme]);
    document.title =
      language === "de"
        ? "Filterstudio · Das analoge Filterlabor"
        : "Filterstudio · The analog filter lab";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        language === "de"
          ? "Analoge Filter entwerfen, Schaltungen verstehen und S-Parameter interaktiv untersuchen. Ein lokales Filterlabor für die Lehre."
          : "Design analog filters, explore circuits, and investigate S-parameters interactively. A browser-based filter lab for teaching.",
      );
  }, [language, theme]);

  useEffect(() => {
    if (themeIsExplicit) return;
    const media = darkPreference();
    if (!media) return;
    const update = (event: MediaQueryListEvent) =>
      setPreferences((previous) =>
        previous.themeIsExplicit
          ? previous
          : { ...previous, theme: event.matches ? "dark" : "light" },
      );
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, [themeIsExplicit]);

  useEffect(() => {
    const update = (event: StorageEvent) => {
      // Ignore sessionStorage changes that happen to use the same key.
      if (event.storageArea && event.storageArea !== storage()) return;
      if (event.key === null) {
        setPreferences(initialPreferences());
        return;
      }
      if (event.key === preferenceKeys.language) {
        setPreferences((previous) => ({
          ...previous,
          language: validLanguage(event.newValue) ? event.newValue : "en",
        }));
      } else if (event.key === preferenceKeys.theme) {
        const explicit = validTheme(event.newValue);
        const nextTheme = explicit
          ? (event.newValue as Theme)
          : darkPreference()?.matches
            ? "dark"
            : "light";
        setPreferences((previous) => ({
          ...previous,
          theme: nextTheme,
          themeIsExplicit: explicit,
        }));
      }
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  const value = useMemo<Preferences>(
    () => ({
      language,
      theme,
      setLanguage,
      setTheme,
      t: (de, en) => (language === "de" ? de : en),
      translate: (message) => translateMessage(message, language),
      number: (value, digits) => formatNumber(value, language, digits),
    }),
    [language, theme, setLanguage, setTheme],
  );
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): Preferences {
  const value = useContext(PreferencesContext);
  if (!value)
    throw new Error("usePreferences must be used within PreferencesProvider.");
  return value;
}
