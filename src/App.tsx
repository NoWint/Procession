import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import CityScene from "./components/CityScene";
import BuildingCluster from "./components/BuildingCluster";
import BuildingHalo from "./components/BuildingHalo";
import CableSystem, { computeCableData } from "./components/CableSystem";
import CableFlow from "./components/CableFlow";
import CityGround from "./components/CityGround";
import CityBackground from "./components/CityBackground";
import RoadGrid from "./components/RoadGrid";
import CityTrees from "./components/CityTrees";
import RoadFlow from "./components/RoadFlow";
import BlockLabel from "./components/BlockLabel";
import Atmosphere from "./components/Atmosphere";
import BloomEffect from "./components/BloomEffect";
import PortHarbors from "./components/PortHarbors";
import FsHeatmap from "./components/FsHeatmap";
import ProcessPopup from "./components/ProcessPopup";
import ErrorState from "./components/ErrorState";
import HudPanel from "./components/HudPanel";
import UtilityMode from "./components/UtilityMode";
import ThemeSelector from "./components/ThemeSelector";
import ThemeEditor from "./components/ThemeEditor";
import ScreensaverMode from "./components/ScreensaverMode";
import ScreenshotButton from "./components/ScreenshotButton";
import FpsCounter from "./components/FpsCounter";
import TimelineConsole from "./components/TimelineConsole";
import { useSystemData } from "./hooks/useSystemData";
import { useSystemHistory } from "./hooks/useSystemHistory";
import { useFpsMonitor } from "./hooks/useFpsMonitor";
import { useAudioEngine } from "./hooks/useAudioEngine";
import * as persistence from "./utils/persistence";
import type { ProcessInfo } from "./utils/types";
import { computeGridPositions, computeProcessSignature } from "./utils/layout";
import { shouldIgnoreSpace } from "./utils/keyboard";
import {
  loadTheme,
  applyTheme,
  DEFAULT_THEME_URL,
  FALLBACK_THEME,
  getSavedThemeUrl,
  saveThemeUrl,
  saveCustomTheme,
  type Theme,
} from "./utils/theme";
import "./App.css";
import "./components/HudPanel.css";
import "./components/UtilityMode.css";
import "./components/ThemeSelector.css";
import "./components/TimelineConsole.css";

const DATA_TIMEOUT_MS = 4000;

// Adaptive quality: keep FPS ≥ 30 by adjusting rendered building count.
const MAX_BUILDINGS_DEFAULT = 200;
const MAX_BUILDINGS_MIN = 60;
const MAX_BUILDINGS_MAX = 400;
const BUILDINGS_STEP = 40;

