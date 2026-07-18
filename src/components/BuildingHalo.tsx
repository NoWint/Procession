import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import { colorForProcess } from "../utils/colors";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface BuildingHaloProps {
  processes: ProcessInfo[];
  positions: BuildingPosition[];
  theme?: Theme;
}

const dummy = new THREE.Object3D();
const HALO_Y_OFFSET = 0.06;
const HALO_INNER = 0.45;
const HALO_OUTER = 0.7;

const vertexShader = `
  uniform float time;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    float pulse = (sin(time * 1.5) + 1.0) * 0.5;
    float scale = 0.85 + pulse * 0.3;
    vec3 scaledPosition = position * scale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(scaledPosition, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 color;
  uniform float opacity;
  varying vec2 vUv;

  void main() {
    float dist = distance(vUv, vec2(0.5));
    float ring = smoothstep(0.5, 0.48, dist) * smoothstep(0.42, 0.44, dist);
    gl_FragColor = vec4(color, opacity * ring);
  }
`;

export function createHaloMaterial(theme: Theme = FALLBACK_THEME): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(theme.colors.active) },
      opacity: { value: 0.75 },
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
    const running = processes.filter((p) => p.state === "Running");
    const posMap = new Map(positions.map((p) => [p.pid, p]));
    return running
      .map((p) => ({ process: p, position: posMap.get(p.pid) }))
      .filter((d): d is { process: ProcessInfo; position: BuildingPosition } => !!d.position)
      .slice(0, 80);
  }, [processes, positions]);

  const material = useMemo(() => createHaloMaterial(theme), [theme]);

  // Initialize instance matrices and colors.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || typeof mesh.setMatrixAt !== "function") return;

    haloData.forEach((d, i) => {
      const scale = 1 + d.position.height * 0.02;
      dummy.position.set(d.position.x, HALO_Y_OFFSET, d.position.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(scale, scale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(colorForProcess(d.process, theme)));
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
      <ringGeometry args={[HALO_INNER, HALO_OUTER, 32]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}
