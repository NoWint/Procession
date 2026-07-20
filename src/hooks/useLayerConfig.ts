import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LAYERS,
  LAYER_ORDER,
  type LayerId,
  type LayerState,
} from "../utils/layerConfig";

/**
 * 图层配置持久化到 localStorage 的 key。
 * 调试完成后保留用户上次设置，避免每次刷新都重置。
 */
const STORAGE_KEY = "procession-layer-config-v1";

/**
 * 从 localStorage 读取图层配置，缺失字段回退到 DEFAULT_LAYERS。
 * 任何解析错误都回退到 DEFAULT_LAYERS，保证安全。
 */
function loadFromStorage(): Record<LayerId, LayerState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LAYERS };
    const parsed = JSON.parse(raw) as Partial<Record<LayerId, Partial<LayerState>>>;
    // 合并默认值，防止新增图层缺失
    const merged = { ...DEFAULT_LAYERS };
    for (const id of LAYER_ORDER) {
      const partial = parsed[id];
      if (partial && typeof partial.visible === "boolean" && typeof partial.yLevel === "number") {
        merged[id] = { visible: partial.visible, yLevel: partial.yLevel };
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_LAYERS };
  }
}

function saveToStorage(layers: Record<LayerId, LayerState>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
  } catch {
    // 忽略存储错误（隐私模式等）
  }
}

export interface UseLayerConfig {
  layers: Record<LayerId, LayerState>;
  /** 局部更新某个图层的字段 */
  setLayer: (id: LayerId, partial: Partial<LayerState>) => void;
  /** 一次性重置所有图层到 DEFAULT_LAYERS */
  resetLayers: () => void;
  /** 关闭所有图层（仅保留指定图层可见），便于逐层调试 */
  isolateLayer: (id: LayerId) => void;
  /** 显示所有图层 */
  showAllLayers: () => void;
}

/**
 * 全局图层配置 hook。
 *
 * 用法：
 *   const { layers, setLayer, isolateLayer } = useLayerConfig();
 *   {layers.ground.visible && <CityGround yLevel={layers.ground.yLevel} ... />}
 *
 * 持久化策略：每次 layers 变化时写入 localStorage，
 * 初次挂载从 localStorage 读取，保证调试配置跨会话保留。
 */
export function useLayerConfig(): UseLayerConfig {
  const [layers, setLayers] = useState<Record<LayerId, LayerState>>(() => loadFromStorage());

  // 持久化：每次 layers 变化时写入
  useEffect(() => {
    saveToStorage(layers);
  }, [layers]);

  const setLayer = useCallback((id: LayerId, partial: Partial<LayerState>) => {
    setLayers((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...partial },
    }));
  }, []);

  const resetLayers = useCallback(() => {
    setLayers({ ...DEFAULT_LAYERS });
  }, []);

  const isolateLayer = useCallback((id: LayerId) => {
    setLayers((prev) => {
      const next = { ...prev };
      for (const lid of LAYER_ORDER) {
        next[lid] = { ...next[lid], visible: lid === id };
      }
      return next;
    });
  }, []);

  const showAllLayers = useCallback(() => {
    setLayers((prev) => {
      const next = { ...prev };
      for (const lid of LAYER_ORDER) {
        next[lid] = { ...next[lid], visible: true };
      }
      return next;
    });
  }, []);

  return { layers, setLayer, resetLayers, isolateLayer, showAllLayers };
}
