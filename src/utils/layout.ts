import type { ProcessInfo } from "./types";

// ============================================================================
// Procession 城市布局算法（v7，2026-07-20，进程树驱动道路系统 + L 形连贯路网）
//
// 核心范式：
//   1. 每个 root 进程 → 一条主干道（Major Road）
//      - 位置由 pid hash → 极坐标 (r, θ)，r ∈ [12, 60]，θ ∈ [0, 2π)
//      - 朝向 φ = pid hash ∈ [0, π)
//      - 长度 L = base(20) + children.length × 3，clamp [20, 50]
//   2. 主干道两端 → T 字路口（road-intersection-3 GLB）
//      - 作为道路"收口"，避免主干道端点突兀地悬空
//      - T 字路口朝向与主干道一致，封口朝外
//   3. 邻近 root 之间 → L 形次干道（Minor Road）连接
//      - 每个 root 连最近的 2 个邻居，去重后约 1.5N 条次干道
//      - L 形：2 段直线 + 1 个 90° 弯道（road-curve GLB）
//      - 拐角方向强制"左转 90°"（与 road-curve GLB 几何对齐）
//   4. 子进程 → 主干道两侧的街区建筑
//      - 沿主干道方向均匀分布，垂直方向偏移 ±(主干道半宽 + 安全距离)
//   5. 建筑避让所有道路（主干 + 次干 + 弯道 + 路口）的影响带
//   6. 全局建筑间避让（resolveOverlap）
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
 * 直线段 — 用于 MinorRoad 的 L 形 2 段，也可独立表示直连次干道。
 * 局部 +X = 道路方向，+Z = 宽度方向（与 MajorRoad 一致）。
 */
export interface RoadSegment {
  cx: number;            // 中点 X
  cz: number;            // 中点 Z
  rotY: number;          // 朝向（0 = +X 方向，π/2 = +Z 方向）
  length: number;        // 长度
  width: number;         // 宽度
}

/**
 * 90° 弯道 — 对应 road-curve GLB（内 R=4、外 R=8、中心 R=6）。
 *
 * 几何说明：
 *   - 局部坐标系原点 = 弯道圆心
 *   - 扇区从 θ=0（+X 轴）扫到 θ=π/2（+Z 轴），位于第一象限
 *   - 入口端：+X 方向（局部 (8, 0) 外缘、(6, 0) 中线）
 *   - 出口端：+Z 方向（局部 (0, 8) 外缘、(0, 6) 中线）
 *   - 这是"左转 90°"弯（从 +X 转到 +Z）
 *
 * rotY 朝向（4 种左转方向）：
 *   - rotY=0:    入口 +X，出口 +Z
 *   - rotY=π/2:  入口 +Z，出口 -X
 *   - rotY=π:    入口 -X，出口 -Z
 *   - rotY=-π/2: 入口 -Z，出口 +X
 */
export interface RoadCurve {
  cx: number;            // 圆心 X（局部原点对应世界位置）
  cz: number;            // 圆心 Z
  rotY: number;          // 朝向（决定入口/出口方向）
  radius: number;        // 中心线半径（=6）
  width: number;         // 道路宽度
}

/**
 * 路口 — T 字 / 十字，对应 road-intersection-3 / road-intersection-4 GLB（8×8 广场）。
 *
 * road-intersection-3 几何：8×8 中心广场，3 边有斑马线（北/东/西），1 边（南）无斑马线
 * 即"封口"在 -Z 方向（局部）。rotY=0 时封口朝 -Z。
 */
export interface RoadIntersection {
  cx: number;            // 中心 X
  cz: number;            // 中心 Z
  rotY: number;          // 朝向（T 字路口的封口方向 = rotY - π/2，即 -Z 旋转后）
  type: "t-junction" | "cross";
  width: number;         // 道路宽度（与主干道一致）
}

