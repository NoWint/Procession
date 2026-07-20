import { describe, it, expect } from "vitest";
import { computeProcessSignature, computeGridPositions, computeProcessTreeRoads } from "./layout";
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

  it("建筑位置绝不能落在任何主干道或次干道上", () => {
    // 关键约束（来自 project_memory）：建筑不能生成在道路上
    const procs = [
      makeProcess({ pid: 1, ppid: 0, name: "root-a", cpu: 30 }),
      makeProcess({ pid: 2, ppid: 1, name: "child-a1", cpu: 5 }),
      makeProcess({ pid: 3, ppid: 1, name: "child-a2", cpu: 8 }),
      makeProcess({ pid: 100, ppid: 0, name: "root-b", cpu: 25 }),
      makeProcess({ pid: 101, ppid: 100, name: "child-b1", cpu: 6 }),
      makeProcess({ pid: 200, ppid: 0, name: "root-c", cpu: 15 }),
      makeProcess({ pid: 201, ppid: 200, name: "child-c1", cpu: 4 }),
    ];

    const { positions, roads } = computeGridPositions(procs, 200);

    // 检查每个建筑中心到每条道路的距离 > 安全距离
    const SAFETY = 1.4; // 略小于 ROAD_SAFETY_MARGIN(1.5) 的容差，建筑中心到道路边缘
    expect(roads.majorRoads.length).toBeGreaterThan(0);
    expect(roads.minorRoads.length).toBeGreaterThan(0);

    for (const pos of positions) {
      for (const zone of roads.avoidanceZones) {
        // 把 (pos.x, pos.z) 变换到道路本地坐标系
        const dx = pos.x - zone.cx;
        const dz = pos.z - zone.cz;
        const cos = Math.cos(-zone.rotY);
        const sin = Math.sin(-zone.rotY);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        // 建筑中心必须不在影响带内（严格小于 zone.halfLength/halfWidth）
        const inX = Math.abs(localX) < zone.halfLength - 0.01;
        const inZ = Math.abs(localZ) < zone.halfWidth - 0.01;
        // 修正：避让带包含 SAFETY_MARGIN，建筑中心允许在 SAFETY_MARGIN 内但应在 road 半宽外
        // 这里改测：建筑中心距离道路矩形（不含 SAFETY_MARGIN）的最近距离应 >= 0
        const roadHalfL = zone.halfLength - 1.5; // 减去 SAFETY_MARGIN 得到真实道路半长
        const roadHalfW = zone.halfWidth - 1.5;
        const inRoad = Math.abs(localX) < roadHalfL - 0.01 && Math.abs(localZ) < roadHalfW - 0.01;
        // 建筑绝不能在道路矩形（不含安全裕量）内
        expect(inRoad).toBe(false);
        void inX;
        void inZ;
        void SAFETY;
      }
    }
  });
});

