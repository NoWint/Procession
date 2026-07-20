import type { ProcessInfo } from "./types";

// ============================================================================
// Procession 城市布局算法
//
// 核心范式（v2，2026-07-20）：
//   1. 主动道路骨架先行 — 固定几何（十字/内外环/放射），不依赖进程数
//   2. 街区按父子拓扑划分 — 每个 root + 其 children = 一个独立街区
//   3. 建筑避让主动道路 — 距离 < 安全距离则沿垂直方向推开
//   4. 建筑间留足安全距离 — 全局 resolveOverlap
//   5. 被动道路由 CityGround 渲染 — 填充街区与街区、建筑与建筑之间的空隙
//
// 稳定性契约（不变）：
//   - computeProcessSignature 只用 pid 集合 → 同 pid 集合 → 同位置
//   - cpu 变化通过 useFrame 缓动 height 体现，不触发 positions 重算
// ============================================================================

export interface BuildingPosition {
  x: number;
  y: number;
  z: number;
  pid: number;
  height: number;
  width?: number;
  parentPid?: number;
  childCount?: number;
}

// 街区 = 一个 root + 其子进程组（不再按进程类型分组）
export interface BlockInfo {
  rootPid: number;             // 街区所属的 root 进程 pid
  rootName: string;            // root 进程名（用于显示）
  typeKey: string;             // 兼容字段（保留用于着色）
  typeName: string;           // 显示名
  x: number;
  z: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  radius: number;              // 街区半径（包络所有子进程）
  processCount: number;
}

// 主动道路骨架（固定，不依赖进程）
export interface RoadSegment {
  type: "straight" | "ring" | "radial";
  // 直道用：中心 (x,z)，长度 length，方向 rotY（绕 Y）
  // 环道用：中心 (x,z)=(0,0)，半径 radius
  // 放射道用：起始 (x,z)，长度 length，方向 rotY
  x: number;
  z: number;
  rotY: number;
  length: number;
  width: number;
  radius?: number;             // ring 用
}

export interface RoadNetwork {
  segments: RoadSegment[];
  // 用于建筑避让的简化表示：每段道路的"影响带"（AABB 形式）
  avoidanceZones: Array<{
    type: "strip" | "ring";
    // strip：以 (x,z) 为中心，rotY 为方向，半长 halfLength，半宽 halfWidth
    cx: number;
    cz: number;
    rotY: number;
    halfLength: number;
    halfWidth: number;
    // ring：以 (0,0) 为中心，半径 ringRadius，环宽 ringWidth
    ringRadius?: number;
    ringWidth?: number;
  }>;
}

// ============================================================================
// 进程分类（保留兼容字段，用于建筑着色，不再用于街区分组）
// ============================================================================

import {
  isSystemProcess,
  isDatabaseProcess,
  isBrowserProcess,
  isEditorProcess,
  isRuntimeProcess,
  isCloudProcess,
} from "./colors";

const TYPE_GROUP_INFO: Record<string, { name: string }> = {
  system:   { name: "系统服务" },
  database: { name: "数据库" },
  browser:  { name: "浏览器" },
  editor:   { name: "编辑器" },
  runtime:  { name: "运行时" },
  cloud:    { name: "云服务" },
  user:     { name: "用户进程" },
};

export function classifyProcess(p: ProcessInfo): string {
  if (isDatabaseProcess(p)) return "database";
  if (isBrowserProcess(p)) return "browser";
  if (isEditorProcess(p)) return "editor";
  if (isRuntimeProcess(p)) return "runtime";
  if (isCloudProcess(p)) return "cloud";
  if (isSystemProcess(p)) return "system";
  return "user";
}

export function getTypeGroupInfo(typeKey: string): { key: string; name: string } {
  const info = TYPE_GROUP_INFO[typeKey] ?? TYPE_GROUP_INFO.user;
  return { key: typeKey, name: info.name };
}

export function cpuToHeight(cpu: number): number {
  return Math.max(1, 1 + cpu * 0.21);
}

// ============================================================================
// 位置签名 — 只用 pid 集合（顺序无关），保证 cpu 变化不影响 positions
// ============================================================================

export function computeProcessSignature(processes: ProcessInfo[]): string {
  const pids = Array.from(new Set(processes.map((p) => p.pid))).sort((a, b) => a - b);
  let h = 0;
  for (const pid of pids) {
    h = (h * 31 + pid) | 0;
  }
  return `${pids.length}:${h}`;
}

