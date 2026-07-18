import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type React from "react";
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
  return (
    <Canvas
      camera={{ position: [24, 30, 24], fov: 45 }}
      // No fog — was causing a "black barrier" that hid buildings at default
      // camera distance. Fog color (#03040a) matched the background too closely.
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
