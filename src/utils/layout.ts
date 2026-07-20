import type { ProcessInfo } from "./types";

// ============================================================================
// Procession 城市布局算法（v6，2026-07-20，进程树驱动道路系统）
//
// 核心范式：
//   1. 每个 root 进程 → 一条主干道（Major Road）
//      - 位置由 pid hash → 极坐标 (r, θ)，r ∈ [12, 60]，θ ∈ [0, 2π)
//      - 朝向 φ = pid hash ∈ [0, π)
//      - 长度 L = base(20) + children.length × 3，clamp [20, 50]
//   2. 邻近 root 之间 → 次干道（Minor Road）连接
//      - 每个 root 连最近的 2 个邻居，去重后约 1.5N 条次干道
//   3. 子进程 → 主干道两侧的街区建筑
//      - 沿主干道方向均匀分布，垂直方向偏移 ±(主干道半宽 + 安全距离)
//   4. 建筑避让所有道路（主干 + 次干）的影响带
//   5. 全局建筑间避让（resolveOverlap）
//
// 稳定性契约（不变）：
//   - computeProcessSignature 只用 pid 集合 → 同 pid 集合 → 同位置 + 同道路几何
//   - cpu 变化通过 useFrame 缓动 height 体现，不触发 positions/roads 重算
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
  typeName: string;            // 显示名
  x: number;
  z: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  radius: number;              // 街区半径（包络所有子进程）
  processCount: number;
}

// ============================================================================
// 进程树道路系统类型
// ============================================================================

/**
 * 主干道 — 每个 root 进程对应一条主干道。
 *
 * 主干道是一条以 (cx, cz) 为中点、长度 length、宽度 width、绕 Y 轴朝向 rotY 的矩形道路。
 * 道路沿 rotY 方向延伸（局部 +X = 道路方向，局部 +Z = 道路宽度方向）。
 */
export interface MajorRoad {
  rootPid: number;
  rootName: string;
  cx: number;            // 中点 X
  cz: number;            // 中点 Z
  rotY: number;          // 朝向（绕 Y 轴，0 = 沿 +X 方向）
  length: number;        // 道路长度
  width: number;         // 道路宽度
}

/**
 * 次干道 — 连接两个相邻 root 主干道的次干道。
 *
 * 次干道是一条以 (midX, midZ) 为中点、长度 length、宽度 width、朝向 rotY 的矩形道路。
 * 端点 (x1, z1) → (x2, z2) 用于精确碰撞检测和避让计算。
 */
export interface MinorRoad {
  fromRootPid: number;
  toRootPid: number;
  x1: number;            // 端点 1 X
  z1: number;            // 端点 1 Z
  x2: number;            // 端点 2 X
  z2: number;            // 端点 2 Z
  midX: number;          // 中点 X
  midZ: number;          // 中点 Z
  rotY: number;          // 朝向
  length: number;        // 长度
  width: number;         // 宽度
}

/**
 * 道路避让带（用于建筑避让计算）。
 * 统一表示为矩形带：中心 (cx, cz)，朝向 rotY，半长 halfLength，半宽 halfWidth。
 */
export interface AvoidanceZone {
  cx: number;
  cz: number;
  rotY: number;
  halfLength: number;
  halfWidth: number;
}

/**
 * 进程树道路网络：主干道 + 次干道 + 避让带。
 */
export interface ProcessTreeRoadNetwork {
  majorRoads: MajorRoad[];
  minorRoads: MinorRoad[];
  avoidanceZones: AvoidanceZone[];
}

/**
 * 布局结果：建筑位置 + 街区信息 + 道路网络。
 */