// ============================================================================
// 哈希辅助 — 用于 pid-based 抖动（不用 name）
// ============================================================================

function hashSeed(seed: number): number {
  let h = seed | 0;
  h = (h ^ 61) ^ (h >>> 16);
  h = h + (h << 3);
  h = h ^ (h >>> 4);
  h = Math.imul(h, 0x27d4eb2d);
  h = h ^ (h >>> 15);
  return (h >>> 0) / 4294967296;
}

// ============================================================================
// 主动道路骨架（固定，不依赖进程数）
// ============================================================================

// 安全距离：建筑中心到道路边缘的最小距离
const ROAD_SAFETY_MARGIN = 1.5;

// 城市半径（地板半边长）
const CITY_RADIUS = 80;

// 主干道宽（双向 4 车道）
const MAIN_ROAD_WIDTH = 4.0;
// 环道宽
const RING_ROAD_WIDTH = 3.0;
// 放射干道宽
const RADIAL_ROAD_WIDTH = 2.5;

// 内环半径
const INNER_RING_R = 32;
// 外环半径
const OUTER_RING_R = 64;

// 放射干道数量（每 45° 一条）
const RADIAL_COUNT = 8;
// 放射干道起始半径（避开中心十字路口）
const RADIAL_START_R = 8;
// 放射干道终止半径（不超过城市）
const RADIAL_END_R = 70;

/**
 * 生成固定主动道路骨架。
 * 不依赖进程数，城市拓扑始终稳定。
 *
 * 骨架构成：
 *   - 2 条主干道：沿 X 轴 + Z 轴穿过中心
 *   - 2 条环道：内环 (r=32) + 外环 (r=64)
 *   - 8 条放射干道：从 r=8 到 r=70，每 45° 一条
 */
export function computeRoadNetwork(): RoadNetwork {
  const segments: RoadSegment[] = [];
  const avoidanceZones: RoadNetwork["avoidanceZones"] = [];

  // 1. 十字主干道（横向，沿 X 轴方向，z=0）
  segments.push({
    type: "straight",
    x: 0, z: 0, rotY: 0,
    length: CITY_RADIUS * 2 - 4,
    width: MAIN_ROAD_WIDTH,
  });
  avoidanceZones.push({
    type: "strip",
    cx: 0, cz: 0, rotY: 0,
    halfLength: CITY_RADIUS - 2,
    halfWidth: MAIN_ROAD_WIDTH / 2 + ROAD_SAFETY_MARGIN,
  });

  // 2. 十字主干道（纵向，沿 Z 轴方向，x=0）
  segments.push({
    type: "straight",
    x: 0, z: 0, rotY: Math.PI / 2,
    length: CITY_RADIUS * 2 - 4,
    width: MAIN_ROAD_WIDTH,
  });
  avoidanceZones.push({
    type: "strip",
    cx: 0, cz: 0, rotY: Math.PI / 2,
    halfLength: CITY_RADIUS - 2,
    halfWidth: MAIN_ROAD_WIDTH / 2 + ROAD_SAFETY_MARGIN,
  });

  // 3. 内环（r=32）
  segments.push({
    type: "ring",
    x: 0, z: 0, rotY: 0,
    length: 0, width: RING_ROAD_WIDTH,
    radius: INNER_RING_R,
  });
  avoidanceZones.push({
    type: "ring",
    cx: 0, cz: 0, rotY: 0,
    halfLength: 0, halfWidth: 0,
    ringRadius: INNER_RING_R,
    ringWidth: RING_ROAD_WIDTH + ROAD_SAFETY_MARGIN * 2,
  });

  // 4. 外环（r=64）
  segments.push({
    type: "ring",
    x: 0, z: 0, rotY: 0,
    length: 0, width: RING_ROAD_WIDTH,
    radius: OUTER_RING_R,
  });
  avoidanceZones.push({
    type: "ring",
    cx: 0, cz: 0, rotY: 0,
    halfLength: 0, halfWidth: 0,
    ringRadius: OUTER_RING_R,
    ringWidth: RING_ROAD_WIDTH + ROAD_SAFETY_MARGIN * 2,
  });

  // 5. 8 条放射干道（从 r=RADIAL_START_R 到 r=RADIAL_END_R）
  for (let i = 0; i < RADIAL_COUNT; i++) {
    const angle = (i / RADIAL_COUNT) * Math.PI * 2;
    // 起点在 r=RADIAL_START_R 处，沿 angle 方向延伸到 r=RADIAL_END_R
    const startX = Math.cos(angle) * RADIAL_START_R;
    const startZ = Math.sin(angle) * RADIAL_START_R;
    const length = RADIAL_END_R - RADIAL_START_R;
    segments.push({
      type: "radial",
      x: startX, z: startZ,
      rotY: angle,
      length,
      width: RADIAL_ROAD_WIDTH,
    });
    // 放射道的避让带：中心在起点+方向*length/2
    const midX = Math.cos(angle) * (RADIAL_START_R + length / 2);
    const midZ = Math.sin(angle) * (RADIAL_START_R + length / 2);
    avoidanceZones.push({
      type: "strip",
      cx: midX, cz: midZ, rotY: angle,
      halfLength: length / 2,
      halfWidth: RADIAL_ROAD_WIDTH / 2 + ROAD_SAFETY_MARGIN,
    });
  }

  return { segments, avoidanceZones };
}

