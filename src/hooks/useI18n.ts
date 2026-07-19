import { createElement, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  applyLocaleHtml,
  detectLocale,
  readStoredLocale,
  translate,
  writeStoredLocale,
  type Locale,
  type TranslationFn,
} from "../i18n";

export interface UseI18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationFn;
}

/**
 * Default context value used when a component is rendered without an
 * <I18nProvider> ancestor (e.g. in unit tests that render a single component
 * in isolation). Provides English translations so labels resolve to real text
 * rather than raw keys, keeping existing tests working unchanged.
 */
const defaultContext: UseI18n = {
  locale: "en",
  setLocale: () => {
    /* no-op outside provider */
  },
  t: (key, params) => translate("en", key, params),
};

const I18nContext = createContext<UseI18n>(defaultContext);

export interface I18nProviderProps {
  children: React.ReactNode;
  /** Override the initial locale (useful for tests). */
  initialLocale?: Locale;
}

/**
 * Top-level locale provider. Resolves the initial locale in this priority:
 *   1. `initialLocale` prop (test override)
 *   2. `localStorage["proc-locale"]` (user's previous manual choice)
 *   3. `detectLocale()` (navigator.language)
 *
 * Persists manual `setLocale` calls to localStorage so they survive reloads,
 * and keeps <html lang/data-locale> in sync for accessibility and CSS.
 */
export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? readStoredLocale() ?? detectLocale(),
  );

  useEffect(() => {
    applyLocaleHtml(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeStoredLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback<TranslationFn>(
    (key, params) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo<UseI18n>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  // createElement keeps this file .ts-compatible (no JSX). The provider
  // value is memoised above so consumers only re-render on locale change.
  return createElement(I18nContext.Provider, { value }, children);
}

/**
 * Read the current i18n context. Falls back to English translations when
 * called outside an <I18nProvider> (e.g. in unit tests) so isolated
 * component renders don't crash on missing context.
 */
export function useI18n(): UseI18n {
  return useContext(I18nContext);
}
