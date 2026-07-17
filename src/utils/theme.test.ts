import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadTheme, getSavedThemeUrl, saveThemeUrl, FALLBACK_THEME, DEFAULT_THEME_URL } from "./theme";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
    writable: true,
    configurable: true,
  });
});

describe("loadTheme", () => {
  it("loads a valid theme from /themes/", async () => {
    const custom = { name: "Custom", colors: { accent: "#ff0000" } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => custom,
    } as Response);

    const theme = await loadTheme("/themes/custom.json");
    expect(theme.name).toBe("Custom");
    expect(theme.colors.accent).toBe("#ff0000");
    // Unspecified fields fallback to default theme.
    expect(theme.colors.background).toBe(FALLBACK_THEME.colors.background);
  });

  it("rejects URLs outside /themes/ and falls back to default", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "Evil" }),
    } as Response);

    const theme = await loadTheme("https://evil.example.com/theme.json");
    expect(theme.name).toBe(FALLBACK_THEME.name);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to default when fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network"));

    const theme = await loadTheme(DEFAULT_THEME_URL);
    expect(theme.name).toBe(FALLBACK_THEME.name);
  });
});

describe("theme localStorage", () => {
  it("round-trips theme URL", () => {
    saveThemeUrl("/themes/light.json");
    expect(getSavedThemeUrl()).toBe("/themes/light.json");
  });
});
