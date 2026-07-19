import type { ProcessInfo } from "./types";
import {
  isSystemProcess,
  isDatabaseProcess,
  isBrowserProcess,
  isEditorProcess,
  isRuntimeProcess,
  isCloudProcess,
} from "./colors";

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

export interface SubBlockInfo {
  x: number;
  z: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface BlockInfo {
  letter: string;        // 保留字段名兼容，现在存的是 typeKey
  typeKey: string;      // system/browser/editor/database/cloud/runtime/user
  typeName: string;     // 中文显示名（系统服务/浏览器/编辑器...）
  x: number;
  z: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  subblocks: SubBlockInfo[];
  processCount: number;
}

/**
 * 进程类型分组：替代之前的首字母分组。
 * 类型分组有空间逻辑：相同类型的进程聚集在同一街区，
 * 用户能预测"系统进程在西北、浏览器在东南"等空间关系。
 *
 * 类型→街区位置的映射是固定的（不随运行进程变化），
 * 这样用户能在脑中建立"城市地图"。
 */
const TYPE_GROUP_ORDER = [
  { key: "system",   name: "系统服务" },
  { key: "database", name: "数据库" },
  { key: "browser",  name: "浏览器" },
  { key: "editor",   name: "编辑器" },
  { key: "runtime",  name: "运行时" },
  { key: "cloud",    name: "云服务" },
  { key: "user",     name: "用户进程" },
] as const;

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
  return TYPE_GROUP_ORDER.find((g) => g.key === typeKey) ?? TYPE_GROUP_ORDER[TYPE_GROUP_ORDER.length - 1];
}

export function cpuToHeight(cpu: number): number {
  return Math.max(1, 1 + cpu * 0.21);
}

/**
 * Returns a cheap signature of the process list that changes only when the
 * process topology (pid/ppid/name) changes — NOT on cpu fluctuations,
 * NOT on processes.length (which fluctuates when transient processes appear/disappear).
 *
 * 关键设计：
 *   - 不包含 cpu（cpu 每秒波动）
 *   - 不包含 processes.length（进程数微变会触发重算）
 *   - 只用 pid 集合的稳定哈希（顺序无关，避免 list 顺序影响）
 *
 * 这样签名只在 pid 集合变化时变，cpu/进程数微变都不会触发 positions 重算。
 * cpu 变化由 useFrame 差分更新 height。
 */
export function computeProcessSignature(processes: ProcessInfo[]): string {
  // 用 Set 去重 + 排序，保证顺序无关
  const pids = Array.from(new Set(processes.map((p) => p.pid))).sort((a, b) => a - b);
  let h = 0;
  for (const pid of pids) {
    h = (h * 31 + pid) | 0;
  }
  return `${pids.length}:${h}`;
}

