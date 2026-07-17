import { useMemo, useState } from "react";
import type { ProcessInfo, SystemSnapshot } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import type { Theme } from "../utils/theme";

type SortKey = "cpu" | "memory";

interface UtilityModeProps {
  snapshot: SystemSnapshot;
  positions: BuildingPosition[];
  theme?: Theme;
  onSelectProcess: (process: ProcessInfo) => void;
}

export default function UtilityMode({
  snapshot,
  positions,
  onSelectProcess,
}: UtilityModeProps) {
  const [sortKey, setSortKey] = useState<SortKey>("cpu");

  const topProcesses = useMemo(() => {
    const sorted = [...snapshot.processes].sort((a, b) => {
      if (sortKey === "cpu") return b.cpu - a.cpu;
      return Number(b.memory_mb) - Number(a.memory_mb);
    });
    return sorted.slice(0, 20);
  }, [snapshot.processes, sortKey]);

  const handleRowClick = (process: ProcessInfo) => {
    const hasPosition = positions.some((p) => p.pid === process.pid);
    if (hasPosition) {
      onSelectProcess(process);
    }
  };

  return (
    <div className="utility-mode">
      <div className="utility-header">
        <span className="utility-title">Process Monitor</span>
        <div className="utility-sort">
          <button
            className={sortKey === "cpu" ? "active" : ""}
            onClick={() => setSortKey("cpu")}
          >
            CPU
          </button>
          <button
            className={sortKey === "memory" ? "active" : ""}
            onClick={() => setSortKey("memory")}
          >
            Memory
          </button>
        </div>
      </div>
      <div className="utility-list">
        {topProcesses.map((p) => (
          <div
            key={p.pid}
            className="utility-row"
            onClick={() => handleRowClick(p)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRowClick(p);
            }}
          >
            <span className="utility-name" title={p.name}>
              {p.name}
            </span>
            <span className="utility-metric">
              {sortKey === "cpu" ? `${p.cpu.toFixed(1)}%` : `${p.memory_mb} MB`}
            </span>
          </div>
        ))}
      </div>
      <div className="utility-footer">Press Space to close</div>
    </div>
  );
}
