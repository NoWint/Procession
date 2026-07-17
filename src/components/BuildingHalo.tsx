import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface BuildingHaloProps {
  processes: ProcessInfo[];
  positions: BuildingPosition[];
  theme?: Theme;
}

const dummy = new THREE.Object3D();
const HALO_Y_OFFSET = 0.06;

export default function BuildingHalo({
  processes,
  positions,
  theme = FALLBACK_THEME,
}: BuildingHaloProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const haloData = useMemo(() => {
    const runningPids = new Set(
      processes.filter((p) => p.state === "Running").map((p) => p.pid),
    );
    // Cap halos to the top-N running processes by CPU to keep draw calls stable.
    return positions
      .filter((pos) => runningPids.has(pos.pid))
      .slice(0, 60);
  }, [processes, positions]);

  // Initialize instance matrices and colors.
  useEffect(() => {
    if (!meshRef.current) return;

    const color = new THREE.Color(theme.colors.active);
    haloData.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.height + HALO_Y_OFFSET, pos.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(i, color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [haloData, theme]);

  // Slow sinusoidal pulse on scale.
  useFrame(({ clock }) => {
    if (!meshRef.current) return;

    const pulse = (Math.sin(clock.elapsedTime * 1.5) + 1) * 0.5; // 0..1
    const scale = 0.85 + pulse * 0.3; // 0.85..1.15

    haloData.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.height + HALO_Y_OFFSET, pos.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, haloData.length]}>
      <ringGeometry args={[0.5, 0.62, 32]} />
      <meshBasicMaterial
        color={theme.colors.active}
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
