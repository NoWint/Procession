import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
/**/
import type { ProcessInfo } from "../utils/types";
import { computeTreePositions, type BuildingPosition } from "../utils/layout";

interface BuildingClusterProps {
  processes: ProcessInfo[];
  positions?: BuildingPosition[];
  maxBuildings?: number;
  onClick?: (process: ProcessInfo) => void;
  onDoubleClick?: (process: ProcessInfo) => void;
  onHover?: (process: ProcessInfo | null) => void;
  [key: string]: unknown;
}

export default function BuildingCluster({
  processes,
  positions: propPositions,
  maxBuildings = 200,
  onClick: _onClick,
}: BuildingClusterProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const positions = useMemo(
    () => propPositions ?? computeTreePositions(processes, maxBuildings),
    [propPositions, processes, maxBuildings],
  );

  // Test: single large green box at origin
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <group>
      {/* DIAGNOSTIC: Single non-instanced mesh. If this renders, the problem is InstancedMesh. */}
      <mesh ref={meshRef} position={[0, 2, 0]} frustumCulled={false}>
        <boxGeometry args={[2, 4, 2]} />
        <meshBasicMaterial color="#00ff00" />
      </mesh>

      {positions.slice(0, 20).map((pos) => {
        const process = processes.find((p) => p.pid === pos.pid);
        if (!process) return null;
        return (
          <Html
            key={`l-${pos.pid}`}
            position={[pos.x, pos.height + 0.9, pos.z]}
            center distanceFactor={14}
            style={{ pointerEvents: "none" }}
          >
            <div className="building-label">{process.name}</div>
          </Html>
        );
      })}
    </group>
  );
}
