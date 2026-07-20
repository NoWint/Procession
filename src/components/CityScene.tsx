import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
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

/**
 * P0-2 主题切换 spring 过渡器。
 * 在 Canvas 内部用 useFrame 把雾颜色/近远端、ambient/hemi/directional 强度
 * 平滑 lerp 到 theme 目标值，避免主题切换时硬切（materialize 原则）。
 *
 * 灯光 ref 由 CityScene 传入；scene.fog 直接通过 useThree() 获取。
 */
interface SceneThemeTransitionProps {
  theme: Theme;
  ambientRef: React.RefObject<THREE.AmbientLight | null>;
  hemiRef: React.RefObject<THREE.HemisphereLight | null>;
  dirRef: React.RefObject<THREE.DirectionalLight | null>;
}

function SceneThemeTransition({ theme, ambientRef, hemiRef, dirRef }: SceneThemeTransitionProps) {
  const { scene } = useThree();

  // 目标值缓存：theme 变化时只更新 target，由 useFrame 平滑过渡
  const targetRef = useRef({
    fogColor: new THREE.Color(theme.scene.fogColor),
    fogNear: theme.scene.fogNear,
    fogFar: theme.scene.fogFar,
    ambient: Math.max(theme.scene.ambientIntensity, 0.35),
    hemi: 0.4,
    directional: Math.max(theme.scene.directionalIntensity, 1.0),
  });

  useEffect(() => {
    targetRef.current.fogColor.set(theme.scene.fogColor);
    targetRef.current.fogNear = theme.scene.fogNear;
    targetRef.current.fogFar = theme.scene.fogFar;
    targetRef.current.ambient = Math.max(theme.scene.ambientIntensity, 0.35);
    targetRef.current.hemi = 0.4;
    targetRef.current.directional = Math.max(theme.scene.directionalIntensity, 1.0);
  }, [theme]);

  useFrame((_state, delta) => {
    const t = targetRef.current;
    // 帧率无关指数衰减 lerp，时间常数 0.3s（Apple critically damped, response 0.3）
    const k = 1 - Math.exp(-delta / 0.3);

    const fog = scene.fog as THREE.Fog | null;
    if (fog && fog.color) {
      fog.color.lerp(t.fogColor, k);
      fog.near = THREE.MathUtils.lerp(fog.near, t.fogNear, k);
      fog.far = THREE.MathUtils.lerp(fog.far, t.fogFar, k);
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(
        ambientRef.current.intensity,
        t.ambient,
        k,
      );
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = THREE.MathUtils.lerp(
        hemiRef.current.intensity,
        t.hemi,
        k,
      );
    }
    if (dirRef.current) {
      dirRef.current.intensity = THREE.MathUtils.lerp(
        dirRef.current.intensity,
        t.directional,
        k,
      );
    }
  });

  return null;
}

export default function CityScene({
  children,
  theme = FALLBACK_THEME,
  cameraTarget,
  autoRotate = false,
}: CitySceneProps) {
  // tab 隐藏时暂停渲染循环，节省 CPU/GPU 资源
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");

  // P0-2 灯光 ref：用于 useFrame 中 lerp 强度
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    const handleVisibility = () => {
      setFrameloop(document.hidden ? "never" : "always");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // 初始强度：与 targetRef 初值一致，避免第一帧硬切
  const initialAmbient = useMemo(() => Math.max(theme.scene.ambientIntensity, 0.35), []);
  const initialDirectional = useMemo(() => Math.max(theme.scene.directionalIntensity, 1.0), []);

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
      <ambientLight ref={ambientRef} intensity={initialAmbient} />
      <hemisphereLight ref={hemiRef} args={[theme.colors.coldBlue, theme.colors.ground, 0.4]} />
      <directionalLight
        ref={dirRef}
        position={[24, 40, 16]}
        intensity={initialDirectional}
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
      <CameraController
        target={cameraTarget}
        autoRotate={autoRotate}
        baseAutoRotateSpeed={0.6}
      />
      {children}
      <CityLandmarks theme={theme} />
      <Skyline theme={theme} />
      {/* P0-2 主题切换 spring 过渡：在 Canvas 内消费 useFrame，lerp 雾/光照到目标 */}
      <SceneThemeTransition
        theme={theme}
        ambientRef={ambientRef}
        hemiRef={hemiRef}
        dirRef={dirRef}
      />
    </Canvas>
  );
}
