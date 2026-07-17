import type { ProcessInfo } from "./types";

export const COLORS = {
  system: "#4a9eff",
  user: "#9aff4a",
  active: "#ff9a4a",
  idle: "#666666",
} as const;

export function colorForProcess(p: ProcessInfo): string {
  const systemNames = ["System", "kernel", "launchd", "init", "systemd"];
  if (
    systemNames.some((s) => p.name.toLowerCase().includes(s.toLowerCase()))
  ) {
    return COLORS.system;
  }
  if (p.cpu > 50) return COLORS.active;
  if (p.cpu < 5) return COLORS.idle;
  return COLORS.user;
}
