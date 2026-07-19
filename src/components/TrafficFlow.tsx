import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import { useGlbAssets, type VehicleId } from "../hooks/useGlbAssets";

interface TrafficFlowProps {
  theme?: Theme;
  /** 期望总车辆数（实际按 3:1 比例分到 car/truck，并受上限约束） */
  totalVehicles?: number;
}

// === 道路网格常量（与 CityGround 保持一致） ===
const GRID_HALF = 80;          // 道路网格半径（与 CityGround GROUND_SIZE/2 一致）
const BLOCK_STEP = 16;         // 街区间距（与 layout.ts blockCell 一致）
const ROAD_COUNT = 11;         // 每方向道路数（i=0..10，共 11 条）
const VEHICLE_Y = 0.3;         // 车辆 y 高度（紧贴道路上方，避免与地面 z-fight）
const LANE_OFFSET = 0.3;       // 车道偏移（道路宽度 1.5 内，模拟双向车道分隔）

// === 主题色板 ===
// 主体颜色按主题分桶：light=自然色、dark=深色、midnight-blue=发光色
const LIGHT_PALETTE = ["#ffffff", "#c0c0c0", "#a02828", "#2a4a8a", "#d8d8d8"];
const DARK_PALETTE = ["#0a0a0a", "#1a1a1a", "#202020", "#2a2a2a"];
const BLUE_PALETTE = ["#00e5ff", "#9d7bff", "#4aa8ff", "#5ce1a8"];

// === 工具：hash 函数（与 layout.ts 中 hashSeed 同算法，但本地保留以避免导出污染） ===
function hashSeed(seed: number): number {
  let h = seed | 0;
  h = (h ^ 61) ^ (h >>> 16);
  h = h + (h << 3);
  h = h ^ (h >>> 4);
  h = Math.imul(h, 0x27d4eb2d);
  h = h ^ (h >>> 15);
  return (h >>> 0) / 4294967296;
}

// === 工具：主题分类 ===
type ThemeBucket = "light" | "dark" | "blue";

function classifyTheme(theme: Theme): ThemeBucket {
  const name = theme.name.toLowerCase();
  if (name.includes("blue") || name.includes("midnight")) return "blue";
  if (theme.mode === "light") return "light";
  return "dark";
}

// === 工具：根据主题桶生成车辆材质 ===
function createVehicleMaterial(theme: Theme): THREE.MeshStandardMaterial {
  const bucket = classifyTheme(theme);
  if (bucket === "blue") {
    // 午夜蓝主题：发光色（青/紫），emissive 强度 0.6
    const palette = BLUE_PALETTE;
    const color = palette[Math.floor(Math.random() * palette.length)];
    return new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.5,
    });
  }
  if (bucket === "light") {
    // light 主题：自然色（白/灰/红/蓝）
    const palette = LIGHT_PALETTE;
    const color = palette[Math.floor(Math.random() * palette.length)];
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.3,
    });
  }
  // dark 主题：深色（黑/深灰）
  const palette = DARK_PALETTE;
  const color = palette[Math.floor(Math.random() * palette.length)];
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.2,
  });
}

// === 单个车辆实例的运行时状态 ===
interface VehicleInstance {
  /** 道路索引（0..ROAD_COUNT-1，对应 i 或 j） */
  roadIdx: number;
  /** 道路方向：'h' = 横向道路（车沿 X 行驶），'v' = 纵向道路（车沿 Z 行驶） */
  axis: "h" | "v";
  /** 行驶方向：+1 正向 / -1 反向 */
  direction: 1 | -1;
  /** 速度（单位/秒，4-8） */
  speed: number;
  /** 当前沿道路轴的位置（在 -GRID_HALF..+GRID_HALF 之间） */
  position: number;
  /** 道路轴垂直方向的偏移（±LANE_OFFSET，模拟车道） */
  perpendicularOffset: number;
  /** 车辆类型 */
  vehicleId: VehicleId;
}

/**
 * 计算所有车辆实例的初始状态。
 *
 * - 11 横 + 11 纵 = 22 条道路
 * - 总车辆数 40-60，平均每条道路 2-3 辆
 * - hashSeed(roadIdx*100 + vehicleIdx) 决定速度（4-8）和车辆类型（3:1 car:truck）
 * - 偶数道路正向（+X 或 +Z），奇数道路反向（-X 或 -Z）— 模拟双向交通
 */
