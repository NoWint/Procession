/**
 * 世界坐标系常量（Y 轴层级 + 平面尺寸）。
 *
 * 设计目的：
 * 1. 统一管理所有 3D 组件的 Y 坐标层级，避免散落在各组件本地常量
 * 2. 防止 z-fight：贴地层多个组件 Y 值原本散乱
 * 3. 与 layerConfig.ts 联动：layerConfig 的默认 yLevel 从此处导入
 *
 * Y 层级（从下到上，进程树驱动道路系统 v6）：
 * - 地板层 0       (GROUND_Y)        — 主题色地板 planeGeometry
 * - 主干道层 0.015 (ROAD_MAJOR_Y)    — 进程树主干道 GLB（每个 root 一条）
 * - 次干道层 0.018 (ROAD_MINOR_Y)    — 连接相邻 root 主干道的次干道
 * - 光缆层 0.04    (CABLE_Y)         — CableSystem 管道
 * - 热区层 0.05    (HEATMAP_Y)       — 文件系统热点
 * - 光晕层 0.10    (HALO_Y)          — BuildingHalo
 * - 港口层 0.15    (DOCK_Y)          — PortHarbors
 * - 车辆层 0.30    (VEHICLE_Y)       — 车辆 GLB（重写后保留）
 *
 * 历史回顾：
 * v6（2026-07-20）：废弃固定十字+内外环道路，改为进程树驱动。
 *                   ROAD_Y 拆分为 ROAD_MAJOR_Y / ROAD_MINOR_Y。
 *                   移除 BLOCK_BORDER_Y / INTERSECTION_Y / BLOCK_CENTER_Y（街区边界已移除）。
 * v5 及之前：固定几何道路（十字/环/放射），已废弃。
 */

/** 地板层 — 主题色地板 planeGeometry 的 Y */
export const GROUND_Y = 0;

/** 主干道层 — 进程树主干道 GLB 的 Y（每个 root 一条，略高于地板避免 z-fight） */
export const ROAD_MAJOR_Y = 0.015;

/** 次干道层 — 连接相邻 root 主干道的次干道 Y（略高于主干道，叠层视觉） */
export const ROAD_MINOR_Y = 0.018;

/** 文件系统热区层 — ringGeometry 平铺的 Y（脱离道路层避免共面） */
export const HEATMAP_Y = 0.05;

/** 光缆层 — CableSystem 管道 TubeGeometry 的 Y */
export const CABLE_Y = 0.04;

/** 建筑光晕层 — BuildingHalo ringGeometry 平铺的 Y */
export const HALO_Y = 0.1;

/** 港口码头层 — PortHarbors dock BoxGeometry 的 Y */
export const DOCK_Y = 0.15;

/** 车辆层 — 车辆 GLB 的 Y（重写后保留） */
export const VEHICLE_Y = 0.3;

/**
 * 城市建筑基座 Y。
 * BuildingCluster 中 GLB 模型 y=0；降级 box y=h/2（在组件内部计算）。
 */
export const BUILDING_BASE_Y = 0;

/**
 * 城市地面尺寸常量。
 */
export const CITY_GEOMETRY = {
  /**
   * 主地板 planeGeometry 边长。
   * 独立于道路网格，扩充到 400 提供宽阔视野（容纳 Skyline 在 ±100 位置）。
   */
  GROUND_PLANE_SIZE: 400,
  /**
   * 道路影响范围（道路 + 建筑分布半径）。
   * 进程树驱动下，root 极坐标 r ∈ [10, 60] 都在此范围内。
   */
  GROUND_SIZE: 160,
  /** 城市半径（用于 Skyline 摆放、CableSystem 远端半径等） */
  CITY_RADIUS: 80,
  /** 道路 GLB 标准长度（与 build-assets.mjs ROAD_CANONICAL_LENGTH 同步） */
  ROAD_GLB_LENGTH: 10,
  /** 道路 GLB 标准宽度（与 build-assets.mjs ROAD_CANONICAL_WIDTH 同步） */
  ROAD_GLB_WIDTH: 4,
} as const;