export interface LayoutResult {
  positions: BuildingPosition[];
  blocks: BlockInfo[];
  roads: ProcessTreeRoadNetwork;
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
// 位置签名 — 只用 pid 集合（顺序无关），保证 cpu 变化不影响 positions/roads
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
// 哈希辅助 — 用于 pid-based 位置/朝向/长度计算（不用 name/cpu）
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
// 道路常量
// ============================================================================

/** 主干道宽度（双向 2 车道 + 中央虚线） */
const MAJOR_ROAD_WIDTH = 4.0;
/** 次干道宽度（单向 1 车道） */
const MINOR_ROAD_WIDTH = 2.0;
/** 主干道最小长度（clamp 下界） */
const MAJOR_ROAD_MIN_LENGTH = 20;
/** 主干道最大长度（clamp 上界） */
const MAJOR_ROAD_MAX_LENGTH = 50;
/** 主干道基础长度（无子进程时） */
const MAJOR_ROAD_BASE_LENGTH = 20;
/** 每个子进程增加的长度 */
const MAJOR_ROAD_LENGTH_PER_CHILD = 3;

/** 主干道中点最小间距（两个 root 主干道中点不能太近，避免重叠） */
const MAJOR_ROAD_MIN_SPACING = 18;

/** root 极坐标半径范围 */
const ROOT_RADIUS_MIN = 12;
const ROOT_RADIUS_MAX = 60;

/** 避让带：建筑中心到道路边缘的最小距离 */
const ROAD_SAFETY_MARGIN = 1.5;

/** 街区/建筑间最小距离（半径之和，加上安全间隙） */
const MIN_RADIUS = 2.2;

/** 每个 root 最多连接的邻居数（次干道生成） */
const MINOR_ROAD_NEIGHBORS_PER_ROOT = 2;

// ============================================================================
// 主干道生成 — 每个 root 一条主干道
// ============================================================================

interface RootContext {
  process: ProcessInfo;
  childrenCount: number;
}

/**
 * 生成主干道列表。
 *
 * 算法：
 *   1. 每个 root 用 pid hash → 极坐标 (r, θ) 决定主干道中点
 *   2. 朝向 φ = pid hash ∈ [0, π)
 *   3. 长度 L = clamp(BASE + childrenCount * PER_CHILD, MIN, MAX)
 *   4. 中点避让：检测与已放置主干道中点距离 < MIN_SPACING，则增大 r 重新放置
 *
 * 稳定性：同 pid 集合 → 同主干道几何（hashSeed 是纯函数）。
 */
function planMajorRoads(roots: RootContext[]): MajorRoad[] {
  const result: MajorRoad[] = [];
  const placedCenters: Array<{ cx: number; cz: number }> = [];

  for (const ctx of roots) {
    const pid = ctx.process.pid;
    const length = Math.min(
      MAJOR_ROAD_MAX_LENGTH,
      Math.max(MAJOR_ROAD_MIN_LENGTH, MAJOR_ROAD_BASE_LENGTH + ctx.childrenCount * MAJOR_ROAD_LENGTH_PER_CHILD),
    );

    // 初始候选位置
    const r0 = ROOT_RADIUS_MIN + hashSeed(pid) * (ROOT_RADIUS_MAX - ROOT_RADIUS_MIN);
    const theta0 = hashSeed(pid + 1) * Math.PI * 2;
    let cx = r0 * Math.cos(theta0);
    let cz = r0 * Math.sin(theta0);

    // 避让已放置的主干道中点
    let attempts = 0;
    while (attempts < 30) {
      let conflict = false;
      for (const placed of placedCenters) {
        const dx = cx - placed.cx;
        const dz = cz - placed.cz;
        if (dx * dx + dz * dz < MAJOR_ROAD_MIN_SPACING * MAJOR_ROAD_MIN_SPACING) {
          conflict = true;
          break;
        }
      }
      if (!conflict) break;
      // 增大半径 + 重新生成角度（仍由 pid hash + attempts 决定，保持稳定）
      const r = r0 + 5 + attempts * 4;
      const theta = hashSeed(pid + 100 + attempts) * Math.PI * 2;
      cx = r * Math.cos(theta);
      cz = r * Math.sin(theta);
      attempts++;
    }

    placedCenters.push({ cx, cz });

    // 朝向：[0, π)，因为线段无方向性
    const rotY = hashSeed(pid + 2) * Math.PI;

    result.push({
      rootPid: pid,
      rootName: ctx.process.name,
      cx,
      cz,
      rotY,
      length,
      width: MAJOR_ROAD_WIDTH,
    });
  }

  return result;
}

// ============================================================================
// 次干道生成 — 连接相邻 root 主干道端点
// ============================================================================

/**
 * 为每个 root 找最近的 N 个邻居，画次干道连接两者的主干道端点。
 *
 * 连接策略：
 *   - 端点 1 = from root 主干道 +length/2 端
 *   - 端点 2 = to root 主干道 -length/2 端
 *   - 这样次干道接在主干道的两端，不会从中间穿出
 *
 * 去重：用 sorted "pid1-pid2" 字符串保证两个 root 之间最多一条次干道。
 */
function planMinorRoads(majorRoads: MajorRoad[]): MinorRoad[] {
  const result: MinorRoad[] = [];
  const added = new Set<string>();

  for (const road of majorRoads) {
    // 找最近的 N 个其他 root 主干道中点
    const others = majorRoads
      .filter((r) => r.rootPid !== road.rootPid)
      .map((r) => ({
        road: r,
        distSq: (r.cx - road.cx) ** 2 + (r.cz - road.cz) ** 2,
      }))
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, MINOR_ROAD_NEIGHBORS_PER_ROOT);

    for (const other of others) {
      // 用 sorted pid 对作为 key，保证无向去重
      const minPid = Math.min(road.rootPid, other.road.rootPid);
      const maxPid = Math.max(road.rootPid, other.road.rootPid);
      const key = `${minPid}-${maxPid}`;
      if (added.has(key)) continue;
      added.add(key);

      // from root 主干道 +length/2 端
      const fromEndX = road.cx + Math.cos(road.rotY) * road.length / 2;
      const fromEndZ = road.cz + Math.sin(road.rotY) * road.length / 2;
      // to root 主干道 -length/2 端
      const toEndX = other.road.cx - Math.cos(other.road.rotY) * other.road.length / 2;
      const toEndZ = other.road.cz - Math.sin(other.road.rotY) * other.road.length / 2;

      const dx = toEndX - fromEndX;
      const dz = toEndZ - fromEndZ;
      const length = Math.sqrt(dx * dx + dz * dz);
      // 跳过过短的次干道（端点几乎重合）
      if (length < 1) continue;
      const rotY = Math.atan2(dz, dx);
      const midX = (fromEndX + toEndX) / 2;
      const midZ = (fromEndZ + toEndZ) / 2;

      result.push({
        fromRootPid: road.rootPid,
        toRootPid: other.road.rootPid,
        x1: fromEndX,
        z1: fromEndZ,
        x2: toEndX,
        z2: toEndZ,
        midX,
        midZ,
        rotY,
        length,
        width: MINOR_ROAD_WIDTH,
      });
    }
  }

