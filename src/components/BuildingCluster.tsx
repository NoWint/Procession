import { useRef, useMemo, useEffect, useCallback, useState } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo, ProcessState } from "../utils/types";
import { computeGridPositions, computeProcessSignature, cpuToHeight, type BuildingPosition } from "../utils/layout";
import { colorForProcess, type Theme } from "../utils/colors";
import { FALLBACK_THEME } from "../utils/theme";
import { createBuildingMaterial, updateBuildingMaterialTime } from "../utils/buildingShader";
import { useI18n } from "../hooks/useI18n";
import {
  useGlbAssets,
  BUILDING_VARIANT_IDS,
  ROOF_DECORATION_IDS,
  type BuildingVariantId,
  type RoofDecorationId,
  type AssetMap,
} from "../hooks/useGlbAssets";
import {
  selectModelVariant,
  computeSkyscraperCandidates,
  computeLoadScore,
  type VariantContext,
} from "../utils/selectModelVariant";

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

// ========== 屋顶装饰（Phase A：建筑装饰） ==========

/**
 * 稳定哈希函数，返回 [0, 1) 浮点数。
 * 与 layout.ts 中的 hashSeed 实现一致（本地副本，避免修改 layout.ts）。
 * 用于按 pid 稳定分配装饰类型/数量/偏移。
 */
function hashSeed(seed: number): number {
  let h = seed | 0;
  h = (h ^ 61) ^ (h >>> 16);
  h = h + (h << 3);
  h = h ^ (h >>> 4);
  h = Math.imul(h, 0x27d4eb2d);
  h = h ^ (h >>> 15);
  return (h >>> 0) / 4294967296;
}

/**
 * 建筑变体屋顶高度（GLB 模型固定高度，用于装饰 Y 放置）。
 * 来自 build-assets.mjs 的 VARIANTS 配置（floors × floorHeight + 0.2 底座）。
 * skyscraper 使用最后一段顶部（不含尖塔），天线/尖塔类装饰用偏移避开。
 */
const BUILDING_VARIANT_ROOF_HEIGHT: Record<BuildingVariantId, number> = {
  "building-low": 2.2,
  "building-mid": 4.2,
  "building-tall": 6.2,
  "building-skyscraper": 22.2,
  "building-zombie": 1.8,
  "building-stopped": 2.9,
  "building-sleeping": 3.4,
  "building-system": 2.6,
  "building-database": 5.2,
  "building-browser": 3.8,
  "building-editor": 3.8,
  "building-runtime": 3.2,
  "building-cloud": 5.6,
};

/** 建筑变体底面宽度（用于装饰水平偏移范围限制：baseWidth/2 - 0.3） */
const BUILDING_VARIANT_BASE_WIDTH: Record<BuildingVariantId, number> = {
  "building-low": 1.6,
  "building-mid": 1.2,
  "building-tall": 0.9,
  "building-skyscraper": 1.2,
  "building-zombie": 1.2,
  "building-stopped": 1.1,
  "building-sleeping": 1.1,
  "building-system": 1.8,
  "building-database": 0.8,
  "building-browser": 1.3,
  "building-editor": 1.1,
  "building-runtime": 1.2,
  "building-cloud": 0.9,
};

/** 装饰实例数据：位置 + 缩放（用于 RoofDecorationInstancedMesh） */
interface DecorationInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
}

/**
 * 创建屋顶装饰材质（MeshStandardMaterial + onBeforeCompile 注入主题色）。
 *
 * - 基础 PBR 材质保留装饰固有色（水箱深灰 / 天线灰 / 广告牌白 / 天窗 accent）
 * - onBeforeCompile 注入 uAccent/uSystem/uUser 三个主题色 uniform
 * - emissive 强度按主题模式区分：light=0.2 / dark=0.6 / midnight-blue=1.0
 * - fragment shader 在 emissivemap_fragment 后追加 accent 色调微调
 */
