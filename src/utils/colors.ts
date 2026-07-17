import type { ProcessInfo } from "./types";
import { FALLBACK_THEME, colorForState, type Theme } from "./theme";

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

const PROTOCOL_COLORS: Record<string, string> = {
  tcp: "#4a9eff",
  udp: "#9aff4a",
  http: "#4af0ff",
  https: "#4af0ff",
};

export function cableColorForProtocol(
  protocol: string,
  theme: Theme = FALLBACK_THEME,
): string {
  const key = protocol.toLowerCase().trim();
  return PROTOCOL_COLORS[key] ?? theme.colors.accent;
}

export { colorForState };
export type { Theme };
