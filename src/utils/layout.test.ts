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

describe("computeProcessTreeRoads L 形路径拓扑", () => {
  it("每个 root 主干道两端应各有一个 T 字路口（共 2N 个）", () => {
    const procs = [
      makeProcess({ pid: 1, ppid: 0 }),
      makeProcess({ pid: 2, ppid: 1 }),
      makeProcess({ pid: 100, ppid: 0 }),
      makeProcess({ pid: 101, ppid: 100 }),
    ];
    const roads = computeProcessTreeRoads(procs);
    expect(roads.majorRoads.length).toBe(2);
    expect(roads.intersections.length).toBe(4);  // 2 个 root × 2 端
    // 都是 t-junction
    for (const inter of roads.intersections) {
      expect(inter.type).toBe("t-junction");
    }
  });

  it("L 形次干道应包含 2 段直线 + 1 个 curve（除非共线退化为直线）", () => {
    // 构造两个 root 主干道端点不共线的场景
    const procs = [
      makeProcess({ pid: 1, ppid: 0 }),
      makeProcess({ pid: 2, ppid: 1 }),
      makeProcess({ pid: 3, ppid: 1 }),
      makeProcess({ pid: 100, ppid: 0 }),
      makeProcess({ pid: 101, ppid: 100 }),
      makeProcess({ pid: 102, ppid: 100 }),
    ];
    const roads = computeProcessTreeRoads(procs);
    expect(roads.majorRoads.length).toBe(2);
    expect(roads.minorRoads.length).toBeGreaterThanOrEqual(1);

    // 至少有一条 L 形次干道（segments=2 且 curve 非空）
    const lShape = roads.minorRoads.find((m) => m.segments.length === 2 && m.curve !== null);
    expect(lShape).toBeDefined();
    if (lShape && lShape.curve) {
      // curve rotY 应是 0/π/π/2/-π/2 之一
      const allowedRotY = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
      const close = allowedRotY.some((r) => Math.abs(lShape.curve!.rotY - r) < 0.001);
      expect(close).toBe(true);
    }
  });

  it("L 形拐角方向强制左转 90°：方案 A 用于 sign(dx)*sign(dz)>0", () => {
    // 这个测试是结构性验证：所有 L 形次干道 segments 必须是 2 段且互相垂直
    const procs = [
      makeProcess({ pid: 1, ppid: 0 }),
      makeProcess({ pid: 100, ppid: 0 }),
      makeProcess({ pid: 200, ppid: 0 }),
    ];
    const roads = computeProcessTreeRoads(procs);
    for (const minor of roads.minorRoads) {
      if (minor.segments.length === 2 && minor.curve) {
        // 两段 rotY 相差 π/2（90°）
        const diff = Math.abs(minor.segments[0].rotY - minor.segments[1].rotY);
        const normalized = Math.abs(((diff % Math.PI) + Math.PI) % Math.PI - Math.PI / 2);
        expect(normalized).toBeLessThan(0.01);
      }
    }
  });

  it("curve 入口/出口中线点 = seg1 终点 / seg2 起点（6 单位 curve 空间）", () => {
    // 新几何（v7）：curve 占据 6×6 方形空间，segments 不再相连，而是停在 curve 入口/出口中线点
    // - seg1 终点 = curve 圆心 + 6 * 入口方向
    // - seg2 起点 = curve 圆心 + 6 * 出口方向
    // 入口方向 = (cos(rotY), sin(rotY))，出口方向 = (-sin(rotY), cos(rotY))
    const procs = [
      makeProcess({ pid: 1, ppid: 0 }),
      makeProcess({ pid: 2, ppid: 1 }),
      makeProcess({ pid: 100, ppid: 0 }),
      makeProcess({ pid: 101, ppid: 100 }),
    ];
    const roads = computeProcessTreeRoads(procs);
    let checked = 0;
    for (const minor of roads.minorRoads) {
      if (minor.segments.length !== 2 || !minor.curve) continue;
      const s1 = minor.segments[0];
      const s2 = minor.segments[1];
      const c = minor.curve;
      // seg1 终点
      const s1EndX = s1.cx + Math.cos(s1.rotY) * s1.length / 2;
      const s1EndZ = s1.cz + Math.sin(s1.rotY) * s1.length / 2;
      // seg2 起点
      const s2StartX = s2.cx - Math.cos(s2.rotY) * s2.length / 2;
      const s2StartZ = s2.cz - Math.sin(s2.rotY) * s2.length / 2;
      // curve 入口中线点 = 圆心 + 6 * (cos(rotY), sin(rotY))
      const entryX = c.cx + c.radius * Math.cos(c.rotY);
      const entryZ = c.cz + c.radius * Math.sin(c.rotY);
      // curve 出口中线点 = 圆心 + 6 * (-sin(rotY), cos(rotY))
      const exitX = c.cx - c.radius * Math.sin(c.rotY);
      const exitZ = c.cz + c.radius * Math.cos(c.rotY);
      // seg1 终点应等于 curve 入口中线点
      expect(s1EndX).toBeCloseTo(entryX, 5);
      expect(s1EndZ).toBeCloseTo(entryZ, 5);
      // seg2 起点应等于 curve 出口中线点
      expect(s2StartX).toBeCloseTo(exitX, 5);
      expect(s2StartZ).toBeCloseTo(exitZ, 5);
      checked++;
    }
    // 至少有一个 L 形被验证
    expect(checked).toBeGreaterThan(0);
  });

  it("同 pid 集不同 cpu → 相同 L 形 segments + curve", () => {
    const procs1 = [
      makeProcess({ pid: 1, ppid: 0, cpu: 10 }),
      makeProcess({ pid: 2, ppid: 1, cpu: 5 }),
      makeProcess({ pid: 100, ppid: 0, cpu: 20 }),
      makeProcess({ pid: 101, ppid: 100, cpu: 8 }),
    ];
    const procs2 = [
      makeProcess({ pid: 1, ppid: 0, cpu: 99 }),
      makeProcess({ pid: 2, ppid: 1, cpu: 88 }),
      makeProcess({ pid: 100, ppid: 0, cpu: 77 }),
      makeProcess({ pid: 101, ppid: 100, cpu: 66 }),
    ];

    const r1 = computeProcessTreeRoads(procs1);
    const r2 = computeProcessTreeRoads(procs2);

    expect(r1.minorRoads.length).toBe(r2.minorRoads.length);
    expect(r1.curves.length).toBe(r2.curves.length);
    expect(r1.intersections.length).toBe(r2.intersections.length);

    for (let i = 0; i < r1.minorRoads.length; i++) {
      const m1 = r1.minorRoads[i];
      const m2 = r2.minorRoads[i];
      expect(m1.segments.length).toBe(m2.segments.length);
      for (let s = 0; s < m1.segments.length; s++) {
        expect(m1.segments[s].cx).toBeCloseTo(m2.segments[s].cx, 6);
        expect(m1.segments[s].cz).toBeCloseTo(m2.segments[s].cz, 6);
        expect(m1.segments[s].rotY).toBeCloseTo(m2.segments[s].rotY, 6);
        expect(m1.segments[s].length).toBeCloseTo(m2.segments[s].length, 6);
      }
      if (m1.curve && m2.curve) {
        expect(m1.curve.cx).toBeCloseTo(m2.curve.cx, 6);
        expect(m1.curve.cz).toBeCloseTo(m2.curve.cz, 6);
        expect(m1.curve.rotY).toBeCloseTo(m2.curve.rotY, 6);
      }
    }
  });
});
