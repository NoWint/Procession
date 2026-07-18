import { useEffect, useRef } from "react";
import type { ProcessInfo } from "../utils/types";

interface ProcessPopupProps {
  process: ProcessInfo | null;
  onClose: () => void;
}

function formatState(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();
}

export default function ProcessPopup({ process, onClose }: ProcessPopupProps) {
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
      </div>
    </div>
  );
}
