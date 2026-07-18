import type { ProcessInfo } from "./types";
import { FALLBACK_THEME, colorForState, type Theme } from "./theme";

const systemNames = ["System", "kernel", "launchd", "init", "systemd", "services", "registry"];
const databaseNames = ["sql", "mysql", "postgres", "mongo", "redis", "db", "database"];
const browserNames = ["chrome", "safari", "firefox", "edge", "opera"];
const editorNames = ["code", "vscode", "cursor", "idea", "vim", "emacs"];

export function isSystemProcess(p: ProcessInfo): boolean {
  return (
    systemNames.some((s) => p.name.toLowerCase().includes(s.toLowerCase())) ||
    p.user === "SYSTEM" ||
    p.user === "root"
  );
}

export function isDatabaseProcess(p: ProcessInfo): boolean {
  return databaseNames.some((s) => p.name.toLowerCase().includes(s));
}

export function isBrowserProcess(p: ProcessInfo): boolean {
  return browserNames.some((s) => p.name.toLowerCase().includes(s));
}

export function isEditorProcess(p: ProcessInfo): boolean {
  return editorNames.some((s) => p.name.toLowerCase().includes(s));
}

export function colorForProcess(p: ProcessInfo, theme: Theme = FALLBACK_THEME): string {
  if (p.state === "Zombie") return theme.colors.zombie;
  if (p.state === "Stopped") return theme.colors.stopped;
  if (p.state === "Sleeping") return theme.colors.sleeping;

  if (p.cpu > 50) return theme.colors.amber;

  if (isDatabaseProcess(p)) return theme.colors.databasePurple;
  if (isBrowserProcess(p)) return theme.colors.coldBlue;
  if (isEditorProcess(p)) return theme.colors.serviceGreen;
  if (isSystemProcess(p)) return theme.colors.system;

  if (p.cpu < 3) return theme.colors.idle;
  return theme.colors.user;
}

const PROTOCOL_COLORS: Record<string, string> = {
  tcp: "#4aa8ff",
  udp: "#5ce1a8",
  http: "#00e5ff",
  https: "#00e5ff",
  ssh: "#5ce1a8",
  dns: "#9d7bff",
};

export function cableColorForProtocol(protocol: string, theme: Theme = FALLBACK_THEME): string {
  const key = protocol.toLowerCase().trim();
  return PROTOCOL_COLORS[key] ?? theme.colors.coldBlue;
}

export { colorForState };
export type { Theme };