/**
 * 次干道 — 连接两个相邻 root 主干道的 L 形路径。
 *
 * L 形由 2 段直线（segments[0/1]）+ 1 个 90° 弯道（curve）组成。
 * 当两个端点几乎共线（|dx| 或 |dz| 极小）时退化为直线（segments 仅 1 段，curve=null）。
 *
 * 拐角方向强制"左转 90°"以匹配 road-curve GLB 几何（无法 mirror）。
 *
 * 兼容字段：保留 x1/z1/x2/z2/midX/midZ/rotY/length/width 用于旧测试。
 */
export interface MinorRoad {
  fromRootPid: number;
  toRootPid: number;
  segments: RoadSegment[];   // L 形 = 2 段；直连 = 1 段
  curve: RoadCurve | null;   // L 形才有，直连为 null
  // 兼容字段（旧测试使用，等于 segments[0] 起点 / segments[last] 终点）
  x1: number; z1: number; x2: number; z2: number;
  midX: number; midZ: number; rotY: number; length: number; width: number;
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
 * 进程树道路网络：主干道 + 次干道 + 路口 + 弯道 + 避让带。
 */
export interface ProcessTreeRoadNetwork {
  majorRoads: MajorRoad[];
  minorRoads: MinorRoad[];
  intersections: RoadIntersection[];   // 主干道端点处的 T 字路口
  curves: RoadCurve[];                  // L 形次干道的 90° 弯道
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

/** road-curve GLB 中心线半径（与 build-assets.mjs 同步：内 R=4、外 R=8、中心 R=6） */
const ROAD_CURVE_RADIUS = 6;
/** road-curve GLB 外缘半径 */
const ROAD_CURVE_OUTER = 8;
/** road-intersection-3 GLB 广场尺寸（8×8） */
const INTERSECTION_SIZE = 8;
/** road-curve 退化为直线时的最小长边阈值（curve 占据 6 单位 + 0.5 裕量） */
const CURVE_CLEARANCE = ROAD_CURVE_RADIUS + 0.5;

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
// 次干道生成 — 连接相邻 root 主干道端点（L 形路径）
// ============================================================================

/**
 * 构造一条直线段 RoadSegment（局部 +X = 道路方向）。
 * 给定起点 (sx, sz) 和终点 (ex, ez)，自动计算中点、朝向、长度。
 */
function makeSegment(
  sx: number, sz: number,
  ex: number, ez: number,
  width: number,
): RoadSegment | null {
  const dx = ex - sx;
  const dz = ez - sz;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 0.5) return null;
  return {
    cx: (sx + ex) / 2,
    cz: (sz + ez) / 2,
    rotY: Math.atan2(dz, dx),
    length,
    width,
  };
}

/**
 * 计算一条 L 形次干道（2 段直线 + 1 个 90° 弯道）。
 *
 * road-curve GLB 几何（关键）：
 *   - 圆心在原点，扇区从 +X 扫到 +Z（rotY=0 时，90° 左转）
 *   - 入口端中线点 (6, 0)（局部），出口端中线点 (0, 6)（局部）
 *   - 入口方向 = +X（车从 -X 进入弯道），出口方向 = +Z（车朝 +Z 离开弯道）
 *   - curve 占据 6×6 方形空间（圆心到入口/出口中线点都是 6 单位）
 *
 * 4 种左转方向 → curve rotY（基于符号组合）：
 *   - dx>0, dz>0: 方案 A（先 +X 后 +Z），curve rotY=0
 *     · 圆心 (cx_c, cz_c) = (toX, fromZ)
 *     · seg1 终点 = 入口中线点 = (cx_c + 6, cz_c) = (toX+6, fromZ)
 *     · seg2 起点 = 出口中线点 = (cx_c, cz_c + 6) = (toX, fromZ+6)
 *     · seg1: (fromX, fromZ) → (toX+6, fromZ)，沿 +X，长度 dx+6
 *     · seg2: (toX, fromZ+6) → (toX, toZ)，沿 +Z，长度 dz-6  （要求 dz>6）
 *   - dx<0, dz<0: 方案 A（先 -X 后 -Z），curve rotY=π
 *     · 圆心 (toX, fromZ)，seg1 终点 (toX-6, fromZ)，seg2 起点 (toX, fromZ-6)
 *     · seg1: (fromX, fromZ) → (toX-6, fromZ)，沿 -X，长度 -dx+6
 *     · seg2: (toX, fromZ-6) → (toX, toZ)，沿 -Z，长度 -dz-6  （要求 -dz>6）
 *   - dx<0, dz>0: 方案 B（先 +Z 后 -X），curve rotY=π/2
 *     · 圆心 (fromX, toZ)，seg1 终点 (fromX, toZ+6)，seg2 起点 (fromX-6, toZ)
 *     · seg1: (fromX, fromZ) → (fromX, toZ+6)，沿 +Z，长度 dz+6
 *     · seg2: (fromX-6, toZ) → (toX, toZ)，沿 -X，长度 -dx-6  （要求 -dx>6）
 *   - dx>0, dz<0: 方案 B（先 -Z 后 +X），curve rotY=-π/2
 *     · 圆心 (fromX, toZ)，seg1 终点 (fromX, toZ-6)，seg2 起点 (fromX+6, toZ)
 *     · seg1: (fromX, fromZ) → (fromX, toZ-6)，沿 -Z，长度 -dz+6
 *     · seg2: (fromX+6, toZ) → (toX, toZ)，沿 +X，长度 dx-6  （要求 dx>6）
 *
 * 退化条件：对应方向所需的"长边"长度不足 6+ε → 退化为直线（segments 1 段，curve=null）。
 */
function buildLShapeMinor(
  fromX: number, fromZ: number,
  toX: number, toZ: number,
  width: number,
  fromPid: number, toPid: number,
): MinorRoad {
  const dx = toX - fromX;
  const dz = toZ - fromZ;

  let curveRotY: number;
  let cx_c: number, cz_c: number;
  let seg1EndX: number, seg1EndZ: number;
  let seg2StartX: number, seg2StartZ: number;
  let validLShape = true;

  if (dx > 0 && dz > 0) {
    // 方案 A: 先 +X 后 +Z，要求 dz > 6
    if (dz < CURVE_CLEARANCE) { validLShape = false; }
    curveRotY = 0;
    cx_c = toX; cz_c = fromZ;
    seg1EndX = cx_c + ROAD_CURVE_RADIUS; seg1EndZ = cz_c;
    seg2StartX = cx_c; seg2StartZ = cz_c + ROAD_CURVE_RADIUS;
  } else if (dx < 0 && dz < 0) {
    // 方案 A: 先 -X 后 -Z，要求 -dz > 6
    if (-dz < CURVE_CLEARANCE) { validLShape = false; }
    curveRotY = Math.PI;
    cx_c = toX; cz_c = fromZ;
    seg1EndX = cx_c - ROAD_CURVE_RADIUS; seg1EndZ = cz_c;
    seg2StartX = cx_c; seg2StartZ = cz_c - ROAD_CURVE_RADIUS;
  } else if (dx < 0 && dz > 0) {
    // 方案 B: 先 +Z 后 -X，要求 -dx > 6
    if (-dx < CURVE_CLEARANCE) { validLShape = false; }
    curveRotY = Math.PI / 2;
    cx_c = fromX; cz_c = toZ;
    seg1EndX = cx_c; seg1EndZ = cz_c + ROAD_CURVE_RADIUS;
    seg2StartX = cx_c - ROAD_CURVE_RADIUS; seg2StartZ = cz_c;
  } else if (dx > 0 && dz < 0) {
    // 方案 B: 先 -Z 后 +X，要求 dx > 6
    if (dx < CURVE_CLEARANCE) { validLShape = false; }
    curveRotY = -Math.PI / 2;
    cx_c = fromX; cz_c = toZ;
    seg1EndX = cx_c; seg1EndZ = cz_c - ROAD_CURVE_RADIUS;
    seg2StartX = cx_c + ROAD_CURVE_RADIUS; seg2StartZ = cz_c;
  } else {
    // dx 或 dz 为 0
    validLShape = false;
    curveRotY = 0; cx_c = 0; cz_c = 0;
    seg1EndX = 0; seg1EndZ = 0; seg2StartX = 0; seg2StartZ = 0;
  }

  // 退化：长边不足，退化为直线
  if (!validLShape) {
    const seg = makeSegment(fromX, fromZ, toX, toZ, width);
    const segments = seg ? [seg] : [];
    const totalLen = seg ? seg.length : 0;
    return {
      fromRootPid: fromPid,
      toRootPid: toPid,
      segments,
      curve: null,
      x1: fromX, z1: fromZ, x2: toX, z2: toZ,
      midX: (fromX + toX) / 2, midZ: (fromZ + toZ) / 2,
      rotY: seg ? seg.rotY : 0,
      length: totalLen,
      width,
    };
  }

  const seg1 = makeSegment(fromX, fromZ, seg1EndX, seg1EndZ, width);
  const seg2 = makeSegment(seg2StartX, seg2StartZ, toX, toZ, width);
  const segments: RoadSegment[] = [];
  if (seg1) segments.push(seg1);
  if (seg2) segments.push(seg2);

  const curve: RoadCurve = {
    cx: cx_c,
    cz: cz_c,
    rotY: curveRotY,
    radius: ROAD_CURVE_RADIUS,
    width,
  };

  const totalLen = (seg1?.length ?? 0) + (seg2?.length ?? 0) + (Math.PI * ROAD_CURVE_RADIUS / 2);

  return {
    fromRootPid: fromPid,
    toRootPid: toPid,
    segments,
    curve,
    x1: fromX, z1: fromZ, x2: toX, z2: toZ,
    midX: (fromX + toX) / 2, midZ: (fromZ + toZ) / 2,
    rotY: seg1?.rotY ?? 0,
    length: totalLen,
    width,
  };
}

/**
 * 为每个 root 找最近的 N 个邻居，画 L 形次干道连接两者的 T 字路口侧出口。
 *
 * 端点选取（关键修正）：
 *   - from root 用 +length/2 端 T 字路口的 +X 局部出口（主干道左侧）
 *   - to root 用 -length/2 端 T 字路口的 +X 局部出口（主干道右侧）
 *
 * 端点位置计算：
 *   - T 字路口 +length/2 端中心 = road.cx + cos(road.rotY) * L/2
 *   - +X 局部出口方向（world）= 主干道左侧 = (-sin(road.rotY), cos(road.rotY))
 *   - 出口位置 = T 字路口中心 + 4 * (-sin, cos) （4 = INTERSECTION_SIZE/2，广场半宽）
 *
 * 去重：用 sorted "pid1-pid2" 字符串保证两个 root 之间最多一条次干道。
 */
function planMinorRoads(majorRoads: MajorRoad[]): MinorRoad[] {
  const result: MinorRoad[] = [];
  const added = new Set<string>();
  const HALF_INTER = INTERSECTION_SIZE / 2;

  // 为每个 root 计算两个 T 字路口侧出口位置
  // plusEnd = +length/2 端 T 字路口的 +X 局部出口（主干道左侧）
  // minusEnd = -length/2 端 T 字路口的 +X 局部出口（主干道右侧）
  const endpoints = new Map<number, { plusX: number; plusZ: number; minusX: number; minusZ: number }>();
  for (const road of majorRoads) {
    const cos = Math.cos(road.rotY);
    const sin = Math.sin(road.rotY);
    const half = road.length / 2;
    // +length/2 端 T 字路口中心
    const plusCenterX = road.cx + cos * half;
    const plusCenterZ = road.cz + sin * half;
    // +X 局部出口（主干道左侧方向 (-sin, cos)）
    const plusExitX = plusCenterX + HALF_INTER * (-sin);
    const plusExitZ = plusCenterZ + HALF_INTER * cos;
    // -length/2 端 T 字路口中心
    const minusCenterX = road.cx - cos * half;
    const minusCenterZ = road.cz - sin * half;
    // +X 局部出口（主干道右侧方向 (sin, -cos)）
    const minusExitX = minusCenterX + HALF_INTER * sin;
    const minusExitZ = minusCenterZ + HALF_INTER * (-cos);
    endpoints.set(road.rootPid, {
      plusX: plusExitX, plusZ: plusExitZ,
      minusX: minusExitX, minusZ: minusExitZ,
    });
  }

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

      const fromEnd = endpoints.get(road.rootPid);
      const toEnd = endpoints.get(other.road.rootPid);
      if (!fromEnd || !toEnd) continue;

      // from root 用 +length/2 端，to root 用 -length/2 端
      const fromX = fromEnd.plusX;
      const fromZ = fromEnd.plusZ;
      const toX = toEnd.minusX;
      const toZ = toEnd.minusZ;

      // 跳过过近的连接
      const dist = Math.sqrt((toX - fromX) ** 2 + (toZ - fromZ) ** 2);
      if (dist < 2) continue;

      result.push(buildLShapeMinor(
        fromX, fromZ,
        toX, toZ,
        MINOR_ROAD_WIDTH,
        road.rootPid, other.road.rootPid,
      ));
    }
  }

  return result;
}

