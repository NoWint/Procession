import type { SystemSnapshot } from "../utils/types";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface HudPanelProps {
  snapshot: SystemSnapshot;
  theme?: Theme;
}

function alertClass(value: number, warning: number, critical: number): string {
  if (value >= critical) return "hud-critical";
  if (value >= warning) return "hud-warning";
  return "";
}

export default function HudPanel({ snapshot, theme = FALLBACK_THEME }: HudPanelProps) {
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

  return (
    <div className="hud-panel" style={{ "--proc-accent-local": theme.colors.accent } as React.CSSProperties}>
      <div className="hud-row">
        <span className="hud-label">CPU</span>
        <span className={`hud-value ${cpuClass}`}>{cpuText}%</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">MEM</span>
        <span className={`hud-value ${memClass}`}>{memText}%</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">NET</span>
        <span className="hud-value">
          ↑{netUp} ↓{netDown}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">PROC</span>
        <span className="hud-value">{procs}</span>
      </div>
    </div>
  );
}
