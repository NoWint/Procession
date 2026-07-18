import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type React from "react";
import { Fog, Color } from "three";
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
      camera={{ position: [18, 14, 18], fov: 50 }}
      scene={{
        fog: new Fog(new Color(theme.scene.fogColor), theme.scene.fogNear, theme.scene.fogFar),
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