// ============================================================================
// 路口生成 — 主干道两端的 T 字路口收口
// ============================================================================

/**
 * 在每条主干道的两端各放一个 T 字路口（road-intersection-3 GLB）。
 *
 * T 字路口几何（rotY=0 时）：8×8 广场，3 个出口在 +X/-X/+Z（局部），封口在 -Z（局部）。
 *
 * 朝向规则（关键）：
 *   - T 字路口 rotY = road.rotY + π/2（+length/2 端）/ road.rotY - π/2（-length/2 端）
 *   - 这样封口（-Z 局部）旋转后朝 ±主干道方向（朝外侧，远离主干道中点）
 *   - 主干道接入方向 = +Z 局部出口（朝主干道反方向，即朝主干道中点）
 *   - 2 个侧出口（+X 局部 = 主干道左侧，-X 局部 = 主干道右侧）作为次干道接入点
 *
 * 数学验证（+length/2 端，rotY=road.rotY+π/2）：
 *   - 封口 -Z 局部 → 世界 (sin(road.rotY+π/2), -cos(road.rotY+π/2)) = (cos(road.rotY), sin(road.rotY)) = +主干道方向 ✓
 *   - 主干道接入方向 = -主干道方向 = (-cos, -sin)
 *   - +Z 局部出口世界方向 = (-sin(road.rotY+π/2), cos(road.rotY+π/2)) = (-cos, -sin) ✓ 主干道接入
 *   - +X 局部出口世界方向 = (cos(road.rotY+π/2), sin(road.rotY+π/2)) = (-sin, cos) = 主干道左侧
 *   - -X 局部出口世界方向 = (sin, -cos) = 主干道右侧
 */
