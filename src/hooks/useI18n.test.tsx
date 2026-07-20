import type { ReactNode } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  detectLocale,
  translate,
  applyLocaleHtml,
  readStoredLocale,
  writeStoredLocale,
  translations,
} from "../i18n";
import { I18nProvider, useI18n } from "./useI18n";

const originalNavigatorLanguage = navigator.language;

function setNavigatorLanguage(lang: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: lang,
  });
}

function restoreNavigatorLanguage() {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: originalNavigatorLanguage,
  });
}

function clearLocalStorage() {
  localStorage.clear();
}

describe("detectLocale", () => {
  afterEach(() => {
    restoreNavigatorLanguage();
  });

  it("returns zh for navigator.language = zh-CN", () => {
    setNavigatorLanguage("zh-CN");
    expect(detectLocale()).toBe("zh");
  });

  it("returns zh for navigator.language = zh-TW", () => {
    setNavigatorLanguage("zh-TW");
    expect(detectLocale()).toBe("zh");
  });

  it("returns en for navigator.language = en-US", () => {
    setNavigatorLanguage("en-US");
    expect(detectLocale()).toBe("en");
  });

  it("returns en for navigator.language = en-GB", () => {
    setNavigatorLanguage("en-GB");
    expect(detectLocale()).toBe("en");
  });

  it("returns en for unrelated locales (fr-FR)", () => {
    setNavigatorLanguage("fr-FR");
    expect(detectLocale()).toBe("en");
  });
});

describe("translate", () => {
  it("returns the correct string for a known key", () => {
    expect(translate("en", "app.title")).toBe("Procession");
    expect(translate("zh", "popup.parent_process")).toBe("父进程");
  });

  it("interpolates parameters correctly", () => {
    expect(
      translate("en", "app.subtitle.process_count", { count: 42, cpu: "12.3" }),
    ).toBe("42 processes · 12.3% CPU");
    expect(
      translate("zh", "popup.block_summary", { rootName: "Code.exe", count: 7 }),
    ).toBe("Code.exe · 共 7 进程");
  });

  it("returns the key itself when no translation exists", () => {
    expect(translate("en", "no.such.key")).toBe("no.such.key");
    expect(translate("zh", "no.such.key")).toBe("no.such.key");
  });

  it("falls back to English when the zh dict is missing a key", () => {
    // Inject a key only in English to verify the fallback path.
    const enBackup = translations.en["test.fallback.only_en"];
    translations.en["test.fallback.only_en"] = "English only";
    try {
      expect(translate("zh", "test.fallback.only_en")).toBe("English only");
    } finally {
      if (enBackup === undefined) {
        delete translations.en["test.fallback.only_en"];
      } else {
        translations.en["test.fallback.only_en"] = enBackup;
      }
    }
  });
});

describe("localStorage persistence", () => {
  beforeEach(() => {
    clearLocalStorage();
  });

  afterEach(() => {
    clearLocalStorage();
  });

  it("writeStoredLocale / readStoredLocale round-trip", () => {
    writeStoredLocale("zh");
    expect(readStoredLocale()).toBe("zh");
    writeStoredLocale("en");
    expect(readStoredLocale()).toBe("en");
  });

  it("readStoredLocale returns null when nothing is stored", () => {
    expect(readStoredLocale()).toBeNull();
  });

  it("readStoredLocale returns null for an invalid value", () => {
    localStorage.setItem("proc-locale", "klingon");
    expect(readStoredLocale()).toBeNull();
  });
});

describe("applyLocaleHtml", () => {
  it("sets <html lang> and data-locale", () => {
    applyLocaleHtml("zh");
    expect(document.documentElement.lang).toBe("zh");
    expect(document.documentElement.getAttribute("data-locale")).toBe("zh");

    applyLocaleHtml("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.getAttribute("data-locale")).toBe("en");
  });
});

describe("useI18n hook", () => {
  beforeEach(() => {
    clearLocalStorage();
    setNavigatorLanguage("en-US");
  });

  afterEach(() => {
    clearLocalStorage();
    restoreNavigatorLanguage();
  });

  it("returns the detected locale when no preference is stored", () => {
    setNavigatorLanguage("zh-CN");
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.locale).toBe("zh");
  });

  it("returns the stored locale when a preference exists", () => {
    setNavigatorLanguage("zh-CN");
    writeStoredLocale("en");
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.locale).toBe("en");
  });

  it("t() returns translated strings for the active locale", () => {
    setNavigatorLanguage("en-US");
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.t("app.title")).toBe("Procession");
    expect(result.current.t("hud.cpu")).toBe("CPU");
  });

  it("t() interpolates params", () => {
    setNavigatorLanguage("en-US");
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(
      result.current.t("app.subtitle.process_count", { count: 5, cpu: "50.0" }),
    ).toBe("5 processes · 50.0% CPU");
  });

  it("t() returns the key for unknown translations", () => {
    setNavigatorLanguage("en-US");
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.t("does.not.exist")).toBe("does.not.exist");
  });

  it("switching locale changes the returned string", () => {
    setNavigatorLanguage("en-US");
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.t("popup.parent_process")).toBe("Parent process");

    act(() => {
      result.current.setLocale("zh");
    });

    expect(result.current.locale).toBe("zh");
    expect(result.current.t("popup.parent_process")).toBe("父进程");
  });

  it("setLocale persists the choice to localStorage", () => {
    setNavigatorLanguage("en-US");
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });

    act(() => {
      result.current.setLocale("zh");
    });

    expect(readStoredLocale()).toBe("zh");
  });

  it("falls back to English context when used outside a provider", () => {
    // Default context value keeps isolated renders (e.g. existing tests
    // that render a single component) working without forcing every test
    // to wrap in <I18nProvider>.
    const { result } = renderHook(() => useI18n());
    expect(result.current.locale).toBe("en");
    expect(result.current.t("app.title")).toBe("Procession");
    expect(result.current.t("popup.parent_process")).toBe("Parent process");
  });

  it("respects the initialLocale prop override", () => {
    setNavigatorLanguage("en-US");
    writeStoredLocale("en");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider initialLocale="zh">{children}</I18nProvider>
    );
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("zh");
    expect(result.current.t("popup.parent_process")).toBe("父进程");
  });
});
