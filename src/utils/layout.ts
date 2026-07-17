import type { ProcessInfo } from "./types";

export interface BuildingPosition {
  x: number;
  y: number;
  z: number;
  pid: number;
  height: number;
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

export function cpuToHeight(cpu: number): number {
  return Math.max(0.1, cpu / 10);
}

/* Scratch test:
const mock = [
  { pid: 1, ppid: 0, name: "System", cpu: 10, memory_mb: 100, state: "Running" as const, user: "root" },
  { pid: 2, ppid: 1, name: "chrome", cpu: 50, memory_mb: 500, state: "Running" as const, user: "user" },
];
console.log(computePositions(mock));
*/
