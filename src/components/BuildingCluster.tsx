import { useRef, useMemo, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import { computeGridPositions, type BuildingPosition } from "../utils/layout";
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
const _c = new THREE.Color();
const _tmp = new THREE.Color();
const _black = new THREE.Color(0x000000);
const BIRTH_DURATION = 0.8;
const DEATH_DURATION = 1.0;

export default function BuildingCluster({
  processes,
  positions: propPositions,
  theme = FALLBACK_THEME,
  selectedPid = null,
  maxBuildings = 200,
  onClick,
  onDoubleClick,
  onHover,
}: BuildingClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const processesRef = useRef(processes);
  const positionsRef = useRef<BuildingPosition[]>([]);
  const themeRef = useRef(theme);
  const selectedPidRef = useRef(selectedPid);
  const hoveredIdRef = useRef(-1);
  const lifecycleRef = useRef<Map<number, LifecycleEntry>>(new Map());
  const prevProcessesRef = useRef<ProcessInfo[]>([]);
  const prevPositionsRef = useRef<BuildingPosition[]>([]);
  const initialRef = useRef(false);

  processesRef.current = processes;
  themeRef.current = theme;
  selectedPidRef.current = selectedPid;

  const positions = useMemo(
    () => propPositions ?? computeGridPositions(processes, maxBuildings),
    [propPositions, processes, maxBuildings],
  );
  positionsRef.current = positions;
  const capacity = Math.max(1, maxBuildings * 2);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || mesh.geometry.hasAttribute("instanceColor")) return;
    const arr = new Float32Array(capacity * 3);
    const ic = new THREE.InstancedBufferAttribute(arr, 3);
    mesh.geometry.setAttribute("instanceColor", ic);
    mesh.instanceColor = ic;
    ic.needsUpdate = true;
  }, [capacity]);

  useEffect(() => {
    const t = themeRef.current;
    const ppos = positions;
    const { births, deaths } = diffProcesses(prevProcessesRef.current, processes);

    for (const p of processes) {
      const entry = lifecycleRef.current.get(p.pid);
      if (entry && entry.state === "dying") {
        entry.state = "alive";
        entry.progress = 1;
        const pos = ppos.find((ps) => ps.pid === p.pid);
        if (pos) entry.position = pos;
        entry.color.set(colorForProcess(p, t));
      }
    }

    for (const p of births) {
      const pos = ppos.find((ps) => ps.pid === p.pid);
      if (pos) {
        lifecycleRef.current.set(p.pid, {
          pid: p.pid,
          state: initialRef.current ? "born" : "alive",
          progress: 1,
          position: pos,
          color: new THREE.Color(colorForProcess(p, t)),
        });
      }
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

  useFrame((_state, delta) => {
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

    const ppos = positionsRef.current;
    const pprocs = processesRef.current;
    let idx = 0;

    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pprocs.find((p) => p.pid === pos.pid);
      const entry = lifecycleRef.current.get(pos.pid);
      const s = entry?.progress ?? 1;

      dummy.position.set(pos.x, (pos.height / 2) * s, pos.z);
      dummy.scale.set(s, s * pos.height, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      const t = themeRef.current;
      _c.set(proc ? colorForProcess(proc, t) : entry?.color ?? t.colors.idle);

      // Boost brightness for MeshBasicMaterial (no emissive channel)
      _c.multiplyScalar(1.5);

      if (selectedPidRef.current === pos.pid) {
        _c.lerp(_tmp.set(t.colors.pulseWhite), 0.45);
      }

      mesh.setColorAt(idx, _c);
      idx++;
    }

    for (const entry of lifecycleRef.current.values()) {
      if (entry.state !== "dying") continue;
      const s = entry.progress;
      dummy.position.set(entry.position.x, (entry.position.height / 2) * s, entry.position.z);
      dummy.scale.set(s, s * entry.position.height, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      _c.copy(entry.color).lerp(_black, 1 - s);
      mesh.setColorAt(idx, _c);
      idx++;
    }

    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const getPid = useCallback((id: number) => {
    if (id < 0 || id >= positions.length) return null;
    return positions[id]?.pid ?? null;
  }, [positions]);

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined || id >= positions.length) {
      hoveredIdRef.current = -1;
      onHover?.(null);
      return;
    }
    hoveredIdRef.current = id;
    const pid = getPid(id);
    if (pid !== null) {
      const proc = processes.find((p) => p.pid === pid);
      if (proc) onHover?.(proc);
    }
  }, [onHover, getPid, processes, positions.length]);

  const handlePointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoveredIdRef.current = -1;
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!onClick) return;
    const id = e.instanceId;
    if (id === undefined) return;
    const pid = getPid(id);
    if (pid !== null) {
      const proc = processes.find((p) => p.pid === pid);
      if (proc) onClick(proc);
    }
  }, [onClick, getPid, processes]);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!onDoubleClick) return;
    const id = e.instanceId;
    if (id === undefined) return;
    const pid = getPid(id);
    if (pid !== null) {
      const proc = processes.find((p) => p.pid === pid);
      if (proc) onDoubleClick(proc);
    }
  }, [onDoubleClick, getPid, processes]);

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, capacity]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        frustumCulled={false}
      >
        <boxGeometry args={[0.5, 1, 0.5]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {positions.map((pos) => {
        const proc = processes.find((p) => p.pid === pos.pid);
        if (!proc) return null;
        return (
          <Html
            key={`l-${pos.pid}`}
            position={[pos.x, pos.height + 0.9, pos.z]}
            center
            distanceFactor={14}
            style={{ pointerEvents: "none" }}
          >
            <div className="building-label">{proc.name}</div>
          </Html>
        );
      })}
    </group>
  );
}