  return result;
}

// ============================================================================
// 道路避让带生成 — 用于建筑避让计算
// ============================================================================

function buildAvoidanceZones(
  majorRoads: MajorRoad[],
  minorRoads: MinorRoad[],
): AvoidanceZone[] {
  const zones: AvoidanceZone[] = [];

  for (const road of majorRoads) {
    zones.push({
      cx: road.cx,
      cz: road.cz,
      rotY: road.rotY,
      halfLength: road.length / 2 + ROAD_SAFETY_MARGIN,
      halfWidth: road.width / 2 + ROAD_SAFETY_MARGIN,
    });
  }

  for (const road of minorRoads) {
    zones.push({
      cx: road.midX,
      cz: road.midZ,
      rotY: road.rotY,
      halfLength: road.length / 2 + ROAD_SAFETY_MARGIN,
      halfWidth: road.width / 2 + ROAD_SAFETY_MARGIN,
    });
  }

  return zones;
}

/**
 * 计算进程树道路网络：主干道 + 次干道 + 避让带。
 *
 * 输入 processes 用于识别 root + 子进程数，但道路几何只由 pid 决定（稳定）。
 */
export function computeProcessTreeRoads(processes: ProcessInfo[]): ProcessTreeRoadNetwork {
  const pidMap = new Map<number, ProcessInfo>();
  for (const p of processes) pidMap.set(p.pid, p);

  const childrenMap = new Map<number, ProcessInfo[]>();
  for (const p of processes) {
    const list = childrenMap.get(p.ppid) ?? [];
    list.push(p);
    childrenMap.set(p.ppid, list);
  }

  // roots: ppid=0 (Windows idle) 或 ppid 不在 pidMap 中 (launchd pid=1 不在 snapshot 中也算 root)
  // 严格避免把 ppid=1 且 pidMap 含 pid=1 的进程误判为 root
  const roots: RootContext[] = processes
    .filter((p) => p.ppid === 0 || !pidMap.has(p.ppid))
    .sort((a, b) => a.pid - b.pid)
    .map((p) => ({
      process: p,
      childrenCount: (childrenMap.get(p.pid) ?? []).length,
    }));

  const majorRoads = planMajorRoads(roots);
  const minorRoads = planMinorRoads(majorRoads);
  const avoidanceZones = buildAvoidanceZones(majorRoads, minorRoads);

  return { majorRoads, minorRoads, avoidanceZones };
}