// ============================================================================
// 道路避让 — 把 (x,z) 推离所有主动道路
// ============================================================================

function avoidRoads(
  x: number,
  z: number,
  network: RoadNetwork,
): { x: number; z: number } {
  let cx = x;
  let cz = z;

  for (const zone of network.avoidanceZones) {
    if (zone.type === "strip") {
      // 把 (x,z) 变换到道路本地坐标系
      const dx = cx - zone.cx;
      const dz = cz - zone.cz;
      const cos = Math.cos(-zone.rotY);
      const sin = Math.sin(-zone.rotY);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      // 在本地坐标里判断是否在影响带内
      if (
        Math.abs(localX) < zone.halfLength &&
        Math.abs(localZ) < zone.halfWidth
      ) {
        // 推开：选择 X 或 Z 方向中较小的推开量
        const pushX = zone.halfLength - Math.abs(localX);
        const pushZ = zone.halfWidth - Math.abs(localZ);
        let newLocalX = localX;
        let newLocalZ = localZ;
        if (pushZ < pushX) {
          // 沿 Z 方向推开
          newLocalZ = localZ >= 0 ? zone.halfWidth : -zone.halfWidth;
        } else {
          // 沿 X 方向推开（直道不会发生，但保留）
          newLocalX = localX >= 0 ? zone.halfLength : -zone.halfLength;
        }
        // 变换回世界坐标
        const cos2 = Math.cos(zone.rotY);
        const sin2 = Math.sin(zone.rotY);
        cx = zone.cx + newLocalX * cos2 - newLocalZ * sin2;
        cz = zone.cz + newLocalX * sin2 + newLocalZ * cos2;
      }
    } else if (zone.type === "ring" && zone.ringRadius != null && zone.ringWidth != null) {
      const dx = cx;
      const dz = cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const innerR = zone.ringRadius - zone.ringWidth / 2;
      const outerR = zone.ringRadius + zone.ringWidth / 2;
      if (dist > innerR && dist < outerR && dist > 0.001) {
        // 推到最近的环边
        const toInner = dist - innerR;
        const toOuter = outerR - dist;
        const targetR = toInner < toOuter ? innerR : outerR;
        const scale = targetR / dist;
        cx = dx * scale;
        cz = dz * scale;
      }
    }
  }

  return { x: cx, z: cz };
}

// ============================================================================
// 街区间避让 — 两个建筑中心最小间距
// ============================================================================

// 街区/建筑间最小距离（半径之和，加上安全间隙）
const MIN_RADIUS = 2.2;

function resolveOverlap(
  x: number,
  z: number,
  placed: Map<number, BuildingPosition>,
): { x: number; z: number } {
  let cx = x;
  let cz = z;
  for (let attempts = 0; attempts < 30; attempts++) {
    let overlap = false;
    for (const other of placed.values()) {
      const dx = cx - other.x;
      const dz = cz - other.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < MIN_RADIUS && dist > 0.001) {
        const push = (MIN_RADIUS - dist) / dist + 0.05;
        cx += dx * push * 0.6;
        cz += dz * push * 0.6;
        overlap = true;
      }
    }
    if (!overlap) break;
  }
  return { x: cx, z: cz };
}

// ============================================================================
// 街区位置规划 — 每个 root 独立街区，分布在 8 个扇区内
// ============================================================================

