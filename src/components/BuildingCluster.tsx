import { useRef, useMemo, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import { computeTreePositions, type BuildingPosition } from "../utils/layout";
import { colorForProcess, type Theme } from "../utils/colors";
import { FALLBACK_THEME } from "../utils/theme";

interface BuildingClusterProps {
  processes: ProcessInfo[];
  positions?: BuildingPosition[];
  theme?: Theme;
  selectedPid?: number | null;
  layout?: "radial" | "tree";
  maxBuildings?: number;
  showLabels?: boolean;
  maxLabels?: number;
  onClick?: (process: ProcessInfo) => void;
  onDoubleClick?: (process: ProcessInfo) => void;
  onHover?: (process: ProcessInfo | null) => void;
}

const dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _emissive = new THREE.Color();

export default function BuildingCluster({
  processes,
  positions: propPositions,
  theme = FALLBACK_THEME,
  selectedPid = null,
  layout = "tree",
  maxBuildings = 200,
  showLabels = false,
  maxLabels = 40,
  onClick,
  onDoubleClick,
  onHover,
}: BuildingClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const positions = useMemo(
    () =>
      propPositions ??
      (layout === "tree"
        ? computeTreePositions(processes, maxBuildings)
        : computeTreePositions(processes, maxBuildings)), // fallback also tree
    [propPositions, processes, layout, maxBuildings],
  );

  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Base colors per instance, stored for glow calculations.
  const baseColors = useMemo(() => {
    const map = new Map<number, THREE.Color>();
    positions.forEach((pos) => {
      const process = processes.find((p) => p.pid === pos.pid);
      if (process) {
        map.set(pos.pid, new THREE.Color(colorForProcess(process, theme)));
      }
    });
    return map;
  }, [positions, processes, theme]);

  // Track which instances are "active" (high CPU) for per-frame pulse.
  const activeIndices = useMemo(() => {
    const ids = new Set<number>();
    positions.forEach((pos, i) => {
      const p = processes.find((proc) => proc.pid === pos.pid);
      if (p && p.cpu > 50) ids.add(i);
    });
    return ids;
  }, [positions, processes]);

  // Initialize instance matrices and colors.
  useEffect(() => {
    if (!meshRef.current) return;

    positions.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.height / 2, pos.z);
      dummy.scale.set(1, pos.height, 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      const process = processes.find((p) => p.pid === pos.pid);
      if (process) {
        meshRef.current!.setColorAt(i, new THREE.Color(colorForProcess(process, theme)));
      }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [positions, processes, theme]);

  // Apply hover/selection highlight whenever those states change.
  useEffect(() => {
    if (!meshRef.current || !meshRef.current.instanceColor) return;

    positions.forEach((pos, i) => {
      const base = baseColors.get(pos.pid);
      if (!base) return;

      _color.copy(base);

      const isHovered = hoveredId === i;
      const isSelected = selectedPid === pos.pid;

      if (isHovered || isSelected) {
        _color.lerp(new THREE.Color(theme.colors.accent), isSelected ? 0.45 : 0.25);
      }

      meshRef.current!.setColorAt(i, _color);
    });

    meshRef.current.instanceColor.needsUpdate = true;
  }, [hoveredId, selectedPid, positions, baseColors, theme]);

  // Per-frame glow pulse for active processes only.
  useFrame(({ clock }) => {
    if (!meshRef.current || !meshRef.current.instanceColor) return;

    const pulse = (Math.sin(clock.elapsedTime * 3) + 1) * 0.5; // 0..1
    const glowIntensity = 0.15 + pulse * 0.25;

    for (const i of activeIndices) {
      const pos = positions[i];
      if (!pos) continue;
      const base = baseColors.get(pos.pid);
      if (!base) continue;

      _color.copy(base).lerp(new THREE.Color(theme.colors.accent), pulse * 0.35);
      meshRef.current!.setColorAt(i, _color);
    }

    if (materialRef.current) {
      _emissive.set(theme.colors.active);
      materialRef.current.emissive = _emissive;
      materialRef.current.emissiveIntensity = glowIntensity;
    }

    meshRef.current.instanceColor.needsUpdate = true;
  });

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const instanceId = event.instanceId;
      if (instanceId === undefined) return;
      setHoveredId(instanceId);
      const pos = positions[instanceId];
      const process = processes.find((p) => p.pid === pos.pid);
      if (process) onHover?.(process);
    },
    [positions, processes, onHover],
  );

  const handlePointerOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHoveredId(null);
      onHover?.(null);
    },
    [onHover],
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const instanceId = event.instanceId;
      if (instanceId === undefined || !onClick) return;

      const pos = positions[instanceId];
      const process = processes.find((p) => p.pid === pos.pid);
      if (process) onClick(process);
    },
    [positions, processes, onClick],
  );

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const instanceId = event.instanceId;
      if (instanceId === undefined || !onDoubleClick) return;

      const pos = positions[instanceId];
      const process = processes.find((p) => p.pid === pos.pid);
      if (process) onDoubleClick(process);
    },
    [positions, processes, onDoubleClick],
  );

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, positions.length]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        frustumCulled
      >
        <boxGeometry args={[0.9, 1, 0.9]} />
        <meshStandardMaterial
          ref={materialRef}
          roughness={0.7}
          metalness={0.15}
        />
      </instancedMesh>
      {showLabels &&
        positions.slice(0, maxLabels).map((pos) => {
          const process = processes.find((p) => p.pid === pos.pid);
          if (!process) return null;
          return (
            <Html
              key={`label-${pos.pid}`}
              position={[pos.x, pos.height + 0.8, pos.z]}
              center
              distanceFactor={12}
              style={{ pointerEvents: "none" }}
            >
              <div className="building-label">{process.name}</div>
            </Html>
          );
        })}
    </group>
  );
}
