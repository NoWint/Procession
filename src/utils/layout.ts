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
  return Math.max(0.1, cpu / 10);
}

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

const MIN_RADIUS = 1.0;

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
      x,
      y: 0,
      z,
      pid: p.pid,
      height: cpuToHeight(p.cpu),
      parentPid: p.ppid,
    };
    positions.push(pos);
    placed.set(p.pid, pos);
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

      const pos: BuildingPosition = {
        x,
        y: 0,
        z,
        pid: child.pid,
        height: cpuToHeight(child.cpu),
        parentPid,
      };
      positions.push(pos);
      placed.set(child.pid, pos);
      queue.push(child.pid);
    });
  }

  // Place any remaining orphans that were not reachable from roots.
  for (const p of sorted) {
    if (placed.has(p.pid)) continue;
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * 4;
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    ({ x, z } = resolveOverlap(x, z, placed));

    const pos: BuildingPosition = {
      x,
      y: 0,
      z,
      pid: p.pid,
      height: cpuToHeight(p.cpu),
      parentPid: p.ppid,
    };
    positions.push(pos);
    placed.set(p.pid, pos);
  }

  return positions;
}

/* Scratch test:
const mock = [
  { pid: 1, ppid: 0, name: "System", cpu: 10, memory_mb: 100, state: "Running" as const, user: "root" },
  { pid: 2, ppid: 1, name: "chrome", cpu: 50, memory_mb: 500, state: "Running" as const, user: "user" },
  { pid: 3, ppid: 1, name: "node", cpu: 15, memory_mb: 200, state: "Running" as const, user: "user" },
];
console.log(computeTreePositions(mock));
*/
