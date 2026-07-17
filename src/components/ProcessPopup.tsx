import { useEffect, useRef } from "react";
import type { ProcessInfo } from "../utils/types";

interface ProcessPopupProps {
  process: ProcessInfo | null;
  onClose: () => void;
  position?: { x: number; y: number };
}

export default function ProcessPopup({
  process,
  onClose,
  position = { x: 24, y: 24 },
}: ProcessPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!process) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [process, onClose]);

  if (!process) return null;

  return (
    <div
      ref={popupRef}
      className="process-popup"
      style={{ left: position.x, top: position.y }}
    >
      <div className="process-popup-header">
        <span className="process-popup-name">{process.name}</span>
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
        <span className="process-popup-value">{process.state}</span>
      </div>
      <div className="process-popup-row">
        <span className="process-popup-label">PPID</span>
        <span className="process-popup-value">{process.ppid}</span>
      </div>
      <div className="process-popup-row">
        <span className="process-popup-label">User</span>
        <span className="process-popup-value">{process.user}</span>
      </div>
    </div>
  );
}
