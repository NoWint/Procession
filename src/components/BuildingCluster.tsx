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

const _color = new THREE.Color();
const BIRTH_DURATION = 0.8;
const DEATH_DURATION = 1.0;

interface LifecycleEntry {
  pid: number;
  state: "born" | "alive" | "dying";
  progress: number;
  pos: BuildingPosition;
  color: THREE.Color;
}

export default function BuildingCluster({
  processes,
  positions: propPositions,
  theme = FALLBACK_THEME,
  selectedPid = null,
  layout: _layout = "tree",
  maxBuildings = 200,
  onClick,
  onDoubleClick,
  onHover,
}: BuildingClusterProps) {
  const themeRef = useRef(theme);
  const selectedPidRef = useRef(selectedPid);
  const hoveredPidRef = useRef<number | null>(null);
  const lifecycleRef = useRef<Map<number, LifecycleEntry>>(new Map());
  const prevProcessesRef = useRef<ProcessInfo[]>([]);
  const prevPositionsRef = useRef<BuildingPosition[]>([]);
  const initialRef = useRef(false);

  themeRef.current = theme;
  selectedPidRef.current = selectedPid;

  const positions = useMemo(
    () => propPositions ?? computeTreePositions(processes, maxBuildings),
    [propPositions, processes, maxBuildings],
  );

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
        if (pos) entry.pos = pos;
        entry.color.set(colorForProcess(p, t));
      }
    }

    for (const p of births) {
      const pos = positions.find((ps) => ps.pid === p.pid);
      lifecycleRef.current.set(p.pid, {
        pid: p.pid,
        state: initialRef.current ? "born" : "alive",
        progress: 1,
        pos: pos ?? { x: 0, y: 0, z: 0, pid: p.pid, height: 1 },
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
          pos,
          color: new THREE.Color(colorForProcess(p, t)),
        });
      }
    }

    prevProcessesRef.current = processes;
    prevPositionsRef.current = positions;
    initialRef.current = true;
  }, [processes, positions]);

  // ---- animation tick ----
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
  });

  // ---- handlers ----
  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>, pid: number) => {
    e.stopPropagation();
    hoveredPidRef.current = pid;
    const proc = processes.find((p) => p.pid === pid);
    if (proc) onHover?.(proc);
  }, [processes, onHover]);

  const handlePointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoveredPidRef.current = null;
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback((pid: number) => {
    const proc = processes.find((p) => p.pid === pid);
    if (proc) onClick?.(proc);
  }, [processes, onClick]);

  const handleDoubleClick = useCallback((pid: number) => {
    const proc = processes.find((p) => p.pid === pid);
    if (proc) onDoubleClick?.(proc);
  }, [processes, onDoubleClick]);

  // ---- render each building as an individual Mesh ----
  return (
    <group>
      {positions.map((pos) => {
        const process = processes.find((p) => p.pid === pos.pid);
        const entry = lifecycleRef.current.get(pos.pid);
        const lifeScale = entry?.progress ?? 1;
        const h = pos.height * lifeScale;

        _color.set(
          process
            ? colorForProcess(process, theme)
            : entry?.color ?? theme.colors.idle,
        );

        return (
          <mesh
            key={`b-${pos.pid}`}
            position={[pos.x, h / 2, pos.z]}
            scale={[lifeScale, lifeScale * pos.height, lifeScale]}
            frustumCulled={false}
            onClick={() => handleClick(pos.pid)}
            onDoubleClick={() => handleDoubleClick(pos.pid)}
            onPointerOver={(e) => handlePointerOver(e, pos.pid)}
            onPointerOut={(e) => handlePointerOut(e)}
          >
            <boxGeometry args={[0.5, 1, 0.5]} />
            <meshBasicMaterial color={_color.getHex()} toneMapped={false} />
          </mesh>
        );
      })}

      {positions.map((pos) => {
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