export default function App() {
  const liveSnapshot = useSystemData();
  const history = useSystemHistory(liveSnapshot);
  const { displaySnapshot } = history;
  const { isLow, isHigh } = useFpsMonitor({
    sampleSize: 30,
    lowThreshold: 28,
    highThreshold: 50,
  });
  const { isMuted, isSupported, toggleMute } = useAudioEngine({
    snapshot: liveSnapshot,
  });
  const [maxBuildings, setMaxBuildings] = useState(MAX_BUILDINGS_DEFAULT);
  const [timedOut, setTimedOut] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ x: number; y: number; z: number } | null>(null);
  const [utilityMode, setUtilityMode] = useState(false);
  const [theme, setTheme] = useState<Theme>(FALLBACK_THEME);
  const [currentThemeUrl, setCurrentThemeUrl] = useState(DEFAULT_THEME_URL);
  const [themeReady, setThemeReady] = useState(false);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const kioskIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load theme on mount, restoring saved preference.
  useEffect(() => {
    let cancelled = false;
    const savedUrl = getSavedThemeUrl();
    const initialUrl = savedUrl && savedUrl.startsWith("/themes/") ? savedUrl : DEFAULT_THEME_URL;
    setCurrentThemeUrl(initialUrl);
    loadTheme(initialUrl).then((t) => {
      if (cancelled) return;
      applyTheme(t);
      setTheme(t);
      setThemeReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Data timeout detection is based on the live stream, not the selected history frame.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!liveSnapshot) setTimedOut(true);
    }, DATA_TIMEOUT_MS);

    if (liveSnapshot) {
      setTimedOut(false);
    }

    return () => clearTimeout(timer);
  }, [liveSnapshot]);

  // Adaptive quality: reduce building count when FPS is low, increase when high.
  useEffect(() => {
    if (isLow) {
      setMaxBuildings((prev) => Math.max(MAX_BUILDINGS_MIN, prev - BUILDINGS_STEP));
    } else if (isHigh) {
      setMaxBuildings((prev) => Math.min(MAX_BUILDINGS_MAX, prev + BUILDINGS_STEP));
    }
  }, [isLow, isHigh]);

  const processSignature = useMemo(
    () => (displaySnapshot ? computeProcessSignature(displaySnapshot.processes) : ""),
    [displaySnapshot],
  );

  const layoutResult = useMemo(
    () => (displaySnapshot ? computeGridPositions(displaySnapshot.processes, maxBuildings) : { positions: [], blocks: [] }),
    [processSignature, maxBuildings],
  );
  const positions = layoutResult.positions;
  const blockCenters = layoutResult.blocks;

  const cableData = useMemo(
    () => (displaySnapshot ? computeCableData(displaySnapshot.network.connections, positions, 80) : []),
    [displaySnapshot?.network.connections, positions],
  );

  const cablePaths = useMemo(() => cableData.map((d) => d.path), [cableData]);
  const cableProtocols = useMemo(() => cableData.map((d) => d.protocol), [cableData]);

  const selectedPosition = useMemo(() => {
    if (!selectedProcess) return null;
    return positions.find((p) => p.pid === selectedProcess.pid) ?? null;
  }, [selectedProcess, positions]);

  const handleBuildingClick = useCallback((process: ProcessInfo) => {
    setSelectedProcess(process);
    setCameraTarget(null);
  }, []);

  const handleBuildingDoubleClick = useCallback(
    (process: ProcessInfo) => {
      const pos = positions.find((p) => p.pid === process.pid);
      if (pos) {
        setCameraTarget({ x: pos.x, y: pos.height, z: pos.z });
      }
    },
    [positions],
  );

  const handleClosePopup = useCallback(() => {
    setSelectedProcess(null);
    setCameraTarget(null);
  }, []);

  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  const handleThemeChange = useCallback((url: string) => {
    loadTheme(url).then((t) => {
      applyTheme(t);
      setTheme(t);
      setCurrentThemeUrl(url);
      saveThemeUrl(url);
    });
  }, []);

  const handleOpenThemeEditor = useCallback(() => {
    setThemeEditorOpen(true);
  }, []);

  const handleSaveHistory = useCallback(() => {
    void persistence.saveHistory(history.history);
  }, [history.history]);

  const handleLoadHistory = useCallback(async () => {
    try {
      const snapshots = await persistence.loadHistory();
      if (snapshots) {
        history.loadHistory(snapshots);
      }
    } catch (err) {
      console.error("Failed to load city state:", err);
    }
  }, [history]);

  const handleCloseThemeEditor = useCallback(() => {
    setThemeEditorOpen(false);
    loadTheme(currentThemeUrl).then((t) => {
      applyTheme(t);
      setTheme(t);
    });
  }, [currentThemeUrl]);

  const handleThemeEditorChange = useCallback((t: Theme) => {
    applyTheme(t);
    setTheme(t);
  }, []);

  const handleThemeEditorSave = useCallback((t: Theme) => {
    const meta = saveCustomTheme(t);
    applyTheme(t);
    setTheme(t);
    setCurrentThemeUrl(meta.url);
    saveThemeUrl(meta.url);
    setThemeEditorOpen(false);
  }, []);

  const handleSelectProcessFromUtility = useCallback((process: ProcessInfo) => {
    setSelectedProcess(process);
    const pos = positions.find((p) => p.pid === process.pid);
    if (pos) {
      setCameraTarget({ x: pos.x, y: pos.height, z: pos.z });
    }
  }, [positions]);

  const handleExitKiosk = useCallback(() => {
    setKioskMode(false);
  }, []);

  const handleUiShow = useCallback(() => {
    setShowUi(true);
  }, []);

  // Sync auto-rotate and UI visibility with kiosk mode.
  useEffect(() => {
    if (kioskMode) {
      setAutoRotate(true);
      setShowUi(false);
    } else {
      setAutoRotate(false);
      setShowUi(true);
    }
  }, [kioskMode]);

  // Hide UI again after a period of inactivity while in kiosk mode.
  useEffect(() => {
    if (!kioskMode || !showUi) return;
    kioskIdleTimer.current = setTimeout(() => {
      setShowUi(false);
    }, 2500);
    return () => {
      if (kioskIdleTimer.current) {
        clearTimeout(kioskIdleTimer.current);
      }
    };
  }, [kioskMode, showUi]);

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
  }

  // Toggle utility mode with Space; kiosk mode with K; close with Escape.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (kioskMode && e.key === "Escape") {
        e.preventDefault();
        setKioskMode(false);
        return;
      }
      if (e.key === "k" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setKioskMode((prev) => !prev);
        return;
      }
      if (e.key === "h" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setTimelineOpen((prev) => !prev);
        return;
      }
      if (e.key === " " && !shouldIgnoreSpace(e.target)) {
        e.preventDefault();
        setUtilityMode((prev) => !prev);
      }
      if (e.key === "m" && !isTypingTarget(e.target)) {
        e.preventDefault();
        toggleMute();
        return;
      }
      if (e.key === "Escape") {
        setUtilityMode(false);
        setSelectedProcess(null);
        setCameraTarget(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [kioskMode, timelineOpen, toggleMute]);

  if (!themeReady) {
    return <ErrorState message="Loading visual system..." loading />;
  }

  if (!liveSnapshot && timedOut) {
    return (
      <ErrorState
        message="Failed to receive system data"
        detail="The backend may still be initializing."
        onRetry={handleRetry}
      />
    );
  }

  if (!liveSnapshot) {
    return <ErrorState message="Waiting for system data..." loading />;
  }

  if (!displaySnapshot || displaySnapshot.processes.length === 0) {
    return (
      <ErrorState
        message="No processes found"
        detail="The city is empty. Try refreshing or check backend permissions."
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className="app-container">
      <CityScene
        theme={theme}
        cameraTarget={cameraTarget ?? (selectedPosition ? { x: selectedPosition.x, y: selectedPosition.height, z: selectedPosition.z } : null)}
        autoRotate={autoRotate}
      >
        <Atmosphere theme={theme} />
        <BloomEffect strength={0.3} radius={0.5} threshold={0.1} />
        <CityBackground theme={theme} />
        <CityGround theme={theme} />
        <RoadGrid />
        <CityTrees />
        <RoadFlow />
        <BlockLabel blocks={blockCenters} />
        <FsHeatmap hotspots={displaySnapshot.fs_hotspots} theme={theme} />
        <BuildingCluster
          processes={displaySnapshot.processes}
          positions={positions}
          theme={theme}
          selectedPid={selectedProcess?.pid ?? null}
          maxBuildings={maxBuildings}
          onClick={handleBuildingClick}
          onDoubleClick={handleBuildingDoubleClick}
        />

        <PortHarbors
          ports={displaySnapshot.listening_ports}
          positions={positions}
          theme={theme}
        />
        <BuildingHalo
          processes={displaySnapshot.processes}
          positions={positions}
          theme={theme}
        />
        <CableSystem cables={cableData} theme={theme} />
        <CableFlow paths={cablePaths} protocols={cableProtocols} theme={theme} />
      </CityScene>

      <div className={`app-ui-layer ${kioskMode && !showUi ? "kiosk-hidden" : ""}`}>
        <div className="app-header">
          <span className="app-title">Procession</span>
          <span className="app-subtitle">
            {displaySnapshot.processes.length} processes · {displaySnapshot.cpu.total.toFixed(1)}% CPU
            {!history.isLive && (
              <span className="app-history-indicator"> · Time Lens</span>
            )}
          </span>
          {isSupported && (
            <span
              className={`app-sound-indicator${isMuted ? " muted" : ""}`}
              onClick={toggleMute}
              title={`Sound ${isMuted ? "off" : "on"} — press M to toggle`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") toggleMute(); }}
            >
              ±
            </span>
          )}
        </div>
        {false && displaySnapshot ? <HudPanel snapshot={displaySnapshot!} theme={theme} /> : null}
        {false && displaySnapshot && utilityMode ? (
          <UtilityMode
            snapshot={displaySnapshot!}
            positions={positions}
            theme={theme}
            onSelectProcess={handleSelectProcessFromUtility}
          />
        ) : null}
        <div className="app-controls">
          {false && <ThemeSelector currentUrl={currentThemeUrl} onChange={handleThemeChange} />}
          {false && (
            <button className="app-theme-toggle" onClick={handleOpenThemeEditor}>
              Edit Signal
            </button>
          )}
          <button
            className="app-theme-toggle"
            onClick={() => setAutoRotate((prev) => !prev)}
            aria-pressed={autoRotate}
          >
            {autoRotate ? "Stop Orbit" : "Orbit"}
          </button>
          <button
            className={`app-theme-toggle ${timelineOpen ? "app-toggle-active" : ""}`}
            onClick={() => setTimelineOpen((prev) => !prev)}
            aria-pressed={timelineOpen}
            title="Toggle time lens (H)"
          >
            Time Lens
          </button>
          <ScreenshotButton />
        </div>
        {false && <FpsCounter />}
        {timelineOpen && (
          <TimelineConsole
            history={history.history}
            mode={history.mode}
            index={history.index}
            isLive={history.isLive}
            canStepBack={history.canStepBack}
            canStepForward={history.canStepForward}
            playbackSpeed={history.playbackSpeed}
            setPlaybackSpeed={history.setPlaybackSpeed}
            onTogglePlay={history.togglePlay}
            onStep={history.step}
            onLive={history.exitHistory}
            onScrub={history.setIndex}
            onSave={handleSaveHistory}
            onLoad={handleLoadHistory}
            canSave={history.history.length >= 2}
          />
        )}
        {false && themeEditorOpen && (
          <ThemeEditor
            theme={theme}
            onChange={handleThemeEditorChange}
            onSave={handleThemeEditorSave}
            onClose={handleCloseThemeEditor}
          />
        )}
        <ProcessPopup process={selectedProcess} onClose={handleClosePopup} />
        <div className="app-slogan">Procession · 进程列队，系统成诗</div>
      </div>
      <ScreensaverMode enabled={kioskMode} onExit={handleExitKiosk} onUiShow={handleUiShow} />
    </div>
  );
}
