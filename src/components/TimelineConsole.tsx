import type { SystemSnapshot } from "../utils/types";
import { useI18n } from "../hooks/useI18n";

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
  onSave?: () => void;
  onLoad?: () => void;
  canSave?: boolean;
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
  onSave,
  onLoad,
  canSave = true,
}: TimelineConsoleProps) {
  const { t } = useI18n();
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
    <div className="timeline-console" aria-label={t("timeline.aria_label")}>
      <div className="timeline-header">
        <span className="timeline-title">{t("timeline.title")}</span>
        <span className="timeline-window">
          {t("timeline.buffered", { duration: formatDuration(windowSeconds) })}
        </span>
      </div>

      <div className="timeline-controls">
        <button
          className={`timeline-button ${isLive ? "timeline-active" : ""}`}
          onClick={onLive}
          disabled={isLive || !hasHistory}
          aria-pressed={isLive}
          title={t("timeline.return_to_live")}
        >
          {t("timeline.live")}
        </button>

        <button
          className="timeline-button"
          onClick={() => onStep(-1)}
          disabled={!canStepBack}
          aria-label={t("timeline.step_backward")}
          title={t("timeline.step_backward")}
        >
          ←
        </button>

        <button
          className={`timeline-button timeline-play ${mode === "playing" ? "timeline-active" : ""}`}
          onClick={onTogglePlay}
          disabled={!hasHistory}
          aria-label={mode === "playing" ? t("timeline.pause_aria") : t("timeline.play_aria")}
          title={mode === "playing" ? t("timeline.pause_aria") : t("timeline.play_aria")}
        >
          {mode === "playing" ? t("timeline.pause") : t("timeline.replay")}
        </button>

        <button
          className="timeline-button"
          onClick={() => onStep(1)}
          disabled={!canStepForward}
          aria-label={t("timeline.step_forward")}
          title={t("timeline.step_forward")}
        >
          →
        </button>

        <select
          className="timeline-speed"
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          disabled={!hasHistory}
          aria-label={t("timeline.playback_speed")}
          title={t("timeline.playback_speed")}
        >
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>

        {onSave && (
          <button
            className="timeline-button"
            onClick={onSave}
            disabled={!canSave}
            aria-label={t("timeline.save_aria")}
            title={t("timeline.save_aria")}
          >
            {t("timeline.save")}
          </button>
        )}

        {onLoad && (
          <button
            className="timeline-button"
            onClick={onLoad}
            aria-label={t("timeline.load_aria")}
            title={t("timeline.load_aria")}
          >
            {t("timeline.load")}
          </button>
        )}
      </div>

      <div className="timeline-scrub">
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={sliderValue}
          onChange={handleScrub}
          disabled={!hasHistory}
          aria-label={t("timeline.scrubber_aria")}
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={sliderValue}
        />
        <div className="timeline-timestamp">
          <span>{formatTime(currentTimestamp)}</span>
          {isLive && <span className="timeline-live-badge">{t("timeline.live_badge")}</span>}
        </div>
      </div>
    </div>
  );
}