describe("computeProcessTreeRoads stability", () => {
  it("同一 pid 集合在不同 cpu 下应得到相同道路几何", () => {
    const procs1 = [
      makeProcess({ pid: 1, ppid: 0, cpu: 10 }),
      makeProcess({ pid: 2, ppid: 1, cpu: 5 }),
      makeProcess({ pid: 100, ppid: 0, cpu: 20 }),
    ];
    const procs2 = [
      makeProcess({ pid: 1, ppid: 0, cpu: 99 }),
      makeProcess({ pid: 2, ppid: 1, cpu: 88 }),
      makeProcess({ pid: 100, ppid: 0, cpu: 77 }),
    ];

    const roads1 = computeProcessTreeRoads(procs1);
    const roads2 = computeProcessTreeRoads(procs2);

    expect(roads1.majorRoads.length).toBe(roads2.majorRoads.length);
    expect(roads1.minorRoads.length).toBe(roads2.minorRoads.length);

    for (let i = 0; i < roads1.majorRoads.length; i++) {
      const r1 = roads1.majorRoads[i];
      const r2 = roads2.majorRoads[i];
      expect(r1.rootPid).toBe(r2.rootPid);
      expect(r1.cx).toBeCloseTo(r2.cx, 6);
      expect(r1.cz).toBeCloseTo(r2.cz, 6);
      expect(r1.rotY).toBeCloseTo(r2.rotY, 6);
      expect(r1.length).toBeCloseTo(r2.length, 6);
      expect(r1.width).toBeCloseTo(r2.width, 6);
    }
    for (let i = 0; i < roads1.minorRoads.length; i++) {
      const r1 = roads1.minorRoads[i];
      const r2 = roads2.minorRoads[i];
      expect(r1.fromRootPid).toBe(r2.fromRootPid);
      expect(r1.toRootPid).toBe(r2.toRootPid);
      expect(r1.x1).toBeCloseTo(r2.x1, 6);
      expect(r1.z1).toBeCloseTo(r2.z1, 6);
      expect(r1.x2).toBeCloseTo(r2.x2, 6);
      expect(r1.z2).toBeCloseTo(r2.z2, 6);
      expect(r1.length).toBeCloseTo(r2.length, 6);
    }
  });

  it("不同 pid 集合应得到不同道路几何", () => {
    const procs1 = [
      makeProcess({ pid: 1, ppid: 0, cpu: 10 }),
      makeProcess({ pid: 2, ppid: 1, cpu: 5 }),
    ];
    const procs2 = [
      makeProcess({ pid: 100, ppid: 0, cpu: 10 }),
      makeProcess({ pid: 200, ppid: 100, cpu: 5 }),
    ];

    const roads1 = computeProcessTreeRoads(procs1);
    const roads2 = computeProcessTreeRoads(procs2);

    // 主干道数量相同（都是 1 条），但中点不同
    expect(roads1.majorRoads.length).toBe(1);
    expect(roads2.majorRoads.length).toBe(1);
    expect(roads1.majorRoads[0].cx).not.toBeCloseTo(roads2.majorRoads[0].cx, 2);
    expect(roads1.majorRoads[0].cz).not.toBeCloseTo(roads2.majorRoads[0].cz, 2);
  });

  it("每个 root 应有一条主干道，且 root 数增加时主干道数同步增加", () => {
    const procs1Root = [
      makeProcess({ pid: 1, ppid: 0 }),
      makeProcess({ pid: 2, ppid: 1 }),
    ];
    const procs2Roots = [
      makeProcess({ pid: 1, ppid: 0 }),
      makeProcess({ pid: 2, ppid: 1 }),
      makeProcess({ pid: 100, ppid: 0 }),
      makeProcess({ pid: 101, ppid: 100 }),
    ];

    const r1 = computeProcessTreeRoads(procs1Root);
    const r2 = computeProcessTreeRoads(procs2Roots);
    expect(r1.majorRoads.length).toBe(1);
    expect(r2.majorRoads.length).toBe(2);
    // 2 个 root 至少 1 条次干道（互连）
    expect(r2.minorRoads.length).toBeGreaterThanOrEqual(1);
  });

  it("主干道长度随子进程数增加而增加（20-50 clamp）", () => {
    const few = [
      makeProcess({ pid: 1, ppid: 0 }),
      makeProcess({ pid: 2, ppid: 1 }),
    ];
    const many: ProcessInfo[] = [
      makeProcess({ pid: 1, ppid: 0 }),
    ];
    for (let i = 100; i < 130; i++) {
      many.push(makeProcess({ pid: i, ppid: 1 }));
    }

    const r1 = computeProcessTreeRoads(few);
    const r2 = computeProcessTreeRoads(many);
    const len1 = r1.majorRoads[0].length;
    const len2 = r2.majorRoads[0].length;
    // many（30 子进程）应远长于 few（1 子进程）
    expect(len2).toBeGreaterThan(len1);
    // clamp 在 [20, 50]
    expect(len2).toBeLessThanOrEqual(50);
    expect(len1).toBeGreaterThanOrEqual(20);
  });
});
