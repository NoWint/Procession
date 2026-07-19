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

type CapVariant = "spire" | "dome" | "stepped" | "antenna" | "flat";

const CAP_VARIANTS: CapVariant[] = ["spire", "dome", "stepped", "antenna", "flat"];

// Intrinsic height of each variant's geometry — used only for seating the cap
// on top of the building (the geometry itself already encodes its real size).
const CAP_HEIGHT: Record<CapVariant, number> = {
  spire: 1.4,
  dome: 0.35,
  stepped: 0.4,
  antenna: 1.6,
  flat: 0.12,
};

// Y offset (relative to the building top) at which to place the cap mesh's
// local origin. For spire / stepped / antenna / flat the geometry's origin is
// at its vertical midpoint, so we use capH/2. The dome is a hemisphere whose
// origin sits on the equator (the flat side), so offset 0 seats the flat side
// directly on the building top.
const CAP_Y_OFFSET: Record<CapVariant, number> = {
  spire: CAP_HEIGHT.spire / 2,
  dome: 0,
  stepped: CAP_HEIGHT.stepped / 2,
  antenna: CAP_HEIGHT.antenna / 2,
  flat: CAP_HEIGHT.flat / 2,
};

function hashPid(pid: number): number {
  let h = pid | 0;
  h = (h ^ 61) ^ (h >>> 16);
  h = h + (h << 3);
  h = h ^ (h >>> 4);
  h = Math.imul(h, 0x27d4eb2d);
  h = h ^ (h >>> 15);
  return h >>> 0;
}

function variantForProcess(proc: ProcessInfo): CapVariant {
  if (proc.cpu > 50) {
    return hashPid(proc.pid) % 2 === 0 ? "spire" : "antenna";
  }
  if (proc.memory_mb > 500) {
    return hashPid(proc.pid) % 2 === 0 ? "dome" : "stepped";
  }
  return CAP_VARIANTS[hashPid(proc.pid) % 5];
}

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
  const spireRef = useRef<THREE.InstancedMesh>(null);
  const domeRef = useRef<THREE.InstancedMesh>(null);
  const steppedRef = useRef<THREE.InstancedMesh>(null);
  const antennaRef = useRef<THREE.InstancedMesh>(null);
  const flatRef = useRef<THREE.InstancedMesh>(null);
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

  const capRefsByVariant: Record<CapVariant, typeof spireRef> = {
    spire: spireRef,
    dome: domeRef,
    stepped: steppedRef,
    antenna: antennaRef,
    flat: flatRef,
  };

  // Init: allocate instanceColor buffers, write all matrices once.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || initedRef.current) return;

    if (!mesh.geometry.hasAttribute("instanceColor")) {
      const arr = new Float32Array(capacity * 3);
      const ic = new THREE.InstancedBufferAttribute(arr, 3);
      mesh.geometry.setAttribute("instanceColor", ic);
      mesh.instanceColor = ic;
    }
    for (const variant of CAP_VARIANTS) {
      const cap = capRefsByVariant[variant].current;
      if (cap && !cap.geometry.hasAttribute("instanceColor")) {
        const arr = new Float32Array(parentCap * 3);
        const ic = new THREE.InstancedBufferAttribute(arr, 3);
        cap.geometry.setAttribute("instanceColor", ic);
        cap.instanceColor = ic;
      }
    }

    const ppos = positionsRef.current;
    const pprocs = processesRef.current;
    let idx = 0;
    const capIdx: Record<CapVariant, number> = {
      spire: 0,
      dome: 0,
      stepped: 0,
      antenna: 0,
      flat: 0,
    };

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

      if (w >= 1.2) {
        const variant = variantForProcess(proc);
        const cap = capRefsByVariant[variant].current;
        if (cap) {
          dummy.position.set(pos.x, h + CAP_Y_OFFSET[variant], pos.z);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          cap.setMatrixAt(capIdx[variant], dummy.matrix);
          cap.setColorAt(capIdx[variant], _c.clone().multiplyScalar(1.3));
          capIdx[variant]++;
        }
      }
    }

    mesh.count = Math.max(1, idx);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    for (const variant of CAP_VARIANTS) {
      const cap = capRefsByVariant[variant].current;
      if (!cap) continue;
      cap.count = capIdx[variant];
      cap.instanceMatrix.needsUpdate = true;
      if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
    }
    initedRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-frame: only re-write everything when a height is changing.
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
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
    const capIdx: Record<CapVariant, number> = {
      spire: 0,
      dome: 0,
      stepped: 0,
      antenna: 0,
      flat: 0,
    };
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

      if (w >= 1.2) {
        const variant = variantForProcess(proc);
        const cap = capRefsByVariant[variant].current;
        if (cap) {
          dummy.position.set(pos.x, h + CAP_Y_OFFSET[variant], pos.z);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          cap.setMatrixAt(capIdx[variant], dummy.matrix);
          cap.setColorAt(capIdx[variant], _c.clone().multiplyScalar(1.3));
          capIdx[variant]++;
        }
      }
      idx++;
    }

    mesh.count = Math.max(1, idx);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    for (const variant of CAP_VARIANTS) {
      const cap = capRefsByVariant[variant].current;
      if (!cap) continue;
      cap.count = capIdx[variant];
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
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.5, 1, 0.5]} />
        <meshStandardMaterial
          roughness={0.55}
          metalness={0.35}
          emissiveIntensity={0.6}
        />
      </instancedMesh>

      <instancedMesh ref={spireRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <coneGeometry args={[0.18, 1.4, 6]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.8}
        />
      </instancedMesh>

      <instancedMesh ref={domeRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <sphereGeometry args={[0.35, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.8}
        />
      </instancedMesh>

      <instancedMesh ref={steppedRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.45, 0.4, 0.45]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.8}
        />
      </instancedMesh>

      <instancedMesh ref={antennaRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.03, 0.05, 1.6, 6]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.8}
        />
      </instancedMesh>

      <instancedMesh ref={flatRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.55, 0.12, 0.55]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.8}
        />
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
