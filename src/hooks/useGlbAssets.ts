import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * 预建建筑 GLB 模型变体 ID。
 * 与 scripts/build-assets.mjs 中的 VARIANTS 保持一致。
 *
 * 4 个基础负载变体（Phase A-D）：
 *   - low / mid / tall / skyscraper
 *
 * 3 个状态特化变体（Phase E）：
 *   - zombie（废弃倾斜）/ stopped（深黑静止）/ sleeping（暗灰蓝低活动）
 *
 * 6 个类型特化变体（Phase F）：
 *   - system（扁平宽基座）/ database（高瘦塔+光柱）/ browser（多窗户）
 *   - editor（标准+天线）/ runtime（绿调中等）/ cloud（高+光柱）
 */
export type BuildingVariantId =
  | "building-low"
  | "building-mid"
  | "building-tall"
  | "building-skyscraper"
  | "building-zombie"
  | "building-stopped"
  | "building-sleeping"
  | "building-system"
  | "building-database"
  | "building-browser"
  | "building-editor"
  | "building-runtime"
  | "building-cloud";

export const BUILDING_VARIANT_IDS: BuildingVariantId[] = [
  "building-low",
  "building-mid",
  "building-tall",
  "building-skyscraper",
  "building-zombie",
  "building-stopped",
  "building-sleeping",
  "building-system",
  "building-database",
  "building-browser",
  "building-editor",
  "building-runtime",
  "building-cloud",
];

/**
 * 预建城市地标 GLB 模型 ID（Phase B）。
 * 与 scripts/build-assets.mjs 中的 LANDMARKS 保持一致。
 *
 * 3 个地标：
 *   - landmark-central-tower（中央雕塑塔，5 段收窄 + 顶部光柱）
 *   - street-tree（街边树木，树干 + 树冠）
 *   - streetlight-pole（路灯，杆 + 弧臂 + 灯头 + 基座）
 */
export type LandmarkId =
  | "landmark-central-tower"
  | "street-tree"
  | "streetlight-pole";

export const LANDMARK_IDS: LandmarkId[] = [
  "landmark-central-tower",
  "street-tree",
  "streetlight-pole",
];

/**
 * 预建屋顶装饰 GLB 模型 ID（Phase A：建筑装饰）。
 * 与 scripts/build-assets.mjs 中的 ROOF_DECORATIONS 保持一致。
 *
 * 4 个装饰：
 *   - roof-water-tank（水箱：圆柱 + 半球圆顶）
 *   - roof-antenna-tall（高天线：基座 + 主杆 + 信号灯）
 *   - roof-billboard-small（小广告牌：双面板 + 4 支撑杆）
 *   - roof-skylight（天窗：扁平发光板 + 凸起）
 */
export type RoofDecorationId =
  | "roof-water-tank"
  | "roof-antenna-tall"
  | "roof-billboard-small"
  | "roof-skylight";

export const ROOF_DECORATION_IDS: RoofDecorationId[] = [
  "roof-water-tank",
  "roof-antenna-tall",
  "roof-billboard-small",
  "roof-skylight",
];

/**
 * 预建车辆 GLB 模型 ID（Phase C 道路交通）。
 * 与 scripts/build-assets.mjs 中的 VEHICLES 保持一致。
 *
 *   - vehicle-car   ：轿车（车身+车顶+4轮+前/尾灯，朝向 +X 为车头）
 *   - vehicle-truck ：卡车（车头+集装箱+4轮+前/尾灯，朝向 +X 为车头）
 */
export type VehicleId = "vehicle-car" | "vehicle-truck";

export const VEHICLE_IDS: VehicleId[] = ["vehicle-car", "vehicle-truck"];

/**
 * 预建远景城市剪影 GLB 模型 ID（Phase D）。
 * 与 scripts/build-assets.mjs 中的 SKYLINES 保持一致。
 *
 *   - skyline-silhouette：50 个扁平剪影建筑沿 X 轴排列的合并几何，
 *     运行时由 Skyline.tsx 用 4 个 InstancedMesh 围绕地图边缘渲染
 */
export type SkylineId = "skyline-silhouette";

export const SKYLINE_IDS: SkylineId[] = ["skyline-silhouette"];

/**
 * 预建道路 GLB 模型 ID（Phase G：主动/被动道路）。
 * 与 scripts/build-assets.mjs 中的 ROADS 保持一致。
 *
 * 5 种形状（标准长度 10、宽度 4，运行时由 InstancedMesh 实例化 + scaleX 适配）：
 *   - road-straight:       直道（沥青 + 路缘 + 中央虚线）
 *   - road-intersection-4: 十字路口（8×8 中心广场 + 4 边斑马线 + 中心标记）
 *   - road-intersection-3: T 字路口（8×8 中心广场 + 3 边斑马线 + 三角标记）
 *   - road-curve:          90° 弯道（环形扇区 + 内外缘 + 中央曲线）
 *   - road-roundabout:     环岛（外环道 + 内中心岛 + 4 入口臂 + 中心装饰）
 *
 * 运行时由 CityGround 通过 useGlbAssets() 读取几何，用于主动道路骨架的
 * straight/radial 段实例化；环道仍用 RingGeometry（曲线不便用直段缩放）。
 */
