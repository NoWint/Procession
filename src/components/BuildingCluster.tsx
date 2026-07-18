import { useRef, useMemo, useEffect, useCallback } from "react";
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
const _emissive = new THREE.Color();
const _black = new THREE.Color(0x000000);
const BIRTH_DURATION = 0.8;
const DEATH_DURATION = 1.0;

// Custom attribute name — avoids Three.js built-in instanceColor pipeline
// which has driver-specific issues on Windows with ShaderMaterial + r185.
const COLOR_ATTR = "aColor";

const vertexShader = `
  attribute vec3 ${COLOR_ATTR};
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vCol;

  void main() {
    vUv = uv;
    vNorm = normalize(normalMatrix * normal);
    vCol = ${COLOR_ATTR};
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    vPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * wp;
  }
`;

const fragmentShader = `
  uniform vec3 uEmissive;
  uniform float uTime;
  uniform float uEnergy;
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vCol;

  void main() {
    vec3 bot = vCol * 0.35;
    vec3 top = vCol * 1.6 + uEmissive * 0.45;
    vec3 c = mix(bot, top, pow(vUv.y, 0.85));

    float wu = fract(vUv.x * 6.0);
    float wv = fract(vUv.y * 18.0);
    float w = step(0.08, wu) * step(0.08, wv);
    float wg = (1.0 - w) * (0.5 + 0.5 * sin(uTime * 2.0 + vUv.y * 10.0));
    c += vCol * wg * 0.35;

    vec3 vd = normalize(cameraPosition - vPos);
    float fr = pow(1.0 - abs(dot(vd, vNorm)), 2.5);
    c += uEmissive * fr * 0.8;
    c += uEmissive * step(0.96, vUv.y) * 0.9;
    float sc = sin(vUv.y * 24.0 - uTime * 2.5) * 0.5 + 0.5;
    c += uEmissive * sc * 0.1 * uEnergy;

    gl_FragColor = vec4(c, 0.94);
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
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const processesRef = useRef(processes);
  const positionsRef = useRef<BuildingPosition[]>([]);
  const themeRef = useRef(theme);
  const selectedPidRef = useRef(selectedPid);
  const hoveredIdRef = useRef(-1);
  const lifecycleRef = useRef<Map<number, LifecycleEntry>>(new Map());
  const prevProcessesRef = useRef<ProcessInfo[]>([]);
  const prevPositionsRef = useRef<BuildingPosition[]>([]);
  const initialRef = useRef(false);
  const colorBufRef = useRef<THREE.BufferAttribute | null>(null);

  processesRef.current = processes;
  themeRef.current = theme;
  selectedPidRef.current = selectedPid;

  const positions = useMemo(
    () =>
      propPositions ??
      (layout === "tree"
        ? computeTreePositions(processes, maxBuildings)
        : computeTreePositions(processes, maxBuildings)),
    [propPositions, processes, layout, maxBuildings],
  );
  positionsRef.current = positions;

  // Track color buffer lifetime — recreate when capacity changes.
  const capacity = Math.max(1, maxBuildings * 2);

  // ---- lifecycle effect ----
  useEffect(() => {
    const t = themeRef.current;
    const { births, deaths } = diffProcesses(prevProcessesRef.current, processes);

    for (const p of processes) {
      const entry = lifecycleRef.current.get(p.pid);
      if (entry && entry.state === "dying") {
        entry.state = "alive";
        entry.progress = 1;
        const pos = positions.find((ps) => ps.pid === p.pid);
        if (pos) entry.position = pos;
        entry.color.set(colorForProcess(p, t));
      }
    }

    for (const p of births) {
      const pos = positions.find((ps) => ps.pid === p.pid);
      lifecycleRef.current.set(p.pid, {
        pid: p.pid,
        state: initialRef.current ? "born" : "alive",
        progress: 1,
        position: pos ?? { x: 0, y: 0, z: 0, pid: p.pid, height: 1 },
        color: new THREE.Color(colorForProcess(p, t)),
      });
    }

    for (const p of deaths) {
      const pos = prevPositionsRef.current.find((ps) => ps.pid === p.pid);
      if (pos) {
        lifecycleRef.current.set(p.pid, {
          pid: p.pid,
          state: "dying",
          progress: 1,
          position: pos,
          color: new THREE.Color(colorForProcess(p, t)),
        });
      }
    }

    prevProcessesRef.current = processes;
    prevPositionsRef.current = positions;
    initialRef.current = true;
  }, [processes, positions]);

  // ---- fill helpers ----
  function ensureColorAttribute(mesh: THREE.InstancedMesh, count: number) {
    let attr = mesh.geometry.getAttribute(COLOR_ATTR) as THREE.BufferAttribute | undefined;
    if (!attr || attr.count !== count) {
      const arr = new Float32Array(count * 3);
      attr = new THREE.BufferAttribute(arr, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.setAttribute(COLOR_ATTR, attr);
      colorBufRef.current = attr;
    }
    return attr;
  }

  function fill(mesh: THREE.InstancedMesh, ppos: BuildingPosition[], pprocs: ProcessInfo[], elapsed: number) {
    const colorAttr = ensureColorAttribute(mesh, capacity);
    const colors = colorAttr.array as Float32Array;

    let idx = 0;

    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pprocs.find((p) => p.pid === pos.pid);
      const entry = lifecycleRef.current.get(pos.pid);
      const lifeScale = entry?.progress ?? 1;

      dummy.position.set(pos.x, (pos.height / 2) * lifeScale, pos.z);
      dummy.scale.set(lifeScale, lifeScale * pos.height, lifeScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      const t = themeRef.current;
      _color.set(proc ? colorForProcess(proc, t) : entry?.color ?? t.colors.idle);

      if (entry?.state === "born") {
        _color.lerp(_emissive.set(t.colors.pulseWhite), (1 - entry.progress) * 0.5);
      } else if (entry?.state === "alive" && proc && proc.cpu > 50) {
        const pulse = (Math.sin(elapsed * 3) + 1) * 0.5;
        _color.lerp(_emissive.set(t.colors.pulseWhite), pulse * 0.25);
      }

      const sel = selectedPidRef.current === pos.pid;
      const hov = hoveredIdRef.current === i;
      if (sel || hov) {
        _color.lerp(_emissive.set(t.colors.pulseWhite), sel ? 0.45 : 0.25);
      }

      colors[idx * 3] = _color.r;
      colors[idx * 3 + 1] = _color.g;
      colors[idx * 3 + 2] = _color.b;
      idx++;
    }

    for (const entry of lifecycleRef.current.values()) {
      if (entry.state !== "dying") continue;
      const lifeScale = entry.progress;

      dummy.position.set(entry.position.x, (entry.position.height / 2) * lifeScale, entry.position.z);
      dummy.scale.set(lifeScale, lifeScale * entry.position.height, lifeScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      _color.copy(entry.color).lerp(_black, 1 - lifeScale);
      colors[idx * 3] = _color.r;
      colors[idx * 3 + 1] = _color.g;
      colors[idx * 3 + 2] = _color.b;
      idx++;
    }

    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  // ---- per-frame ----
  useFrame((_state, delta) => {
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

    const mesh = meshRef.current;
    if (!mesh) return;
    const ppos = positionsRef.current;
    const pprocs = processesRef.current;
    fill(mesh, ppos, pprocs, 0.001);

    if (matRef.current) {
      matRef.current.uniforms.uTime.value += delta;
      matRef.current.uniforms.uEmissive.value.set(themeRef.current.colors.electricCyan);
    }
  });

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined) return;
    hoveredIdRef.current = id;
    const pos = positionsRef.current[id];
    if (pos) {
      const p = processesRef.current.find((p) => p.pid === pos.pid);
      if (p) onHover?.(p);
    }
  }, [onHover]);

  const handlePointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoveredIdRef.current = -1;
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined || !onClick) return;
    const pos = positionsRef.current[id];
    if (pos) {
      const p = processesRef.current.find((p) => p.pid === pos.pid);
      if (p) onClick(p);
    }
  }, [onClick]);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined || !onDoubleClick) return;
    const pos = positionsRef.current[id];
    if (pos) {
      const p = processesRef.current.find((p) => p.pid === pos.pid);
      if (p) onDoubleClick(p);
    }
  }, [onDoubleClick]);

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, capacity]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[0.5, 1, 0.5]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
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
            key={`l-${pos.pid}`}
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
