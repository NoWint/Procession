import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
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
      camera={{ position: [16, 18, 22], fov: 55 }}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      shadows
    >
      <color attach="background" args={[theme.colors.background]} />
      <fog attach="fog" args={[theme.scene.fogColor, theme.scene.fogNear, theme.scene.fogFar]} />
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
    </Canvas>
  );
}
