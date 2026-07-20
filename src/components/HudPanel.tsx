import type { SystemSnapshot } from "../utils/types";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import { useI18n } from "../hooks/useI18n";

interface HudPanelProps {
  snapshot: SystemSnapshot;
  theme?: Theme;
  /**
   * P2-5 FpsCounter 合并进 HudPanel：
   * fps 由 App 通过 useFpsMonitor 单实例获取后传入，避免重复订阅。
   * quality 用于决定是否触发红色警告样式（非 high 视为低帧）。
   */
  fps?: number;
  quality?: "high" | "med" | "low";
}

function alertClass(value: number, warning: number, critical: number): string {
  if (value >= critical) return "hud-critical";
  if (value >= warning) return "hud-warning";
  return "";
}

export default function HudPanel({ snapshot, theme = FALLBACK_THEME, fps, quality }: HudPanelProps) {
  const { t } = useI18n();
  const cpu = snapshot.cpu.total;
  const cpuText = cpu.toFixed(1);
  const memUsed = snapshot.memory.used_mb;
  const memTotal = Math.max(snapshot.memory.total_mb, 1);
  const memPct = (memUsed / memTotal) * 100;
  const memText = memPct.toFixed(1);
  const netUp = (snapshot.network.up_bytes_per_sec / 1024).toFixed(1);
  const netDown = (snapshot.network.down_bytes_per_sec / 1024).toFixed(1);
  const procs = snapshot.processes.length;

  const cpuClass = alertClass(cpu, 70, 90);
  const memClass = alertClass(memPct, 80, 95);
  // 沿用旧 UI：非 high 档位即视为"低帧"，触发红色警告样式
  const fpsLow = quality != null && quality !== "high";

  return (
    <div className="hud-panel" style={{ "--proc-accent-local": theme.colors.accent } as React.CSSProperties}>
      <div className="hud-row">
        <span className="hud-label">{t("hud.cpu")}</span>
        <span className={`hud-value ${cpuClass}`}>{cpuText}%</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">{t("hud.mem")}</span>
        <span className={`hud-value ${memClass}`}>{memText}%</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">{t("hud.net")}</span>
        <span className="hud-value">
          ↑{netUp} ↓{netDown}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">{t("hud.proc")}</span>
        <span className="hud-value">{procs}</span>
      </div>
      {/* P2-5 FpsCounter 合并进 HudPanel：作为最后一个 row，与其它指标共占同一行 */}
      {fps != null && (
        <div className={`hud-row hud-fps ${fpsLow ? "hud-fps-low" : ""}`}>
          <span className="hud-label">{t("fps.label")}</span>
          <span className="hud-value">{fps}</span>
        </div>
      )}
    </div>
  );
}
