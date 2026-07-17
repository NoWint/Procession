import type { ProcessInfo } from "./types";
import { FALLBACK_THEME, colorForState, type Theme } from "./theme";

export const COLORS = {
  system: "#4a9eff",
  user: "#9aff4a",
  active: "#ff9a4a",
  idle: "#666666",
} as const;

const systemNames = ["System", "kernel", "launchd", "init", "systemd", "services", "registry"];

export function isSystemProcess(p: ProcessInfo): boolean {
  return systemNames.some((s) => p.name.toLowerCase().includes(s.toLowerCase())) || p.user === "SYSTEM" || p.user === "root";
}

export function colorForProcess(p: ProcessInfo, theme: Theme = FALLBACK_THEME): string {
  // Muted states first.
  if (p.state === "Zombie") return theme.colors.zombie;
  if (p.state === "Stopped") return theme.colors.stopped;
  if (p.state === "Sleeping") return theme.colors.sleeping;

  const base = isSystemProcess(p) ? theme.colors.system : theme.colors.user;

  // High CPU running processes glow white/active regardless of system/user.
  if (p.cpu > 50) return theme.colors.active;
  if (p.cpu < 3) return theme.colors.idle;
  return base;
}

export function colorForProcessLegacy(p: ProcessInfo): string {
  if (systemNames.some((s) => p.name.toLowerCase().includes(s.toLowerCase()))) {
    return COLORS.system;
  }
  if (p.cpu > 50) return COLORS.active;
  if (p.cpu < 5) return COLORS.idle;
  return COLORS.user;
}

export { colorForState };
export type { Theme };
