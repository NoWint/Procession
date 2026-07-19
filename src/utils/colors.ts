import type { ProcessInfo } from "./types";
import { FALLBACK_THEME, colorForState, type Theme } from "./theme";

const systemNames = ["System", "kernel", "launchd", "init", "systemd", "services", "registry"];
const databaseNames = ["sql", "mysql", "postgres", "mongo", "redis", "db", "database"];
const browserNames = ["chrome", "safari", "firefox", "edge", "opera"];
const editorNames = ["code", "vscode", "cursor", "idea", "vim", "emacs"];
// 运行时进程：解释型/VM 型语言运行时
const runtimeNames = ["node", "python", "python3", "java", "dotnet", "ruby", "php", "go", "rustc", "cargo"];
// 云服务客户端：云厂商同步/CLI 工具
const cloudNames = ["aws", "azure", "gcloud", "gcp", "s3", "ec2", "onedrive", "icloud", "dropbox", "gdrive"];

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

export function isRuntimeProcess(p: ProcessInfo): boolean {
  return runtimeNames.some((s) => p.name.toLowerCase().includes(s));
}

export function isCloudProcess(p: ProcessInfo): boolean {
  return cloudNames.some((s) => p.name.toLowerCase().includes(s));
}

export function colorForProcess(p: ProcessInfo, theme: Theme = FALLBACK_THEME): string {
  if (p.state === "Zombie") return theme.colors.zombie;
  if (p.state === "Stopped") return theme.colors.stopped;
  if (p.state === "Sleeping") return theme.colors.sleeping;

  if (p.cpu > 50) return theme.colors.amber;

  if (isDatabaseProcess(p)) return theme.colors.databasePurple;
  if (isBrowserProcess(p)) return theme.colors.coldBlue;
  if (isEditorProcess(p)) return theme.colors.serviceGreen;
  if (isRuntimeProcess(p)) return theme.colors.electricCyan;
  if (isCloudProcess(p)) return theme.colors.pulseWhite;
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

/**
 * 街区类型色：每种进程类型对应一个固定的视觉色，
 * 用于街区边框、街区中心标识、街区命名标签。
 *
 * 设计意图：让用户能通过颜色识别街区类型（蓝=系统、紫=数据库、橙=浏览器...），
 * 建立"颜色-类型-位置"的三重映射，强化空间记忆。
 *
 * 这些颜色独立于主题，作为"语义色"使用（如同红绿灯：红色总是停止）。
 */
const BLOCK_TYPE_COLORS: Record<string, string> = {
  system:   "#5c8fbd",  // 系统服务：稳重的蓝
  database: "#9d7bff",  // 数据库：紫色（与电缆 DNS 一致）
  browser:  "#ff8c42",  // 浏览器：橙色（活跃感）
  editor:   "#5ce1a8",  // 编辑器：绿色（程序员友好色）
  runtime:  "#00e5ff",  // 运行时：青色（与 HTTP 一致）
  cloud:    "#a8d4ff",  // 云服务：浅蓝（轻盈感）
  user:     "#e0c080",  // 用户进程：暖黄（中性）
};

export function blockTypeColor(typeKey: string): string {
  return BLOCK_TYPE_COLORS[typeKey] ?? BLOCK_TYPE_COLORS.user;
}

export { colorForState };
export type { Theme };
