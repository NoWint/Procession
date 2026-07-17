import type { ProcessInfo } from "../utils/types";

interface ProcessPopupProps {
  process: ProcessInfo | null;
  onClose: () => void;
  position?: { x: number; y: number };
}

export default function ProcessPopup({
  process,
  onClose,
  position = { x: 100, y: 100 },
}: ProcessPopupProps) {
  if (!process) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        background: "rgba(10, 10, 20, 0.95)",
        color: "#e0e0e0",
        padding: "12px 16px",
        borderRadius: "8px",
        border: "1px solid #4a9eff",
        fontFamily: "monospace",
        fontSize: "13px",
        pointerEvents: "auto",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "8px",
          gap: "16px",
        }}
      >
        <strong>{process.name}</strong>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#999",
            cursor: "pointer",
            fontSize: "16px",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div>PID: {process.pid}</div>
      <div>CPU: {process.cpu.toFixed(1)}%</div>
      <div>Memory: {process.memory_mb} MB</div>
      <div>State: {process.state}</div>
      <div>PPID: {process.ppid}</div>
    </div>
  );
}
