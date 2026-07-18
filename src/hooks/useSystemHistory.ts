import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SystemSnapshot } from "../utils/types";

const DEFAULT_CAPACITY = 600;

export type HistoryMode = "live" | "paused" | "playing";

export interface UseSystemHistoryOptions {
  capacity?: number;
}

export interface UseSystemHistoryResult {
  liveSnapshot: SystemSnapshot | null;
  displaySnapshot: SystemSnapshot | null;
  history: readonly SystemSnapshot[];
  mode: HistoryMode;
  index: number;
  isLive: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  enterHistory: (index: number) => void;
  exitHistory: () => void;
  step: (delta: number) => void;
  togglePlay: () => void;
  setIndex: (index: number) => void;
  loadHistory: (snapshots: SystemSnapshot[]) => void;
}

export function useSystemHistory(
  liveSnapshot: SystemSnapshot | null,
  options: UseSystemHistoryOptions = {},
): UseSystemHistoryResult {
  const { capacity = DEFAULT_CAPACITY } = options;
  const [history, setHistory] = useState<SystemSnapshot[]>([]);
  const [index, setIndexState] = useState<number>(-1);
  const [mode, setMode] = useState<HistoryMode>("live");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const latestTimestampRef = useRef<number>(0);

  const modeRef = useRef(mode);
  const indexRef = useRef(index);
  const historyRef = useRef(history);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Append live snapshots to the rolling history buffer.
  useEffect(() => {
    if (!liveSnapshot) return;
    const ts = liveSnapshot.timestamp;
    if (ts <= latestTimestampRef.current) return;
    latestTimestampRef.current = ts;

    setHistory((prev) => {
      const next = [...prev, liveSnapshot];
      if (next.length > capacity) next.shift();
      return next;
    });
  }, [liveSnapshot, capacity]);

  // While live, keep the playhead at the newest frame.
  useEffect(() => {
    if (mode === "live" && history.length > 0) {
      setIndexState(history.length - 1);
    }
  }, [history, mode]);

  // Playback loop: advance one frame per snapshot interval.
  useEffect(() => {
    if (mode !== "playing") return;
    if (history.length < 2) return;

    const intervalMs = Math.max(50, 1000 / playbackSpeed);
    const id = setInterval(() => {
      const nextIndex = indexRef.current + 1;
      if (nextIndex >= historyRef.current.length) {
        setMode("live");
        setIndexState(historyRef.current.length - 1);
      } else {
        setIndexState(nextIndex);
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [mode, history.length, playbackSpeed]);

  const isLive = mode === "live";
  const displaySnapshot = isLive
    ? (liveSnapshot ?? history[index] ?? null)
    : (history[index] ?? liveSnapshot ?? null);

  const canStepBack = !isLive && index > 0;
  const canStepForward = !isLive && index < history.length - 1;

  const enterHistory = useCallback((targetIndex: number) => {
    const clamped = Math.max(0, Math.min(targetIndex, historyRef.current.length - 1));
    setMode("paused");
    setIndexState(clamped);
  }, []);

  const exitHistory = useCallback(() => {
    setMode("live");
    setIndexState(historyRef.current.length - 1);
  }, []);

  const setIndex = useCallback((targetIndex: number) => {
    const clamped = Math.max(0, Math.min(targetIndex, historyRef.current.length - 1));
    setMode("paused");
    setIndexState(clamped);
  }, []);

  const loadHistory = useCallback((snapshots: SystemSnapshot[]) => {
    const trimmed = snapshots.slice(-capacity);
    const lastTs = trimmed.length > 0 ? trimmed[trimmed.length - 1].timestamp : 0;
    latestTimestampRef.current = lastTs;
    setHistory(trimmed);
    setMode("live");
    setIndexState(Math.max(0, trimmed.length - 1));
  }, [capacity]);

  const step = useCallback((delta: number) => {
    setMode("paused");
    setIndexState((prev) => Math.max(0, Math.min(prev + delta, historyRef.current.length - 1)));
  }, []);

  const togglePlay = useCallback(() => {
    if (modeRef.current === "live") {
      if (historyRef.current.length > 0) {
        setIndexState(0);
        setMode("playing");
      }
      return;
    }
    setMode((prev) => (prev === "playing" ? "paused" : "playing"));
  }, []);

  return useMemo(
    () => ({
      liveSnapshot,
      displaySnapshot,
      history,
      mode,
      index,
      isLive,
      canStepBack,
      canStepForward,
      playbackSpeed,
      setPlaybackSpeed,
      enterHistory,
      exitHistory,
      step,
      togglePlay,
      setIndex,
      loadHistory,
    }),
    [
      liveSnapshot,
      displaySnapshot,
      history,
      mode,
      index,
      isLive,
      canStepBack,
      canStepForward,
      playbackSpeed,
      enterHistory,
      exitHistory,
      step,
      togglePlay,
      setIndex,
      loadHistory,
    ],
  );
}
