import type { ProcessInfo } from "./types";

export interface BuildingPosition {
  x: number;
  y: number;
  z: number;
  pid: number;
  height: number;
  width?: number;        // 2.0 for parent (main tower), 1.0 for child (annex)
  parentPid?: number;
  childCount?: number;   // how many children cluster around this parent
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
  letter: string;
  x: number;        // 街区中心 x
  z: number;        // 街区中心 z
  minX: number;     // 街区边界
  maxX: number;
  minZ: number;
  maxZ: number;
  subblocks: SubBlockInfo[];
  processCount: number;  // 街区内建筑总数（含子进程），用于 BlockLabel 副标题
}

export function cpuToHeight(cpu: number): number {
  return Math.max(1, 1 + cpu * 0.21);
}

/**
 * Returns a cheap signature of the process list that changes only when the
 * layout-relevant properties (pid, ppid, cpu) change. Use it as a useMemo
 * dependency so layout is recomputed only when the process topology actually
 * changes, not on every snapshot update.
 */
export function computeProcessSignature(processes: ProcessInfo[]): string {
  let h = 0;
  for (const p of processes) {
    h = (h * 31 + p.pid) | 0;
    h = (h * 31 + p.ppid) | 0;
    h = (h * 31 + Math.floor(p.cpu * 10)) | 0;
  }
  return `${processes.length}:${h}`;
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
const MIN_RADIUS = 2.0;

function hashSeed(seed: number): number {
  let h = seed | 0;
  h = (h ^ 61) ^ (h >>> 16);
  h = h + (h << 3);
  h = h ^ (h >>> 4);
  h = Math.imul(h, 0x27d4eb2d);
  h = h ^ (h >>> 15);
  return (h >>> 0) / 4294967296;
}

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
  const filtered = [...processes]
    .filter((p) => p.state !== "Zombie" || p.cpu > 1)
    .slice(0, maxBuildings);

  const pidMap = new Map<number, ProcessInfo>();
  for (const p of filtered) pidMap.set(p.pid, p);

  const childrenMap = new Map<number, ProcessInfo[]>();
  for (const p of filtered) {
    const list = childrenMap.get(p.ppid) ?? [];
    list.push(p);
    childrenMap.set(p.ppid, list);
  }
  for (const list of childrenMap.values()) list.sort((a, b) => b.cpu - a.cpu);

  const roots = filtered.filter((p) => p.ppid <= 1 || !pidMap.has(p.ppid));

  const letterGroups = new Map<string, ProcessInfo[]>();
  for (const r of roots) {
    const key = r.name.charAt(0).toUpperCase();
    if (!letterGroups.has(key)) letterGroups.set(key, []);
    letterGroups.get(key)!.push(r);
  }
  const sortedKeys = Array.from(letterGroups.keys()).sort();

  const blockCols = 8;
  const blockCell = 16.0;        // 街区间距（给主干道留空间）
  const subGap = 1.5;            // 小区间距（支干道宽度）
  const inSubCell = 3.0;         // 小区内 root 间距
  const childPad = 2.0;          // 街区边界向外留白（容纳子进程环绕）

  const result: BuildingPosition[] = [];
  const blockInfo: BlockInfo[] = [];
  const placed = new Set<number>();

  const centerOffset = Math.floor(sortedKeys.length / blockCols) * blockCell / 2;

  sortedKeys.forEach((letter, bi) => {
    const rootList = letterGroups.get(letter)!;
    rootList.sort((a, b) => a.name.localeCompare(b.name));

    const bx = (bi % blockCols) * blockCell;
    const bz = Math.floor(bi / blockCols) * blockCell - centerOffset;

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

        subRoots.forEach((root, ri) => {
          const r = Math.floor(ri / localSide);
          const col = ri % localSide;
          let rx = subCx + (col - localHalf) * inSubCell;
          let rz = subCz + (r - localHalf) * inSubCell;
          const h = root.name.split("").reduce((a: number, ch: string) => a * 31 + ch.charCodeAt(0), 0);
          rx += (hashSeed(h) - 0.5) * 0.4;
          rz += (hashSeed(h + 1) - 0.5) * 0.4;

          placed.add(root.pid);
          placedInBlock++;

          const kids = (childrenMap.get(root.pid) ?? []).filter((k) => pidMap.has(k.pid));

          result.push({ x: rx, y: 0, z: rz, pid: root.pid, height: cpuToHeight(root.cpu), width: 2.0, childCount: kids.length });

          const childRadius = 1.5 + (kids.length > 4 ? 1.2 : 0.7);
          kids.forEach((child, ci) => {
            if (placed.has(child.pid)) return;
            placed.add(child.pid);
            placedInBlock++;
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

    blockInfo.push({
      letter,
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
