import type { ProcessState } from "./types";

export interface ThemeTypography {
  heading: string;
  body: string;
  mono: string;
}

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  accent: string;
  border: string;
  grid: string;
  gridSecondary: string;
  ground: string;
  system: string;
  user: string;
  active: string;
  idle: string;
  sleeping: string;
  stopped: string;
  zombie: string;
  particle: string;
  electricCyan: string;
  coldBlue: string;
  pulseWhite: string;
  amber: string;
  deepRed: string;
  databasePurple: string;
  serviceGreen: string;
}

export interface ThemeScene {
  ambientIntensity: number;
  directionalIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
}

export interface Theme {
  name: string;
  mode: "dark" | "light";
  typography: ThemeTypography;
  colors: ThemeColors;
  scene: ThemeScene;
}

export interface ThemeMeta {
  id: string;
  name: string;
  mode: "dark" | "light";
  url: string;
}

export const DEFAULT_THEME_URL = "/themes/default.json";

const THEME_REGISTRY: ThemeMeta[] = [
  { id: "default", name: "Monument Valley Noir", mode: "dark", url: "/themes/default.json" },
  { id: "light", name: "Monument Valley Light", mode: "light", url: "/themes/light.json" },
  { id: "midnight-blue", name: "Midnight Blue", mode: "dark", url: "/themes/midnight-blue.json" },
];

const THEME_STORAGE_KEY = "procession-theme-url";
const CUSTOM_THEMES_STORAGE_KEY = "procession-custom-themes";

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#([0-9a-fA-F]{3}){1,2}$/.test(value);
}

function isMode(value: unknown): value is "dark" | "light" {
  return value === "dark" || value === "light";
}

function hasAllKeys(obj: unknown, keys: string[]): obj is Record<string, unknown> {
  if (!obj || typeof obj !== "object") return false;
  return keys.every((k) => k in obj);
}

export function validateTheme(data: unknown): Theme | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  if (typeof d.name !== "string" || !isMode(d.mode)) return null;

  if (!hasAllKeys(d.typography, ["heading", "body", "mono"])) return null;
  const typography = d.typography as unknown as ThemeTypography;

  const colorKeys: (keyof ThemeColors)[] = [
    "background",
    "surface",
    "surfaceElevated",
    "text",
    "textMuted",
    "accent",
    "border",
    "grid",
    "gridSecondary",
    "ground",
    "system",
    "user",
    "active",
    "idle",
    "sleeping",
    "stopped",
    "zombie",
    "particle",
    "electricCyan",
    "coldBlue",
    "pulseWhite",
    "amber",
    "deepRed",
    "databasePurple",
    "serviceGreen",
  ];
  if (!hasAllKeys(d.colors, colorKeys)) return null;
  const colors = d.colors as unknown as ThemeColors;
  if (!colorKeys.every((k) => isHexColor(colors[k]))) return null;

  const sceneKeys: (keyof ThemeScene)[] = [
    "ambientIntensity",
    "directionalIntensity",
    "fogColor",
    "fogNear",
    "fogFar",
  ];
  if (!hasAllKeys(d.scene, sceneKeys)) return null;
  const scene = d.scene as unknown as ThemeScene;
  if (
    typeof scene.ambientIntensity !== "number" ||
    typeof scene.directionalIntensity !== "number" ||
    typeof scene.fogNear !== "number" ||
    typeof scene.fogFar !== "number" ||
    !isHexColor(scene.fogColor)
  ) {
    return null;
  }

  return { name: d.name, mode: d.mode, typography, colors, scene };
}

function customThemeUrl(id: string): string {
  return `theme://local/${id}`;
}

function parseCustomThemeUrl(url: string): string | null {
  if (!url.startsWith("theme://local/")) return null;
  return url.slice("theme://local/".length);
}

export function getCustomThemes(): ThemeMeta[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ThemeMeta =>
          item &&
          typeof item === "object" &&
          typeof (item as ThemeMeta).id === "string" &&
          typeof (item as ThemeMeta).name === "string" &&
          isMode((item as ThemeMeta).mode) &&
          typeof (item as ThemeMeta).url === "string",
      )
      .map((item) => ({ ...item, url: customThemeUrl(item.id) }));
  } catch {
    return [];
  }
}

function loadCustomThemeById(id: string): Theme | null {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Array<{ meta: ThemeMeta; theme: Theme }>;
    const entry = parsed.find((p) => p.meta.id === id);
    return entry ? validateTheme(entry.theme) : null;
  } catch {
    return null;
  }
}

export function saveCustomTheme(theme: Theme): ThemeMeta {
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const meta: ThemeMeta = { id, name: theme.name, mode: theme.mode, url: customThemeUrl(id) };
  const payload = { meta, theme };

  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as Array<{ meta: ThemeMeta; theme: Theme }>) : [];
    existing.push(payload);
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Ignore storage errors.
  }

  return meta;
}

export function deleteCustomTheme(id: string): void {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return;
    const existing = JSON.parse(raw) as Array<{ meta: ThemeMeta; theme: Theme }>;
    const next = existing.filter((p) => p.meta.id !== id);
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors.
  }
}

export function exportThemeJson(theme: Theme): string {
  return JSON.stringify(theme, null, 2);
}

