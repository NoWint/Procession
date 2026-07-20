/**
 * 全局 3D 图层配置。
 *
 * 设计目的：
 * 1. 统一管理 12 个 3D 图层的可见性与 Y 坐标锚点，避免散落在各组件
 * 2. 支持逐层构建调试：可单独隐藏/显示任意图层，便于从地面到天空按顺序调试
 * 3. 与 useLayerConfig hook 配合，状态持久化到 localStorage
 *
 * Y 坐标锚点说明：
 * - 贴地层（0~0.05）：地板 / 道路 / 街区边界 / 热区
 * - 装饰层（0.06~0.15）：光晕 / 光缆 / 港口
 * - 车辆层（0.30）：车辆
 * - 远景层（200）：天空球壳
 *
 * 注意：DEFAULT_LAYERS 是初始默认值，运行时由 useLayerConfig 控制。
 */
import {
  BUILDING_BASE_Y,
  CABLE_Y,
  DOCK_Y,
  GROUND_Y,
  HALO_Y,
  HEATMAP_Y,
  VEHICLE_Y,
} from "./worldCoords";

export type LayerId =
  | "sky" // SkyDome + Atmosphere（天空层）
  | "ground" // CityGround（地板 + 道路 + 街区边界）
  | "skyline" // Skyline（背景剪影）
  | "landmarks" // CityLandmarks（中央塔 + 路灯 + 树木）
  | "buildings" // BuildingCluster
  | "halo" // BuildingHalo
  | "cables" // CableSystem（光缆 = TCP 连接）
  | "ports" // PortHarbors（监听港口）
  | "traffic" // TrafficFlow（车辆粒子）
  | "heatmap" // FsHeatmap（文件系统热区）
  | "trees" // CityTrees（待删除，先保留开关）
  | "postfx"; // BloomEffect（后处理）

export interface LayerState {
  /** 是否渲染该图层 */
  visible: boolean;
  /**
   * Y 坐标锚点。组件用此值放置 mesh 中心。
   * 注意：组件内部仍可基于此锚点做相对偏移（如建筑 halo yLevel=0.10，
   * 内部 ringGeometry 仍以 -π/2 旋转平铺）。
   */
  yLevel: number;
}

/**
 * 默认图层配置。
 *
 * 默认所有图层都 visible=true，保持当前渲染行为不变。
 * 调试时可在 SettingsPanel 的「图层调试」section 关闭其他图层，
 * 只打开当前要调试的图层。
 *
 * yLevel 数值取自盘点结果（详见 conversation）：
 * - ground=0（地板平面）
 * - halo=0.10（P2 修正后，避开 cable）
 * - cables=0.04（P2 修正后，下沉到 halo 下方避免共面）
 * - heatmap=0.05（P2 修正后，脱离 road 共面）
 * - ports=0.15、traffic=0.30 保持原值
 * - sky/skyline/landmarks/buildings/trees/postfx 的 Y 由组件内部决定（用 0 占位）
 */
export const DEFAULT_LAYERS: Record<LayerId, LayerState> = {
  sky: { visible: true, yLevel: 0 },
  ground: { visible: true, yLevel: GROUND_Y },
  skyline: { visible: true, yLevel: 0 },
  landmarks: { visible: true, yLevel: 0 },
  buildings: { visible: true, yLevel: BUILDING_BASE_Y },
  halo: { visible: true, yLevel: HALO_Y },
  cables: { visible: true, yLevel: CABLE_Y },
  ports: { visible: true, yLevel: DOCK_Y },
  traffic: { visible: true, yLevel: VEHICLE_Y },
  heatmap: { visible: true, yLevel: HEATMAP_Y },
  trees: { visible: false, yLevel: 0 },
  postfx: { visible: true, yLevel: 0 },
};

/**
 * 图层显示顺序（用于 UI 渲染排序，从地面到天空）。
 * 与"从地面→主城区→道路→设施→建筑→车流→TCP→天空"的构建调试顺序一致。
 */
export const LAYER_ORDER: LayerId[] = [
  "ground", // 1. 地板 + 道路
  "skyline", // 2. 背景剪影
  "landmarks", // 3. 中央塔 + 路灯 + 树木
  "buildings", // 4. 建筑实体
  "halo", // 5. 建筑光晕
  "cables", // 6. 光缆（TCP 连接）
  "ports", // 7. 监听港口
  "traffic", // 8. 车流
  "heatmap", // 9. 文件系统热区
  "sky", // 10. 天空 + 星空
  "postfx", // 11. Bloom 后处理
  "trees", // 末尾（待删除）
];

/**
 * 图层中文名（用于 SettingsPanel UI 显示）。
 */
export const LAYER_LABELS: Record<LayerId, string> = {
  sky: "天空 / 星空",
  ground: "地面 + 道路",
  skyline: "背景剪影",
  landmarks: "地标（塔/路灯/树）",
  buildings: "建筑实体",
  halo: "建筑光晕",
  cables: "光缆（TCP 连接）",
  ports: "监听港口",
  traffic: "车流",
  heatmap: "文件系统热区",
  trees: "树木 grid（待删除）",
  postfx: "Bloom 后处理",
};
