import { useEffect, useRef, useState } from "react";

/** 三档质量策略：单向降级，仅下不上。 */
export type Quality = "high" | "med" | "low";

export interface FpsMonitorOptions {
  /** 滚动平均的样本窗口大小（沿用旧实现，单位：帧）。 */
  sampleSize?: number;
  /** 触发 high→med 降级的 FPS 阈值，持续 degradePersistMs 后触发（默认 28）。 */
  medFpsThreshold?: number;
  /** 触发 med→low 降级的 FPS 阈值，持续 degradePersistMs 后触发（默认 20）。 */
  lowFpsThreshold?: number;
  /** FPS 低于阈值必须持续的毫秒数才触发降级，去抖用（默认 5000ms）。 */
  degradePersistMs?: number;
  /** 降级冷却毫秒数，上次切换后该时间内不再触发新的降级（默认 8000ms）。 */
  cooldownMs?: number;
  /** 基础建筑数，low 档会降为 60%（默认 200）。 */
  maxBuildings?: number;
  /** 非 low 档时的 DPR 值，low 档强制 1.0（默认 1.5，与 CityScene dpr 上限一致）。 */
  highDpr?: number;
}

export interface FpsSnapshot {
  /** 当前滚动平均 FPS。 */
  fps: number;
  /** 根据当前 quality 调整后的建筑数。 */
  buildingCount: number;
  /** 当前质量档位。 */
  quality: Quality;
  /** 是否启用 Bloom 后处理（仅 high 档为 true）。 */
  bloomEnabled: boolean;
  /** 当前应使用的 DPR 值，由调用方（CityScene）通过 gl.setPixelRatio 应用。 */
  dpr: number;
}

const DEFAULT_SAMPLE_SIZE = 30;
const DEFAULT_MED_FPS_THRESHOLD = 28;
const DEFAULT_LOW_FPS_THRESHOLD = 20;
const DEFAULT_DEGRADE_PERSIST_MS = 5000;
const DEFAULT_COOLDOWN_MS = 8000;
const DEFAULT_MAX_BUILDINGS = 200;
const DEFAULT_HIGH_DPR = 1.5;
const LOW_QUALITY_DPR = 1.0;
const LOW_QUALITY_BUILDING_RATIO = 0.6;

/**
 * 监控渲染 FPS 并维护 high/med/low 三档质量策略。
 *
 * 状态机规则：
 * - 默认 high 档：bloom on，建筑数 = maxBuildings
 * - FPS < medFpsThreshold 持续 degradePersistMs → 降至 med：bloom off，建筑数不变
 * - FPS < lowFpsThreshold 持续 degradePersistMs → 降至 low：bloom off，建筑数减 40%，DPR 降到 1.0
 * - 单向降级（仅下不上），不会自动从 low 升回 med 或 high
 * - 切换冷却 cooldownMs：上次切换后该时间内不再触发新的降级
 * - degradePersistMs 去抖：FPS 低于阈值必须持续该时长才触发，短暂波动不触发
 *
 * 注：此 hook 通过 requestAnimationFrame 监控 FPS，不在 R3F Canvas 内执行，
 *     因此不直接调用 gl.setPixelRatio；目标 DPR 通过返回值暴露给调用方处理。
 */
export function useFpsMonitor(options: FpsMonitorOptions = {}): FpsSnapshot {
  const {
    sampleSize = DEFAULT_SAMPLE_SIZE,
    medFpsThreshold = DEFAULT_MED_FPS_THRESHOLD,
    lowFpsThreshold = DEFAULT_LOW_FPS_THRESHOLD,
    degradePersistMs = DEFAULT_DEGRADE_PERSIST_MS,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    maxBuildings = DEFAULT_MAX_BUILDINGS,
    highDpr = DEFAULT_HIGH_DPR,
  } = options;

  const [fps, setFps] = useState(60);
  const [quality, setQuality] = useState<Quality>("high");

  // rAF 循环内部使用的可变状态，全部走 ref 以避免重新订阅 rAF
  const samplesRef = useRef<number[]>([]);
  const lastTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  // 跟踪当前 quality，避免 rAF 闭包陈旧
  const qualityRef = useRef<Quality>("high");
  // 跟踪 FPS 持续低于阈值的开始时间（去抖计时器）
  const lowSinceRef = useRef<number | null>(null);
  // 上次降级时间戳（冷却判断），初始 -Infinity 确保首次降级不被冷却阻挡
  const lastDegradeRef = useRef<number>(-Infinity);

  // 同步 quality 到 ref，供 rAF 回调读取最新值
  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  // 配置项也通过 ref 传递，避免配置变化时重新订阅 rAF
  const configRef = useRef({
    sampleSize,
    medFpsThreshold,
    lowFpsThreshold,
    degradePersistMs,
    cooldownMs,
  });
  useEffect(() => {
    configRef.current = {
      sampleSize,
      medFpsThreshold,
      lowFpsThreshold,
      degradePersistMs,
      cooldownMs,
    };
  }, [sampleSize, medFpsThreshold, lowFpsThreshold, degradePersistMs, cooldownMs]);

  useEffect(() => {
    const tick = (time: number) => {
      const cfg = configRef.current;

      if (lastTimeRef.current !== null) {
        const delta = time - lastTimeRef.current;
        if (delta > 0) {
          const instant = 1000 / delta;
          const samples = samplesRef.current;
          samples.push(instant);
          if (samples.length > cfg.sampleSize) {
            samples.shift();
          }
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
          setFps(Math.round(avg));

          // 状态机：单向降级 high → med → low
          const currentQuality = qualityRef.current;
          if (currentQuality !== "low") {
            // high 档看 medFpsThreshold（目标 med）；med 档看 lowFpsThreshold（目标 low）
            const threshold =
              currentQuality === "high" ? cfg.medFpsThreshold : cfg.lowFpsThreshold;
            const targetQuality: Quality =
              currentQuality === "high" ? "med" : "low";

            if (avg < threshold) {
              // 进入或保持低 FPS 状态
              if (lowSinceRef.current === null) {
                lowSinceRef.current = time;
              }
              // 同时满足去抖持续时长 + 冷却期才触发降级
              const persisted = time - lowSinceRef.current;
              const sinceLastDegrade = time - lastDegradeRef.current;
              if (persisted >= cfg.degradePersistMs && sinceLastDegrade >= cfg.cooldownMs) {
                setQuality(targetQuality);
                qualityRef.current = targetQuality;
                lastDegradeRef.current = time;
                // 重置持续计时器：下一档降级需要重新积累 degradePersistMs
                lowSinceRef.current = null;
              }
            } else {
              // FPS 恢复，重置持续计时器（去抖：必须连续 degradePersistMs 低于阈值）
              lowSinceRef.current = null;
            }
          }
        }
      }
      lastTimeRef.current = time;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // 空依赖：只订阅一次 rAF，所有可变状态走 ref

  // 派生返回值
  const bloomEnabled = quality === "high";
  const dpr = quality === "low" ? LOW_QUALITY_DPR : highDpr;
  const buildingCount =
    quality === "low"
      ? Math.floor(maxBuildings * LOW_QUALITY_BUILDING_RATIO)
      : maxBuildings;

  return { fps, buildingCount, quality, bloomEnabled, dpr };
}
