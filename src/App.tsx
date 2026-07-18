import { useState, useEffect, useCallback, useMemo } from "react";
import CityScene from "./components/CityScene";
import BuildingCluster from "./components/BuildingCluster";
import BuildingHalo from "./components/BuildingHalo";
import CableSystem, { computeCableData } from "./components/CableSystem";
import CableFlow from "./components/CableFlow";
import CityGround from "./components/CityGround";
import Atmosphere from "./components/Atmosphere";
import RelationGraph from "./components/RelationGraph";
import PortHarbors from "./components/PortHarbors";
import FsHeatmap from "./components/FsHeatmap";
import ProcessPopup from "./components/ProcessPopup";
import ErrorState from "./components/ErrorState";
import HudPanel from "./components/HudPanel";
import UtilityMode from "./components/UtilityMode";
import ThemeSelector from "./components/ThemeSelector";
import { useSystemData } from "./hooks/useSystemData";
import type { ProcessInfo } from "./utils/types";
import { computeTreePositions, computeProcessSignature } from "./utils/layout";
import { shouldIgnoreSpace } from "./utils/keyboard";
import {
  loadTheme,
  applyTheme,
  DEFAULT_THEME_URL,
  FALLBACK_THEME,
  getSavedThemeUrl,
  saveThemeUrl,
  type Theme,
} from "./utils/theme";
import "./App.css";
import "./components/HudPanel.css";
import "./components/UtilityMode.css";
import "./components/ThemeSelector.css";

const DATA_TIMEOUT_MS = 4000;

export default function App() {
  const snapshot = useSystemData();
  const [timedOut, setTimedOut] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [hoveredProcess, setHoveredProcess] = useState<ProcessInfo | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ x: number; y: number; z: number } | null>(null);
  const [utilityMode, setUtilityMode] = useState(false);
  const [theme, setTheme] = useState<Theme>(FALLBACK_THEME);
  const [currentThemeUrl, setCurrentThemeUrl] = useState(DEFAULT_THEME_URL);
  const [themeReady, setThemeReady] = useState(false);

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

  // Data timeout detection.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!snapshot) setTimedOut(true);
    }, DATA_TIMEOUT_MS);

    if (snapshot) {
      setTimedOut(false);
    }

    return () => clearTimeout(timer);
  }, [snapshot]);

  const processSignature = useMemo(
    () => (snapshot ? computeProcessSignature(snapshot.processes) : ""),
    [snapshot],
  );

  const positions = useMemo(
    () => (snapshot ? computeTreePositions(snapshot.processes, 200) : []),
    [processSignature],
  );

  const cableData = useMemo(
    () => (snapshot ? computeCableData(snapshot.network.connections, positions, 80) : []),
    [snapshot?.network.connections, positions],
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

  const handleSelectProcessFromUtility = useCallback((process: ProcessInfo) => {
    setSelectedProcess(process);
    const pos = positions.find((p) => p.pid === process.pid);
    if (pos) {
      setCameraTarget({ x: pos.x, y: pos.height, z: pos.z });
    }
  }, [positions]);

  // Toggle utility mode with Space; close with Escape.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " && !shouldIgnoreSpace(e.target)) {
        e.preventDefault();
        setUtilityMode((prev) => !prev);
      }
      if (e.key === "Escape") {
        setUtilityMode(false);
        setSelectedProcess(null);
        setCameraTarget(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!themeReady) {
    return <ErrorState message="Loading visual system..." loading />;
  }

  if (!snapshot && timedOut) {
    return (
      <ErrorState
        message="Failed to receive system data"
        detail="The backend may still be initializing."
        onRetry={handleRetry}
      />
    );
  }

  if (!snapshot) {
    return <ErrorState message="Waiting for system data..." loading />;
  }

  if (snapshot.processes.length === 0) {
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
      <CityScene theme={theme} cameraTarget={cameraTarget ?? (selectedPosition ? { x: selectedPosition.x, y: selectedPosition.height, z: selectedPosition.z } : null)}>
        <Atmosphere theme={theme} />
        <CityGround theme={theme} />
        <FsHeatmap hotspots={snapshot.fs_hotspots} theme={theme} />
        <BuildingCluster
          processes={snapshot.processes}
          positions={positions}
          theme={theme}
          selectedPid={selectedProcess?.pid ?? null}
          showLabels={utilityMode}
          onClick={handleBuildingClick}
          onDoubleClick={handleBuildingDoubleClick}
          onHover={setHoveredProcess}
        />
        <RelationGraph
          positions={positions}
          relations={snapshot.process_relations}
          theme={theme}
          selectedPid={selectedProcess?.pid ?? null}
          hoveredPid={hoveredProcess?.pid ?? null}
        />
        <PortHarbors
          ports={snapshot.listening_ports}
          positions={positions}
          theme={theme}
        />
        <BuildingHalo
          processes={snapshot.processes}
          positions={positions}
          theme={theme}
        />
        <CableSystem cables={cableData} theme={theme} />
        <CableFlow paths={cablePaths} protocols={cableProtocols} theme={theme} />
      </CityScene>

      <div className="app-ui-layer">
        <div className="app-header">
          <span className="app-title">Procession</span>
          <span className="app-subtitle">
            {snapshot.processes.length} processes · {snapshot.cpu.total.toFixed(1)}% CPU
          </span>
        </div>
        <HudPanel snapshot={snapshot} theme={theme} />
        {utilityMode && (
          <UtilityMode
            snapshot={snapshot}
            positions={positions}
            theme={theme}
            onSelectProcess={handleSelectProcessFromUtility}
          />
        )}
        <div className="app-controls">
          <ThemeSelector currentUrl={currentThemeUrl} onChange={handleThemeChange} />
        </div>
        <ProcessPopup
          process={selectedProcess}
          onClose={handleClosePopup}
          position={{ x: 24, y: 24 }}
        />
      </div>
    </div>
  );
}