function buildVehicleInstances(totalVehicles: number): VehicleInstance[] {
  const instances: VehicleInstance[] = [];
  // 22 条道路，每条道路分配的车辆数：均匀分摊后再加随机扰动
  const totalRoads = ROAD_COUNT * 2;
  const perRoad = Math.max(1, Math.floor(totalVehicles / totalRoads));

  for (let r = 0; r < ROAD_COUNT; r++) {
    // 横向道路 r（车沿 X 行驶）
    const hDir: 1 | -1 = r % 2 === 0 ? 1 : -1;
    for (let v = 0; v < perRoad; v++) {
      const seed = r * 1000 + v;
      const rand = hashSeed(seed);
      const rand2 = hashSeed(seed + 7);
      const rand3 = hashSeed(seed + 13);
      // 速度 4-8 单位/秒
      const speed = 4 + rand * 4;
      // 车辆类型：3:1 car:truck
      const vehicleId: VehicleId = rand2 < 0.75 ? "vehicle-car" : "vehicle-truck";
      // 初始位置：均匀分布 + 抖动
      const slotSpan = (GRID_HALF * 2) / perRoad;
      const position = -GRID_HALF + v * slotSpan + rand3 * slotSpan;
      // 车道偏移：方向相同的车走同一车道（避免对撞）
      const perpendicularOffset = hDir > 0 ? LANE_OFFSET : -LANE_OFFSET;
      instances.push({
        roadIdx: r,
        axis: "h",
        direction: hDir,
        speed,
        position,
        perpendicularOffset,
        vehicleId,
      });
    }
  }
  for (let r = 0; r < ROAD_COUNT; r++) {
    // 纵向道路 r（车沿 Z 行驶）
    const vDir: 1 | -1 = r % 2 === 0 ? 1 : -1;
    for (let v = 0; v < perRoad; v++) {
      const seed = (r + ROAD_COUNT) * 1000 + v;
      const rand = hashSeed(seed);
      const rand2 = hashSeed(seed + 7);
      const rand3 = hashSeed(seed + 13);
      const speed = 4 + rand * 4;
      const vehicleId: VehicleId = rand2 < 0.75 ? "vehicle-car" : "vehicle-truck";
      const slotSpan = (GRID_HALF * 2) / perRoad;
      const position = -GRID_HALF + v * slotSpan + rand3 * slotSpan;
      const perpendicularOffset = vDir > 0 ? LANE_OFFSET : -LANE_OFFSET;
      instances.push({
        roadIdx: r,
        axis: "v",
        direction: vDir,
        speed,
        position,
        perpendicularOffset,
        vehicleId,
      });
    }
  }

  // 如果超出总数上限，按 hashSeed 截断（保持稳定）
  if (instances.length > totalVehicles) {
    instances.sort((a, b) => {
      // 排序时使用稳定 key（roadIdx + axis + position）
      const ka = a.axis === "h" ? a.roadIdx : a.roadIdx + ROAD_COUNT;
      const kb = b.axis === "h" ? b.roadIdx : b.roadIdx + ROAD_COUNT;
      if (ka !== kb) return ka - kb;
      return a.position - b.position;
    });
    return instances.slice(0, totalVehicles);
  }
  return instances;
}

// === 单个 InstancedMesh 子组件（一种车辆类型） ===
interface VehicleMeshProps {
  vehicleId: VehicleId;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  instances: VehicleInstance[];
  theme: Theme;
}

