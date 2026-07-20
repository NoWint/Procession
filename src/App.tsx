import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import CityScene from "./components/CityScene";
import BuildingCluster from "./components/BuildingCluster";
import BuildingHalo from "./components/BuildingHalo";
import CableSystem, { computeCableData } from "./components/CableSystem";
import CityGround from "./components/CityGround";
import TrafficFlow from "./components/TrafficFlow";
import Atmosphere from "./components/Atmosphere";
import BloomEffect from "./components/BloomEffect";
import PortHarbors from "./components/PortHarbors";
import FsHeatmap from "./components/FsHeatmap";
import ProcessPopup from "./components/ProcessPopup";
import ErrorState from "./components/ErrorState";
import HudPanel from "./components/HudPanel";
import UtilityMode from "./components/UtilityMode";
import ThemeEditor from "./components/ThemeEditor";
import SettingsPanel, { type QualityMode } from "./components/SettingsPanel";
import ScreensaverMode from "./components/ScreensaverMode";
import ScreenshotButton from "./components/ScreenshotButton";
import TimelineConsole from "./components/TimelineConsole";
import { useSystemData } from "./hooks/useSystemData";
import { useSystemHistory } from "./hooks/useSystemHistory";
import { useFpsMonitor } from "./hooks/useFpsMonitor";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useI18n } from "./hooks/useI18n";
import * as persistence from "./utils/persistence";
import type { ProcessInfo, SystemSnapshot } from "./utils/types";
import { computeGridPositions, computeProcessSignature, type BlockInfo, type BuildingPosition } from "./utils/layout";
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

// Default process cap (rendered building ceiling). User-tunable via SettingsPanel.
const DEFAULT_PROCESS_CAP = 200;

// 后端无响应时渲染空城市使用的占位快照，避免下游组件访问 null 字段
const EMPTY_SNAPSHOT: SystemSnapshot = {
  processes: [],
  cpu: { total: 0, per_core: [] },
  memory: { used_mb: 0, total_mb: 0, swap_used_mb: 0, swap_total_mb: 0 },
  network: { up_bytes_per_sec: 0, down_bytes_per_sec: 0, connections: [] },
  disk: { read_bytes_per_sec: 0, write_bytes_per_sec: 0, usage_percent: 0 },
  gpu: null,
  temperature: null,
  process_relations: [],
  listening_ports: [],
  fs_hotspots: [],
  plugins: {},
  timestamp: 0,
  stale: false,
};

