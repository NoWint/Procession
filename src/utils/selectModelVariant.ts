import type { BuildingVariantId } from "../hooks/useGlbAssets";
import type { ProcessInfo } from "./types";
import {
  isSystemProcess,
  isDatabaseProcess,
  isBrowserProcess,
  isEditorProcess,
  isRuntimeProcess,
  isCloudProcess,
} from "./colors";

/**
 * 建筑模型变体选择决策。
 *
 * 优先级（从高到低）：
 *   1. 状态特化（zombie/stopped/sleeping）→ 对应变体（最高优先级，状态异常优先表达）
 *   2. 类型特化（system/database/browser/editor/runtime/cloud）→ 对应变体
 *   3. 网络节点（node-port/node-relay）— 暂未实现 GLB，降级为 tall
 *   4. 摩天大楼（综合负载 Top 3）→ building-skyscraper
 *   5. 父进程（childCount >= 2）— 暂未实现 GLB，降级为 tall
 *   6. CPU > 80 → building-tall (临时，spire 未实现)
 *   7. CPU > 50 → building-tall
 *   8. 内存 > 1GB → building-tall (临时，fortress 未实现)
 *   9. CPU < 5 → building-low
 *  10. 默认 → building-mid
 *
 * 已实现：low/mid/tall/skyscraper（基础负载）+ zombie/stopped/sleeping（状态特化）
 *       + system/database/browser/editor/runtime/cloud（类型特化）。
 * 待实现：node-port/node-relay、spire/parent/fortress。
 */

export interface VariantContext {
  /** 该进程是否在 connections[] 中有 LISTEN 端口 */
  hasListeningPorts: boolean;
  /** 该进程是否与多个其他进程有 IPC peer */
  hasIpcPeers: boolean;
  /** 该进程的子进程数 */
  childCount: number;
  /** 该进程的综合负载分数（用于 skyscraper Top N 判定） */
  loadScore: number;
  /** 该进程是否在本帧的 skyscraper 候选名单中（综合负载 Top 3） */
  isSkyscraperCandidate: boolean;
}

export interface VariantDecision {
  variant: BuildingVariantId;
  /** 决策原因（调试用） */
  reason: string;
}

/**
 * 计算进程的综合负载分数。
 * 公式：cpu × 0.5 + memory_mb / 100 × 0.3 + childCount × 5 × 0.2
 * - CPU 占用权重最大（直接性能影响）
 * - 内存次之（1GB 内存约等于 50% CPU 的分数）
 * - 子进程数最小（但父进程通常代表"枢纽"角色）
 */
export function computeLoadScore(
  process: ProcessInfo,
  childCount: number,
): number {
  return (
    process.cpu * 0.5 +
    process.memory_mb / 100 * 0.3 +
    childCount * 5 * 0.2
  );
}

/**
 * 给定一批进程，计算综合负载 Top N（默认 3）的 pid 集合。
 * 用于 skyscraper 候选判定。
 */
export function computeSkyscraperCandidates(
  processes: ProcessInfo[],
  childCountByPid: Map<number, number>,
  topN = 3,
): Set<number> {
  const scored = processes.map((p) => ({
    pid: p.pid,
    score: computeLoadScore(p, childCountByPid.get(p.pid) ?? 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return new Set(scored.slice(0, topN).map((s) => s.pid));
}

/**
 * 为单个进程选择建筑模型变体。
 *
 * @param process 进程信息
 * @param ctx 变体上下文（已预计算的辅助信息）
 */
export function selectModelVariant(
  process: ProcessInfo,
  ctx: VariantContext,
): VariantDecision {
  // === 优先级 1: 状态特化（最高优先级，异常状态优先表达）===
  // zombie/stopped/sleeping 即使 CPU 高也用对应状态变体
  // 因为状态信息比瞬时 CPU 更能表达"这个进程发生了什么"
  switch (process.state) {
    case "Zombie":
      return {
        variant: "building-zombie",
        reason: `zombie: state=Zombie (pid=${process.pid})`,
      };
    case "Stopped":
      return {
        variant: "building-stopped",
        reason: `stopped: state=Stopped (pid=${process.pid})`,
      };
    case "Sleeping":
      return {
        variant: "building-sleeping",
        reason: `sleeping: state=Sleeping (pid=${process.pid})`,
      };
  }

  // === 优先级 2: 类型特化（在 skyscraper 之前，类型信息是持久属性优先于瞬时负载）===
  // 一个数据库进程即使 CPU 高也用 database 变体，让用户一眼看出"这是数据库"
  if (isDatabaseProcess(process)) {
    return { variant: "building-database", reason: `database: name=${process.name}` };
  }
  if (isBrowserProcess(process)) {
    return { variant: "building-browser", reason: `browser: name=${process.name}` };
  }
  if (isEditorProcess(process)) {
    return { variant: "building-editor", reason: `editor: name=${process.name}` };
  }
  if (isRuntimeProcess(process)) {
    return { variant: "building-runtime", reason: `runtime: name=${process.name}` };
  }
  if (isCloudProcess(process)) {
    return { variant: "building-cloud", reason: `cloud: name=${process.name}` };
  }
  if (isSystemProcess(process)) {
    return { variant: "building-system", reason: `system: name=${process.name} user=${process.user}` };
  }

  // === 优先级 4: 摩天大楼（综合负载 Top 3）===
  // 注意：放在状态/类型之后，确保 zombie/database 等不会被误判为 skyscraper
  if (ctx.isSkyscraperCandidate && process.cpu > 30) {
    return {
      variant: "building-skyscraper",
      reason: `skyscraper: loadScore=${ctx.loadScore.toFixed(1)}, top 3`,
    };
  }

  // === 优先级 6/7: CPU 负载 ===
  if (process.cpu > 50) {
    return {
      variant: "building-tall",
      reason: `tall: cpu=${process.cpu.toFixed(1)}% > 50`,
    };
  }

  // === 优先级 8: 高内存 ===
  if (process.memory_mb > 1024) {
    return {
      variant: "building-tall",
      reason: `tall: memory=${process.memory_mb.toFixed(0)}MB > 1024`,
    };
  }

  // === 优先级 9: idle ===
  if (process.cpu < 5) {
    return {
      variant: "building-low",
      reason: `low: cpu=${process.cpu.toFixed(1)}% < 5`,
    };
  }

  // === 优先级 10: 默认 ===
  return {
    variant: "building-mid",
    reason: `mid: default (cpu=${process.cpu.toFixed(1)}%, mem=${process.memory_mb.toFixed(0)}MB)`,
  };
}
