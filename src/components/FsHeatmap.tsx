import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { FsHotspot } from "../utils/types";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import { useI18n } from "../hooks/useI18n";
import { HEATMAP_Y } from "../utils/worldCoords";

interface FsHeatmapProps {
  hotspots: FsHotspot[];
  theme?: Theme;
  maxZones?: number;
}

export interface HeatZone {
  path: string;
  x: number;
  z: number;
  intensity: number;
  eventCount: number;
  fading: boolean;
}

const MAX_ZONES_DEFAULT = 20;
const FADE_SPEED = 1.5;
const PULSE_SPEED = 2.2;
const HEAT_RADIUS_MIN = 3.5;
const HEAT_RADIUS_VAR = 6.5;

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pathToPosition(path: string): { x: number; z: number } {
  const h = hashString(path);
  const angle = (h % 360) * (Math.PI / 180);
  const radius = HEAT_RADIUS_MIN + ((h % 1000) / 1000) * HEAT_RADIUS_VAR;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  };
}

export function computeHeatZones(
  hotspots: FsHotspot[],
  maxZones: number = MAX_ZONES_DEFAULT,
): HeatZone[] {
  const sorted = [...hotspots].sort((a, b) => b.event_count - a.event_count).slice(0, maxZones);
  const maxCount = Math.max(1, sorted[0]?.event_count ?? 1);

  return sorted.map((h) => {
    const pos = pathToPosition(h.path);
    return {
      path: h.path,
      x: pos.x,
      z: pos.z,
      intensity: h.event_count / maxCount,
      eventCount: h.event_count,
      fading: false,
    };
  });
}

export default function FsHeatmap({
  hotspots,
  theme = FALLBACK_THEME,
  maxZones = MAX_ZONES_DEFAULT,
}: FsHeatmapProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [zones, setZones] = useState<HeatZone[]>([]);
  const { t } = useI18n();

  // Keep a fading-stable zone list: new hotspots appear, missing ones fade out.
  useEffect(() => {
    setZones((prev) => {
      const incoming = computeHeatZones(hotspots, maxZones);
      const incomingMap = new Map(incoming.map((z) => [z.path, z]));
      const next: HeatZone[] = [];

      for (const z of incoming) {
        next.push(z);
      }

      for (const z of prev) {
        if (incomingMap.has(z.path)) continue;
        // Zone no longer active: keep it but mark fading.
        if (!z.fading || z.intensity > 0.02) {
          next.push({ ...z, intensity: Math.max(0, z.intensity - FADE_SPEED * 0.016), fading: true });
        }
      }

      return next.slice(0, maxZones * 2);
    });
  }, [hotspots, maxZones]);

  // Per-frame pulse for active (non-fading) zones.
  const frameRef = useRef(0);
  const updateInstances = useCallback(
    (time: number) => {
      if (!meshRef.current) return;
      const dummy = new THREE.Object3D();
      const color = new THREE.Color(theme.colors.accent);
      const baseScale = 1.6;

      zones.forEach((z, i) => {
        const pulse = z.fading ? 1 : 0.85 + Math.sin(time * PULSE_SPEED + i) * 0.15;
        const scale = baseScale * (0.6 + z.intensity * 0.8) * pulse;

        dummy.position.set(z.x, HEATMAP_Y, z.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(scale, scale, 1);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);

        const alpha = z.fading ? z.intensity : 0.55 + z.intensity * 0.35;
        color.set(theme.colors.accent);
        color.multiplyScalar(alpha);
        meshRef.current!.setColorAt(i, color);
      });

      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) {
        meshRef.current.instanceColor.needsUpdate = true;
      }
    },
    [zones, theme.colors.accent],
  );

  useEffect(() => {
    let raf = 0;
    const loop = (time: number) => {
      frameRef.current = time;
      updateInstances(time * 0.001);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [updateInstances]);

  // Initialize matrices/colors on first mount or count change.
  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color(theme.colors.accent);
    for (let i = 0; i < maxZones * 2; i++) {
      dummy.position.set(0, -100, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, color);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [maxZones, theme.colors.accent]);

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (event.instanceId === undefined) return;
      setHoveredIndex(event.instanceId);
    },
    [],
  );

  const handlePointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHoveredIndex(null);
  }, []);

  if (zones.length === 0) return null;

  const hoveredZone = hoveredIndex !== null ? zones[hoveredIndex] : null;

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, maxZones * 2]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        renderOrder={1}
      >
        <ringGeometry args={[0.35, 0.65, 32]} />
        <meshBasicMaterial
          color={theme.colors.accent}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      {hoveredZone && (
        <Html
          position={[hoveredZone.x, 0.5, hoveredZone.z]}
          center
          distanceFactor={14}
          style={{ pointerEvents: "none" }}
        >
          <div className="harbor-label">
            <div className="harbor-label-port">{t("harbor.events", { count: hoveredZone.eventCount })}</div>
            <div className="harbor-label-address">{hoveredZone.path}</div>
          </div>
        </Html>
      )}
    </group>
  );
}
