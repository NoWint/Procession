import zh from "./zh.json";
import en from "./en.json";

export type Locale = "zh" | "en";
export type TranslationDict = Record<string, string>;
export type TranslationFn = (key: string, params?: Record<string, string | number>) => string;

export const defaultLocale: Locale = "zh";

export const translations: Record<Locale, TranslationDict> = {
  zh: zh as TranslationDict,
  en: en as TranslationDict,
};

const LOCALE_STORAGE_KEY = "proc-locale";
const VALID_LOCALES: Locale[] = ["zh", "en"];

/**
 * Detect the user's preferred locale from navigator.language.
 * Returns "zh" for any Chinese variant (zh-CN, zh-TW, zh-HK, …), otherwise "en".
 */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return defaultLocale;
  const lang = navigator.language ?? "en";
  return lang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/**
 * Read a previously persisted locale preference from localStorage.
 * Returns null if no preference is stored or the value is invalid.
 */
export function readStoredLocale(): Locale | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && VALID_LOCALES.includes(stored as Locale)) {
      return stored as Locale;
    }
  } catch {
    // localStorage may be unavailable (private mode, sandboxed iframe, …).
  }
  return null;
}

/**
 * Persist a locale preference to localStorage so it survives reloads.
 * Silently no-ops if localStorage is unavailable.
 */
export function writeStoredLocale(locale: Locale): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore write failures — locale stays in-memory for the session.
  }
}

/**
 * Apply the active locale to <html lang="…" data-locale="…">.
 * CSS can hook off [data-locale="zh"] / [data-locale="en"] for locale-specific
 * tweaks (e.g. font choices) without a re-render.
 */
export function applyLocaleHtml(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.setAttribute("data-locale", locale);
}

/**
 * Look up a translation key in the given locale dict, falling back to English
 * and finally to the key itself if no translation is found.
 */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = translations[locale] ?? translations.en;
  let str = dict[key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}
