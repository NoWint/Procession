import { describe, it, expect } from "vitest";
import { computeTreePositions, computeProcessSignature, computeGridPositions } from "./layout";
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

  it("keeps signature STABLE when only name changes (pid 集合不变就不应重算)", () => {
    // 新设计：签名只用 pid 集合，name 变化不触发重算。
    // 进程 rename 但 pid 不变，位置应保持稳定（避免位置漂移）。
    const a = [makeProcess({ pid: 1, ppid: 0, name: "test" })];
    const b = [makeProcess({ pid: 1, ppid: 0, name: "other" })];
    expect(computeProcessSignature(a)).toBe(computeProcessSignature(b));
  });

  it("changes signature when pid/ppid changes", () => {
    const a = [makeProcess({ pid: 1, ppid: 0 })];
    const b = [makeProcess({ pid: 2, ppid: 0 })];
    expect(computeProcessSignature(a)).not.toBe(computeProcessSignature(b));
  });

  it("keeps signature STABLE when processes.length changes but pid set is identical", () => {
    // 回归测试：1Hz 推送中临时子进程可能导致 list 中出现重复 pid 或顺序变化，
    // 但只要 pid 集合相同，签名必须稳定。
    const a = [
      makeProcess({ pid: 1, ppid: 0 }),
      makeProcess({ pid: 2, ppid: 1 }),
      makeProcess({ pid: 3, ppid: 1 }),
    ];
    const b = [
      makeProcess({ pid: 3, ppid: 1 }),  // 顺序不同
      makeProcess({ pid: 1, ppid: 0 }),
      makeProcess({ pid: 2, ppid: 1 }),
    ];
    expect(computeProcessSignature(a)).toBe(computeProcessSignature(b));
  });
});

describe("computeGridPositions stability", () => {
  it("同一 pid 集合在不同 cpu 下应得到相同位置", () => {
    const baseProcs = [
      makeProcess({ pid: 100, ppid: 0, name: "root1", cpu: 10 }),
      makeProcess({ pid: 101, ppid: 0, name: "root2", cpu: 5 }),
      makeProcess({ pid: 102, ppid: 100, name: "child1", cpu: 2 }),
    ];
    const withDifferentCpu = [
      makeProcess({ pid: 100, ppid: 0, name: "root1", cpu: 88 }),
      makeProcess({ pid: 101, ppid: 0, name: "root2", cpu: 33 }),
      makeProcess({ pid: 102, ppid: 100, name: "child1", cpu: 99 }),
    ];

    const run1 = computeGridPositions(baseProcs, 200);
    const run2 = computeGridPositions(withDifferentCpu, 200);

    for (const pos1 of run1.positions) {
      const pos2 = run2.positions.find((p) => p.pid === pos1.pid);
      expect(pos2).toBeDefined();
      expect(pos2!.x).toBeCloseTo(pos1.x, 6);
      expect(pos2!.z).toBeCloseTo(pos1.z, 6);
    }
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