function planIntersections(majorRoads: MajorRoad[]): RoadIntersection[] {
  const result: RoadIntersection[] = [];

  for (const road of majorRoads) {
    const half = road.length / 2;
    const cos = Math.cos(road.rotY);
    const sin = Math.sin(road.rotY);

    // +length/2 端：封口朝 +主干道方向（外侧），主干道接入 +Z 局部出口
    result.push({
      cx: road.cx + cos * half,
      cz: road.cz + sin * half,
      rotY: road.rotY + Math.PI / 2,
      type: "t-junction",
      width: road.width,
    });
    // -length/2 端：封口朝 -主干道方向（外侧），主干道接入 +Z 局部出口
    result.push({
      cx: road.cx - cos * half,
      cz: road.cz - sin * half,
      rotY: road.rotY - Math.PI / 2,
      type: "t-junction",
      width: road.width,
    });
  }

  return result;
}

// ============================================================================
// 道路避让带生成 — 用于建筑避让计算
// ============================================================================

function buildAvoidanceZones(
  majorRoads: MajorRoad[],
  minorRoads: MinorRoad[],
  intersections: RoadIntersection[],
  curves: RoadCurve[],
): AvoidanceZone[] {
  const zones: AvoidanceZone[] = [];

  // 主干道：矩形避让带
  for (const road of majorRoads) {
    zones.push({
      cx: road.cx,
      cz: road.cz,
      rotY: road.rotY,
      halfLength: road.length / 2 + ROAD_SAFETY_MARGIN,
      halfWidth: road.width / 2 + ROAD_SAFETY_MARGIN,
    });
  }

  // 次干道：每段直线一个矩形避让带
  for (const minor of minorRoads) {
    for (const seg of minor.segments) {
      zones.push({
        cx: seg.cx,
        cz: seg.cz,
        rotY: seg.rotY,
        halfLength: seg.length / 2 + ROAD_SAFETY_MARGIN,
        halfWidth: seg.width / 2 + ROAD_SAFETY_MARGIN,
      });
    }
  }

  // 路口：8×8 方形避让带（rotY 不影响正方形）
  const intersectionHalf = INTERSECTION_SIZE / 2 + ROAD_SAFETY_MARGIN;
  for (const inter of intersections) {
    zones.push({
      cx: inter.cx,
      cz: inter.cz,
      rotY: inter.rotY,
      halfLength: intersectionHalf,
      halfWidth: intersectionHalf,
    });
  }

  // 弯道：用外接方形避让带（保守估算，简化计算）
  // road-curve 外接方形边长 = 2 * ROAD_CURVE_OUTER，中心 = curve 圆心偏移到扇区中心
  // 简化：以 curve 圆心为中心，half = ROAD_CURVE_OUTER + SAFETY
  const curveHalf = ROAD_CURVE_OUTER + ROAD_SAFETY_MARGIN;
  for (const curve of curves) {
    zones.push({
      cx: curve.cx,
      cz: curve.cz,
      rotY: curve.rotY,
      halfLength: curveHalf,
      halfWidth: curveHalf,
    });
  }

  return zones;
}

