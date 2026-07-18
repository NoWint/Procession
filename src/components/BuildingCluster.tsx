import { useRef, useMemo, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import { computeTreePositions, type BuildingPosition } from "../utils/layout";
import { colorForProcess, type Theme } from "../utils/colors";
import { diffProcesses } from "../utils/lifecycle";
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

interface LifecycleEntry {
  pid: number;
  state: "born" | "alive" | "dying";
  progress: number;
  position: BuildingPosition;
  color: THREE.Color;
}

const dummy = new THREE.Object3D();
const _color = new THREE.Color();
const BIRTH_DURATION = 0.8;
const DEATH_DURATION = 1.0;

const buildingVertexShader = `
  uniform float uTime;
  attribute vec3 instanceColor;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vInstanceColor;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vInstanceColor = instanceColor;
    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
  }
`;

const buildingFragmentShader = `
  uniform vec3 uEmissive;
  uniform float uTime;
  uniform float uEnergy;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vInstanceColor;

  void main() {
    vec3 bottom = vInstanceColor * 0.6;
    vec3 top = vInstanceColor * 1.4 + uEmissive * 0.25;
    vec3 baseColor = mix(bottom, top, vUv.y);

    // Fresnel edge glow
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.0);
    baseColor += uEmissive * fresnel * 0.6;

    // Energy scan lines
    float scan = sin(vUv.y * 20.0 - uTime * 2.0) * 0.5 + 0.5;
    baseColor += uEmissive * scan * 0.08 * uEnergy;

    gl_FragColor = vec4(baseColor, 0.92);
  }
`;

export default function BuildingCluster({
  processes,
  positions: propPositions,
  theme = FALLBACK_THEME,
  selectedPid = null,
  layout = "tree",
  maxBuildings = 200,
  onClick,
  onDoubleClick,
  onHover,
}: BuildingClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const positions = useMemo(
    () =>
      propPositions ??
      (layout === "tree"
        ? computeTreePositions(processes, maxBuildings)
        : computeTreePositions(processes, maxBuildings)),
    [propPositions, processes, layout, maxBuildings],
  );

  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const lifecycleRef = useRef<Map<number, LifecycleEntry>>(new Map());
  const prevProcessesRef = useRef<ProcessInfo[]>([]);
  const prevPositionsRef = useRef<BuildingPosition[]>([]);

  // Detect births and deaths by diffing the current process list against the previous frame.
  useEffect(() => {
    const { births, deaths } = diffProcesses(prevProcessesRef.current, processes);

    for (const p of processes) {
      const entry = lifecycleRef.current.get(p.pid);
      if (entry && entry.state === "dying") {
        entry.state = "born";
        entry.progress = 0;
        const pos = positions.find((pos) => pos.pid === p.pid);
        if (pos) entry.position = pos;
        entry.color.set(colorForProcess(p, theme));
      }
    }

    for (const p of births) {
      const pos = positions.find((pos) => pos.pid === p.pid);
      if (pos) {
        lifecycleRef.current.set(p.pid, {
          pid: p.pid,
          state: "born",
          progress: 0,
          position: pos,
          color: new THREE.Color(colorForProcess(p, theme)),
        });
      }
    }

    for (const p of deaths) {
      const pos = prevPositionsRef.current.find((pos) => pos.pid === p.pid);
      if (pos) {
        lifecycleRef.current.set(p.pid, {
          pid: p.pid,
          state: "dying",
          progress: 1,
          position: pos,
          color: new THREE.Color(colorForProcess(p, theme)),
        });
      }
    }

    prevProcessesRef.current = processes;
    prevPositionsRef.current = positions;
  }, [processes, positions, theme]);

  // Per-frame: advance lifecycle animations and update instance matrices/colors.
  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (const entry of lifecycleRef.current.values()) {
      if (entry.state === "born") {
        entry.progress = Math.min(1, entry.progress + delta / BIRTH_DURATION);
        if (entry.progress >= 1) entry.state = "alive";
      } else if (entry.state === "dying") {
        entry.progress = Math.max(0, entry.progress - delta / DEATH_DURATION);
      }
    }

    for (const [pid, entry] of lifecycleRef.current) {
      if (entry.state === "dying" && entry.progress <= 0) {
        lifecycleRef.current.delete(pid);
      }
    }

    let instanceIndex = 0;

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const process = processes.find((p) => p.pid === pos.pid);
      const entry = lifecycleRef.current.get(pos.pid);
      const scale = entry?.progress ?? 1;

      dummy.position.set(pos.x, (pos.height / 2) * scale, pos.z);
      dummy.scale.set(scale, scale * pos.height, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummy.matrix);

      _color.copy(
        process
          ? new THREE.Color(colorForProcess(process, theme))
          : entry?.color ?? new THREE.Color(theme.colors.idle),
      );

      if (entry?.state === "born") {
        _color.lerp(new THREE.Color(theme.colors.pulseWhite), (1 - entry.progress) * 0.5);
      }

      if (process && process.cpu > 50) {
        const pulse = (Math.sin(clock.elapsedTime * 3) + 1) * 0.5;
        _color.lerp(new THREE.Color(theme.colors.pulseWhite), pulse * 0.25);
      }

      const isHovered = hoveredId === instanceIndex;
      const isSelected = selectedPid === pos.pid;
      if (isHovered || isSelected) {
        _color.lerp(new THREE.Color(theme.colors.pulseWhite), isSelected ? 0.45 : 0.25);
      }

      mesh.setColorAt(instanceIndex, _color);
      instanceIndex++;
    }

    for (const entry of lifecycleRef.current.values()) {
      if (entry.state !== "dying") continue;

      const scale = entry.progress;
      dummy.position.set(entry.position.x, (entry.position.height / 2) * scale, entry.position.z);
      dummy.scale.set(scale, scale * entry.position.height, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummy.matrix);

      _color.copy(entry.color).lerp(new THREE.Color(0x000000), 1 - scale);
      mesh.setColorAt(instanceIndex, _color);
      instanceIndex++;
    }

    mesh.count = instanceIndex;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
      const emissive = new THREE.Color(theme.colors.electricCyan);
      materialRef.current.uniforms.uEmissive.value = emissive;
    }
  });

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const instanceId = event.instanceId;
      if (instanceId === undefined || instanceId >= positions.length) return;
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
      if (instanceId === undefined || instanceId >= positions.length || !onClick) return;

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
      if (instanceId === undefined || instanceId >= positions.length || !onDoubleClick) return;

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
        args={[undefined, undefined, Math.max(1, maxBuildings * 2)]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        frustumCulled
      >
        <boxGeometry args={[0.75, 1, 0.75]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={buildingVertexShader}
          fragmentShader={buildingFragmentShader}
          transparent
          depthWrite={false}
          uniforms={{
            uTime: { value: 0 },
            uEmissive: { value: new THREE.Color(theme.colors.electricCyan) },
            uEnergy: { value: 0.7 },
          }}
        />
      </instancedMesh>
      {positions.map((pos) => {
        const process = processes.find((p) => p.pid === pos.pid);
        if (!process) return null;
        return (
          <Html
            key={`label-${pos.pid}`}
            position={[pos.x, pos.height + 0.9, pos.z]}
            center
            distanceFactor={14}
            style={{ pointerEvents: "none" }}
          >
            <div className="building-label">{process.name}</div>
          </Html>
        );
      })}
    </group>
  );
}
