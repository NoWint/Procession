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

const vertexShader = `
  uniform float time;

  void main() {
    float pulse = (sin(time * 1.5) + 1.0) * 0.5;
    float scale = 0.85 + pulse * 0.3;
    vec3 scaledPosition = position * scale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(scaledPosition, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 color;
  uniform float opacity;

  void main() {
    gl_FragColor = vec4(color, opacity);
  }
`;

export function createHaloMaterial(theme: Theme = FALLBACK_THEME): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(theme.colors.active) },
      opacity: { value: 0.55 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

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

  const material = useMemo(() => createHaloMaterial(theme), [theme]);

  // Initialize instance matrices and colors.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || typeof mesh.setMatrixAt !== "function") return;

    const color = new THREE.Color(theme.colors.active);
    haloData.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.height + HALO_Y_OFFSET, pos.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [haloData, theme]);

  // GPU-driven pulse: only update the time uniform each frame.
  useFrame(({ clock }) => {
    material.uniforms.time.value = clock.elapsedTime;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, haloData.length]}>
      <ringGeometry args={[0.5, 0.62, 32]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}