function VehicleMesh({ vehicleId, geometry, material, instances, theme }: VehicleMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // 本子组件的实例引用（只包含本类型车辆）
  const instancesRef = useRef<VehicleInstance[]>(instances);
  instancesRef.current = instances;

  // 主题变更时重置实例颜色（差分缓存失效）
  const lastThemeBucketRef = useRef<ThemeBucket>(classifyTheme(theme));

  // 初始化：分配 instanceColor
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!mesh.geometry.hasAttribute("instanceColor")) {
      const arr = new Float32Array(instances.length * 3);
      const ic = new THREE.InstancedBufferAttribute(arr, 3);
      mesh.geometry.setAttribute("instanceColor", ic);
      mesh.instanceColor = ic;
    }
  }, [instances.length]);

  // 主题切换时重新生成材质（颜色随主题分桶变化）
  useEffect(() => {
    const bucket = classifyTheme(theme);
    lastThemeBucketRef.current = bucket;
    // 重新分配每个实例的颜色（不同实例不同色）
    const mesh = meshRef.current;
    if (!mesh || !mesh.instanceColor) return;
    const c = new THREE.Color();
    for (let i = 0; i < instances.length; i++) {
      // 用 hashSeed 决定颜色索引，保证主题切换时颜色仍稳定
      const seed = i * 31 + (vehicleId === "vehicle-car" ? 1 : 100);
      const palette = bucket === "blue" ? BLUE_PALETTE
        : bucket === "light" ? LIGHT_PALETTE
        : DARK_PALETTE;
      const colorStr = palette[Math.floor(hashSeed(seed) * palette.length)];
      c.set(colorStr);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [theme, instances.length, vehicleId]);

  // 初始化时也设置一次颜色
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const bucket = lastThemeBucketRef.current;
    const c = new THREE.Color();
    for (let i = 0; i < instances.length; i++) {
      const seed = i * 31 + (vehicleId === "vehicle-car" ? 1 : 100);
      const palette = bucket === "blue" ? BLUE_PALETTE
        : bucket === "light" ? LIGHT_PALETTE
        : DARK_PALETTE;
      const colorStr = palette[Math.floor(hashSeed(seed) * palette.length)];
      c.set(colorStr);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每帧更新车辆位置（差分：仅 position+rotation 变化，scale 与 color 不变）
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const insts = instancesRef.current;

    // delta 钳制：tab 切回时 delta 可能很大，避免车辆瞬移
    const dt = Math.min(delta, 0.1);

    let changed = false;
    for (let i = 0; i < insts.length; i++) {
      const inst = insts[i];
      // 位置更新
      inst.position += inst.direction * inst.speed * dt;

      // 边界 wrap（到末端跳到另一端）
      if (inst.position > GRID_HALF) {
        inst.position = -GRID_HALF;
      } else if (inst.position < -GRID_HALF) {
        inst.position = GRID_HALF;
      }

      // 计算世界坐标
      let x: number, y: number, z: number;
      let rotY: number;
      if (inst.axis === "h") {
        // 横向道路：道路在 z = -GRID_HALF + roadIdx*BLOCK_STEP，车沿 X 行驶
        const roadZ = -GRID_HALF + inst.roadIdx * BLOCK_STEP;
        x = inst.position;
        y = VEHICLE_Y;
        z = roadZ + inst.perpendicularOffset;
        // +X 方向：rotY = 0；-X 方向：rotY = π
        rotY = inst.direction > 0 ? 0 : Math.PI;
      } else {
        // 纵向道路：道路在 x = -GRID_HALF + roadIdx*BLOCK_STEP，车沿 Z 行驶
        const roadX = -GRID_HALF + inst.roadIdx * BLOCK_STEP;
        x = roadX + inst.perpendicularOffset;
        y = VEHICLE_Y;
        z = inst.position;
        // +Z 方向：rotY = -π/2；-Z 方向：rotY = π/2
        rotY = inst.direction > 0 ? -Math.PI / 2 : Math.PI / 2;
      }

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      changed = true;
    }

    if (changed) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, instances.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

/**
 * 道路交通车辆流动组件（Phase C）。
 *
 * - 在 11 横 + 11 纵 = 22 条主干道上分布 40-60 辆车
 * - 每条道路双向交通（偶数正向、奇数反向）
 * - 用 InstancedMesh 渲染：每种车辆类型一个 InstancedMesh
 * - 每帧通过 setMatrixAt 更新 position+rotation（scale/color 不变，差分更新）
 * - GLB 未加载时不显示车辆（不报错）
 * - 主题适配：light=自然色、dark=深色、midnight-blue=发光色
 *
 * 不与 BuildingCluster 冲突：车辆 y=0.3，紧贴道路上方；
 * 车辆 x/z 严格在道路中心线（偏移 ±0.3 在道路宽度 1.5 内），
 * 不会出现在建筑街区内部（道路与街区不重叠）。
 */
export default function TrafficFlow({
  theme = FALLBACK_THEME,
  totalVehicles = 50,
}: TrafficFlowProps) {
  const { assets } = useGlbAssets();

  // 生成所有车辆实例（稳定的 hashSeed 决定类型、速度、初始位置）
  const allInstances = useMemo(() => buildVehicleInstances(totalVehicles), [totalVehicles]);

  // 按车辆类型分组
  const carInstances = useMemo(
    () => allInstances.filter((v) => v.vehicleId === "vehicle-car"),
    [allInstances],
  );
  const truckInstances = useMemo(
    () => allInstances.filter((v) => v.vehicleId === "vehicle-truck"),
    [allInstances],
  );

  // 主题材质（每种类型一份，所有同类型实例共享；颜色由 instanceColor 区分）
  const carMaterial = useMemo(() => createVehicleMaterial(theme), [theme]);
  const truckMaterial = useMemo(() => createVehicleMaterial(theme), [theme]);

  // 释放旧材质（主题切换时）
  useEffect(() => {
    return () => {
      carMaterial.dispose();
      truckMaterial.dispose();
    };
  }, [carMaterial, truckMaterial]);

  const carGeometry = assets.vehicles?.["vehicle-car"];
  const truckGeometry = assets.vehicles?.["vehicle-truck"];

  // GLB 未加载时不渲染（不报错）
  return (
    <group>
      {carGeometry && carInstances.length > 0 && (
        <VehicleMesh
          vehicleId="vehicle-car"
          geometry={carGeometry}
          material={carMaterial}
          instances={carInstances}
          theme={theme}
        />
      )}
      {truckGeometry && truckInstances.length > 0 && (
        <VehicleMesh
          vehicleId="vehicle-truck"
          geometry={truckGeometry}
          material={truckMaterial}
          instances={truckInstances}
          theme={theme}
        />
      )}
    </group>
  );
}
