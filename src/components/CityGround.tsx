import { useMemo } from "react";
import * as THREE from "three";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import { useGlbAssets } from "../hooks/useGlbAssets";
import type { ProcessTreeRoadNetwork, MajorRoad, MinorRoad } from "../utils/layout";
import { CITY_GEOMETRY, ROAD_MAJOR_Y, ROAD_MINOR_Y } from "../utils/worldCoords";

interface CityGroundProps {
  theme?: Theme;
  roads?: ProcessTreeRoadNetwork;
}

const { GROUND_PLANE_SIZE, ROAD_GLB_LENGTH, ROAD_GLB_WIDTH } = CITY_GEOMETRY;

/**
 * 地面：主题色地板 + 进程树道路系统（主干道 + 次干道）。
 *
 * 范式（v6，2026-07-20，进程树驱动）：
 *   1. 主地板 — 主题色铺满 400×400，提供宽阔视野
 *   2. 主干道 — 每个 root 一条 road-straight GLB（含路缘 + 中央虚线）
 *      按 (length, width) 缩放，位置 (cx, cz)，朝向 rotY
 *   3. 次干道 — 连接相邻 root 主干道端点的 road-straight GLB（窄）
 *
 * 数据来源：App.tsx 调用 computeGridPositions(processes) 后传入 layoutResult.roads。
 * 道路几何完全由 pid 决定（稳定），不随 cpu 变化重算。
 *
 * 旋转修正：planeGeometry 默认在 XY 平面（立面），
 * 必须把 mesh.rotation.x = -π/2 才能平铺在 XZ 平面（地面）。
 * R3F 中 rotation-x 是 mesh 属性，不是 geometry 子元素属性。
 *
 * GLB 几何说明：road-straight GLB 本地 +X 是长度方向，+Z 是宽度方向。
 * 渲染时 mesh.rotation=[0, rotY, 0] 把 +X 转到道路朝向。
 */
export default function CityGround({
  theme = FALLBACK_THEME,
  roads,
}: CityGroundProps) {
  const { assets } = useGlbAssets();
  const straightRoadGeo = assets.roads?.["road-straight"];

  const isLight = theme.mode === "light";
  const themeName = theme.name.toLowerCase();
  const isBlue = themeName.includes("blue") || themeName.includes("midnight");

  // 主干道 fallback 几何：GLB 未加载时用 PlaneGeometry（已 rotateX 平铺）
  const fallbackMajorGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ROAD_GLB_LENGTH, ROAD_GLB_WIDTH, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // 次干道 fallback 几何：宽度更窄（2.0）
  const fallbackMinorGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ROAD_GLB_LENGTH, 2.0, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // 主干道渲染数据
  const majorItems = useMemo<Array<{ road: MajorRoad; pos: [number, number, number]; scaleX: number; scaleZ: number }>>(() => {
    if (!roads) return [];
    return roads.majorRoads.map((road) => ({
      road,
      pos: [road.cx, ROAD_MAJOR_Y, road.cz],
      scaleX: road.length / ROAD_GLB_LENGTH,
      scaleZ: road.width / ROAD_GLB_WIDTH,
    }));
  }, [roads]);

  // 次干道渲染数据
  const minorItems = useMemo<Array<{ road: MinorRoad; pos: [number, number, number]; scaleX: number; scaleZ: number }>>(() => {
    if (!roads) return [];
    return roads.minorRoads.map((road) => ({
      road,
      pos: [road.midX, ROAD_MINOR_Y, road.midZ],
      scaleX: road.length / ROAD_GLB_LENGTH,
      scaleZ: road.width / ROAD_GLB_WIDTH,
    }));
  }, [roads]);

  const majorColor = isLight ? "#3a3a3a" : isBlue ? "#0c1a2c" : "#1c1c1c";
  const minorColor = isLight ? "#2e2e2e" : isBlue ? "#0a1420" : "#161616";

  return (
    <group>
      {/* 1. 主题色地板（rotation 必须在 mesh 上，不能放在 planeGeometry 子元素上） */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_PLANE_SIZE, GROUND_PLANE_SIZE]} />
        <meshStandardMaterial
          color={theme.colors.ground}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* 2a. 主干道 — road-straight GLB（含路缘 + 中央虚线） */}
      {straightRoadGeo && majorItems.map((item, i) => (
        <mesh
          key={`major-${item.road.rootPid}-${i}`}
          geometry={straightRoadGeo}
          position={item.pos}
          rotation={[0, item.road.rotY, 0]}
          scale={[item.scaleX, 1, item.scaleZ]}
          frustumCulled={false}
          receiveShadow
        >
          <meshStandardMaterial
            vertexColors
            roughness={0.85}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* 2b. 主干道 fallback：GLB 未加载时用纯色 PlaneGeometry */}
      {!straightRoadGeo && majorItems.map((item, i) => (
        <mesh
          key={`major-fb-${item.road.rootPid}-${i}`}
          geometry={fallbackMajorGeo}
          position={item.pos}
          rotation={[0, item.road.rotY, 0]}
          scale={[item.scaleX, 1, item.scaleZ]}
          frustumCulled={false}
          receiveShadow
        >
          <meshStandardMaterial
            color={majorColor}
            emissive={isBlue ? theme.colors.accent : majorColor}
            emissiveIntensity={isLight ? 0.0 : isBlue ? 0.08 : 0.03}
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      ))}

      {/* 3a. 次干道 — road-straight GLB（缩放更窄，宽度 2.0） */}
      {straightRoadGeo && minorItems.map((item, i) => (
        <mesh
          key={`minor-${item.road.fromRootPid}-${item.road.toRootPid}-${i}`}
          geometry={straightRoadGeo}
          position={item.pos}
          rotation={[0, item.road.rotY, 0]}
          scale={[item.scaleX, 1, item.scaleZ]}
          frustumCulled={false}
          receiveShadow
        >
          <meshStandardMaterial
            vertexColors
            roughness={0.85}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* 3b. 次干道 fallback：GLB 未加载时用纯色 PlaneGeometry */}
      {!straightRoadGeo && minorItems.map((item, i) => (
        <mesh
          key={`minor-fb-${item.road.fromRootPid}-${item.road.toRootPid}-${i}`}
          geometry={fallbackMinorGeo}
          position={item.pos}
          rotation={[0, item.road.rotY, 0]}
          scale={[item.scaleX, 1, item.scaleZ]}
          frustumCulled={false}
          receiveShadow
        >
          <meshStandardMaterial
            color={minorColor}
            emissive={isBlue ? theme.colors.accent : minorColor}
            emissiveIntensity={isLight ? 0.0 : isBlue ? 0.06 : 0.02}
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  );
}
