import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { SystemSnapshot } from "../utils/types";

// 后端连接状态：
// - connecting：启动中，尚未收到任何快照
// - live：已收到快照，正在被实时数据驱动
// - backend-unresponsive：启动 5 秒内未收到任何快照，判定后端无响应
export type BackendStatus = "connecting" | "live" | "backend-unresponsive";

export interface UseSystemDataResult {
  snapshot: SystemSnapshot | null;
  backendStatus: BackendStatus;
}

// 后端首帧超时阈值：5 秒内未收到任何快照则切换为 backend-unresponsive
const BACKEND_TIMEOUT_MS = 5000;

export function useSystemData(): UseSystemDataResult {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("connecting");

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    // 5 秒超时定时器：仅在 connecting 状态下生效；收到首帧后会被清除
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      // 仅在仍处于 connecting 时切换；若已收到快照变为 live，则保持不变（避免抖动）
      setBackendStatus((prev) => (prev === "connecting" ? "backend-unresponsive" : prev));
    }, BACKEND_TIMEOUT_MS);

    const handleSnapshot = (event: { payload: SystemSnapshot }) => {
      setSnapshot(event.payload);
      // 收到任一快照：清除超时定时器（若尚未触发），并切换到 live
      // 覆盖 connecting → live 与 backend-unresponsive → live 两种恢复路径
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      setBackendStatus("live");
    };

    listen<SystemSnapshot>("system-snapshot", handleSnapshot)
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => {
        console.warn("[useSystemData] Failed to listen for system snapshots:", error);
      });

    return () => {
      if (unlisten) unlisten();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { snapshot, backendStatus };
}
