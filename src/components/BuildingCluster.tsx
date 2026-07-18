import { useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import { computeTreePositions, type BuildingPosition } from "../utils/layout";

interface BuildingClusterProps {
  processes: ProcessInfo[];
  positions?: BuildingPosition[];
  theme?: unknown;
  selectedPid?: number | null;
  showLabels?: boolean;
  maxLabels?: number;
  layout?: "radial" | "tree";
  maxBuildings?: number;
  onClick?: (process: ProcessInfo) => void;
  onDoubleClick?: (process: ProcessInfo) => void;
  onHover?: (process: ProcessInfo | null) => void;
}

const dummy = new THREE.Object3D();

export default function BuildingCluster({
  processes,
  positions: propPositions,
  layout: _layout = "tree",
  maxBuildings = 200,
  onClick,
}: BuildingClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const positionsRef = useRef<BuildingPosition[]>([]);

  const positions = useMemo(
    () => propPositions ?? computeTreePositions(processes, maxBuildings),
    [propPositions, processes, maxBuildings],
  );
  positionsRef.current = positions;

  const capacity = Math.max(1, maxBuildings * 2);

  // Minimal per-frame: just write positions, no colors, no lifecycle
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || positions.length === 0) return;

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      dummy.position.set(pos.x, pos.height / 2, pos.z);
      dummy.scale.set(1, pos.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = positions.length;
    mesh.instanceMatrix.needsUpdate = true;
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined || !onClick) return;
    const pos = positionsRef.current[id];
    if (pos) {
      const p = processes.find((p) => p.pid === pos.pid);
      if (p) onClick(p);
    }
  }, [processes, onClick]);

  return (
    <group>
      {/* DIAGNOSTIC: pure InstancedMesh with MeshBasicMaterial, hotpink color */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, capacity]}
        onClick={handleClick} frustumCulled={false}>
        <boxGeometry args={[0.5, 1, 0.5]} />
        <meshBasicMaterial color="hotpink" />
      </instancedMesh>

      {positions.map((pos) => {
        const process = processes.find((p) => p.pid === pos.pid);
        if (!process) return null;
        return (
          <Html key={`l-${pos.pid}`}
            position={[pos.x, pos.height + 0.9, pos.z]}
            center distanceFactor={14} style={{ pointerEvents: "none" }}>
            <div className="building-label">{process.name}</div>
          </Html>
        );
      })}
    </group>
  );
}
