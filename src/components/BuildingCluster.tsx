import { useRef, useMemo, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo, ProcessState } from "../utils/types";
import { computeGridPositions, type BuildingPosition } from "../utils/layout";
import { colorForProcess, type Theme } from "../utils/colors";
import { FALLBACK_THEME } from "../utils/theme";
import { createBuildingMaterial, updateBuildingMaterialTime } from "../utils/buildingShader";

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

function stateToNumber(state: ProcessState): number {
  switch (state) {
    case "Running":
      return 0;
    case "Sleeping":
      return 1;
    case "Stopped":
      return 2;
    case "Zombie":
      return 3;
  }
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
  const midRef = useRef<THREE.InstancedMesh>(null);
  const lowRef = useRef<THREE.InstancedMesh>(null);
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
  // Per-LOD instanceId → pid maps. The high LOD writes in positions order,
  // but mid/low are filled per-frame based on camera distance, so we must
  // maintain separate maps to resolve events on each mesh.
  const highPidMap = useRef<number[]>([]);
  const midPidMap = useRef<number[]>([]);
  const lowPidMap = useRef<number[]>([]);

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

  const buildingMaterial = useMemo(
    () =>
      createBuildingMaterial("#ffffff", {
        windowColor: new THREE.Color("#ffe9b0"),
        windowColorSleeping: new THREE.Color("#4aa8ff"),
        windowDensity: 2.0,
        windowSize: 0.35,
        nightIntensity: 0.3,
        flickerRate: 0.15,
      }),
    [],
  );

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
    if (!mesh.geometry.hasAttribute("aPid")) {
      mesh.geometry.setAttribute(
        "aPid",
        new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
      );
    }
    if (!mesh.geometry.hasAttribute("aState")) {
      mesh.geometry.setAttribute(
        "aState",
        new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
      );
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
    // Allocate instanceColor buffers for mid/low LOD meshes so setColorAt
    // works on first frame. Counts start at 0 — useFrame fills them in.
    const midMesh = midRef.current;
    if (midMesh && !midMesh.geometry.hasAttribute("instanceColor")) {
      const arr = new Float32Array(capacity * 3);
      const ic = new THREE.InstancedBufferAttribute(arr, 3);
      midMesh.geometry.setAttribute("instanceColor", ic);
      midMesh.instanceColor = ic;
      midMesh.count = 0;
    }
    const lowMesh = lowRef.current;
    if (lowMesh && !lowMesh.geometry.hasAttribute("instanceColor")) {
      const arr = new Float32Array(capacity * 3);
      const ic = new THREE.InstancedBufferAttribute(arr, 3);
      lowMesh.geometry.setAttribute("instanceColor", ic);
      lowMesh.instanceColor = ic;
      lowMesh.count = 0;
    }

    const ppos = positionsRef.current;
    const pprocs = processesRef.current;
    const pidAttr = mesh.geometry.getAttribute("aPid") as THREE.InstancedBufferAttribute;
    const stateAttr = mesh.geometry.getAttribute("aState") as THREE.InstancedBufferAttribute;
    const pidArr = pidAttr.array as Float32Array;
    const stateArr = stateAttr.array as Float32Array;
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
      pidArr[idx] = proc.pid;
      stateArr[idx] = stateToNumber(proc.state);
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
    pidAttr.needsUpdate = true;
    stateAttr.needsUpdate = true;
    for (const variant of CAP_VARIANTS) {
      const cap = capRefsByVariant[variant].current;
      if (!cap) continue;
      cap.count = capIdx[variant];
      cap.instanceMatrix.needsUpdate = true;
      if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
    }
    initedRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-frame: advance window-shader time, interpolate heights, and assign
  // each building to one of three LOD meshes based on camera distance. LOD
  // assignment runs every frame (camera moves independently of height changes).
  useFrame((state, delta) => {
    const high = meshRef.current;
    const mid = midRef.current;
    const low = lowRef.current;
    if (!high || !mid || !low) return;

    // Always advance the window shader time so flicker keeps animating.
    updateBuildingMaterialTime(buildingMaterial, state.clock.elapsedTime);

    const ppos = positionsRef.current;
    const pprocs = processesRef.current;
    const lerpFactor = 1 - Math.pow(0.001, delta);
    const hMap = heightCurRef.current;

    // Height interpolation pass — mutates hMap in place.
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
      }
    }

    // LOD assignment pass — always runs. Camera may have moved even if no
    // building height changed.
    const cameraPos = state.camera.position;
    const camX = cameraPos.x;
    const camZ = cameraPos.z;
    let highIdx = 0;
    let midIdx = 0;
    let lowIdx = 0;
    const capIdx: Record<CapVariant, number> = {
      spire: 0,
      dome: 0,
      stepped: 0,
      antenna: 0,
      flat: 0,
    };
    const pidAttr = high.geometry.getAttribute("aPid") as THREE.InstancedBufferAttribute;
    const stateAttr = high.geometry.getAttribute("aState") as THREE.InstancedBufferAttribute;
    const pidArr = pidAttr.array as Float32Array;
    const stateArr = stateAttr.array as Float32Array;
    const highMap = highPidMap.current;
    const midMap = midPidMap.current;
    const lowMap = lowPidMap.current;

    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pprocs.find((p) => p.pid === pos.pid);
      if (!proc) continue;

      const h = hMap.get(proc.pid) ?? pos.height;
      const w = pos.width ?? 1;
      const dx = pos.x - camX;
      const dz = pos.z - camZ;
      const distSq = dx * dx + dz * dz; // squared distance, avoids sqrt

      _c.set(colorForProcess(proc, themeRef.current));

      if (distSq < 625) {
        // HIGH LOD — full box + window shader + caps (within 25 units).
        dummy.position.set(pos.x, h / 2, pos.z);
        dummy.scale.set(w, h, w);
        dummy.updateMatrix();
        high.setMatrixAt(highIdx, dummy.matrix);
        high.setColorAt(highIdx, _c);
        pidArr[highIdx] = proc.pid;
        stateArr[highIdx] = stateToNumber(proc.state);
        highMap[highIdx] = proc.pid;

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
        highIdx++;
      } else if (distSq < 3600) {
        // MID LOD — same box geometry, plain standard material (25–60 units).
        dummy.position.set(pos.x, h / 2, pos.z);
        dummy.scale.set(w, h, w);
        dummy.updateMatrix();
        mid.setMatrixAt(midIdx, dummy.matrix);
        mid.setColorAt(midIdx, _c);
        midMap[midIdx] = proc.pid;
        midIdx++;
      } else {
        // LOW LOD — small glowing line (60+ units).
        dummy.position.set(pos.x, h, pos.z);
        dummy.scale.set(1, h * 0.6, 1);
        dummy.updateMatrix();
        low.setMatrixAt(lowIdx, dummy.matrix);
        _c.multiplyScalar(1.0); // distant dots kept dim — bloom already amplifies
        low.setColorAt(lowIdx, _c);
        lowMap[lowIdx] = proc.pid;
        lowIdx++;
      }
    }

    high.count = Math.max(1, highIdx);
    mid.count = midIdx;
    low.count = lowIdx;
    high.instanceMatrix.needsUpdate = true;
    if (high.instanceColor) high.instanceColor.needsUpdate = true;
    pidAttr.needsUpdate = true;
    stateAttr.needsUpdate = true;
    mid.instanceMatrix.needsUpdate = true;
    if (mid.instanceColor) mid.instanceColor.needsUpdate = true;
    low.instanceMatrix.needsUpdate = true;
    if (low.instanceColor) low.instanceColor.needsUpdate = true;
    for (const variant of CAP_VARIANTS) {
      const cap = capRefsByVariant[variant].current;
      if (!cap) continue;
      cap.count = capIdx[variant];
      cap.instanceMatrix.needsUpdate = true;
      if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
    }
  });

  const getPid = useCallback((lod: "high" | "mid" | "low", id: number) => {
    const map = lod === "high"
      ? highPidMap.current
      : lod === "mid"
        ? midPidMap.current
        : lowPidMap.current;
    if (id < 0 || id >= map.length) return null;
    const pid = map[id];
    return pid !== undefined ? pid : null;
  }, []);

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined) {
      hoveredIdRef.current = -1;
      onHover?.(null);
      return;
    }
    const lod = (e.eventObject.userData.lod ?? "high") as "high" | "mid" | "low";
    const pid = getPid(lod, id);
    if (pid === null) {
      hoveredIdRef.current = -1;
      onHover?.(null);
      return;
    }
    hoveredIdRef.current = pid;
    const proc = processes.find((p) => p.pid === pid);
    if (proc) onHover?.(proc);
  }, [onHover, getPid, processes]);

  const handlePointerOut = useCallback(() => {
    hoveredIdRef.current = -1;
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!onClick) return;
    const id = e.instanceId;
    if (id === undefined) return;
    const lod = (e.eventObject.userData.lod ?? "high") as "high" | "mid" | "low";
    const pid = getPid(lod, id);
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
    const lod = (e.eventObject.userData.lod ?? "high") as "high" | "mid" | "low";
    const pid = getPid(lod, id);
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
        <primitive object={buildingMaterial} attach="material" />
      </instancedMesh>

      <instancedMesh
        ref={midRef}
        args={[undefined, undefined, capacity]}
        userData={{ lod: "mid" }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.5, 1, 0.5]} />
        <meshStandardMaterial roughness={0.7} metalness={0.3} emissiveIntensity={0.05} />
      </instancedMesh>

      <instancedMesh
        ref={lowRef}
        args={[undefined, undefined, capacity]}
        userData={{ lod: "low" }}
        frustumCulled={false}
      >
        <boxGeometry args={[0.15, 1, 0.15]} />
        <meshBasicMaterial toneMapped />
      </instancedMesh>

      <instancedMesh ref={spireRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <coneGeometry args={[0.18, 1.4, 6]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.15}
        />
      </instancedMesh>

      <instancedMesh ref={domeRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <sphereGeometry args={[0.35, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.15}
        />
      </instancedMesh>

      <instancedMesh ref={steppedRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.45, 0.4, 0.45]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.15}
        />
      </instancedMesh>

      <instancedMesh ref={antennaRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.03, 0.05, 1.6, 6]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.15}
        />
      </instancedMesh>

      <instancedMesh ref={flatRef} args={[undefined, undefined, parentCap]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.55, 0.12, 0.55]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissiveIntensity={0.15}
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
