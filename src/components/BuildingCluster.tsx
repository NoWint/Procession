import { useRef, useMemo, useEffect, useCallback } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import { computePositions } from "../utils/layout";
import { colorForProcess } from "../utils/colors";

interface BuildingClusterProps {
  processes: ProcessInfo[];
  onClick?: (process: ProcessInfo) => void;
}

const dummy = new THREE.Object3D();

export default function BuildingCluster({ processes, onClick }: BuildingClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const positions = useMemo(() => computePositions(processes), [processes]);

  useEffect(() => {
    if (!meshRef.current) return;

    positions.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.height / 2, pos.z);
      dummy.scale.set(1, pos.height, 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      const process = processes.find((p) => p.pid === pos.pid);
      if (process) {
        meshRef.current!.setColorAt(i, new THREE.Color(colorForProcess(process)));
      }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [positions, processes]);

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

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, positions.length]}
      onClick={handleClick}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}
