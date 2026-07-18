import type { SystemSnapshot } from "../utils/types";

export interface TimelineConsoleProps {
  history: readonly SystemSnapshot[];
  mode: "live" | "paused" | "playing";
  index: number;
  isLive: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  onTogglePlay: () => void;
  onStep: (delta: number) => void;
  onLive: () => void;
  onScrub: (index: number) => void;
}

function formatTime(timestamp: number): string {
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TimelineConsole({
  history,
  mode,
  index,
  isLive,
  canStepBack,
  canStepForward,
  playbackSpeed,
  setPlaybackSpeed,
  onTogglePlay,
  onStep,
  onLive,
  onScrub,
}: TimelineConsoleProps) {
  const maxIndex = Math.max(0, history.length - 1);
  const sliderValue = isLive ? maxIndex : index;
  const hasHistory = history.length >= 2;
  const oldest = history[0]?.timestamp ?? 0;
  const newest = history[maxIndex]?.timestamp ?? 0;
  const windowSeconds = Math.max(0, newest - oldest);
  const currentTimestamp = history[sliderValue]?.timestamp ?? newest;

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    onScrub(Number(e.target.value));
  };

  return (
    <div className="timeline-console" aria-label="Time lens console">
      <div className="timeline-header">
        <span className="timeline-title">Time Lens</span>
        <span className="timeline-window">{formatDuration(windowSeconds)} buffered</span>
      </div>

      <div className="timeline-controls">
        <button
          className={`timeline-button ${isLive ? "timeline-active" : ""}`}
          onClick={onLive}
          disabled={isLive || !hasHistory}
          aria-pressed={isLive}
          title="Return to live"
        >
          Live
        </button>

        <button
          className="timeline-button"
          onClick={() => onStep(-1)}
          disabled={!canStepBack}
          aria-label="Step backward"
          title="Step backward"
        >
          ←
        </button>

        <button
          className={`timeline-button timeline-play ${mode === "playing" ? "timeline-active" : ""}`}
          onClick={onTogglePlay}
          disabled={!hasHistory}
          aria-label={mode === "playing" ? "Pause" : "Play"}
          title={mode === "playing" ? "Pause" : "Play"}
        >
          {mode === "playing" ? "Pause" : "Replay"}
        </button>

        <button
          className="timeline-button"
          onClick={() => onStep(1)}
          disabled={!canStepForward}
          aria-label="Step forward"
          title="Step forward"
        >
          →
        </button>

        <select
          className="timeline-speed"
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          disabled={!hasHistory}
          aria-label="Playback speed"
          title="Playback speed"
        >
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </div>

      <div className="timeline-scrub">
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={sliderValue}
          onChange={handleScrub}
          disabled={!hasHistory}
          aria-label="History scrubber"
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={sliderValue}
        />
        <div className="timeline-timestamp">
          <span>{formatTime(currentTimestamp)}</span>
          {isLive && <span className="timeline-live-badge">LIVE</span>}
        </div>
      </div>
    </div>
  );
}
