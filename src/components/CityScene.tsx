import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type React from "react";
import { FogExp2, Color } from "three";
import CameraController from "./CameraController";
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
  // Reduce fog density so buildings at default camera distance (~45u) are
  // clearly visible. Original 0.018 made objects only ~45% visible at 45u,
  // rendering them nearly invisible against the dark background.
  // New density: at 45u → ~80% visible; at 80u → ~60% visible.
  const fogDensity = 0.005;

  return (
    <Canvas
      camera={{ position: [24, 30, 24], fov: 45 }}
      scene={{
        fog: new FogExp2(new Color(theme.scene.fogColor), fogDensity),
        background: new Color(theme.colors.background),
      }}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={[theme.colors.background]} />
      <ambientLight intensity={theme.scene.ambientIntensity} />
      <directionalLight
        position={[12, 24, 8]}
        intensity={theme.scene.directionalIntensity}
        castShadow
      />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={4}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2 - 0.05}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
      />
      <CameraController target={cameraTarget} />
      {children}
    </Canvas>
  );
}
