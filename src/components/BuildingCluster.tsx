import { useRef, useMemo, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import { computeTreePositions } from "../utils/layout";
import { colorForProcess, type Theme } from "../utils/colors";
import { FALLBACK_THEME } from "../utils/theme";

interface BuildingClusterProps {
  processes: ProcessInfo[];
  theme?: Theme;
  selectedPid?: number | null;
  layout?: "radial" | "tree";
  maxBuildings?: number;
  showLabels?: boolean;
  onClick?: (process: ProcessInfo) => void;
  onDoubleClick?: (process: ProcessInfo) => void;
  onHover?: (process: ProcessInfo | null) => void;
}

const dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _emissive = new THREE.Color();

export default function BuildingCluster({
  processes,
  theme = FALLBACK_THEME,
  selectedPid = null,
  layout = "tree",
  maxBuildings = 200,
  showLabels = false,
  onClick,
  onDoubleClick,
  onHover,
}: BuildingClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const positions = useMemo(
    () =>
      layout === "tree"
        ? computeTreePositions(processes, maxBuildings)
        : computeTreePositions(processes, maxBuildings), // fallback also tree
    [processes, layout, maxBuildings],
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

  // Per-frame glow pulse for active processes + hover/selection highlight.
  useFrame(({ clock }) => {
    if (!meshRef.current || !meshRef.current.instanceColor) return;

    const pulse = (Math.sin(clock.elapsedTime * 3) + 1) * 0.5; // 0..1
    const glowIntensity = 0.15 + pulse * 0.25;

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
      >
        <boxGeometry args={[0.9, 1, 0.9]} />
        <meshStandardMaterial
          ref={materialRef}
          roughness={0.7}
          metalness={0.15}
        />
      </instancedMesh>
      {showLabels &&
        positions.map((pos) => {
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
