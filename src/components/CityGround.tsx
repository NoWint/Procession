import { useMemo } from "react";
import * as THREE from "three";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import { useGlbAssets } from "../hooks/useGlbAssets";
import type {
  ProcessTreeRoadNetwork,
  MajorRoad,
  MinorRoad,
  RoadSegment,
  RoadCurve,
  RoadIntersection,
} from "../utils/layout";
import { CITY_GEOMETRY, ROAD_MAJOR_Y, ROAD_MINOR_Y } from "../utils/worldCoords";

interface CityGroundProps {
  theme?: Theme;
  roads?: ProcessTreeRoadNetwork;
}

const { GROUND_PLANE_SIZE, ROAD_GLB_LENGTH, ROAD_GLB_WIDTH } = CITY_GEOMETRY;

/**
 * 地面：主题色地板 + 进程树道路系统（v7：连贯路网）。
 *
 * 渲染层级：
 *   1. 主地板 — 主题色 400×400 planeGeometry
 *   2. 主干道 — road-straight GLB（每个 root 一条）
 *   3. 路口 — road-intersection-3 GLB（主干道两端 T 字路口收口）
 *   4. 次干道 L 形段 — road-straight GLB（每段直线）
 *   5. 弯道 — road-curve GLB（L 形拐角处的 90° 弧形）
 *
 * 数据来源：App.tsx 调用 computeGridPositions(processes) 后传入 layoutResult.roads。
 * 道路几何完全由 pid 决定（稳定），不随 cpu 变化重算。
 *
 * 旋转修正：planeGeometry 默认在 XY 平面（立面），
 * 必须把 mesh.rotation.x = -π/2 才能平铺在 XZ 平面（地面）。
 * R3F 中 rotation-x 是 mesh 属性，不是 geometry 子元素属性。
 *
 * GLB 几何说明：
 *   - road-straight: 本地 +X = 长度方向（10），+Z = 宽度方向（4）
 *   - road-intersection-3: 8×8 中心广场 + 3 边斑马线（北/东/西），南边封口
 *   - road-curve: 内 R=4、外 R=8 的 90° 扇区，圆心在原点，从 +X 扫到 +Z
 *
 * 渲染时 mesh.rotation=[0, rotY, 0] 把 +X 转到道路朝向。
 */
