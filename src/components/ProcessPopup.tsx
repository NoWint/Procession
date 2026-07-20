import { useEffect, useRef } from "react";
import type {
  ProcessInfo,
  ProcessRelation,
  ListeningPort,
  Connection,
  ProcessState,
} from "../utils/types";
import type { BuildingPosition, BlockInfo } from "../utils/layout";
import { useI18n } from "../hooks/useI18n";

interface ProcessPopupProps {
  process: ProcessInfo | null;
  relations?: ProcessRelation[];
  ports?: ListeningPort[];
  connections?: Connection[];
  allProcesses?: ProcessInfo[];
  positions?: BuildingPosition[];
  blocks?: BlockInfo[];
  onClose: () => void;
  // 点击子进程/IPC peer 项时触发，可选实现
  onSelectProcess?: (pid: number) => void;
}

// 将后端返回的进程状态字符串映射到 i18n key，支持 Linux 常见状态。
function stateToKey(state: ProcessState | string): string {
  const normalized = String(state).toLowerCase().replace(/[\s_-]+/g, "");
  switch (normalized) {
    case "running":
      return "popup.state.running";
    case "sleeping":
    case "sleep":
      return "popup.state.sleeping";
    case "disksleep":
    case "disk":
      return "popup.state.disk_sleep";
    case "stopped":
      return "popup.state.stopped";
    case "zombie":
      return "popup.state.zombie";
    case "idle":
      return "popup.state.idle";
    default:
      return "popup.state.unknown";
  }
}

// 列表最大显示数量
const MAX_CHILDREN = 5;
const MAX_IPC_PEERS = 5;
const MAX_PORTS = 3;
const MAX_CONNECTIONS = 5;

