import { describe, it } from "vitest";
import { computeProcessTreeRoads } from "./layout";
import type { ProcessInfo } from "./types";

function makeProcess(overrides: Partial<ProcessInfo>): ProcessInfo {
  return {
    pid: 1, ppid: 0, name: "test", cpu: 0, memory_mb: 0, state: "Running", user: "user",
    ...overrides,
  };
}

describe("DEBUG: 道路连通性人工核查", () => {
  it("输出实际坐标", () => {
    const procs = [
      makeProcess({ pid: 1, ppid: 0, name: "systemd" }),
      makeProcess({ pid: 10, ppid: 1, name: "child-a1" }),
      makeProcess({ pid: 11, ppid: 1, name: "child-a2" }),

      makeProcess({ pid: 100, ppid: 0, name: "launchd" }),
      makeProcess({ pid: 110, ppid: 100, name: "child-b1" }),
      makeProcess({ pid: 111, ppid: 100, name: "child-b2" }),

      makeProcess({ pid: 200, ppid: 0, name: "explorer" }),
      makeProcess({ pid: 210, ppid: 200, name: "child-c1" }),

      makeProcess({ pid: 300, ppid: 0, name: "nginx" }),
      makeProcess({ pid: 310, ppid: 300, name: "child-d1" }),
    ];

    const roads = computeProcessTreeRoads(procs);

    console.log("\n===== 主干道 =====");
    for (const r of roads.majorRoads) {
      console.log(`  rootPid=${r.rootPid} ${r.rootName}`);
      console.log(`    center=(${r.cx.toFixed(2)}, ${r.cz.toFixed(2)})  rotY=${r.rotY.toFixed(3)} (${(r.rotY * 180 / Math.PI).toFixed(1)}°)`);
      console.log(`    length=${r.length.toFixed(2)}  width=${r.width}`);
      const cos = Math.cos(r.rotY), sin = Math.sin(r.rotY), half = r.length / 2;
      console.log(`    +端 T 字路口中心 = (${(r.cx + cos * half).toFixed(2)}, ${(r.cz + sin * half).toFixed(2)})`);
      console.log(`    -端 T 字路口中心 = (${(r.cx - cos * half).toFixed(2)}, ${(r.cz - sin * half).toFixed(2)})`);
    }

    console.log("\n===== 路口（T 字路口） =====");
    for (const it of roads.intersections) {
      console.log(`  (${it.cx.toFixed(2)}, ${it.cz.toFixed(2)})  rotY=${it.rotY.toFixed(3)} (${(it.rotY * 180 / Math.PI).toFixed(1)}°)  type=${it.type}`);
    }

    console.log("\n===== 次干道 L 形 =====");
    for (const m of roads.minorRoads) {
      console.log(`  ${m.fromRootPid} → ${m.toRootPid}: (${m.x1.toFixed(2)}, ${m.z1.toFixed(2)}) → (${m.x2.toFixed(2)}, ${m.z2.toFixed(2)})`);
      console.log(`    segments: ${m.segments.length}, curve: ${m.curve ? "有" : "无"}`);
      for (let i = 0; i < m.segments.length; i++) {
        const s = m.segments[i];
        const sx = s.cx - Math.cos(s.rotY) * s.length / 2;
        const sz = s.cz - Math.sin(s.rotY) * s.length / 2;
        const ex = s.cx + Math.cos(s.rotY) * s.length / 2;
        const ez = s.cz + Math.sin(s.rotY) * s.length / 2;
        console.log(`    seg[${i}]: (${sx.toFixed(2)}, ${sz.toFixed(2)}) → (${ex.toFixed(2)}, ${ez.toFixed(2)})  len=${s.length.toFixed(2)}  rotY=${s.rotY.toFixed(3)} (${(s.rotY * 180 / Math.PI).toFixed(1)}°)`);
      }
      if (m.curve) {
        const c = m.curve;
        // v9 修正：弯道 GLB 是右转（+X → -Z），不是左转。
        // Three.js Y 轴旋转矩阵：R(θ)·(x,0,z) = (x·cos(θ)+z·sin(θ), 0, -x·sin(θ)+z·cos(θ))
        // 入口（局部 +X 端，(radius, 0, 0)）→ 世界 (cx + radius·cos(rotY), cz - radius·sin(rotY))
        // 出口（局部 -Z 端，(0, 0, -radius)）→ 世界 (cx - radius·sin(rotY), cz - radius·cos(rotY))
        const entryX = c.cx + c.radius * Math.cos(c.rotY);
        const entryZ = c.cz - c.radius * Math.sin(c.rotY);
        const exitX = c.cx - c.radius * Math.sin(c.rotY);
        const exitZ = c.cz - c.radius * Math.cos(c.rotY);
        console.log(`    curve: center=(${c.cx.toFixed(2)}, ${c.cz.toFixed(2)})  rotY=${c.rotY.toFixed(3)} (${(c.rotY * 180 / Math.PI).toFixed(1)}°)`);
        console.log(`           入口中线 (+X端) = (${entryX.toFixed(2)}, ${entryZ.toFixed(2)})`);
        console.log(`           出口中线 (-Z端) = (${exitX.toFixed(2)}, ${exitZ.toFixed(2)})`);
      }
    }

    console.log("\n===== 连通性检查 =====");
    const HALF_INTER = 4;
    const endpoints = new Map<number, { plusX: number; plusZ: number; minusX: number; minusZ: number }>();
    for (const r of roads.majorRoads) {
      const cos = Math.cos(r.rotY), sin = Math.sin(r.rotY), half = r.length / 2;
      const plusCX = r.cx + cos * half;
      const plusCZ = r.cz + sin * half;
      const minusCX = r.cx - cos * half;
      const minusCZ = r.cz - sin * half;
      // v9 修正：与 planMinorRoads 严格匹配
      // +端 T-junction rotY = road.rotY - π/2，+X 局部出口世界方向 = (sin, cos)
      // -端 T-junction rotY = road.rotY + π/2，+X 局部出口世界方向 = (-sin, -cos)
      endpoints.set(r.rootPid, {
        plusX: plusCX + HALF_INTER * sin,
        plusZ: plusCZ + HALF_INTER * cos,
        minusX: minusCX + HALF_INTER * (-sin),
        minusZ: minusCZ + HALF_INTER * (-cos),
      });
    }

    for (const m of roads.minorRoads) {
      const seg1 = m.segments[0];
      const segLast = m.segments[m.segments.length - 1];
      const s1StartX = seg1.cx - Math.cos(seg1.rotY) * seg1.length / 2;
      const s1StartZ = seg1.cz - Math.sin(seg1.rotY) * seg1.length / 2;
      const sLastEndX = segLast.cx + Math.cos(segLast.rotY) * segLast.length / 2;
      const sLastEndZ = segLast.cz + Math.sin(segLast.rotY) * segLast.length / 2;

      const fromEnd = endpoints.get(m.fromRootPid);
      const toEnd = endpoints.get(m.toRootPid);

      // seg1 起点应与 from 的某个端出口对齐（plusX/plusZ 或 minusX/minusZ）
      const fromPlusErr = fromEnd ? Math.hypot(s1StartX - fromEnd.plusX, s1StartZ - fromEnd.plusZ) : Infinity;
      const fromMinusErr = fromEnd ? Math.hypot(s1StartX - fromEnd.minusX, s1StartZ - fromEnd.minusZ) : Infinity;
      const fromErr = Math.min(fromPlusErr, fromMinusErr);
      const fromLabel = fromPlusErr < fromMinusErr ? "+端" : "-端";
      // segLast 终点应与 to 的某个端出口对齐
      const toPlusErr = toEnd ? Math.hypot(sLastEndX - toEnd.plusX, sLastEndZ - toEnd.plusZ) : Infinity;
      const toMinusErr = toEnd ? Math.hypot(sLastEndX - toEnd.minusX, sLastEndZ - toEnd.minusZ) : Infinity;
      const toErr = Math.min(toPlusErr, toMinusErr);
      const toLabel = toPlusErr < toMinusErr ? "+端" : "-端";

      console.log(`  ${m.fromRootPid}→${m.toRootPid}: seg1起点-from${fromLabel}出口误差=${fromErr.toFixed(3)}  segLast终点-to${toLabel}出口误差=${toErr.toFixed(3)}`);
      if (m.curve) {
        const s1EndX = seg1.cx + Math.cos(seg1.rotY) * seg1.length / 2;
        const s1EndZ = seg1.cz + Math.sin(seg1.rotY) * seg1.length / 2;
        // v9 修正：seg1 终点应连接 curve 的 -Z 端（"出口"，但按车流方向是入口）
        // 弯道 -Z 端 = (cx - radius·sin(rotY), cz - radius·cos(rotY))
        const s1EndTargetX = m.curve.cx - m.curve.radius * Math.sin(m.curve.rotY);
        const s1EndTargetZ = m.curve.cz - m.curve.radius * Math.cos(m.curve.rotY);
        const err1 = Math.hypot(s1EndX - s1EndTargetX, s1EndZ - s1EndTargetZ);
        const seg2 = m.segments[1];
        const s2StartX = seg2.cx - Math.cos(seg2.rotY) * seg2.length / 2;
        const s2StartZ = seg2.cz - Math.sin(seg2.rotY) * seg2.length / 2;
        // v9 修正：seg2 起点应连接 curve 的 +X 端
        // 弯道 +X 端 = (cx + radius·cos(rotY), cz - radius·sin(rotY))
        const s2StartTargetX = m.curve.cx + m.curve.radius * Math.cos(m.curve.rotY);
        const s2StartTargetZ = m.curve.cz - m.curve.radius * Math.sin(m.curve.rotY);
        const err2 = Math.hypot(s2StartX - s2StartTargetX, s2StartZ - s2StartTargetZ);
        console.log(`           seg1终点-curve(-Z端)误差=${err1.toFixed(3)}  seg2起点-curve(+X端)误差=${err2.toFixed(3)}`);
      }
    }
  });
});