/**
 * 从 MinorRoad 列表中提取所有非空 curve，便于渲染。
 */
function collectCurves(minorRoads: MinorRoad[]): RoadCurve[] {
  const result: RoadCurve[] = [];
  for (const minor of minorRoads) {
    if (minor.curve) result.push(minor.curve);
  }
  return result;
}

/**
 * 计算进程树道路网络：主干道 + 次干道 + 路口 + 弯道 + 避让带。
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
  const intersections = planIntersections(majorRoads);
  const curves = collectCurves(minorRoads);
  const avoidanceZones = buildAvoidanceZones(majorRoads, minorRoads, intersections, curves);

  return { majorRoads, minorRoads, intersections, curves, avoidanceZones };
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

  // 1. 进程树道路网络（主干道 + 次干道 + 路口 + 弯道 + 避让带）
  const rootCtx: RootContext[] = roots.map((p) => ({
    process: p,
    childrenCount: (childrenMap.get(p.pid) ?? []).length,
  }));
  const majorRoads = planMajorRoads(rootCtx);
  const minorRoads = planMinorRoads(majorRoads);
  const intersections = planIntersections(majorRoads);
  const curves = collectCurves(minorRoads);
  const avoidanceZones = buildAvoidanceZones(majorRoads, minorRoads, intersections, curves);
  const roads: ProcessTreeRoadNetwork = { majorRoads, minorRoads, intersections, curves, avoidanceZones };

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