export type RoadId =
  | "road-straight"
  | "road-intersection-4"
  | "road-intersection-3"
  | "road-curve"
  | "road-roundabout";

export const ROAD_IDS: RoadId[] = [
  "road-straight",
  "road-intersection-4",
  "road-intersection-3",
  "road-curve",
  "road-roundabout",
];

/** 单个变体加载后的资源：合并后的几何 + 共享材质数组 */
export interface VariantAsset {
  /** 从 GLB Scene 提取所有 Mesh 的几何，merge 成单一 BufferGeometry（用于 InstancedMesh） */
  geometry: THREE.BufferGeometry;
  /** 从 GLB 提取的材质数组（保留多材质，让 InstancedMesh 仍能渲染多色） */
  materials: THREE.Material[];
}

export type AssetMap = Partial<Record<BuildingVariantId, VariantAsset>> & {
  /**
   * 车辆几何映射（Phase C）。
   * 与建筑 VariantAsset 不同：车辆仅需 BufferGeometry（材质由 TrafficFlow
   * 根据主题动态生成），因此直接存储合并后的几何而非完整 VariantAsset。
   */
  vehicles?: Partial<Record<VehicleId, THREE.BufferGeometry>>;
  /**
   * 城市地标几何映射（Phase B）。
   * 与车辆一致：仅存合并后的 BufferGeometry，材质由 CityLandmarks 根据
   * 主题动态生成（accent emissive / vertex colors / lamp glow）。
   */
  landmarks?: Partial<Record<LandmarkId, THREE.BufferGeometry>>;
  /**
   * 屋顶装饰几何映射（Phase A：建筑装饰）。
   * 仅存合并后的 BufferGeometry，材质由 BuildingCluster 根据
   * 主题动态生成（onBeforeCompile 注入 accent/system/user 颜色 + emissive 强度）。
   */
  roofDecorations?: Partial<Record<RoofDecorationId, THREE.BufferGeometry>>;
  /**
   * 远景城市剪影几何映射（Phase D）。
   * 仅存合并后的 BufferGeometry，材质由 Skyline 根据
   * 主题动态生成（onBeforeCompile 注入 accent emissive + 主题剪影色）。
   */
  skyline?: Partial<Record<SkylineId, THREE.BufferGeometry>>;
  /**
   * 道路几何映射（Phase G：主动/被动道路）。
   * 仅存合并后的 BufferGeometry，材质由 CityGround 根据
   * 主题动态生成（vertexColors 保留沥青/路缘/黄线/斑马线/中心标记多色分段）。
   */
  roads?: Partial<Record<RoadId, THREE.BufferGeometry>>;
};

export interface UseGlbAssetsResult {
  /** 已加载完成的变体（部分加载也可用） */
  assets: AssetMap;
  /** 是否全部加载完毕（含失败） */
  loaded: boolean;
  /** 加载失败的变体 ID（用于回退到 box 占位） */
  failed: Set<BuildingVariantId | VehicleId | LandmarkId | RoofDecorationId | SkylineId | RoadId>;
}

/**
 * 异步加载预建建筑 GLB。
 *
 * - 加载策略：从 `/models/<id>.glb` 异步加载（Vite 把 public/ 目录映射到根路径）
 * - 失败容错：单个 GLB 失败时记录到 failed Set，不阻塞其他变体
 * - 部分加载可用：每加载完一个变体就更新 assets，BuildingCluster 可渐进替换占位 box
 * - 资源提取：把 GLB scene 中所有 Mesh 的几何合并为单一 BufferGeometry
 *
 * 不做 IndexedDB 缓存（MVP 阶段）：Vite 已有 HTTP 缓存，二次启动 304 即可。
 *
 * Phase C 扩展：同时加载 2 个车辆 GLB（vehicle-car / vehicle-truck），
 * 挂载到 assets.vehicles。TrafficFlow 通过 vehicles[id] 读取几何。
 */