// 城市分区：8 个扇区，每个扇区中心在 r=SECTOR_RADIUS 处
// SECTOR_RADIUS 已为被动道路 + 安全区预留间距（街区半径 + BLOCK_GAP ≈ 8 单位）
const SECTOR_RADIUS = 22;        // 内圈街区半径
const SECTOR_RADIUS_OUTER = 48; // 外圈街区半径

/**
 * 为 root family 列表规划街区位置。
 * 每个 root 对应一个街区，街区位置由扇区分布 + 螺旋偏移决定。
 *
 * 策略：
 *   - 第 0 个 root → 中心街区 (r=12, 在 X+ 方向避开十字路口)
 *   - 第 1-8 个 root → 内圈扇区（r=SECTOR_RADIUS，每 45° 一个）
 *   - 第 9-16 个 root → 外圈扇区（r=SECTOR_RADIUS_OUTER）
 *   - 第 17+ 个 root → 更远螺旋分布
 *
 * 位置由 root 在 sortedRoots 中的索引决定，但 sortedRoots 按 pid 排序保证稳定。
 */
function planBlockCenters(
  sortedRoots: ProcessInfo[],
  network: RoadNetwork,
): Map<number, { x: number; z: number }> {
  const result = new Map<number, { x: number; z: number }>();

  sortedRoots.forEach((root, idx) => {
    let bx: number;
    let bz: number;

    if (idx === 0) {
      // 第一个 root 放在中心街区（X+ 方向，避开十字路口）
      // 十字路口占 x∈[-2,2], z∈[-2,2]，街区中心在 (10, 8) 避开
      bx = 12;
      bz = 10;
    } else if (idx <= 8) {
      // 内圈 8 个扇区，每 45° 一个，起始角度 45°（避开十字路口）
      const sectorIdx = idx - 1;
      const angle = (sectorIdx / 8) * Math.PI * 2 + Math.PI / 8;
      bx = Math.cos(angle) * SECTOR_RADIUS;
      bz = Math.sin(angle) * SECTOR_RADIUS;
    } else if (idx <= 16) {
      // 外圈 8 个扇区，错开内圈
      const sectorIdx = idx - 9;
      const angle = (sectorIdx / 8) * Math.PI * 2 + Math.PI / 8 + Math.PI / 16;
      bx = Math.cos(angle) * SECTOR_RADIUS_OUTER;
      bz = Math.sin(angle) * SECTOR_RADIUS_OUTER;
    } else {
      // 更远：螺旋分布到 r=68 处
      const outer = idx - 17;
      const angle = (outer / 6) * Math.PI * 2;
      const radius = 60 + outer * 1.5;
      bx = Math.cos(angle) * radius;
      bz = Math.sin(angle) * radius;
    }

    // 用 pid 哈希做微抖动（避免完全规整的网格感）
    bx += (hashSeed(root.pid) - 0.5) * 1.2;
    bz += (hashSeed(root.pid + 1) - 0.5) * 1.2;

    // 避让主动道路（街区中心本身不能在道路上）
    const avoided = avoidRoads(bx, bz, network);
    bx = avoided.x;
    bz = avoided.z;

    result.set(root.pid, { x: bx, z: bz });
  });

  return result;
}

// ============================================================================
// 主入口：computeGridPositions
// ============================================================================

