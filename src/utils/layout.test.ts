import { describe, it, expect } from "vitest";
import { computeTreePositions, computeProcessSignature } from "./layout";
import type { ProcessInfo } from "./types";

function makeProcess(overrides: Partial<ProcessInfo>): ProcessInfo {
  return {
    pid: 1,
    ppid: 0,
    name: "test",
    cpu: 0,
    memory_mb: 0,
    state: "Running",
    user: "user",
    ...overrides,
  };
}

describe("computeProcessSignature", () => {
  it("returns the same signature for identical process topology", () => {
    const a = [makeProcess({ pid: 1, ppid: 0, cpu: 12.3 })];
    const b = [makeProcess({ pid: 1, ppid: 0, cpu: 12.3 })];
    expect(computeProcessSignature(a)).toBe(computeProcessSignature(b));
  });

  it("keeps signature STABLE when only cpu changes (cpu 波动不应触发 positions 重算)", () => {
    // 关键：cpu 在 1Hz 推送中持续波动，若签名随 cpu 变，positions 每帧重算 → 建筑漂移
    // cpu 变化由 useFrame 差分更新 height，不需要重算 layout
    const a = [makeProcess({ pid: 1, ppid: 0, cpu: 12.3 })];
    const b = [makeProcess({ pid: 1, ppid: 0, cpu: 12.4 })];
    expect(computeProcessSignature(a)).toBe(computeProcessSignature(b));
  });

  it("changes signature when name changes (拓扑变化才应触发重算)", () => {
    const a = [makeProcess({ pid: 1, ppid: 0, name: "test" })];
    const b = [makeProcess({ pid: 1, ppid: 0, name: "other" })];
    expect(computeProcessSignature(a)).not.toBe(computeProcessSignature(b));
  });

  it("changes signature when pid/ppid changes", () => {
    const a = [makeProcess({ pid: 1, ppid: 0 })];
    const b = [makeProcess({ pid: 2, ppid: 0 })];
    expect(computeProcessSignature(a)).not.toBe(computeProcessSignature(b));
  });
});

describe("computeTreePositions", () => {
  it("places orphan processes at stable positions across calls", () => {
    // A root plus a cycle (2 <-> 3) that cannot be reached from the root.
    const processes = [
      makeProcess({ pid: 1, ppid: 0, name: "root", cpu: 10 }),
      makeProcess({ pid: 2, ppid: 3, name: "orphan-a", cpu: 5 }),
      makeProcess({ pid: 3, ppid: 2, name: "orphan-b", cpu: 5 }),
    ];

    const run1 = computeTreePositions(processes, 200);
    const run2 = computeTreePositions(processes, 200);

    const posA1 = run1.find((p) => p.pid === 2)!;
    const posA2 = run2.find((p) => p.pid === 2)!;
    const posB1 = run1.find((p) => p.pid === 3)!;
    const posB2 = run2.find((p) => p.pid === 3)!;

    expect(posA1.x).toBeCloseTo(posA2.x, 6);
    expect(posA1.z).toBeCloseTo(posA2.z, 6);
    expect(posB1.x).toBeCloseTo(posB2.x, 6);
    expect(posB1.z).toBeCloseTo(posB2.z, 6);
  });
});
