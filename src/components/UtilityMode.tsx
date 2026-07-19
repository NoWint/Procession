import { useMemo, useState } from "react";
import type { ProcessInfo, SystemSnapshot } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import type { Theme } from "../utils/theme";
import { useI18n } from "../hooks/useI18n";

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
  const { t } = useI18n();

  const topProcesses = useMemo(() => {
    const sorted = [...snapshot.processes].sort((a, b) => {
      if (sortKey === "cpu") return b.cpu - a.cpu;
      return Number(b.memory_mb) - Number(a.memory_mb);
    });
    return sorted.slice(0, 20);
  }, [snapshot.processes, sortKey]);

  const visiblePids = useMemo(() => new Set(positions.map((p) => p.pid)), [positions]);

  const handleRowClick = (process: ProcessInfo) => {
    if (visiblePids.has(process.pid)) {
      onSelectProcess(process);
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, process: ProcessInfo) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick(process);
    }
  };

  return (
    <div className="utility-mode">
      <div className="utility-header">
        <span className="utility-title">{t("utility.title")}</span>
        <div className="utility-sort">
          <button
            className={sortKey === "cpu" ? "active" : ""}
            onClick={() => setSortKey("cpu")}
            aria-pressed={sortKey === "cpu"}
          >
            {t("utility.sort.cpu")}
          </button>
          <button
            className={sortKey === "memory" ? "active" : ""}
            onClick={() => setSortKey("memory")}
            aria-pressed={sortKey === "memory"}
          >
            {t("utility.sort.memory")}
          </button>
        </div>
      </div>
      <div className="utility-list">
        {topProcesses.map((p) => {
          const isVisible = visiblePids.has(p.pid);
          return (
            <div
              key={p.pid}
              className={`utility-row ${isVisible ? "" : "utility-row-disabled"}`}
              onClick={() => handleRowClick(p)}
              role="button"
              tabIndex={isVisible ? 0 : -1}
              aria-disabled={!isVisible}
              title={isVisible ? t("utility.locate_visible") : t("utility.locate_hidden")}
              onKeyDown={(e) => handleRowKeyDown(e, p)}
            >
              <span className="utility-name" title={p.name}>
                {p.name}
              </span>
              <span className="utility-metric">
                {sortKey === "cpu" ? `${p.cpu.toFixed(1)}%` : `${p.memory_mb} MB`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="utility-footer">{t("utility.footer")}</div>
    </div>
  );
}