export default function CityGround({
  theme = FALLBACK_THEME,
  roads,
}: CityGroundProps) {
  const { assets } = useGlbAssets();
  const straightRoadGeo = assets.roads?.["road-straight"];
  const intersection3Geo = assets.roads?.["road-intersection-3"];
  const curveGeo = assets.roads?.["road-curve"];

  const isLight = theme.mode === "light";
  const themeName = theme.name.toLowerCase();
  const isBlue = themeName.includes("blue") || themeName.includes("midnight");

  // Fallback 几何：GLB 未加载时用 PlaneGeometry（已 rotateX 平铺）
  const fallbackMajorGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ROAD_GLB_LENGTH, ROAD_GLB_WIDTH, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const fallbackMinorGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ROAD_GLB_LENGTH, 2.0, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // 路口 fallback：8×8 方形
  const fallbackIntersectionGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(8, 8, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // 弯道 fallback：用 RingGeometry 模拟 90° 弯道（内 R=4、外 R=8）
  const fallbackCurveGeo = useMemo(() => {
    const geo = new THREE.RingGeometry(4, 8, 24, 1, 0, Math.PI / 2);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // === 主干道渲染数据 ===
  const majorItems = useMemo<Array<{
    road: MajorRoad; pos: [number, number, number]; scaleX: number; scaleZ: number;
  }>>(() => {
    if (!roads) return [];
    return roads.majorRoads.map((road) => ({
      road,
      pos: [road.cx, ROAD_MAJOR_Y, road.cz],
      scaleX: road.length / ROAD_GLB_LENGTH,
      scaleZ: road.width / ROAD_GLB_WIDTH,
    }));
  }, [roads]);

  // === 路口渲染数据（主干道两端 T 字） ===
  const intersectionItems = useMemo<Array<{
    item: RoadIntersection; pos: [number, number, number];
  }>>(() => {
    if (!roads) return [];
    return roads.intersections.map((item) => ({
      item,
      pos: [item.cx, ROAD_MAJOR_Y + 0.001, item.cz],  // 略高于主干道避免 z-fight
    }));
  }, [roads]);

  // === 次干道渲染数据：所有 L 形段展开 ===
  const minorSegmentItems = useMemo<Array<{
    minor: MinorRoad; seg: RoadSegment; pos: [number, number, number]; scaleX: number; scaleZ: number;
  }>>(() => {
    if (!roads) return [];
    const items: Array<{ minor: MinorRoad; seg: RoadSegment; pos: [number, number, number]; scaleX: number; scaleZ: number }> = [];
    for (const minor of roads.minorRoads) {
      for (const seg of minor.segments) {
        items.push({
          minor,
          seg,
          pos: [seg.cx, ROAD_MINOR_Y, seg.cz],
          scaleX: seg.length / ROAD_GLB_LENGTH,
          scaleZ: seg.width / ROAD_GLB_WIDTH,
        });
      }
    }
    return items;
  }, [roads]);

  // === 弯道渲染数据 ===
  const curveItems = useMemo<Array<{
    curve: RoadCurve; pos: [number, number, number];
  }>>(() => {
    if (!roads) return [];
    return roads.curves.map((curve) => ({
      curve,
      pos: [curve.cx, ROAD_MINOR_Y + 0.001, curve.cz],
    }));
  }, [roads]);

  const majorColor = isLight ? "#3a3a3a" : isBlue ? "#0c1a2c" : "#1c1c1c";
  const minorColor = isLight ? "#2e2e2e" : isBlue ? "#0a1420" : "#161616";
  const intersectionColor = isLight ? "#3a3a3a" : isBlue ? "#0c1a2c" : "#1c1c1c";

  // 共享道路材质（vertexColors GLB 时使用）
  const roadVertexMat = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  }), []);

  return (
    <group>
      {/* 1. 主题色地板（rotation 必须在 mesh 上） */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_PLANE_SIZE, GROUND_PLANE_SIZE]} />
        <meshStandardMaterial
          color={theme.colors.ground}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* 2a. 主干道 — road-straight GLB */}
      {straightRoadGeo && majorItems.map((item, i) => (
        <mesh
          key={`major-${item.road.rootPid}-${i}`}
          geometry={straightRoadGeo}
          material={roadVertexMat}
          position={item.pos}
          rotation={[0, item.road.rotY, 0]}
          scale={[item.scaleX, 1, item.scaleZ]}
          frustumCulled={false}
          receiveShadow
        />
      ))}

      {/* 2b. 主干道 fallback */}
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

      {/* 3a. 路口 — road-intersection-3 GLB（T 字路口收口） */}
      {intersection3Geo && intersectionItems.map(({ item, pos }, i) => (
        <mesh
          key={`inter-${item.cx.toFixed(2)}-${item.cz.toFixed(2)}-${i}`}
          geometry={intersection3Geo}
          material={roadVertexMat}
          position={pos}
          rotation={[0, item.rotY, 0]}
          // 路口 GLB 是 8×8，不需要缩放
          frustumCulled={false}
          receiveShadow
        />
      ))}

      {/* 3b. 路口 fallback */}
      {!intersection3Geo && intersectionItems.map(({ item, pos }, i) => (
        <mesh
          key={`inter-fb-${item.cx.toFixed(2)}-${item.cz.toFixed(2)}-${i}`}
          geometry={fallbackIntersectionGeo}
          position={pos}
          rotation={[0, item.rotY, 0]}
          frustumCulled={false}
          receiveShadow
        >
          <meshStandardMaterial
            color={intersectionColor}
            emissive={isBlue ? theme.colors.accent : intersectionColor}
            emissiveIntensity={isLight ? 0.0 : isBlue ? 0.08 : 0.03}
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      ))}

      {/* 4a. 次干道 L 形段 — road-straight GLB */}
      {straightRoadGeo && minorSegmentItems.map(({ minor, seg, pos, scaleX, scaleZ }, i) => (
        <mesh
          key={`minor-${minor.fromRootPid}-${minor.toRootPid}-${i}`}
          geometry={straightRoadGeo}
          material={roadVertexMat}
          position={pos}
          rotation={[0, seg.rotY, 0]}
          scale={[scaleX, 1, scaleZ]}
          frustumCulled={false}
          receiveShadow
        />
      ))}

      {/* 4b. 次干道 fallback */}
      {!straightRoadGeo && minorSegmentItems.map(({ minor, seg, pos, scaleX, scaleZ }, i) => (
        <mesh
          key={`minor-fb-${minor.fromRootPid}-${minor.toRootPid}-${i}`}
          geometry={fallbackMinorGeo}
          position={pos}
          rotation={[0, seg.rotY, 0]}
          scale={[scaleX, 1, scaleZ]}
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

      {/* 5a. 弯道 — road-curve GLB（L 形拐角的 90° 弧形） */}
      {curveGeo && curveItems.map(({ curve, pos }, i) => (
        <mesh
          key={`curve-${curve.cx.toFixed(2)}-${curve.cz.toFixed(2)}-${i}`}
          geometry={curveGeo}
          material={roadVertexMat}
          position={pos}
          rotation={[0, curve.rotY, 0]}
          // 关键：不缩放！road-curve GLB 原始 R=4-8、中线 R=6，与算法 ROAD_CURVE_RADIUS=6 严格匹配。
          // 若缩放（width/4=0.5），GLB 实际几何缩到 R=2-4、中线 R=3，
          // 但算法按 R=6 算 segments 端点 → segments 与 curve 之间出现 3 单位空隙 → 视觉上不首尾相接。
          scale={[1, 1, 1]}
          frustumCulled={false}
          receiveShadow
        />
      ))}

      {/* 5b. 弯道 fallback */}
      {!curveGeo && curveItems.map(({ curve, pos }, i) => (
        <mesh
          key={`curve-fb-${curve.cx.toFixed(2)}-${curve.cz.toFixed(2)}-${i}`}
          geometry={fallbackCurveGeo}
          position={pos}
          rotation={[0, curve.rotY, 0]}
          frustumCulled={false}
          receiveShadow
        >
          <meshStandardMaterial
            color={minorColor}
            emissive={isBlue ? theme.colors.accent : minorColor}
            emissiveIntensity={isLight ? 0.0 : isBlue ? 0.06 : 0.02}
            roughness={0.85}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