// ============================================================================
// 道路避让 — 把 (x, z) 推离所有道路影响带
// ============================================================================

function avoidRoads(
  x: number,
  z: number,
  zones: AvoidanceZone[],
): { x: number; z: number } {
  let cx = x;
  let cz = z;

  for (const zone of zones) {
    // 把 (cx, cz) 变换到道路本地坐标系
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
        // 沿 Z 方向推开（垂直于道路方向，把建筑推到道路两侧）
        newLocalZ = localZ >= 0 ? zone.halfWidth : -zone.halfWidth;
      } else {
        // 沿 X 方向推开（道路方向，把建筑推到道路端点外）
        newLocalX = localX >= 0 ? zone.halfLength : -zone.halfLength;
      }
      // 变换回世界坐标
      const cos2 = Math.cos(zone.rotY);
      const sin2 = Math.sin(zone.rotY);
      cx = zone.cx + newLocalX * cos2 - newLocalZ * sin2;
      cz = zone.cz + newLocalX * sin2 + newLocalZ * cos2;
    }
  }

  return { x: cx, z: cz };
}

// ============================================================================
// 建筑间避让 — 两个建筑中心最小间距
// ============================================================================

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
// 街区位置规划 — 子进程沿主干道两侧分布
// ============================================================================

/**
 * 为每个 root + 其子进程规划建筑位置。
 *
 * 算法：
 *   - root 建筑 = 主干道中点 (cx, cz)，避让道路
 *   - 子进程沿主干道方向均匀分布，垂直方向偏移 ±(MAJOR_ROAD_WIDTH/2 + 安全距离)
 *     - 沿道路方向：t = (ci + 0.5) / childrenCount，along = (t - 0.5) * length
 *     - 垂直方向：alternating ±(MAJOR_ROAD_WIDTH/2 + 3.5)
 *   - 子进程位置也要避让道路（防止落在其他 root 主干道或次干道上）
 *
 * 返回 Map<pid, {x, z}>，包含 root + 所有直接子进程。
 */