function createRoofDecorationMaterial(
  decorationId: RoofDecorationId,
  theme: Theme,
): THREE.MeshStandardMaterial {
  // 主题 emissive 强度：light 低 / dark 中 / midnight-blue 高
  const isMidnight = theme.name.toLowerCase().includes("midnight");
  const emissiveIntensity = theme.mode === "light" ? 0.2 : isMidnight ? 1.0 : 0.6;

  // 按装饰类型设定基础色和 emissive 色
  let baseColor: THREE.ColorRepresentation;
  let emissiveColor: THREE.ColorRepresentation;
  switch (decorationId) {
    case "roof-water-tank":
      baseColor = 0x3a3a3a;
      emissiveColor = 0x000000;
      break;
    case "roof-antenna-tall":
      baseColor = 0x333333;
      emissiveColor = 0xff3030;
      break;
    case "roof-billboard-small":
      baseColor = 0xffffff;
      emissiveColor = 0xffffff;
      break;
    case "roof-skylight":
      baseColor = theme.colors.accent;
      emissiveColor = theme.colors.accent;
      break;
  }

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor),
    emissive: new THREE.Color(emissiveColor),
    emissiveIntensity,
    roughness: 0.6,
    metalness: 0.3,
  });

  // 注入主题色 uniform（accent/system/user）
  const uAccent = { value: new THREE.Color(theme.colors.accent) };
  const uSystem = { value: new THREE.Color(theme.colors.system) };
  const uUser = { value: new THREE.Color(theme.colors.user) };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAccent = uAccent;
    shader.uniforms.uSystem = uSystem;
    shader.uniforms.uUser = uUser;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform vec3 uAccent;
         uniform vec3 uSystem;
         uniform vec3 uUser;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += uAccent * 0.15;`,
      );
  };

  material.customProgramCacheKey = () => `procession-roof-deco-${decorationId}-v1`;

  return material;
}

interface RoofDecorationInstancedMeshProps {
  decorationId: RoofDecorationId;
  geometry: THREE.BufferGeometry | undefined;
  instances: DecorationInstance[];
  theme: Theme;
  capacity: number;
}

/**
 * 单装饰类型 InstancedMesh 子组件（4 个全局装饰 mesh 之一）。
 *
 * - GLB 已加载：使用传入的 geometry，按 instances 写入 matrix
 * - GLB 未加载/失败：返回 null（降级为不显示装饰，不报错）
 * - 装饰材质按主题动态生成（onBeforeCompile 注入 accent/system/user）
 * - 不参与 hover/click/selection（纯视觉装饰，事件由建筑 mesh 处理）
 */
function RoofDecorationInstancedMesh({
  decorationId,
  geometry,
  instances,
  theme,
  capacity,
}: RoofDecorationInstancedMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const instancesRef = useRef<DecorationInstance[]>(instances);
  instancesRef.current = instances;

  // 主题变化时重建材质（触发 shader 重编译，注入新主题色）
  const material = useMemo(
    () => createRoofDecorationMaterial(decorationId, theme),
    [decorationId, theme],
  );

  // 写入 instance matrix（instances 变化或 geometry 加载时重写）
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !geometry) return;

    const dummyObj = new THREE.Object3D();
    const list = instancesRef.current;
    for (let i = 0; i < list.length; i++) {
      const inst = list[i];
      dummyObj.position.set(inst.x, inst.y, inst.z);
      dummyObj.scale.set(inst.scale, inst.scale, inst.scale);
      dummyObj.rotation.set(0, 0, 0);
      dummyObj.updateMatrix();
      mesh.setMatrixAt(i, dummyObj.matrix);
    }
    mesh.count = Math.max(1, list.length);
    mesh.instanceMatrix.needsUpdate = true;
  }, [geometry, instances]);

  // GLB 未加载时降级为不显示装饰（不报错）
  if (!geometry) return null;

  return (
    <instancedMesh
      key={`deco-${decorationId}`}
      ref={meshRef}
      args={[geometry, material, capacity]}
      frustumCulled={false}
      castShadow
      receiveShadow
    />
  );
}

interface PointerDownPos {
  x: number;
  y: number;
  t: number;
}

interface VariantInstancedMeshProps {
  variantId: BuildingVariantId;
  positions: BuildingPosition[];
  assets: AssetMap;
  processes: ProcessInfo[];
  themeRef: MutableRefObject<Theme>;
  selectedPidRef: MutableRefObject<number | null>;
  hoveredIdRef: MutableRefObject<number>;
  pointerDownPosRef: MutableRefObject<PointerDownPos | null>;
  onClick?: (process: ProcessInfo) => void;
  onDoubleClick?: (process: ProcessInfo) => void;
  onHover?: (process: ProcessInfo | null) => void;
  setHoveredPid: (pid: number | null) => void;
  capacity: number;
}

/**
 * 单变体 InstancedMesh 子组件。
 *
 * 每个变体独立维护：meshRef、buildingMaterial、pidMap、差分缓存。
 * - GLB 已加载：使用 assets[variantId].geometry，position 只控制 x/z，scale (1,1,1)
 * - GLB 未加载/失败：降级为 boxGeometry args=[1.2,1,1.2]，保留原 height lerp 行为
 *
 * 父组件共享：themeRef、selectedPidRef、hoveredIdRef、pointerDownPosRef。
 * hover/selected 通过 ref 同步，避免每帧 React render。
 */
function VariantInstancedMesh({
  variantId,
  positions,
  assets,
  processes,
  themeRef,
  selectedPidRef,
  hoveredIdRef,
  pointerDownPosRef,
  onClick,
  onDoubleClick,
  onHover,
  setHoveredPid,
  capacity,
}: VariantInstancedMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const positionsRef = useRef<BuildingPosition[]>(positions);
  const processesRef = useRef<ProcessInfo[]>(processes);
  const heightCurRef = useRef<Map<number, number>>(new Map());
  const initedRef = useRef(false);
  // instanceId → pid map（本变体内部），useFrame 写入、事件处理反查
  const pidMap = useRef<number[]>([]);
  const procMapRef = useRef<Map<number, ProcessInfo>>(new Map());
  // 差分缓存：上次写入 instanceColor 的最终颜色（含 hover/selected 调整）
  const lastColorRef = useRef<Float32Array | null>(null);
  // 差分缓存：上次写入 aState 的 state number
  const lastStateRef = useRef<Int8Array | null>(null);
  // positions 变化时置 true，强制下一帧全量重写 instanceMatrix
  const forceMatrixUpdateRef = useRef(true);
  // useGlb 通过 ref 暴露给 useFrame，避免闭包捕获过期值
  const useGlbRef = useRef(false);

  positionsRef.current = positions;
  processesRef.current = processes;

  const asset = assets[variantId];
  const geometry = asset?.geometry;
  const useGlb = !!geometry;
  useGlbRef.current = useGlb;

  // pid → ProcessInfo 的 Map（本变体视图），useFrame 用 O(1) 查找
  const procMap = useMemo(() => {
    const m = new Map<number, ProcessInfo>();
    for (const p of processes) m.set(p.pid, p);
    return m;
  }, [processes]);
  procMapRef.current = procMap;

  // 每变体独立 material（onBeforeCompile 注入 window shader）
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

  // positions 变化时标记需要强制重写 matrix（兜底 pos.x/z/width 变化但 height 不变）
  useEffect(() => {
    forceMatrixUpdateRef.current = true;
  }, [positions]);

  // useGlb 切换（GLB 加载完成从 box 切换到 GLB）时重置 init 状态，
  // 让下面的 init effect 重新跑一遍，给新 mesh 挂上 instanceColor/aPid/aState。
  useEffect(() => {
    initedRef.current = false;
    forceMatrixUpdateRef.current = true;
    if (lastColorRef.current) lastColorRef.current.fill(NaN);
    if (lastStateRef.current) lastStateRef.current.fill(-1);
  }, [useGlb]);

  // Init: 分配 instanceColor + aPid/aState 属性缓冲，写入初始 matrix/color/state
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
    const pmap_proc = procMapRef.current;
    const pidAttr = mesh.geometry.getAttribute("aPid") as THREE.InstancedBufferAttribute;
    const stateAttr = mesh.geometry.getAttribute("aState") as THREE.InstancedBufferAttribute;
    const pidArr = pidAttr.array as Float32Array;
    const stateArr = stateAttr.array as Float32Array;
    const pmap = pidMap.current;
    let idx = 0;
    const useGlbNow = useGlbRef.current;

    // 初始化差分缓存（NaN / -1 触发首次写入）
    const lastColor = new Float32Array(capacity * 3).fill(NaN);
    const lastState = new Int8Array(capacity).fill(-1);
    lastColorRef.current = lastColor;
    lastStateRef.current = lastState;

    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pmap_proc.get(pos.pid);
      if (!proc) continue;

      if (useGlbNow) {
        // GLB 模型保持原生尺寸，position 只控制 x/z
        dummy.position.set(pos.x, 0, pos.z);
        dummy.scale.set(1, 1, 1);
      } else {
        // 降级 box：用 pos.height/width 缩放（保持原行为）
        const h = pos.height;
        const w = pos.width ?? 1;
        heightCurRef.current.set(proc.pid, h);
        dummy.position.set(pos.x, h / 2, pos.z);
        dummy.scale.set(w, h, w);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      _c.set(colorForProcess(proc, themeRef.current));
      mesh.setColorAt(idx, _c);
      lastColor[idx * 3] = Math.fround(_c.r);
      lastColor[idx * 3 + 1] = Math.fround(_c.g);
      lastColor[idx * 3 + 2] = Math.fround(_c.b);
      const sn = stateToNumber(proc.state);
      pidArr[idx] = proc.pid;
      stateArr[idx] = sn;
      lastState[idx] = sn;
      pmap[idx] = proc.pid;
      idx++;
    }

    mesh.count = Math.max(1, idx);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    pidAttr.needsUpdate = true;
    stateAttr.needsUpdate = true;
    initedRef.current = true;
    forceMatrixUpdateRef.current = false; // 初始化已写入，无需再强制
  }, [useGlb]); // eslint-disable-line react-hooks/exhaustive-deps

  // aPid 写入：pid 在进程生命周期内不变，仅在 processes/positions 变化时同步。
  // 同时重置颜色/state 差分缓存，因为 instance 顺序可能变化导致索引语义错位。
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !initedRef.current) return;
    if (!mesh.geometry.hasAttribute("aPid")) return;

    const pidAttr = mesh.geometry.getAttribute("aPid") as THREE.InstancedBufferAttribute;
    const pidArr = pidAttr.array as Float32Array;
    const pmap = pidMap.current;
    const ppos = positionsRef.current;
    const pmap_proc = procMapRef.current;
    let idx = 0;
    let pidChanged = false;

    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pmap_proc.get(pos.pid);
      if (!proc) continue;
      if (pidArr[idx] !== proc.pid) {
        pidArr[idx] = proc.pid;
        pidChanged = true;
      }
      pmap[idx] = proc.pid;
      idx++;
    }

    if (pidChanged) pidAttr.needsUpdate = true;

    // instance 顺序可能因 processes/positions 变化而改变，
    // 重置差分缓存强制下一帧全量重写颜色/state，保证索引语义一致。
    if (lastColorRef.current) lastColorRef.current.fill(NaN);
    if (lastStateRef.current) lastStateRef.current.fill(-1);
  }, [processes, positions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-frame: advance window-shader time + 差分更新 matrix/color/state。
  // GLB 模型 matrix 固定（仅 position）；降级 box 保留 height lerp 动画。
  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Always advance the window shader time so flicker keeps animating.
    updateBuildingMaterialTime(buildingMaterial, state.clock.elapsedTime);

    const ppos = positionsRef.current;
    const pmap_proc = procMapRef.current;
    const lerpFactor = 1 - Math.pow(0.001, delta);
    const hMap = heightCurRef.current;
    const useGlbNow = useGlbRef.current;

    const stateAttr = mesh.geometry.getAttribute("aState") as THREE.InstancedBufferAttribute;
    const stateArr = stateAttr.array as Float32Array;
    const pmap = pidMap.current;

    // 保证差分缓存存在（防止初始化 useEffect 未跑就进入 useFrame）
    let lastColor = lastColorRef.current;
    if (!lastColor || lastColor.length !== capacity * 3) {
      lastColor = new Float32Array(capacity * 3).fill(NaN);
      lastColorRef.current = lastColor;
    }
    let lastState = lastStateRef.current;
    if (!lastState || lastState.length !== capacity) {
      lastState = new Int8Array(capacity).fill(-1);
      lastStateRef.current = lastState;
    }

    const forceMatrix = forceMatrixUpdateRef.current;
    let matrixChanged = forceMatrix; // 强制模式下必然标记 needsUpdate
    let colorChanged = false;
    let stateChanged = false;

    let idx = 0;
    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pmap_proc.get(pos.pid);
      if (!proc) continue;

      if (useGlbNow) {
        // GLB 模型：仅 positions 变化时才重写 matrix
        if (forceMatrix) {
          dummy.position.set(pos.x, 0, pos.z);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          matrixChanged = true;
        }
      } else {
        // 降级 box：用实时 proc.cpu 计算 targetH（pos.height 是拓扑快照，不会每帧更新）
        // 这样 cpu 波动时 height 平滑 lerp 跟随，而不需要重算 positions
        const targetH = cpuToHeight(proc.cpu);
        let curH = hMap.get(proc.pid) ?? targetH;
        const heightChanging = Math.abs(curH - targetH) > 0.01;
        if (heightChanging) {
          curH += (targetH - curH) * lerpFactor;
          if (Math.abs(curH - targetH) < 0.01) curH = targetH;
          hMap.set(proc.pid, curH);
        }
        if (heightChanging || forceMatrix) {
          const w = pos.width ?? 1;
          dummy.position.set(pos.x, curH / 2, pos.z);
          dummy.scale.set(w, curH, w);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          matrixChanged = true;
        }
      }

      // 颜色差分：含 hover/selected 调整后与缓存比较，仅在变化时写入。
      // Math.fround 截断为 Float32 精度，匹配 instanceColor 内部存储。
      _c.set(colorForProcess(proc, themeRef.current));
      // Hover/selected visual feedback: brighten instanceColor only (no
      // instanceMatrix changes) to avoid per-frame matrix rewrite overhead.
      if (proc.pid === hoveredIdRef.current) {
        _c.multiplyScalar(1.6);
      } else if (proc.pid === selectedPidRef.current) {
        _c.multiplyScalar(1.3);
      }
      const o3 = idx * 3;
      const r = Math.fround(_c.r);
      const g = Math.fround(_c.g);
      const b = Math.fround(_c.b);
      if (lastColor[o3] !== r || lastColor[o3 + 1] !== g || lastColor[o3 + 2] !== b) {
        mesh.setColorAt(idx, _c);
        lastColor[o3] = r;
        lastColor[o3 + 1] = g;
        lastColor[o3 + 2] = b;
        colorChanged = true;
      }

      // state：仅在变化时写入
      const sn = stateToNumber(proc.state);
      if (lastState[idx] !== sn) {
        stateArr[idx] = sn;
        lastState[idx] = sn;
        stateChanged = true;
      }

      pmap[idx] = proc.pid;
      idx++;
    }

    mesh.count = Math.max(1, idx);
    if (matrixChanged) mesh.instanceMatrix.needsUpdate = true;
    if (colorChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (stateChanged) stateAttr.needsUpdate = true;

    if (forceMatrixUpdateRef.current) forceMatrixUpdateRef.current = false;
  });

  const getPid = useCallback((id: number) => {
    const map = pidMap.current;
    if (id < 0 || id >= map.length) return null;
    const pid = map[id];
    return pid !== undefined ? pid : null;
  }, []);

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
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
      const proc = processesRef.current.find((p) => p.pid === pid);
      if (proc) onHover?.(proc);
    },
    [onHover, getPid, hoveredIdRef, setHoveredPid],
  );

  const handlePointerOut = useCallback(() => {
    hoveredIdRef.current = -1;
    setHoveredPid(null);
    onHover?.(null);
  }, [onHover, hoveredIdRef, setHoveredPid]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // 拖动距离检测：如果 pointerdown → pointerup 之间鼠标移动超过 5px，视为相机拖拽
      if (pointerDownPosRef.current) {
        const dx = e.nativeEvent.clientX - pointerDownPosRef.current.x;
        const dy = e.nativeEvent.clientY - pointerDownPosRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        pointerDownPosRef.current = null;
        if (dist > 5) return; // 拖动，忽略 click
      }
      if (!onClick) return;
      const id = e.instanceId;
      if (id === undefined) return;
      const pid = getPid(id);
      if (pid !== null) {
        const proc = processesRef.current.find((p) => p.pid === pid);
        if (proc) onClick(proc);
      }
    },
    [onClick, getPid, pointerDownPosRef],
  );

  const handleDoubleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // 同样检测拖动，避免 OrbitControls 拖动末尾误触发双击 → 飞行 → controls 禁用
      if (pointerDownPosRef.current) {
        const dx = e.nativeEvent.clientX - pointerDownPosRef.current.x;
        const dy = e.nativeEvent.clientY - pointerDownPosRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        pointerDownPosRef.current = null;
        if (dist > 5) return;
      }
      if (!onDoubleClick) return;
      const id = e.instanceId;
      if (id === undefined) return;
      const pid = getPid(id);
      if (pid !== null) {
        const proc = processesRef.current.find((p) => p.pid === pid);
        if (proc) onDoubleClick(proc);
      }
    },
    [onDoubleClick, getPid, pointerDownPosRef],
  );

  // 记录 pointerdown 起点，用于 click/dblclick 拖动距离检测
  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      pointerDownPosRef.current = {
        x: e.nativeEvent.clientX,
        y: e.nativeEvent.clientY,
        t: performance.now(),
      };
    },
    [pointerDownPosRef],
  );

  // GLB 加载/未加载时通过 key 切换强制 InstancedMesh 重建，
  // 配合上面的 useGlb init effect 重新挂载 instanceColor/aPid/aState 属性。
  return (
    <instancedMesh
      key={useGlb ? `glb-${variantId}` : `box-${variantId}`}
      ref={meshRef}
      args={[geometry, undefined, capacity]}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      {!useGlb && <boxGeometry args={[1.2, 1, 1.2]} />}
      <primitive object={buildingMaterial} attach="material" />
    </instancedMesh>
  );
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
  // 异步加载 4 个 GLB；加载完成前各变体降级为 boxGeometry
  const { assets } = useGlbAssets();
  const { t } = useI18n();

  // 共享 ref：避免每帧 React render，子组件通过 ref 读取最新值
  const themeRef = useRef(theme);
  const selectedPidRef = useRef(selectedPid);
  // hovered pid 在父组件 state（驱动 Html tooltip 显隐）+ ref（驱动 useFrame 颜色高亮）
  const hoveredIdRef = useRef(-1);
  // 拖动起点检测：父组件持有，所有子组件共享，避免 OrbitControls 拖动误触发
  const pointerDownPosRef = useRef<PointerDownPos | null>(null);
  const [hoveredPid, setHoveredPid] = useState<number | null>(null);

  themeRef.current = theme;
  selectedPidRef.current = selectedPid;

  // 拓扑签名：只在 pid/ppid/name 变化时变（不含 cpu），避免每帧 cpu 波动触发 positions 重算。
  // 这是建筑稳定的关键：cpu 变化由 useFrame 差分更新 height，不需要重算 layout。
  const processSignature = useMemo(
    () => computeProcessSignature(processes),
    [processes],
  );

  // processes ref 让 useMemo 内能读到最新 processes，但依赖用签名（稳定）
  const processesRef = useRef(processes);
  processesRef.current = processes;

  const positions = useMemo(
    () => propPositions ?? computeGridPositions(processesRef.current, maxBuildings).positions,
    // 用签名代替 processes 本身，避免每帧重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [propPositions, processSignature, maxBuildings],
  );

  // 每变体 InstancedMesh 的容量上限（与原实现一致，留 2x 余量）
  const capacity = Math.max(1, maxBuildings * 2);

  // pid → ProcessInfo 的 Map（用于 Html tooltip 渲染）
  const procMap = useMemo(() => {
    const m = new Map<number, ProcessInfo>();
    for (const p of processes) m.set(p.pid, p);
    return m;
  }, [processes]);

  // pid → 子进程数（基于 ppid 聚合），用于 skyscraper 候选 + 变体选择
  const childCountByPid = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of processes) {
      m.set(p.ppid, (m.get(p.ppid) ?? 0) + 1);
    }
    return m;
  }, [processes]);

  // 综合负载 Top 3 → skyscraper 候选 pid 集合
  const skyscraperCandidates = useMemo(
    () => computeSkyscraperCandidates(processes, childCountByPid, 3),
    [processes, childCountByPid],
  );

  // 为每个 position 选择变体并按变体分组
  const variantGroups = useMemo(() => {
    const groups = new Map<BuildingVariantId, BuildingPosition[]>();
    for (const id of BUILDING_VARIANT_IDS) groups.set(id, []);
    for (const pos of positions) {
      const proc = procMap.get(pos.pid);
      if (!proc) continue;
      const childCount = childCountByPid.get(pos.pid) ?? 0;
      const ctx: VariantContext = {
        hasListeningPorts: false,
        hasIpcPeers: false,
        childCount,
        loadScore: computeLoadScore(proc, childCount),
        isSkyscraperCandidate: skyscraperCandidates.has(pos.pid),
      };
      const { variant } = selectModelVariant(proc, ctx);
      groups.get(variant)!.push(pos);
    }
    return groups;
  }, [positions, procMap, childCountByPid, skyscraperCandidates]);

  // 屋顶装饰实例分配：按 pid 稳定哈希决定装饰数量/类型/位置
  // 4 个全局装饰 InstancedMesh（所有建筑共享 4 个 mesh），每栋建筑 0-2 个装饰
  // - 60% 建筑 1 个装饰，30% 0 个，10% 2 个
  // - 装饰类型用 hashSeed(pid + offset) 选 4 种之一
  // - 装饰位置：建筑屋顶高度 + 0.5，x/z 偏移在 baseWidth/2 - 0.3 内（不穿模）
  const decorationInstances = useMemo(() => {
    const result: Record<RoofDecorationId, DecorationInstance[]> = {
      "roof-water-tank": [],
      "roof-antenna-tall": [],
      "roof-billboard-small": [],
      "roof-skylight": [],
    };

    for (const [variantId, posList] of variantGroups) {
      const roofHeight = BUILDING_VARIANT_ROOF_HEIGHT[variantId] ?? 2.0;
      const baseWidth = BUILDING_VARIANT_BASE_WIDTH[variantId] ?? 1.2;
      // 装饰水平偏移范围：baseWidth/2 - 0.3（不超出建筑底面）
      const maxOffset = Math.max(0.1, baseWidth / 2 - 0.3);

      for (const pos of posList) {
        // 60% → 1 个装饰，30% → 0 个，10% → 2 个
        const r = hashSeed(pos.pid);
        let count: number;
        if (r < 0.6) count = 1;
        else if (r < 0.9) count = 0;
        else count = 2;

        for (let i = 0; i < count; i++) {
          // 装饰类型：4 种之一
          const typeIdx = Math.floor(hashSeed(pos.pid + i * 1000 + 7) * 4);
          const decoId = ROOF_DECORATION_IDS[typeIdx];
          // x/z 偏移：在 [-maxOffset, maxOffset] 范围内
          const offX = (hashSeed(pos.pid + i * 100 + 1) - 0.5) * 2 * maxOffset;
          const offZ = (hashSeed(pos.pid + i * 100 + 2) - 0.5) * 2 * maxOffset;
          result[decoId].push({
            x: pos.x + offX,
            y: roofHeight + 0.5,
            z: pos.z + offZ,
            scale: 1.0,
          });
        }
      }
    }

    return result;
  }, [variantGroups]);

  return (
    <group>
      {BUILDING_VARIANT_IDS.map((variantId) => (
        <VariantInstancedMesh
          key={variantId}
          variantId={variantId}
          positions={variantGroups.get(variantId) ?? []}
          assets={assets}
          processes={processes}
          themeRef={themeRef}
          selectedPidRef={selectedPidRef}
          hoveredIdRef={hoveredIdRef}
          pointerDownPosRef={pointerDownPosRef}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onHover={onHover}
          setHoveredPid={setHoveredPid}
          capacity={capacity}
        />
      ))}

      {/* 屋顶装饰：4 个全局 InstancedMesh，所有建筑共享 */}
      {ROOF_DECORATION_IDS.map((decoId) => (
        <RoofDecorationInstancedMesh
          key={`roof-deco-${decoId}`}
          decorationId={decoId}
          geometry={assets.roofDecorations?.[decoId]}
          instances={decorationInstances[decoId]}
          theme={theme}
          capacity={capacity}
        />
      ))}

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
            position={[pos.x, pos.height + 1.2, pos.z]}
            center
            distanceFactor={14}
            style={{ pointerEvents: "none" }}
          >
            <div className={`building-tooltip${isSelected ? " selected" : ""}`}>
              <div className="building-tooltip-name">{proc.name}</div>
              <div className="building-tooltip-row">{t("building_tooltip.pid", { pid: proc.pid })}</div>
              <div className="building-tooltip-row">{t("building_tooltip.cpu", { cpu: proc.cpu.toFixed(1) })}</div>
              <div className="building-tooltip-row">{t("building_tooltip.mem", { mb: proc.memory_mb })}</div>
            </div>
          </Html>
        );
      })}
    </group>
  );
}