export function computeGridPositions(
  processes: ProcessInfo[],
  maxBuildings: number = 200,
): { positions: BuildingPosition[]; blocks: BlockInfo[] } {
  // filter 只看 state（不看 cpu），避免 cpu 波动导致进程在/不在列表切换
  const filtered = [...processes]
    .filter((p) => p.state !== "Zombie")
    .slice(0, maxBuildings);

  const pidMap = new Map<number, ProcessInfo>();
  for (const p of filtered) pidMap.set(p.pid, p);

  const childrenMap = new Map<number, ProcessInfo[]>();
  for (const p of filtered) {
    const list = childrenMap.get(p.ppid) ?? [];
    list.push(p);
    childrenMap.set(p.ppid, list);
  }
  // 子进程按 pid 排序（绝对稳定）
  for (const list of childrenMap.values()) list.sort((a, b) => a.pid - b.pid);

  const roots = filtered.filter((p) => p.ppid <= 1 || !pidMap.has(p.ppid));
  // roots 按 pid 排序（不再按类型分组）
  const sortedRoots = [...roots].sort((a, b) => a.pid - b.pid);

  // 1. 主动道路骨架（固定）
  const network = computeRoadNetwork();

  // 2. 街区位置规划
  const blockCenters = planBlockCenters(sortedRoots, network);

  const result: BuildingPosition[] = [];
  const blockInfo: BlockInfo[] = [];
  const placed = new Set<number>();

  // 3. 每个 root + 子进程 = 一个街区
  sortedRoots.forEach((root) => {
    const center = blockCenters.get(root.pid)!;
    let bx = center.x;
    let bz = center.z;

    const kids = (childrenMap.get(root.pid) ?? []).filter((k) => pidMap.has(k.pid));
    // 街区半径 = 容纳所有子进程的最小半径
    const childRadius = 2.4 + (kids.length > 4 ? 1.2 : 0.7);
    const blockRadius = childRadius + 1.5; // 给子进程外围留安全区

    // root 位置：再次避让道路（街区中心已避让，但 root 落在中心，仍要保险）
    const rootAvoided = avoidRoads(bx, bz, network);
    bx = rootAvoided.x;
    bz = rootAvoided.z;

    result.push({
      x: bx, y: 0, z: bz,
      pid: root.pid,
      height: cpuToHeight(root.cpu),
      width: 2.0,
      childCount: kids.length,
    });
    placed.add(root.pid);

    // 子进程环绕 root（保持原有角度逻辑，但 pid-based 抖动）
    kids.forEach((child, ci) => {
      if (placed.has(child.pid)) return;
      placed.add(child.pid);

      const angle = (ci / Math.max(kids.length, 1)) * Math.PI * 2;
      let cx = bx + Math.cos(angle) * (childRadius + hashSeed(child.pid) * 0.3);
      let cz = bz + Math.sin(angle) * (childRadius + hashSeed(child.pid + 1) * 0.3);

      // 子进程避让主动道路
      const childAvoided = avoidRoads(cx, cz, network);
      cx = childAvoided.x;
      cz = childAvoided.z;

      result.push({
        x: cx, y: 0, z: cz,
        pid: child.pid,
        height: cpuToHeight(child.cpu),
        width: 1.0,
        parentPid: root.pid,
      });
    });

    // 街区信息
    const typeKey = classifyProcess(root);
    const typeInfo = getTypeGroupInfo(typeKey);
    blockInfo.push({
      rootPid: root.pid,
      rootName: root.name,
      typeKey,
      typeName: typeInfo.name,
      x: bx,
      z: bz,
      minX: bx - blockRadius,
      maxX: bx + blockRadius,
      minZ: bz - blockRadius,
      maxZ: bz + blockRadius,
      radius: blockRadius,
      processCount: 1 + kids.length,
    });
  });

  // 4. 剩余进程（深度孙辈或孤儿）— 紧贴父进程或环绕城市边缘
  for (const p of filtered) {
    if (placed.has(p.pid)) continue;
    const parent = pidMap.get(p.ppid);
    if (parent && placed.has(parent.pid)) {
      const parentPos = result.find((r) => r.pid === parent.pid);
      if (parentPos) {
        const angle = hashSeed(p.pid) * Math.PI * 2;
        const cr = 1.0 + hashSeed(p.pid + 2) * 0.6;
        let cx = parentPos.x + Math.cos(angle) * cr;
        let cz = parentPos.z + Math.sin(angle) * cr;
        const avoided = avoidRoads(cx, cz, network);
        cx = avoided.x;
        cz = avoided.z;
        result.push({
          x: cx, y: 0, z: cz,
          pid: p.pid,
          height: cpuToHeight(p.cpu),
          width: 1.0,
          parentPid: parent.pid,
        });
        placed.add(p.pid);
        continue;
      }
    }
    // 孤儿进程：环绕城市边缘
    const angle = hashSeed(p.pid) * Math.PI * 2;
    const radius = 70 + hashSeed(p.pid + 3) * 4;
    let cx = Math.cos(angle) * radius;
    let cz = Math.sin(angle) * radius;
    const avoided = avoidRoads(cx, cz, network);
    cx = avoided.x;
    cz = avoided.z;
    result.push({
      x: cx, y: 0, z: cz,
      pid: p.pid,
      height: cpuToHeight(p.cpu),
      width: 1.0,
    });
    placed.add(p.pid);
  }

  // 5. 全局建筑间避让 + 道路避让（迭代 3 轮）
  const placedMap = new Map<number, BuildingPosition>();
  for (const pos of result) placedMap.set(pos.pid, pos);
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const pos of result) {
      // 建筑间避让
      const before1 = { x: pos.x, z: pos.z };
      const after1 = resolveOverlap(pos.x, pos.z, placedMap);
      pos.x = after1.x;
      pos.z = after1.z;
      // 道路避让（建筑绝不能在道路上）
      const before2 = { x: pos.x, z: pos.z };
      const after2 = avoidRoads(pos.x, pos.z, network);
      pos.x = after2.x;
      pos.z = after2.z;
      if (
        before1.x !== pos.x || before1.z !== pos.z ||
        before2.x !== pos.x || before2.z !== pos.z
      ) {
        placedMap.set(pos.pid, pos);
        moved = true;
      }
    }
    if (!moved) break;
  }

  return { positions: result, blocks: blockInfo };
}

