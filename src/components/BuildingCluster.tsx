import { useRef, useMemo, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import { computeGridPositions, type BuildingPosition } from "../utils/layout";
import { colorForProcess, type Theme } from "../utils/colors";
import { FALLBACK_THEME } from "../utils/theme";

interface BuildingClusterProps {
  processes: ProcessInfo[];
  positions?: BuildingPosition[];
  theme?: Theme;
  selectedPid?: number | null;
  maxBuildings?: number;
  onClick?: (process: ProcessInfo) => void;
  onDoubleClick?: (process: ProcessInfo) => void;
  onHover?: (process: ProcessInfo | null) => void;
}

const dummy = new THREE.Object3D();
const _c = new THREE.Color();

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
  const capRef = useRef<THREE.InstancedMesh>(null);
  const processesRef = useRef(processes);
  const positionsRef = useRef<BuildingPosition[]>([]);
  const themeRef = useRef(theme);
  const selectedPidRef = useRef(selectedPid);
  const hoveredIdRef = useRef(-1);
  const heightCurRef = useRef<Map<number, number>>(new Map());
  const initedRef = useRef(false);

  processesRef.current = processes;
  themeRef.current = theme;
  selectedPidRef.current = selectedPid;

  const positions = useMemo(
    () => propPositions ?? computeGridPositions(processes, maxBuildings).positions,
    [propPositions, processes, maxBuildings],
  );
  positionsRef.current = positions;

  const parents = useMemo(() => positions.filter((p) => (p.width ?? 1) >= 1.2), [positions]);
  const capacity = Math.max(1, maxBuildings * 2);
  const parentCap = Math.max(1, parents.length + 10);

  // Init: allocate instanceColor buffers, write all matrices once.
  useEffect(() => {
    const mesh = meshRef.current;
    const cap = capRef.current;
    if (!mesh || initedRef.current) return;

    if (!mesh.geometry.hasAttribute("instanceColor")) {
      const arr = new Float32Array(capacity * 3);
      const ic = new THREE.InstancedBufferAttribute(arr, 3);
      mesh.geometry.setAttribute("instanceColor", ic);
      mesh.instanceColor = ic;
    }
    if (cap && !cap.geometry.hasAttribute("instanceColor")) {
      const arr = new Float32Array(parentCap * 3);
      const ic = new THREE.InstancedBufferAttribute(arr, 3);
      cap.geometry.setAttribute("instanceColor", ic);
      cap.instanceColor = ic;
    }

    const ppos = positionsRef.current;
    const pprocs = processesRef.current;
    let idx = 0;
    let capIdx = 0;

    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pprocs.find((p) => p.pid === pos.pid);
      if (!proc) continue;

      const h = pos.height;
      const w = pos.width ?? 1;
      heightCurRef.current.set(proc.pid, h);

      dummy.position.set(pos.x, h / 2, pos.z);
      dummy.scale.set(w, h, w);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      _c.set(colorForProcess(proc, themeRef.current));
      mesh.setColorAt(idx, _c);
      idx++;

      if (cap && w >= 1.2) {
        const capH = Math.min(h * 0.18, 1.0);
        dummy.position.set(pos.x, h + capH / 2, pos.z);
        dummy.scale.set(w * 0.7, capH, w * 0.7);
        dummy.updateMatrix();
        cap.setMatrixAt(capIdx, dummy.matrix);
        cap.setColorAt(capIdx, _c.clone().multiplyScalar(1.3));
        capIdx++;
      }
    }

    mesh.count = Math.max(1, idx);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (cap && capIdx > 0) {
      cap.count = capIdx;
      cap.instanceMatrix.needsUpdate = true;
      if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
    }
    initedRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-frame: only re-write everything when a height is changing.
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    const cap = capRef.current;
    if (!mesh) return;

    const ppos = positionsRef.current;
    const pprocs = processesRef.current;
    const lerpFactor = 1 - Math.pow(0.001, delta);
    const hMap = heightCurRef.current;

    let anyChanged = false;

    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pprocs.find((p) => p.pid === pos.pid);
      if (!proc) continue;

      const targetH = pos.height;
      let curH = hMap.get(proc.pid) ?? targetH;
      if (Math.abs(curH - targetH) > 0.01) {
        curH += (targetH - curH) * lerpFactor;
        if (Math.abs(curH - targetH) < 0.01) curH = targetH;
        hMap.set(proc.pid, curH);
        anyChanged = true;
      }
    }

    if (!anyChanged) return;

    // Full rewrite: write ALL buildings so new arrivals get matrices.
    let idx = 0;
    let capIdx = 0;
    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pprocs.find((p) => p.pid === pos.pid);
      if (!proc) continue;

      const h = heightCurRef.current.get(proc.pid) ?? pos.height;
      const w = pos.width ?? 1;

      dummy.position.set(pos.x, h / 2, pos.z);
      dummy.scale.set(w, h, w);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      _c.set(colorForProcess(proc, themeRef.current));
      mesh.setColorAt(idx, _c);

      if (cap && w >= 1.2) {
        const capH = Math.min(h * 0.18, 1.0);
        dummy.position.set(pos.x, h + capH / 2, pos.z);
        dummy.scale.set(w * 0.7, capH, w * 0.7);
        dummy.updateMatrix();
        cap.setMatrixAt(capIdx, dummy.matrix);
        cap.setColorAt(capIdx, _c.clone().multiplyScalar(1.3));
        capIdx++;
      }
      idx++;
    }

    mesh.count = Math.max(1, idx);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (cap && capIdx > 0) {
      cap.count = capIdx;
      cap.instanceMatrix.needsUpdate = true;
      if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
    }
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

  const handlePointerOut = useCallback(() => {
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

  const procMap = useMemo(() => {
    const m = new Map<number, ProcessInfo>();
    for (const p of processes) m.set(p.pid, p);
    return m;
  }, [processes]);

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

      <instancedMesh ref={capRef} args={[undefined, undefined, parentCap]} frustumCulled={false}>
        <coneGeometry args={[0.4, 1, 4]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {positions.map((pos) => {
        const proc = procMap.get(pos.pid);
        if (!proc) return null;
        return (
          <Html
            key={`l-${pos.pid}`}
            position={[pos.x, (heightCurRef.current.get(pos.pid) ?? pos.height) + 0.9, pos.z]}
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
