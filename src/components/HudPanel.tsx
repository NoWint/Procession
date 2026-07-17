import type { SystemSnapshot } from "../utils/types";
import type { Theme } from "../utils/theme";

interface HudPanelProps {
  snapshot: SystemSnapshot;
  theme?: Theme;
}

export default function HudPanel({ snapshot }: HudPanelProps) {
  const cpu = snapshot.cpu.total.toFixed(1);
  const memUsed = snapshot.memory.used_mb;
  const memTotal = Math.max(snapshot.memory.total_mb, 1);
  const memPct = ((memUsed / memTotal) * 100).toFixed(1);
  const netUp = (snapshot.network.up_bytes_per_sec / 1024).toFixed(1);
  const netDown = (snapshot.network.down_bytes_per_sec / 1024).toFixed(1);
  const procs = snapshot.processes.length;

  return (
    <div className="hud-panel">
      <div className="hud-row">
        <span className="hud-label">CPU</span>
        <span className="hud-value">{cpu}%</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">MEM</span>
        <span className="hud-value">{memPct}%</span>
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