export default function ProcessPopup({
  process,
  relations,
  ports,
  connections,
  allProcesses,
  positions,
  blocks,
  onClose,
  onSelectProcess,
}: ProcessPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!process) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // 非模态 popup：仅 Esc 关闭，不再监听 pointerdown 外部点击
    // （popup 已不全屏覆盖，OrbitControls 拖动建筑不应触发关闭）
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [process, onClose]);

  if (!process) return null;

  // —— 数据派生：主城/周边城关联 ——
  const processMap = new Map<number, ProcessInfo>();
  for (const p of allProcesses ?? []) processMap.set(p.pid, p);

  const parent = process.ppid > 0 ? processMap.get(process.ppid) : undefined;

  const relation = (relations ?? []).find((r) => r.pid === process.pid);
  const childPids = relation?.children ?? [];
  const ipcPids = relation?.ipc_peers ?? [];

  const childList = childPids
    .map((pid) => processMap.get(pid))
    .filter((p): p is ProcessInfo => Boolean(p));
  const ipcList = ipcPids
    .map((pid) => processMap.get(pid))
    .filter((p): p is ProcessInfo => Boolean(p));

  const portList = (ports ?? []).filter((p) => p.pid === process.pid);
  const connList = (connections ?? []).filter((c) => c.pid === process.pid);

  // 所在街区（主城）
  const pos = (positions ?? []).find((p) => p.pid === process.pid);
  let containingBlock: BlockInfo | undefined;
  if (pos && blocks) {
    containingBlock = blocks.find(
      (b) =>
        pos.x >= b.minX && pos.x <= b.maxX && pos.z >= b.minZ && pos.z <= b.maxZ,
    );
  }

  // 渲染子进程/IPC peer 列表项
  const renderPeerItem = (p: ProcessInfo) => {
    const content = (
      <>
        <span className="process-popup-list-item-name">
          {t("popup.peer_format", { name: p.name, pid: p.pid })}
        </span>
      </>
    );
    if (onSelectProcess) {
      return (
        <li key={p.pid} className="process-popup-list-item">
          <button
            type="button"
            className="process-popup-list-item-btn"
            onClick={() => onSelectProcess(p.pid)}
          >
            {content}
          </button>
        </li>
      );
    }
    return (
      <li key={p.pid} className="process-popup-list-item">
        {content}
      </li>
    );
  };

  const hasRelationSection =
    parent || childList.length > 0 || ipcList.length > 0;
  const hasPortSection = portList.length > 0;
  const hasConnSection = connList.length > 0;
  const hasBlockSection = Boolean(containingBlock);

  return (
    <div className="process-popup-overlay" role="presentation">
      <div
        ref={popupRef}
        className="process-popup"
        role="dialog"
        aria-modal="true"
        aria-label={t("app.process.aria_label", { name: process.name })}
      >
        <div className="process-popup-header">
          <span className="process-popup-name" title={process.name}>
            {process.name}
          </span>
          <button
            className="process-popup-close"
            onClick={onClose}
            aria-label={t("popup.close")}
          >
            ×
          </button>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">{t("popup.pid")}</span>
          <span className="process-popup-value">{process.pid}</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">{t("popup.cpu")}</span>
          <span className="process-popup-value">{process.cpu.toFixed(1)}%</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">{t("popup.memory")}</span>
          <span className="process-popup-value">{t("popup.memory_value", { mb: process.memory_mb })}</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">{t("popup.state")}</span>
          <span className="process-popup-value">{t(stateToKey(process.state))}</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">{t("popup.ppid")}</span>
          <span className="process-popup-value">{process.ppid}</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">{t("popup.user")}</span>
          <span className="process-popup-value">{process.user}</span>
        </div>

        {/* A. 进程关系（主城/周边城） */}
        {hasRelationSection && (
          <div className="process-popup-section">
            <div className="process-popup-section-title">{t("popup.process_relations")}</div>
            <div className="process-popup-row">
              <span className="process-popup-label">{t("popup.parent_process")}</span>
              <span className="process-popup-value">
                {parent ? t("popup.parent_format", { name: parent.name, pid: process.ppid }) : "—"}
              </span>
            </div>
            {childList.length > 0 && (
              <>
                <div className="process-popup-label process-popup-sublabel">
                  {t("popup.child_processes")}
                  <span className="process-popup-badge">{childList.length}</span>
                </div>
                <ul className="process-popup-list">
                  {childList.slice(0, MAX_CHILDREN).map(renderPeerItem)}
                  {childList.length > MAX_CHILDREN && (
                    <li className="process-popup-list-item process-popup-list-item-more">
                      {t("popup.more_format", { count: childList.length - MAX_CHILDREN })}
                    </li>
                  )}
                </ul>
              </>
            )}
            {ipcList.length > 0 && (
              <>
                <div className="process-popup-label process-popup-sublabel">
                  {t("popup.ipc_peers")}
                  <span className="process-popup-badge">{ipcList.length}</span>
                </div>
                <ul className="process-popup-list">
                  {ipcList.slice(0, MAX_IPC_PEERS).map(renderPeerItem)}
                  {ipcList.length > MAX_IPC_PEERS && (
                    <li className="process-popup-list-item process-popup-list-item-more">
                      {t("popup.more_format", { count: ipcList.length - MAX_IPC_PEERS })}
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}

        {/* B. 监听端口 */}
        {hasPortSection && (
          <div className="process-popup-section">
            <div className="process-popup-section-title">{t("popup.listening_ports")}</div>
            <ul className="process-popup-list">
              {portList.slice(0, MAX_PORTS).map((p, i) => (
                <li key={`${p.protocol}-${p.port}-${i}`} className="process-popup-list-item">
                  {p.protocol} :{p.port} @ {p.address}
                </li>
              ))}
              {portList.length > MAX_PORTS && (
                <li className="process-popup-list-item process-popup-list-item-more">
                  {t("popup.more_format", { count: portList.length - MAX_PORTS })}
                </li>
              )}
            </ul>
          </div>
        )}

        {/* C. 网络连接 */}
        {hasConnSection && (
          <div className="process-popup-section">
            <div className="process-popup-section-title">{t("popup.network_connections")}</div>
            <ul className="process-popup-list">
              {connList.slice(0, MAX_CONNECTIONS).map((c, i) => (
                <li key={i} className="process-popup-list-item">
                  {c.protocol} {c.local_addr} → {c.remote_addr}{" "}
                  <span className="process-popup-badge">{c.state}</span>
                </li>
              ))}
              {connList.length > MAX_CONNECTIONS && (
                <li className="process-popup-list-item process-popup-list-item-more">
                  {t("popup.more_format", { count: connList.length - MAX_CONNECTIONS })}
                </li>
              )}
            </ul>
          </div>
        )}

        {/* D. 所在街区（主城） */}
        {hasBlockSection && containingBlock && pos && (
          <div className="process-popup-section">
            <div className="process-popup-section-title">{t("popup.containing_block")}</div>
            <div className="process-popup-row">
              <span className="process-popup-label">{t("popup.block")}</span>
              <span className="process-popup-value">
                {t("popup.block_summary", { rootName: containingBlock.rootName, count: containingBlock.processCount })}
              </span>
            </div>
            <div className="process-popup-row">
              <span className="process-popup-label">{t("popup.coordinate")}</span>
              <span className="process-popup-value">
                {t("popup.coordinate_format", { x: pos.x.toFixed(1), z: pos.z.toFixed(1) })}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