// ============================================================================
// 兼容旧 API：保留 computePositions / computeTreePositions（不再使用）
// ============================================================================

export function computePositions(
  processes: ProcessInfo[],
  maxBuildings: number = 200,
): BuildingPosition[] {
  const sorted = [...processes].sort((a, b) => b.cpu - a.cpu).slice(0, maxBuildings);
  return sorted.map((p, i) => {
    const angle = (i / Math.max(sorted.length, 1)) * Math.PI * 2;
    const radius = Math.sqrt(i) * 1.5;
    return {
      x: Math.cos(angle) * radius,
      y: 0,
      z: Math.sin(angle) * radius,
      pid: p.pid,
      height: cpuToHeight(p.cpu),
    };
  });
}

export function computeTreePositions(
  processes: ProcessInfo[],
  maxBuildings: number = 200,
): BuildingPosition[] {
  const sorted = [...processes]
    .filter((p) => p.state !== "Zombie" || p.cpu > 1)
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, maxBuildings);

  const pidMap = new Map(sorted.map((p) => [p.pid, p]));
  const childrenMap = new Map<number, ProcessInfo[]>();
  for (const p of sorted) {
    const list = childrenMap.get(p.ppid) ?? [];
    list.push(p);
    childrenMap.set(p.ppid, list);
  }
  for (const list of childrenMap.values()) {
    list.sort((a, b) => b.cpu - a.cpu);
  }

  const positions: BuildingPosition[] = [];
  const placed = new Map<number, BuildingPosition>();

  const roots = sorted.filter((p) => p.ppid <= 1 || !pidMap.has(p.ppid));
  const rootCount = Math.max(roots.length, 1);

  roots.forEach((p, i) => {
    const angle = (i / rootCount) * Math.PI * 2;
    const radius = 1.2 + Math.sqrt(i) * 0.3;
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    ({ x, z } = resolveOverlap(x, z, placed));

    const pos: BuildingPosition = {
      x, y: 0, z,
      pid: p.pid,
      height: cpuToHeight(p.cpu),
      parentPid: p.ppid,
    };
    positions.push(pos);
  });

  const queue = roots.map((p) => p.pid);
  while (queue.length > 0) {
    const parentPid = queue.shift()!;
    const children = childrenMap.get(parentPid) ?? [];
    const parent = placed.get(parentPid);
    if (!parent) continue;

    const parentRadius = Math.sqrt(parent.x * parent.x + parent.z * parent.z);
    const parentAngle = Math.atan2(parent.z, parent.x);
    const total = Math.max(children.length, 1);
    const spread = Math.min(Math.PI, total * 0.45);

    children.forEach((child, i) => {
      if (placed.has(child.pid)) return;
      const childAngle = parentAngle - spread / 2 + (i + 0.5) * (spread / total);
      const childRadius = parentRadius + 1.2 + (child.cpu / 100) * 0.5;
      let x = Math.cos(childAngle) * childRadius;
      let z = Math.sin(childAngle) * childRadius;
      ({ x, z } = resolveOverlap(x, z, placed));
      const pos: BuildingPosition = { x, y: 0, z, pid: child.pid, height: cpuToHeight(child.cpu), parentPid };
      positions.push(pos);
      placed.set(child.pid, pos);
      queue.push(child.pid);
    });
  }

  for (const p of sorted) {
    if (placed.has(p.pid)) continue;
    const r1 = hashSeed(p.pid);
    const r2 = hashSeed(p.pid + 1);
    const angle = r1 * Math.PI * 2;
    const radius = 8 + r2 * 4;
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    ({ x, z } = resolveOverlap(x, z, placed));
    positions.push({ x, y: 0, z, pid: p.pid, height: cpuToHeight(p.cpu), parentPid: p.ppid });
  }

  return positions;
}