/// Generate grid coordinates in spiral order from center.
/// Returns [row, col] pairs starting at center and spiraling outward.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function spiralGridIndices(side: number): [number, number][] {
  const result: [number, number][] = [];
  const center = Math.floor(side / 2);
  let r = center;
  let c = center;
  result.push([r, c]);
  let step = 1;
  while (result.length < side * side) {
    for (let i = 0; i < step && result.length < side * side; i++) {
      c++;
      if (c >= 0 && c < side && r >= 0 && r < side) result.push([r, c]);
    }
    for (let i = 0; i < step && result.length < side * side; i++) {
      r++;
      if (c >= 0 && c < side && r >= 0 && r < side) result.push([r, c]);
    }
    step++;
    for (let i = 0; i < step && result.length < side * side; i++) {
      c--;
      if (c >= 0 && c < side && r >= 0 && r < side) result.push([r, c]);
    }
    for (let i = 0; i < step && result.length < side * side; i++) {
      r--;
      if (c >= 0 && c < side && r >= 0 && r < side) result.push([r, c]);
    }
    step++;
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CELL_SIZE = 3.0;
// MIN_RADIUS 用于 resolveOverlap：两个建筑中心最小间距
// 最大变体 building-system baseWidth=1.8，半径 0.9；加上 0.6 边距 = 1.5
// 但 childRadius 已给 root-children 留空间，这里主要防 root 间穿模
const MIN_RADIUS = 2.2;

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
 * 解决冲突：把 (x,z) 推离所有 placed 中距离过近的建筑。
 * 最多迭代 30 次，每次推离 MIN_RADIUS - dist 的距离。
 */
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

/// Group processes by first letter of name → each letter gets its own
/// block district. Each block is sub-divided into 1-8 "subblocks" based
/// on root process count, with minor roads running between subblocks.
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
  // 用 pid 稳定排序：pid 在进程生命周期内不变，避免 1Hz 推送中顺序漂移
  for (const list of childrenMap.values()) list.sort((a, b) => a.pid - b.pid);

  const roots = filtered.filter((p) => p.ppid <= 1 || !pidMap.has(p.ppid));

  // 按进程类型分组（替代首字母分组）：相同类型聚集在同一街区，可建立空间地图
  const typeGroups = new Map<string, ProcessInfo[]>();
  for (const r of roots) {
    const typeKey = classifyProcess(r);
    if (!typeGroups.has(typeKey)) typeGroups.set(typeKey, []);
    typeGroups.get(typeKey)!.push(r);
  }
  // rootList 按 pid 排序（绝对稳定），不按 name（name 可能因路径不同而排序变化）
  for (const list of typeGroups.values()) list.sort((a, b) => a.pid - b.pid);
  // 固定顺序：system → database → browser → editor → runtime → cloud → user
  const sortedKeys = TYPE_GROUP_ORDER
    .map((g) => g.key)
    .filter((k) => typeGroups.has(k));

  const blockCols = 8;
  const blockCell = 16.0;        // 街区间距（给主干道留空间）
  const subGap = 1.5;            // 小区间距（支干道宽度）
  const inSubCell = 3.8;         // 小区内 root 间距（加大：system 变体 1.8 宽 + 边距）
  const childPad = 2.0;          // 街区边界向外留白（容纳子进程环绕）

  const result: BuildingPosition[] = [];
  const blockInfo: BlockInfo[] = [];
  const placed = new Set<number>();

  // 街区网格在两个方向都居中：之前 bx 从 0 开始向 +x 延伸（最大 112），
  // 但地板是 ±80 居中，导致建筑全部偏到 +x 侧，-x 侧空荡。
  // 现在根据实际街区数计算 cols/rows，让街区中心在原点。
  const totalBlocks = sortedKeys.length;
  const gridCols = Math.max(1, Math.min(totalBlocks, blockCols));
  const gridRows = Math.max(1, Math.ceil(totalBlocks / gridCols));
  const totalWidth = (gridCols - 1) * blockCell;
  const totalDepth = (gridRows - 1) * blockCell;
  const startX = -totalWidth / 2;
  const startZ = -totalDepth / 2;

  sortedKeys.forEach((typeKey, bi) => {
    const rootList = typeGroups.get(typeKey)!;
    rootList.sort((a, b) => a.name.localeCompare(b.name));

    const bx = startX + (bi % gridCols) * blockCell;
    const bz = startZ + Math.floor(bi / gridCols) * blockCell;

    // 根据街区 root 数量决定小区网格：1/2/4/8 个小区
    const { cols, rows } = getSubblockGrid(rootList.length);
    const totalSubs = cols * rows;
    const perSub = Math.ceil(rootList.length / totalSubs);
    const sideLocal = Math.max(1, Math.ceil(Math.sqrt(perSub)));
    const subSize = sideLocal * inSubCell;
    const subHalf = subSize / 2;

    // 小区网格总尺寸（用于居中布局）
    const totalW = cols * subSize + (cols - 1) * subGap;
    const totalD = rows * subSize + (rows - 1) * subGap;
    const startCx = bx - totalW / 2 + subHalf;
    const startCz = bz - totalD / 2 + subHalf;

    const subblocks: SubBlockInfo[] = [];
    let rootIdx = 0;
    let placedInBlock = 0;

    for (let sr = 0; sr < rows; sr++) {
      for (let sc = 0; sc < cols; sc++) {
        const subCx = startCx + sc * (subSize + subGap);
        const subCz = startCz + sr * (subSize + subGap);

        subblocks.push({
          x: subCx,
          z: subCz,
          minX: subCx - subHalf,
          maxX: subCx + subHalf,
          minZ: subCz - subHalf,
          maxZ: subCz + subHalf,
        });

        // 取出本小区要放置的 roots
        const subRoots: ProcessInfo[] = [];
        while (rootIdx < rootList.length && subRoots.length < perSub) {
          subRoots.push(rootList[rootIdx++]);
        }

        const localSide = Math.max(1, Math.ceil(Math.sqrt(subRoots.length)));
        const localHalf = (localSide - 1) / 2;

        // 关键修复：root 位置由 pid 哈希决定，而非 ri 索引
        // 这样即使 rootList 增减导致 ri 变化，相同 pid 的 root 仍然在相同位置。
        // 排序保证同一 pid 在网格中的 (row, col) 稳定。
        const subRootsSorted = [...subRoots].sort((a, b) => a.pid - b.pid);
        subRootsSorted.forEach((root, ri) => {
          const r = Math.floor(ri / localSide);
          const col = ri % localSide;
          let rx = subCx + (col - localHalf) * inSubCell;
          let rz = subCz + (r - localHalf) * inSubCell;
          // 用 pid 哈希做微抖动（之前用 name，name 可能因路径变化）
          rx += (hashSeed(root.pid) - 0.5) * 0.4;
          rz += (hashSeed(root.pid + 1) - 0.5) * 0.4;

          placed.add(root.pid);
          placedInBlock++;

          const kids = (childrenMap.get(root.pid) ?? []).filter((k) => pidMap.has(k.pid));

          result.push({ x: rx, y: 0, z: rz, pid: root.pid, height: cpuToHeight(root.cpu), width: 2.0, childCount: kids.length });

          // 子进程位置：用 pid 哈希做角度，避免 ci 索引依赖
          // kids 已按 pid 排序（childrenMap 处理），ci 稳定
          const childRadius = 2.4 + (kids.length > 4 ? 1.2 : 0.7);
          kids.forEach((child, ci) => {
            if (placed.has(child.pid)) return;
            placed.add(child.pid);
            placedInBlock++;
            // ci 由 kids.length 决定，但 child.pid 已排序，相同 pid 的 child 角度稳定
            const angle = (ci / Math.max(kids.length, 1)) * Math.PI * 2;
            const cx = rx + Math.cos(angle) * (childRadius + hashSeed(child.pid) * 0.3);
            const cz = rz + Math.sin(angle) * (childRadius + hashSeed(child.pid + 1) * 0.3);
            result.push({ x: cx, y: 0, z: cz, pid: child.pid, height: cpuToHeight(child.cpu), width: 1.0, parentPid: root.pid });
          });
        });
      }
    }

    // 街区边界 = 包络所有小区，外加 childPad 容纳子进程环绕
    const blockMinX = Math.min(...subblocks.map((s) => s.minX)) - childPad;
    const blockMaxX = Math.max(...subblocks.map((s) => s.maxX)) + childPad;
    const blockMinZ = Math.min(...subblocks.map((s) => s.minZ)) - childPad;
    const blockMaxZ = Math.max(...subblocks.map((s) => s.maxZ)) + childPad;

    const typeInfo = getTypeGroupInfo(typeKey);
    blockInfo.push({
      letter: typeKey,        // 兼容字段，存 typeKey
      typeKey,
      typeName: typeInfo.name,
      x: bx,
      z: bz,
      minX: blockMinX,
      maxX: blockMaxX,
      minZ: blockMinZ,
      maxZ: blockMaxZ,
      subblocks,
      processCount: placedInBlock,
    });
  });

  // Remaining processes (deep grandchildren or orphans)
  for (const p of filtered) {
    if (placed.has(p.pid)) continue;
    const parent = pidMap.get(p.ppid);
    if (parent && placed.has(parent.pid)) {
      const parentPos = result.find((r) => r.pid === parent.pid);
      if (parentPos) {
        const angle = hashSeed(p.pid) * Math.PI * 2;
        const cr = 0.8 + hashSeed(p.pid + 2) * 0.4;
        result.push({ x: parentPos.x + Math.cos(angle) * cr, y: 0, z: parentPos.z + Math.sin(angle) * cr, pid: p.pid, height: cpuToHeight(p.cpu), width: 1.0, parentPid: parent.pid });
        placed.add(p.pid);
        continue;
      }
    }
    const angle = hashSeed(p.pid) * Math.PI * 2;
    const radius = 8 + hashSeed(p.pid + 3) * 3;
    result.push({ x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius, pid: p.pid, height: cpuToHeight(p.cpu), width: 1.0 });
    placed.add(p.pid);
  }

  // === 全局冲突检测：解决跨街区/孤儿/边界穿模 ===
  // 之前 resolveOverlap 只在 computeTreePositions 用，computeGridPositions 没调用，导致穿模。
  // 这里在所有位置确定后做一轮全局分离，迭代直到无冲突或达上限。
  const placedMap = new Map<number, BuildingPosition>();
  for (const pos of result) placedMap.set(pos.pid, pos);
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const pos of result) {
      const before = { x: pos.x, z: pos.z };
      const after = resolveOverlap(pos.x, pos.z, placedMap);
      if (after.x !== before.x || after.z !== before.z) {
        pos.x = after.x;
        pos.z = after.z;
        placedMap.set(pos.pid, pos);
        moved = true;
      }
    }
    if (!moved) break;
  }

  return { positions: result, blocks: blockInfo };
}

/// 根据街区 root 进程数量决定小区网格：
///   1-3  → 1x1 (1 个小区)
///   4-8  → 2x1 (2 个小区)
///   9-15 → 2x2 (4 个小区)
///   16+  → 4x2 (8 个小区)
function getSubblockGrid(rootCount: number): { cols: number; rows: number } {
  if (rootCount <= 3) return { cols: 1, rows: 1 };
  if (rootCount <= 8) return { cols: 2, rows: 1 };
  if (rootCount <= 15) return { cols: 2, rows: 2 };
  return { cols: 4, rows: 2 };
}


// computeGridPositions now returns { positions, blocks }
void spiralGridIndices; void CELL_SIZE;

// Legacy radial/tree layout// Legacy radial/tree layout — kept for reference but no longer used.
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
    // legacy — removed variable ref
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
    // legacy — removed variable ref
  }

  return positions;
}
