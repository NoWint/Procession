import { useState, useEffect, useCallback, useMemo } from "react";
import CityScene from "./components/CityScene";
import BuildingCluster from "./components/BuildingCluster";
import BuildingHalo from "./components/BuildingHalo";
import CableSystem from "./components/CableSystem";
import CityGround from "./components/CityGround";
import Atmosphere from "./components/Atmosphere";
import ProcessPopup from "./components/ProcessPopup";
import ErrorState from "./components/ErrorState";
import { useSystemData } from "./hooks/useSystemData";
import type { ProcessInfo } from "./utils/types";
import { computeTreePositions } from "./utils/layout";
import { loadTheme, applyTheme, DEFAULT_THEME_URL, FALLBACK_THEME, type Theme } from "./utils/theme";
import "./App.css";

const DATA_TIMEOUT_MS = 4000;

export default function App() {
  const snapshot = useSystemData();
  const [timedOut, setTimedOut] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ x: number; y: number; z: number } | null>(null);
  const [theme, setTheme] = useState<Theme>(FALLBACK_THEME);
  const [themeReady, setThemeReady] = useState(false);

  // Load theme on mount.
  useEffect(() => {
    let cancelled = false;
    loadTheme(DEFAULT_THEME_URL).then((t) => {
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

  const positions = useMemo(
    () => (snapshot ? computeTreePositions(snapshot.processes, 200) : []),
    [snapshot],
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

  const toggleTheme = useCallback(() => {
    const nextUrl = theme.mode === "dark" ? "/themes/light.json" : "/themes/dark.json";
    loadTheme(nextUrl).then((t) => {
      applyTheme(t);
      setTheme(t);
    });
  }, [theme.mode]);

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
        <BuildingCluster
          processes={snapshot.processes}
          theme={theme}
          selectedPid={selectedProcess?.pid ?? null}
          onClick={handleBuildingClick}
          onDoubleClick={handleBuildingDoubleClick}
        />
        <BuildingHalo
          processes={snapshot.processes}
          positions={positions}
          theme={theme}
        />
        <CableSystem
          connections={snapshot.network.connections}
          positions={positions}
          theme={theme}
          maxCables={100}
        />
      </CityScene>

      <div className="app-ui-layer">
        <div className="app-header">
          <span className="app-title">Procession</span>
          <span className="app-subtitle">
            {snapshot.processes.length} processes · {snapshot.cpu.total.toFixed(1)}% CPU
          </span>
        </div>
        <div className="app-controls">
          <button className="app-theme-toggle" onClick={toggleTheme}>
            {theme.mode === "dark" ? "Light" : "Noir"}
          </button>
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
