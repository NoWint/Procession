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

export function getThemeRegistry(): ThemeMeta[] {
  return [...THEME_REGISTRY];
}

export function findThemeMetaByUrl(url: string): ThemeMeta | undefined {
  return THEME_REGISTRY.find((t) => t.url === url);
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
  name: "Monument Valley Noir",
  mode: "dark",
  typography: {
    heading: '"Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"SF Mono", "Cascadia Code", "Fira Code", monospace',
  },
  colors: {
    background: "#0a0a0f",
    surface: "#141419",
    surfaceElevated: "#1e1e26",
    text: "#f0f0f5",
    textMuted: "#8a8a95",
    accent: "#e8e8f0",
    border: "#2a2a35",
    grid: "#1f1f2a",
    gridSecondary: "#111118",
    ground: "#0c0c12",
    system: "#c0c0d0",
    user: "#9090a0",
    active: "#ffffff",
    idle: "#4a4a55",
    sleeping: "#6a6a75",
    stopped: "#3a3a45",
    zombie: "#2a2a35",
    particle: "#a0a0b0",
  },
  scene: {
    ambientIntensity: 0.4,
    directionalIntensity: 0.9,
    fogColor: "#0a0a0f",
    fogNear: 20,
    fogFar: 90,
  },
};

export async function loadTheme(url: string): Promise<Theme> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load theme: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as Theme;
    return { ...FALLBACK_THEME, ...data };
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
