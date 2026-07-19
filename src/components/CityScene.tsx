import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useState } from "react";
import type React from "react";
import CameraController from "./CameraController";
import SkyDome from "./SkyDome";
import CityLandmarks from "./CityLandmarks";
import Skyline from "./Skyline";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface CitySceneProps {
  children?: React.ReactNode;
  theme?: Theme;
  cameraTarget?: { x: number; y: number; z: number } | null;
  autoRotate?: boolean;
}

export default function CityScene({
  children,
  theme = FALLBACK_THEME,
  cameraTarget,
  autoRotate = false,
}: CitySceneProps) {
  // tab 隐藏时暂停渲染循环，节省 CPU/GPU 资源
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");

  useEffect(() => {
    const handleVisibility = () => {
      setFrameloop(document.hidden ? "never" : "always");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <Canvas
      camera={{ position: [16, 18, 22], fov: 55 }}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        powerPreference: "high-performance",
        logarithmicDepthBuffer: true,
      }}
      shadows="soft"
      dpr={[1, 1.5]}
      frameloop={frameloop}
    >
      <fog attach="fog" args={[theme.scene.fogColor, theme.scene.fogNear, theme.scene.fogFar]} />
      <SkyDome theme={theme} />
      <ambientLight intensity={Math.max(theme.scene.ambientIntensity, 0.35)} />
      <hemisphereLight args={[theme.colors.coldBlue, theme.colors.ground, 0.4]} />
      <directionalLight
        position={[24, 40, 16]}
        intensity={Math.max(theme.scene.directionalIntensity, 1.0)}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.0005}
      />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={6}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2 - 0.05}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
      />
      <CameraController target={cameraTarget} />
      {children}
      <CityLandmarks theme={theme} />
      <Skyline theme={theme} />
    </Canvas>
  );
}