function planBlockPositions(
  majorRoads: MajorRoad[],
  childrenMap: Map<number, ProcessInfo[]>,
  pidMap: Map<number, ProcessInfo>,
  zones: AvoidanceZone[],
): Map<number, { x: number; z: number }> {
  const result = new Map<number, { x: number; z: number }>();

  for (const road of majorRoads) {
    // root 建筑放在主干道中点
    let rx = road.cx;
    let rz = road.cz;
    // root 也要避让（虽然主干道中点不会落在自己的影响带，但可能落在其他 root 主干道或次干道上）
    const rootAvoided = avoidRoads(rx, rz, zones);
    rx = rootAvoided.x;
    rz = rootAvoided.z;
    result.set(road.rootPid, { x: rx, z: rz });

    const kids = (childrenMap.get(road.rootPid) ?? [])
      .filter((k) => pidMap.has(k.pid))
      .sort((a, b) => a.pid - b.pid);
    const childCount = kids.length;

    kids.forEach((child, ci) => {
      // 沿道路方向均匀分布
      const t = childCount > 0 ? (ci + 0.5) / childCount : 0.5;
      const along = (t - 0.5) * road.length;
      // 垂直方向：alternating ±(半宽 + 安全距离)
      const perp = (ci % 2 === 0 ? 1 : -1) * (road.width / 2 + 3.5);

      const cos = Math.cos(road.rotY);
      const sin = Math.sin(road.rotY);
      // 道路局部 +X = 道路方向，+Z = 垂直方向
      let cx = road.cx + cos * along - sin * perp;
      let cz = road.cz + sin * along + cos * perp;

      // 子进程位置抖动（基于 pid，稳定）
      cx += (hashSeed(child.pid) - 0.5) * 0.4;
      cz += (hashSeed(child.pid + 1) - 0.5) * 0.4;

      // 避让所有道路影响带
      const avoided = avoidRoads(cx, cz, zones);
      cx = avoided.x;
      cz = avoided.z;

      result.set(child.pid, { x: cx, z: cz });
    });
  }

  return result;
}

// ============================================================================
// 主入口：computeGridPositions
// ============================================================================

export function computeGridPositions(
  processes: ProcessInfo[],
  maxBuildings: number = 200,
): LayoutResult {
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

  const roots = filtered
    .filter((p) => p.ppid === 0 || !pidMap.has(p.ppid))
    .sort((a, b) => a.pid - b.pid);

  // 1. 进程树道路网络（主干道 + 次干道 + 避让带）
  const rootCtx: RootContext[] = roots.map((p) => ({
    process: p,
    childrenCount: (childrenMap.get(p.pid) ?? []).length,
  }));
  const majorRoads = planMajorRoads(rootCtx);
  const minorRoads = planMinorRoads(majorRoads);
  const avoidanceZones = buildAvoidanceZones(majorRoads, minorRoads);
  const roads: ProcessTreeRoadNetwork = { majorRoads, minorRoads, avoidanceZones };

  // 2. 街区位置规划（root + 直接子进程）
  const blockPositions = planBlockPositions(majorRoads, childrenMap, pidMap, avoidanceZones);

  const result: BuildingPosition[] = [];
  const blockInfo: BlockInfo[] = [];
  const placed = new Set<number>();

  // 3. 每个 root + 子进程 = 一个街区
  roots.forEach((root) => {
    const center = blockPositions.get(root.pid);
    if (!center) return;
    let bx = center.x;
    let bz = center.z;

    const kids = (childrenMap.get(root.pid) ?? []).filter((k) => pidMap.has(k.pid));
    // 街区半径 = 容纳所有子进程的最小半径
    const childRadius = 2.4 + (kids.length > 4 ? 1.2 : 0.7);
    const blockRadius = childRadius + 1.5; // 给子进程外围留安全区

    result.push({
      x: bx, y: 0, z: bz,
      pid: root.pid,
      height: cpuToHeight(root.cpu),
      width: 2.0,
      childCount: kids.length,
    });
    placed.add(root.pid);

    // 子进程位置（已由 planBlockPositions 计算）
    kids.forEach((child) => {
      if (placed.has(child.pid)) return;
      placed.add(child.pid);

      const childPos = blockPositions.get(child.pid);
      if (!childPos) return;
      let cx = childPos.x;
      let cz = childPos.z;

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
        const avoided = avoidRoads(cx, cz, avoidanceZones);
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
    const radius = 65 + hashSeed(p.pid + 3) * 8;
    let cx = Math.cos(angle) * radius;
    let cz = Math.sin(angle) * radius;
    const avoided = avoidRoads(cx, cz, avoidanceZones);
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
      const after2 = avoidRoads(pos.x, pos.z, avoidanceZones);
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

  return { positions: result, blocks: blockInfo, roads };
}
