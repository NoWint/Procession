import type { ProcessInfo } from "./types";

export interface BuildingPosition {
  x: number;
  y: number;
  z: number;
  pid: number;
  height: number;
  parentPid?: number;
}

export function cpuToHeight(cpu: number): number {
  return Math.max(0.5, 0.5 + cpu * 0.15);
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

const CELL_SIZE = 3.0;
const MIN_RADIUS = 1.0;

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

/// Place processes in a grid layout, sorted by CPU descending.
/// Highest CPU → city center (CBD), lowest → outskirts.
/// Roads naturally emerge as the gaps between grid cells.
export function computeGridPositions(
  processes: ProcessInfo[],
  maxBuildings: number = 200,
): BuildingPosition[] {
  const sorted = [...processes]
    .filter((p) => p.state !== "Zombie" || p.cpu > 1)
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, maxBuildings);

  const side = Math.ceil(Math.sqrt(maxBuildings * 1.1));
  const center = Math.floor(side / 2);
  const indices = spiralGridIndices(side);

  return indices.slice(0, sorted.length).map(([r, c], i) => ({
    x: (c - center) * CELL_SIZE,
    y: 0,
    z: (r - center) * CELL_SIZE,
    pid: sorted[i].pid,
    height: cpuToHeight(sorted[i].cpu),
  }));
}

// Legacy radial/tree layout — kept for reference but no longer used.
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
