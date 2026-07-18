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

// LOD thresholds (camera distance from origin)
const LOD_NEAR = 25;
const LOD_MID = 50;

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
    vec3 bottom = vInstanceColor * 0.35;
    vec3 top = vInstanceColor * 1.6 + uEmissive * 0.45;
    vec3 baseColor = mix(bottom, top, pow(vUv.y, 0.85));

    // Window grid pattern
    float windowU = fract(vUv.x * 6.0);
    float windowV = fract(vUv.y * 18.0);
    float window = step(0.08, windowU) * step(0.08, windowV);
    float windowGlow = (1.0 - window) * (0.5 + 0.5 * sin(uTime * 2.0 + vUv.y * 10.0));
    baseColor += vInstanceColor * windowGlow * 0.35;

    // Fresnel edge glow
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.5);
    baseColor += uEmissive * fresnel * 0.8;

    // Top cap glow
    float topCap = step(0.96, vUv.y);
    baseColor += uEmissive * topCap * 0.9;

    // Energy scan lines
    float scan = sin(vUv.y * 24.0 - uTime * 2.5) * 0.5 + 0.5;
    baseColor += uEmissive * scan * 0.1 * uEnergy;

    gl_FragColor = vec4(baseColor, 0.94);
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
  // LOD: three InstancedMesh at different detail levels
  const highRef = useRef<THREE.InstancedMesh>(null);
  const midRef = useRef<THREE.InstancedMesh>(null);
  const lowRef = useRef<THREE.InstancedMesh>(null);
  const highMaterialRef = useRef<THREE.ShaderMaterial>(null);

  const positions = useMemo(
    () =>
      propPositions ??
      (layout === "tree"
        ? computeTreePositions(processes, maxBuildings)
        : computeTreePositions(processes, maxBuildings)),
    [propPositions, processes, layout, maxBuildings],
  );

  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [lodLevel, setLodLevel] = useState(0);
  const lodLevelRef = useRef(0);
  const lifecycleRef = useRef<Map<number, LifecycleEntry>>(new Map());
  const prevProcessesRef = useRef<ProcessInfo[]>([]);
  const prevPositionsRef = useRef<BuildingPosition[]>([]);
  const clockRef = useRef(0);

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

  /// Update instance matrices and colors for one InstancedMesh (LOD level helper).
  function updateMesh(
    mesh: THREE.InstancedMesh,
    positions: BuildingPosition[],
    processes: ProcessInfo[],
    elapsed: number,
    scale: "high" | "mid" | "low",
  ) {
    let instanceIndex = 0;

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const process = processes.find((p) => p.pid === pos.pid);
      const entry = lifecycleRef.current.get(pos.pid);
      const lifeScale = entry?.progress ?? 1;
      const heightScale = scale === "low" ? 1 : pos.height;

      dummy.position.set(pos.x, (pos.height / 2) * lifeScale, pos.z);
      dummy.scale.set(lifeScale, lifeScale * heightScale, lifeScale);
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
        const pulse = (Math.sin(elapsed * 3) + 1) * 0.5;
        _color.lerp(new THREE.Color(theme.colors.pulseWhite), pulse * 0.25);
      }

      // Brightness boost for far LOD (tiny boxes need to still be visible as glow dots)
      if (scale === "low") {
        _color.multiplyScalar(2.5);
      } else if (scale === "mid") {
        _color.multiplyScalar(1.4);
      }

      const isHovered = scale === "high" && hoveredId === instanceIndex;
      const isSelected = scale === "high" && selectedPid === pos.pid;
      if (isHovered || isSelected) {
        _color.lerp(new THREE.Color(theme.colors.pulseWhite), isSelected ? 0.45 : 0.25);
      }

      mesh.setColorAt(instanceIndex, _color);
      instanceIndex++;
    }

    for (const entry of lifecycleRef.current.values()) {
      if (entry.state !== "dying") continue;

      const lifeScale = entry.progress;
      const heightScale = scale === "low" ? 1 : entry.position.height;

      dummy.position.set(entry.position.x, (entry.position.height / 2) * lifeScale, entry.position.z);
      dummy.scale.set(lifeScale, lifeScale * heightScale, lifeScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummy.matrix);

      _color.copy(entry.color).lerp(new THREE.Color(0x000000), 1 - lifeScale);
      mesh.setColorAt(instanceIndex, _color);
      instanceIndex++;
    }

    mesh.count = instanceIndex;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // Per-frame: LOD selection, lifecycle animation, instance matrix update.
  useFrame(({ camera }, delta) => {
    clockRef.current += delta;

    // Advance lifecycle animations
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

    // Determine LOD level from camera distance
    const dist = camera.position.length();
    const newLevel = dist < LOD_NEAR ? 0 : dist < LOD_MID ? 1 : 2;
    if (newLevel !== lodLevelRef.current) {
      lodLevelRef.current = newLevel;
      setLodLevel(newLevel);
    }

    // Update visibility
    const elapsed = clockRef.current;
    if (highRef.current) {
      highRef.current.visible = newLevel === 0;
      if (newLevel === 0) {
        updateMesh(highRef.current, positions, processes, elapsed, "high");
      }
    }
    if (midRef.current) {
      midRef.current.visible = newLevel === 1;
      if (newLevel === 1) {
        updateMesh(midRef.current, positions, processes, elapsed, "mid");
      }
    }
    if (lowRef.current) {
      lowRef.current.visible = newLevel === 2;
      if (newLevel === 2) {
        updateMesh(lowRef.current, positions, processes, elapsed, "low");
      }
    }

    // Update high-detail uniforms
    if (highMaterialRef.current) {
      highMaterialRef.current.uniforms.uTime.value = elapsed;
      const emissive = new THREE.Color(theme.colors.electricCyan);
      highMaterialRef.current.uniforms.uEmissive.value = emissive;
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

  const instanceCount = Math.max(1, maxBuildings * 2);

  return (
    <group>
      {/* High detail: full custom shader (distance < LOD_NEAR) */}
      <instancedMesh
        ref={highRef}
        args={[undefined, undefined, instanceCount]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        frustumCulled
      >
        <boxGeometry args={[0.5, 1, 0.5]} />
        <shaderMaterial
          ref={highMaterialRef}
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

      {/* Mid detail: simplified box + emissive color (LOD_NEAR <= distance < LOD_MID)
          — MeshBasicMaterial skips lighting, toneMapped:false keeps colors vibrant */}
      <instancedMesh
        ref={midRef}
        args={[undefined, undefined, instanceCount]}
        frustumCulled
      >
        <boxGeometry args={[0.5, 1, 0.5]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.92} />
      </instancedMesh>

      {/* Far detail: tiny glow dots (distance >= LOD_MID) */}
      <instancedMesh
        ref={lowRef}
        args={[undefined, undefined, instanceCount]}
        frustumCulled
      >
        <boxGeometry args={[0.15, 0.15, 0.15]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
      </instancedMesh>

      {/* Labels — only at near LOD level */}
      {lodLevel === 0 &&
        positions.map((pos) => {
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
