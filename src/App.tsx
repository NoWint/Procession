import { useState, useEffect, useCallback } from "react";
import CityScene from "./components/CityScene";
import BuildingCluster from "./components/BuildingCluster";
import CityGround from "./components/CityGround";
import Atmosphere from "./components/Atmosphere";
import ProcessPopup from "./components/ProcessPopup";
import ErrorState from "./components/ErrorState";
import { useSystemData } from "./hooks/useSystemData";
import type { ProcessInfo } from "./utils/types";
import "./App.css";

const DATA_TIMEOUT_MS = 3000;

export default function App() {
  const snapshot = useSystemData();
  const [timedOut, setTimedOut] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!snapshot) setTimedOut(true);
    }, DATA_TIMEOUT_MS);

    if (snapshot) {
      setTimedOut(false);
    }

    return () => clearTimeout(timer);
  }, [snapshot]);

  const handleBuildingClick = useCallback((process: ProcessInfo) => {
    setSelectedProcess(process);
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedProcess(null);
  }, []);

  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  if (!snapshot && timedOut) {
    return (
      <ErrorState
        message="Failed to receive system data"
        onRetry={handleRetry}
      />
    );
  }

  if (!snapshot) {
    return <ErrorState message="Waiting for system data..." />;
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <CityScene>
        <Atmosphere />
        <CityGround />
        <BuildingCluster
          processes={snapshot.processes}
          onClick={handleBuildingClick}
        />
      </CityScene>
      <ProcessPopup
        process={selectedProcess}
        onClose={handleClosePopup}
        position={{ x: 24, y: 24 }}
      />
    </div>
  );
}
