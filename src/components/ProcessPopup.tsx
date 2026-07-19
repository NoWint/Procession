import { useEffect, useRef } from "react";
import type {
  ProcessInfo,
  ProcessRelation,
  ListeningPort,
  Connection,
} from "../utils/types";
import type { BuildingPosition, BlockInfo } from "../utils/layout";

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

function formatState(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();
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

  useEffect(() => {
    if (!process) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popupRef.current && !popupRef.current.contains(target)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
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
          {p.name} (PID {p.pid})
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
    <div className="process-popup-overlay" role="presentation" onClick={onClose}>
      <div
        ref={popupRef}
        className="process-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`Process details for ${process.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="process-popup-header">
          <span className="process-popup-name" title={process.name}>
            {process.name}
          </span>
          <button
            className="process-popup-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">PID</span>
          <span className="process-popup-value">{process.pid}</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">CPU</span>
          <span className="process-popup-value">{process.cpu.toFixed(1)}%</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">Memory</span>
          <span className="process-popup-value">{process.memory_mb} MB</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">State</span>
          <span className="process-popup-value">{formatState(process.state)}</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">PPID</span>
          <span className="process-popup-value">{process.ppid}</span>
        </div>
        <div className="process-popup-row">
          <span className="process-popup-label">User</span>
          <span className="process-popup-value">{process.user}</span>
        </div>

        {/* A. 进程关系（主城/周边城） */}
        {hasRelationSection && (
          <div className="process-popup-section">
            <div className="process-popup-section-title">进程关系</div>
            <div className="process-popup-row">
              <span className="process-popup-label">父进程</span>
              <span className="process-popup-value">
                {parent ? `${parent.name} (PID ${process.ppid})` : "—"}
              </span>
            </div>
            {childList.length > 0 && (
              <>
                <div className="process-popup-label process-popup-sublabel">
                  子进程
                  <span className="process-popup-badge">{childList.length}</span>
                </div>
                <ul className="process-popup-list">
                  {childList.slice(0, MAX_CHILDREN).map(renderPeerItem)}
                  {childList.length > MAX_CHILDREN && (
                    <li className="process-popup-list-item process-popup-list-item-more">
                      +{childList.length - MAX_CHILDREN} more
                    </li>
                  )}
                </ul>
              </>
            )}
            {ipcList.length > 0 && (
              <>
                <div className="process-popup-label process-popup-sublabel">
                  IPC peers
                  <span className="process-popup-badge">{ipcList.length}</span>
                </div>
                <ul className="process-popup-list">
                  {ipcList.slice(0, MAX_IPC_PEERS).map(renderPeerItem)}
                  {ipcList.length > MAX_IPC_PEERS && (
                    <li className="process-popup-list-item process-popup-list-item-more">
                      +{ipcList.length - MAX_IPC_PEERS} more
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
            <div className="process-popup-section-title">监听端口</div>
            <ul className="process-popup-list">
              {portList.slice(0, MAX_PORTS).map((p) => (
                <li key={`${p.protocol}-${p.port}`} className="process-popup-list-item">
                  {p.protocol} :{p.port} @ {p.address}
                </li>
              ))}
              {portList.length > MAX_PORTS && (
                <li className="process-popup-list-item process-popup-list-item-more">
                  +{portList.length - MAX_PORTS} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* C. 网络连接 */}
        {hasConnSection && (
          <div className="process-popup-section">
            <div className="process-popup-section-title">网络连接</div>
            <ul className="process-popup-list">
              {connList.slice(0, MAX_CONNECTIONS).map((c, i) => (
                <li key={i} className="process-popup-list-item">
                  {c.protocol} {c.local_addr} → {c.remote_addr}{" "}
                  <span className="process-popup-badge">{c.state}</span>
                </li>
              ))}
              {connList.length > MAX_CONNECTIONS && (
                <li className="process-popup-list-item process-popup-list-item-more">
                  +{connList.length - MAX_CONNECTIONS} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* D. 所在街区（主城） */}
        {hasBlockSection && containingBlock && pos && (
          <div className="process-popup-section">
            <div className="process-popup-section-title">所在街区</div>
            <div className="process-popup-row">
              <span className="process-popup-label">街区</span>
              <span className="process-popup-value">
                {containingBlock.letter} · 共 {containingBlock.processCount} 进程
              </span>
            </div>
            <div className="process-popup-row">
              <span className="process-popup-label">坐标</span>
              <span className="process-popup-value">
                ({pos.x.toFixed(1)}, {pos.z.toFixed(1)})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