export function importThemeJson(json: string): Theme | null {
  try {
    const data = JSON.parse(json) as unknown;
    return validateTheme(data);
  } catch {
    return null;
  }
}

export function getThemeRegistry(): ThemeMeta[] {
  return [...THEME_REGISTRY, ...getCustomThemes()];
}

export function findThemeMetaByUrl(url: string): ThemeMeta | undefined {
  return getThemeRegistry().find((t) => t.url === url);
}

export function getSavedThemeUrl(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveThemeUrl(url: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, url);
  } catch {
    // Ignore storage errors (e.g., private mode).
  }
}

export const FALLBACK_THEME: Theme = {
  name: "Digital City",
  mode: "dark",
  typography: {
    heading: '"Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"SF Mono", "Cascadia Code", "Fira Code", monospace',
  },
  colors: {
    background: "#03040a",
    surface: "#0c0c10",
    surfaceElevated: "#131318",
    text: "#f2f4f8",
    textMuted: "#9da2ad",
    accent: "#00e5ff",
    border: "#2a2a35",
    grid: "#0f0f18",
    gridSecondary: "#0a0a12",
    ground: "#0c0c14",
    system: "#c0c0d0",
    user: "#9090a0",
    active: "#00e5ff",
    idle: "#4aa8ff",
    sleeping: "#6a6a75",
    stopped: "#3a3a45",
    zombie: "#2a2a35",
    particle: "#a0d0ff",
    electricCyan: "#00e5ff",
    coldBlue: "#4aa8ff",
    pulseWhite: "#ffffff",
    amber: "#ffb84d",
    deepRed: "#ff3b5c",
    databasePurple: "#9d7bff",
    serviceGreen: "#5ce1a8",
  },
  scene: {
    ambientIntensity: 0.15,
    directionalIntensity: 0.6,
    fogColor: "#03040a",
    fogNear: 15,
    fogFar: 80,
  },
};

function isValidThemeUrl(url: string): boolean {
  if (url.startsWith("theme://local/")) return true;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.pathname.startsWith("/themes/") && parsed.pathname.endsWith(".json");
  } catch {
    return false;
  }
}

function mergeTheme(data: Partial<Theme>): Theme {
  return {
    ...FALLBACK_THEME,
    ...data,
    colors: { ...FALLBACK_THEME.colors, ...data.colors },
    scene: { ...FALLBACK_THEME.scene, ...data.scene },
    typography: { ...FALLBACK_THEME.typography, ...data.typography },
  };
}

export async function loadTheme(url: string): Promise<Theme> {
  if (!isValidThemeUrl(url)) {
    console.warn(`Rejected unsafe theme URL: ${url}`);
    return FALLBACK_THEME;
  }

  const customId = parseCustomThemeUrl(url);
  if (customId) {
    const custom = loadCustomThemeById(customId);
    return custom ?? FALLBACK_THEME;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load theme: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as Partial<Theme>;
    return mergeTheme(data);
  } catch (error) {
    console.warn("Theme load failed, using fallback.", error);
    return FALLBACK_THEME;
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.mode);

  const c = theme.colors;
  root.style.setProperty("--proc-bg", c.background);
  root.style.setProperty("--proc-surface", c.surface);
  root.style.setProperty("--proc-surface-elevated", c.surfaceElevated);
  root.style.setProperty("--proc-text", c.text);
  root.style.setProperty("--proc-text-muted", c.textMuted);
  root.style.setProperty("--proc-accent", c.accent);
  root.style.setProperty("--proc-border", c.border);
  root.style.setProperty("--proc-grid", c.grid);
  root.style.setProperty("--proc-grid-secondary", c.gridSecondary);
  root.style.setProperty("--proc-ground", c.ground);
  root.style.setProperty("--proc-system", c.system);
  root.style.setProperty("--proc-user", c.user);
  root.style.setProperty("--proc-active", c.active);
  root.style.setProperty("--proc-idle", c.idle);
  root.style.setProperty("--proc-sleeping", c.sleeping);
  root.style.setProperty("--proc-stopped", c.stopped);
  root.style.setProperty("--proc-zombie", c.zombie);
  root.style.setProperty("--proc-particle", c.particle);
  root.style.setProperty("--proc-electric-cyan", c.electricCyan);
  root.style.setProperty("--proc-cold-blue", c.coldBlue);
  root.style.setProperty("--proc-pulse-white", c.pulseWhite);
  root.style.setProperty("--proc-amber", c.amber);
  root.style.setProperty("--proc-deep-red", c.deepRed);
  root.style.setProperty("--proc-database-purple", c.databasePurple);
  root.style.setProperty("--proc-service-green", c.serviceGreen);

  root.style.setProperty("--proc-font-heading", theme.typography.heading);
  root.style.setProperty("--proc-font-body", theme.typography.body);
  root.style.setProperty("--proc-font-mono", theme.typography.mono);
}

export function colorForState(theme: Theme, state: ProcessState): string {
  switch (state) {
    case "Running":
      return theme.colors.active;
    case "Sleeping":
      return theme.colors.sleeping;
    case "Stopped":
      return theme.colors.stopped;
    case "Zombie":
      return theme.colors.zombie;
    default:
      return theme.colors.idle;
  }
}