export function useGlbAssets(): UseGlbAssetsResult {
  const [assets, setAssets] = useState<AssetMap>({});
  const [failed, setFailed] = useState<Set<BuildingVariantId | VehicleId | LandmarkId | RoofDecorationId | SkylineId | RoadId>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();

    // === 建筑变体加载（合并几何 + 保留材质数组） ===
    for (const id of BUILDING_VARIANT_IDS) {
      const url = `/models/${id}.glb`;
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;

          // 遍历 scene，收集所有 Mesh 的几何和材质
          const geometries: THREE.BufferGeometry[] = [];
          const materials: THREE.Material[] = [];
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              // 把世界变换 bake 进几何（让合并后保持正确位置）
              const cloned = mesh.geometry.clone();
              cloned.applyMatrix4(mesh.matrixWorld);
              geometries.push(cloned);
              if (Array.isArray(mesh.material)) {
                materials.push(...mesh.material);
              } else if (mesh.material) {
                materials.push(mesh.material);
              }
            }
          });

          // 合并所有几何为单一 BufferGeometry（InstancedMesh 要求单一几何）
          let merged: THREE.BufferGeometry;
          if (geometries.length === 0) {
            merged = new THREE.BufferGeometry();
          } else if (geometries.length === 1) {
            merged = geometries[0];
          } else {
            try {
              merged = mergeGeometries(geometries, false) ?? geometries[0];
            } catch (err) {
              console.warn(`[useGlbAssets] mergeGeometries failed for ${id}, fallback to first:`, err);
              merged = geometries[0];
            }
            // 释放未采用的临时克隆
            geometries.forEach((g) => {
              if (g !== merged) g.dispose();
            });
          }

          setAssets((prev) => ({
            ...prev,
            [id]: { geometry: merged, materials },
          }));
        },
        undefined, // 不需要 progress 回调
        (err) => {
          if (cancelled) return;
          console.warn(`[useGlbAssets] Failed to load ${url}:`, err);
          setFailed((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        },
      );
    }

    // === 车辆变体加载（Phase C：仅合并几何，材质由 TrafficFlow 主题动态生成） ===
    for (const id of VEHICLE_IDS) {
      const url = `/models/${id}.glb`;
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;

          const geometries: THREE.BufferGeometry[] = [];
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              const cloned = mesh.geometry.clone();
              cloned.applyMatrix4(mesh.matrixWorld);
              geometries.push(cloned);
            }
          });

          let merged: THREE.BufferGeometry;
          if (geometries.length === 0) {
            merged = new THREE.BufferGeometry();
          } else if (geometries.length === 1) {
            merged = geometries[0];
          } else {
            try {
              merged = mergeGeometries(geometries, false) ?? geometries[0];
            } catch (err) {
              console.warn(`[useGlbAssets] mergeGeometries failed for ${id}, fallback to first:`, err);
              merged = geometries[0];
            }
            geometries.forEach((g) => {
              if (g !== merged) g.dispose();
            });
          }

          setAssets((prev) => ({
            ...prev,
            vehicles: {
              ...(prev.vehicles ?? {}),
              [id]: merged,
            },
          }));
        },
        undefined,
        (err) => {
          if (cancelled) return;
          console.warn(`[useGlbAssets] Failed to load ${url}:`, err);
          setFailed((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        },
      );
    }

    // === 城市地标加载（Phase B：仅合并几何，材质由 CityLandmarks 主题动态生成） ===
    for (const id of LANDMARK_IDS) {
      const url = `/models/${id}.glb`;
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;

          const geometries: THREE.BufferGeometry[] = [];
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              const cloned = mesh.geometry.clone();
              cloned.applyMatrix4(mesh.matrixWorld);
              geometries.push(cloned);
            }
          });

          let merged: THREE.BufferGeometry;
          if (geometries.length === 0) {
            merged = new THREE.BufferGeometry();
          } else if (geometries.length === 1) {
            merged = geometries[0];
          } else {
            try {
              merged = mergeGeometries(geometries, false) ?? geometries[0];
            } catch (err) {
              console.warn(`[useGlbAssets] mergeGeometries failed for ${id}, fallback to first:`, err);
              merged = geometries[0];
            }
            geometries.forEach((g) => {
              if (g !== merged) g.dispose();
            });
          }

          setAssets((prev) => ({
            ...prev,
            landmarks: {
              ...(prev.landmarks ?? {}),
              [id]: merged,
            },
          }));
        },
        undefined,
        (err) => {
          if (cancelled) return;
          console.warn(`[useGlbAssets] Failed to load ${url}:`, err);
          setFailed((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        },
      );
    }

    // === 屋顶装饰加载（Phase A：仅合并几何，材质由 BuildingCluster 主题动态生成） ===
    for (const id of ROOF_DECORATION_IDS) {
      const url = `/models/${id}.glb`;
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;

          const geometries: THREE.BufferGeometry[] = [];
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              const cloned = mesh.geometry.clone();
              cloned.applyMatrix4(mesh.matrixWorld);
              geometries.push(cloned);
            }
          });

          let merged: THREE.BufferGeometry;
          if (geometries.length === 0) {
            merged = new THREE.BufferGeometry();
          } else if (geometries.length === 1) {
            merged = geometries[0];
          } else {
            try {
              merged = mergeGeometries(geometries, false) ?? geometries[0];
            } catch (err) {
              console.warn(`[useGlbAssets] mergeGeometries failed for ${id}, fallback to first:`, err);
              merged = geometries[0];
            }
            geometries.forEach((g) => {
              if (g !== merged) g.dispose();
            });
          }

          setAssets((prev) => ({
            ...prev,
            roofDecorations: {
              ...(prev.roofDecorations ?? {}),
              [id]: merged,
            },
          }));
        },
        undefined,
        (err) => {
          if (cancelled) return;
          console.warn(`[useGlbAssets] Failed to load ${url}:`, err);
          setFailed((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        },
      );
    }

    // === 远景剪影加载（Phase D：仅合并几何，材质由 Skyline 主题动态生成） ===
    for (const id of SKYLINE_IDS) {
      const url = `/models/${id}.glb`;
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;

          const geometries: THREE.BufferGeometry[] = [];
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              const cloned = mesh.geometry.clone();
              cloned.applyMatrix4(mesh.matrixWorld);
              geometries.push(cloned);
            }
          });

          let merged: THREE.BufferGeometry;
          if (geometries.length === 0) {
            merged = new THREE.BufferGeometry();
          } else if (geometries.length === 1) {
            merged = geometries[0];
          } else {
            try {
              merged = mergeGeometries(geometries, false) ?? geometries[0];
            } catch (err) {
              console.warn(`[useGlbAssets] mergeGeometries failed for ${id}, fallback to first:`, err);
              merged = geometries[0];
            }
            geometries.forEach((g) => {
              if (g !== merged) g.dispose();
            });
          }

          setAssets((prev) => ({
            ...prev,
            skyline: {
              ...(prev.skyline ?? {}),
              [id]: merged,
            },
          }));
        },
        undefined,
        (err) => {
          if (cancelled) return;
          console.warn(`[useGlbAssets] Failed to load ${url}:`, err);
          setFailed((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        },
      );
    }

    // === 道路加载（Phase G：仅合并几何，材质由 CityGround 主题动态生成） ===
    for (const id of ROAD_IDS) {
      const url = `/models/${id}.glb`;
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;

          const geometries: THREE.BufferGeometry[] = [];
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              const cloned = mesh.geometry.clone();
              cloned.applyMatrix4(mesh.matrixWorld);
              geometries.push(cloned);
            }
          });

          let merged: THREE.BufferGeometry;
          if (geometries.length === 0) {
            merged = new THREE.BufferGeometry();
          } else if (geometries.length === 1) {
            merged = geometries[0];
          } else {
            try {
              merged = mergeGeometries(geometries, false) ?? geometries[0];
            } catch (err) {
              console.warn(`[useGlbAssets] mergeGeometries failed for ${id}, fallback to first:`, err);
              merged = geometries[0];
            }
            geometries.forEach((g) => {
              if (g !== merged) g.dispose();
            });
          }

          setAssets((prev) => ({
            ...prev,
            roads: {
              ...(prev.roads ?? {}),
              [id]: merged,
            },
          }));
        },
        undefined,
        (err) => {
          if (cancelled) return;
          console.warn(`[useGlbAssets] Failed to load ${url}:`, err);
          setFailed((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        },
      );
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // loaded 判定：所有建筑变体 + 所有车辆变体 + 所有地标 + 所有屋顶装饰 + 所有远景剪影 + 所有道路都已加载或失败
  const buildingsLoaded = BUILDING_VARIANT_IDS.every(
    (id) => assets[id] !== undefined || failed.has(id),
  );
  const vehiclesLoaded = VEHICLE_IDS.every(
    (id) => (assets.vehicles?.[id] !== undefined) || failed.has(id),
  );
  const landmarksLoaded = LANDMARK_IDS.every(
    (id) => (assets.landmarks?.[id] !== undefined) || failed.has(id),
  );
  const roofDecorationsLoaded = ROOF_DECORATION_IDS.every(
    (id) => (assets.roofDecorations?.[id] !== undefined) || failed.has(id),
  );
  const skylineLoaded = SKYLINE_IDS.every(
    (id) => (assets.skyline?.[id] !== undefined) || failed.has(id),
  );
  const roadsLoaded = ROAD_IDS.every(
    (id) => (assets.roads?.[id] !== undefined) || failed.has(id),
  );
  const loaded = buildingsLoaded && vehiclesLoaded && landmarksLoaded && roofDecorationsLoaded && skylineLoaded && roadsLoaded;

  return { assets, loaded, failed };
}
