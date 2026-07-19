import { useRef, useMemo, useEffect, useCallback, useState } from "react";
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
  const heightCurRef = useRef<Map<number, number>>(new Map());
  const initedRef = useRef(false);
  // hoveredPid mirrors hoveredIdRef but in React state, so Html tooltips
  // show/hide on hover. The ref is used inside useFrame to avoid per-frame
  // setState when reading the hover target for color brightening.
  const [hoveredPid, setHoveredPid] = useState<number | null>(null);
  // instanceId → pid map for the single mesh. Written every frame alongside
  // instanceMatrix, used to resolve pointer/click events back to a process.
  const pidMap = useRef<number[]>([]);

  processesRef.current = processes;
  themeRef.current = theme;
  selectedPidRef.current = selectedPid;

  const positions = useMemo(
    () => propPositions ?? computeGridPositions(processes, maxBuildings).positions,
    [propPositions, processes, maxBuildings],
  );
  positionsRef.current = positions;

  const capacity = Math.max(1, maxBuildings * 2);

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

  // Init: allocate instanceColor + aPid/aState attribute buffers, write all
  // matrices and colors once so the first frame is not empty.
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

    const ppos = positionsRef.current;
    const pprocs = processesRef.current;
    const pidAttr = mesh.geometry.getAttribute("aPid") as THREE.InstancedBufferAttribute;
    const stateAttr = mesh.geometry.getAttribute("aState") as THREE.InstancedBufferAttribute;
    const pidArr = pidAttr.array as Float32Array;
    const stateArr = stateAttr.array as Float32Array;
    const pmap = pidMap.current;
    let idx = 0;

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
      pmap[idx] = proc.pid;
      idx++;
    }

    mesh.count = Math.max(1, idx);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    pidAttr.needsUpdate = true;
    stateAttr.needsUpdate = true;
    initedRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-frame: advance window-shader time and interpolate building heights.
  // All buildings render through the single HIGH mesh — no LOD switching, so
  // the camera can move freely without instances disappearing.
  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Always advance the window shader time so flicker keeps animating.
    updateBuildingMaterialTime(buildingMaterial, state.clock.elapsedTime);

    const ppos = positionsRef.current;
    const pprocs = processesRef.current;
    const lerpFactor = 1 - Math.pow(0.001, delta);
    const hMap = heightCurRef.current;

    const pidAttr = mesh.geometry.getAttribute("aPid") as THREE.InstancedBufferAttribute;
    const stateAttr = mesh.geometry.getAttribute("aState") as THREE.InstancedBufferAttribute;
    const pidArr = pidAttr.array as Float32Array;
    const stateArr = stateAttr.array as Float32Array;
    const pmap = pidMap.current;
    let idx = 0;

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

      const w = pos.width ?? 1;
      _c.set(colorForProcess(proc, themeRef.current));
      // Hover/selected visual feedback: brighten instanceColor only (no
      // instanceMatrix changes) to avoid per-frame matrix rewrite overhead.
      if (proc.pid === hoveredIdRef.current) {
        _c.multiplyScalar(1.6);
      } else if (proc.pid === selectedPidRef.current) {
        _c.multiplyScalar(1.3);
      }

      dummy.position.set(pos.x, curH / 2, pos.z);
      dummy.scale.set(w, curH, w);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      mesh.setColorAt(idx, _c);
      pidArr[idx] = proc.pid;
      stateArr[idx] = stateToNumber(proc.state);
      pmap[idx] = proc.pid;
      idx++;
    }

    mesh.count = Math.max(1, idx);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    pidAttr.needsUpdate = true;
    stateAttr.needsUpdate = true;
  });

  const getPid = useCallback((id: number) => {
    const map = pidMap.current;
    if (id < 0 || id >= map.length) return null;
    const pid = map[id];
    return pid !== undefined ? pid : null;
  }, []);

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined) {
      hoveredIdRef.current = -1;
      setHoveredPid(null);
      onHover?.(null);
      return;
    }
    const pid = getPid(id);
    if (pid === null) {
      hoveredIdRef.current = -1;
      setHoveredPid(null);
      onHover?.(null);
      return;
    }
    hoveredIdRef.current = pid;
    setHoveredPid(pid);
    const proc = processes.find((p) => p.pid === pid);
    if (proc) onHover?.(proc);
  }, [onHover, getPid, processes]);

  const handlePointerOut = useCallback(() => {
    hoveredIdRef.current = -1;
    setHoveredPid(null);
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
        <boxGeometry args={[1.2, 1, 1.2]} />
        <primitive object={buildingMaterial} attach="material" />
      </instancedMesh>

      {positions.map((pos) => {
        const proc = procMap.get(pos.pid);
        if (!proc) return null;
        const isHovered = pos.pid === hoveredPid;
        const isSelected = pos.pid === selectedPid;
        // Only render tooltips for hovered or selected buildings to keep DOM
        // nodes minimal — every Html element is a foreignObject in the SVG
        // overlay, and 200 of them per frame is wasteful.
        if (!isHovered && !isSelected) return null;
        return (
          <Html
            key={`l-${pos.pid}`}
            position={[pos.x, (heightCurRef.current.get(pos.pid) ?? pos.height) + 1.2, pos.z]}
            center
            distanceFactor={14}
            style={{ pointerEvents: "none" }}
          >
            <div className={`building-tooltip${isSelected ? " selected" : ""}`}>
              <div className="building-tooltip-name">{proc.name}</div>
              <div className="building-tooltip-row">PID: {proc.pid}</div>
              <div className="building-tooltip-row">CPU: {proc.cpu.toFixed(1)}%</div>
              <div className="building-tooltip-row">MEM: {proc.memory_mb} MB</div>
            </div>
          </Html>
        );
      })}
    </group>
  );
}