export default function App() {
  const { snapshot: liveSnapshot, backendStatus } = useSystemData();
  const { t } = useI18n();
  const history = useSystemHistory(liveSnapshot);
  const { displaySnapshot } = history;
  // User-tunable settings (F-702). processCap replaces the old MAX_BUILDINGS_DEFAULT.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [processCap, setProcessCap] = useState(DEFAULT_PROCESS_CAP);
  const [qualityMode, setQualityMode] = useState<QualityMode>("auto");
  // 自适应质量：FPS 状态机已下沉到 hook 内部，App 只消费 buildingCount/bloomEnabled
  // P2-5 FpsCounter 合并进 HudPanel：fps/quality 也由本单实例提供，避免双重订阅
  const { buildingCount, bloomEnabled, fps, quality } = useFpsMonitor({
    sampleSize: 30,
    maxBuildings: processCap,
  });
  const { isMuted, isSupported, toggleMute } = useAudioEngine({
    snapshot: liveSnapshot,
  });
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

  // Quality mode override (F-702): in "auto" we delegate to useFpsMonitor;
  // "performance" forces bloom off and 60% of cap; "quality" forces bloom on
  // and the full cap. The hook itself is not modified (forbidden file).
  const effectiveBloom =
    qualityMode === "performance"
      ? false
      : qualityMode === "quality"
        ? true
        : bloomEnabled;
  const effectiveMaxBuildings =
    qualityMode === "performance"
      ? Math.floor(processCap * 0.6)
      : qualityMode === "quality"
        ? processCap
        : buildingCount;

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
  // FPS 状态机已下沉到 useFpsMonitor，App 直接使用 hook 返回的 buildingCount；
  // qualityMode 覆盖（F-702）通过 effectiveMaxBuildings 注入。
  const maxBuildings = effectiveMaxBuildings;

  const processSignature = useMemo(
    () => (displaySnapshot ? computeProcessSignature(displaySnapshot.processes) : ""),
    [displaySnapshot],
  );

  const layoutResult = useMemo(
    () => (displaySnapshot ? computeGridPositions(displaySnapshot.processes, maxBuildings) : { positions: [] as BuildingPosition[], blocks: [] as BlockInfo[] }),
    [processSignature, maxBuildings],
  );
  const positions = layoutResult.positions;
  const blockCenters = layoutResult.blocks;

  const cableData = useMemo(
    () => (displaySnapshot ? computeCableData(displaySnapshot.network.connections, positions, 80) : []),
    [displaySnapshot?.network.connections, positions],
  );

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
        // Close settings drawer first (F-702); only fall through to popup
        // dismissal on the next Escape press.
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        setUtilityMode(false);
        setSelectedProcess(null);
        setCameraTarget(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [kioskMode, timelineOpen, toggleMute, settingsOpen]);

  if (!themeReady) {
    return <ErrorState message={t("error.loading_visual")} loading />;
  }

  // connecting 阶段保留 loading 提示
  if (backendStatus === "connecting" && !liveSnapshot) {
    return <ErrorState message={t("error.waiting_data")} loading />;
  }

  // 后端无响应时不进入全屏 ErrorState，让空城市 + banner 渲染
  if (backendStatus !== "backend-unresponsive" && !liveSnapshot && timedOut) {
    return (
      <ErrorState
        message={t("error.failed_data")}
        detail={t("error.failed_data_detail")}
        onRetry={handleRetry}
      />
    );
  }

  // 空数据兜底：backend-unresponsive 时不阻塞，让用户看到空城市 + banner
  if (
    backendStatus !== "backend-unresponsive" &&
    (!displaySnapshot || displaySnapshot.processes.length === 0)
  ) {
    return (
      <ErrorState
        message={t("error.no_processes")}
        detail={t("error.no_processes_detail")}
        onRetry={handleRetry}
      />
    );
  }

  // backend-unresponsive 时 displaySnapshot 可能为 null，使用占位快照驱动空城市渲染
  const renderSnapshot = displaySnapshot ?? EMPTY_SNAPSHOT;
  const showUnresponsiveBanner = backendStatus === "backend-unresponsive";

  return (
    <div className="app-container">
      <CityScene
        theme={theme}
        cameraTarget={cameraTarget ?? (selectedPosition ? { x: selectedPosition.x, y: selectedPosition.height, z: selectedPosition.z } : null)}
        autoRotate={autoRotate}
      >
        <Atmosphere theme={theme} />
        {effectiveBloom && (
          <BloomEffect
            theme={theme}
            radius={0.4}
            threshold={0.85}
            enableVignette={false}
            enableSMAA={false}
          />
        )}
        <CityGround theme={theme} blocks={blockCenters} />
        <TrafficFlow theme={theme} />
        <FsHeatmap hotspots={renderSnapshot.fs_hotspots} theme={theme} />
        <BuildingCluster
          processes={renderSnapshot.processes}
          positions={positions}
          theme={theme}
          selectedPid={selectedProcess?.pid ?? null}
          maxBuildings={maxBuildings}
          onClick={handleBuildingClick}
          onDoubleClick={handleBuildingDoubleClick}
        />

        <PortHarbors
          ports={renderSnapshot.listening_ports}
          positions={positions}
          theme={theme}
        />
        <BuildingHalo
          processes={renderSnapshot.processes}
          positions={positions}
          theme={theme}
        />
        <CableSystem cables={cableData} theme={theme} />
      </CityScene>

      <div className={`app-ui-layer ${kioskMode && !showUi ? "kiosk-hidden" : ""}`}>
        {showUnresponsiveBanner && (
          <div className="app-backend-banner" role="alert">
            {t("app.banner.backend_unresponsive")}
          </div>
        )}
        <div className="app-header">
          <span className="app-title">{t("app.title")}</span>
          <span className="app-subtitle">
            {t("app.subtitle.process_count", {
              count: renderSnapshot.processes.length,
              cpu: renderSnapshot.cpu.total.toFixed(1),
            })}
            {!history.isLive && (
              <span className="app-history-indicator">{t("app.subtitle.time_lens_indicator")}</span>
            )}
          </span>
          {isSupported && (
            <span
              className={`app-sound-indicator${isMuted ? " muted" : ""}`}
              onClick={toggleMute}
              title={t(isMuted ? "app.sound.off_title" : "app.sound.on_title")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") toggleMute(); }}
            >
              ±
            </span>
          )}
        </div>
        <HudPanel snapshot={renderSnapshot} theme={theme} fps={fps} quality={quality} />
        {utilityMode ? (
          <UtilityMode
            snapshot={renderSnapshot}
            positions={positions}
            theme={theme}
            onSelectProcess={handleSelectProcessFromUtility}
          />
        ) : null}
        <div className="app-controls">
          {/* P1-3 顶部按钮收敛：环绕 / 时光棱镜 toggle 已挪入 SettingsPanel View section */}
          <button
            className={`app-settings-toggle ${settingsOpen ? "app-toggle-active" : ""}`}
            onClick={() => setSettingsOpen((prev) => !prev)}
            aria-pressed={settingsOpen}
            aria-expanded={settingsOpen}
            title={t("app.button.settings_open_title")}
          >
            {t("app.button.settings")}
          </button>
          <ScreenshotButton />
        </div>
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
        {themeEditorOpen && (
          <ThemeEditor
            theme={theme}
            onChange={handleThemeEditorChange}
            onSave={handleThemeEditorSave}
            onClose={handleCloseThemeEditor}
          />
        )}
        <SettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          processCap={processCap}
          onProcessCapChange={setProcessCap}
          qualityMode={qualityMode}
          onQualityModeChange={setQualityMode}
          currentThemeUrl={currentThemeUrl}
          onThemeChange={handleThemeChange}
          onOpenThemeEditor={handleOpenThemeEditor}
          autoRotate={autoRotate}
          onAutoRotateChange={setAutoRotate}
          timelineOpen={timelineOpen}
          onTimelineOpenChange={setTimelineOpen}
        />
        <ProcessPopup
          process={selectedProcess}
          relations={renderSnapshot.process_relations}
          ports={renderSnapshot.listening_ports}
          connections={renderSnapshot.network.connections}
          allProcesses={renderSnapshot.processes}
          positions={positions}
          blocks={blockCenters}
          onClose={handleClosePopup}
        />
        <div className="app-slogan">{t("app.tagline")}</div>
      </div>
      <ScreensaverMode enabled={kioskMode} onExit={handleExitKiosk} onUiShow={handleUiShow} />
    </div>
  );
}
