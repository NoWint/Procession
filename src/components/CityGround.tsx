import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import { blockTypeColor } from "../utils/colors";
import { useGlbAssets } from "../hooks/useGlbAssets";
import {
  computeRoadNetwork,
  type BlockInfo,
  type RoadNetwork,
} from "../utils/layout";

interface CityGroundProps {
  theme?: Theme;
  blocks?: BlockInfo[];
}

const GROUND_SIZE = 160;
const ROAD_Y = 0.02;
const BLOCK_BORDER_Y = 0.015;

// road-straight GLB 的标准尺寸（与 build-assets.mjs ROAD_CANONICAL_* 一致）
const ROAD_GLB_LENGTH = 10;
const ROAD_GLB_WIDTH = 4;

/**
 * 地面：主题色地板 + 主动道路骨架 + 被动道路填充 + 街区边界 + 路口装饰。
 *
 * 范式（v3，2026-07-20）：
 *   1. 主地板 — 主题色铺满（mesh.rotation 修正为 -π/2，平铺在 XZ 平面）
 *   2. 主动道路 — 用 road-straight GLB 铺装直道（含十字主干道 + 放射干道），
 *      每条道路一个独立 mesh，按 length/width 缩放，带路缘 + 中央虚线
 *   3. 环道 — 用 RingGeometry 渲染，内外环各自独立 mesh（不同半径）
 *   4. 路口装饰 — road-intersection-4 GLB 放在十字路口 (0, 0)
 *   5. 中心环岛 — road-roundabout GLB 备选（如已加载且路口装饰未占用）
 *   6. 被动道路 — LineSegments，街区中心↔最近邻街区中心
 *   7. 街区边界 — InstancedMesh，按 typeKey 着色
 *
 * 旋转修正：planeGeometry/RingGeometry 默认在 XY 平面（立面），
 * 必须把 mesh.rotation.x = -π/2 才能平铺在 XZ 平面（地面）。
 * R3F 中 rotation-x 是 mesh 属性，不是 geometry 子元素属性。
 */
export default function CityGround({ theme = FALLBACK_THEME, blocks = [] }: CityGroundProps) {
  const groundMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const passiveMatRef = useRef<THREE.LineBasicMaterial>(null);
  const laneMatRef = useRef<THREE.LineBasicMaterial>(null);
  const borderInstRef = useRef<THREE.InstancedMesh>(null);
  const centerInstRef = useRef<THREE.InstancedMesh>(null);

  // === 道路 GLB 资产（Phase G） ===
  const { assets } = useGlbAssets();
  const straightRoadGeo = assets.roads?.["road-straight"];
  const intersection4Geo = assets.roads?.["road-intersection-4"];
  const roundaboutGeo = assets.roads?.["road-roundabout"];

  const isLight = theme.mode === "light";
  const themeName = theme.name.toLowerCase();
  const isBlue = themeName.includes("blue") || themeName.includes("midnight");

  const accentIntensity = isLight ? 0.35 : isBlue ? 1.6 : 0.9;
  const ringRoadColor = isLight ? "#323232" : isBlue ? "#0c1a2c" : "#1c1c1c";
  const laneColor = isLight ? "#f5e060" : isBlue ? theme.colors.accent : "#ffffff";
  const passiveLaneColor = isLight ? "#b0b0b0" : isBlue ? "#5a7cb0" : "#666666";

  // === 1. 主动道路骨架 ===
  const network: RoadNetwork = useMemo(() => computeRoadNetwork(), []);

  // 把 segments 分成三类：straight / radial / ring
  const straightSegs = useMemo(() => network.segments.filter((s) => s.type === "straight"), [network]);
  const radialSegs = useMemo(() => network.segments.filter((s) => s.type === "radial"), [network]);
  const ringSegs = useMemo(() => network.segments.filter((s) => s.type === "ring"), [network]);

  // === 直道渲染数据：用 road-straight GLB ===
  // 每个 segment 计算位置、方向、缩放（GLB 标准尺寸 10×4，缩放到实际 length×width）
  // GLB 本地 +X 是长度方向，+Z 是宽度方向，所以 rotY 绕 Y 旋转把 X 转到道路方向
  // 位置取 segment 中心（直道：s.x/s.z 即中心；放射道：起点 + 方向 * length/2）
  const straightItems = useMemo(() => {
    return straightSegs.map((s) => {
      const midX = s.x;
      const midZ = s.z;
      return {
        pos: [midX, ROAD_Y, midZ] as [number, number, number],
        rotY: s.rotY,
        scaleX: s.length / ROAD_GLB_LENGTH,
        scaleZ: s.width / ROAD_GLB_WIDTH,
      };
    });
  }, [straightSegs]);

  const radialItems = useMemo(() => {
    return radialSegs.map((s) => {
      // 放射道起点 (s.x, s.z) + 方向 * length/2 = 中心
      const midX = s.x + Math.cos(s.rotY) * s.length / 2;
      const midZ = s.z + Math.sin(s.rotY) * s.length / 2;
      return {
        pos: [midX, ROAD_Y, midZ] as [number, number, number],
        rotY: s.rotY,
        scaleX: s.length / ROAD_GLB_LENGTH,
        scaleZ: s.width / ROAD_GLB_WIDTH,
      };
    });
  }, [radialSegs]);

  // 直道几何 fallback：GLB 未加载时用 PlaneGeometry
  const fallbackStraightGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ROAD_GLB_LENGTH, ROAD_GLB_WIDTH, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // === 环道渲染数据：每环独立 mesh（不同半径不能用同一 InstancedMesh） ===
  const ringGeometries = useMemo(() => {
    const results: Array<{ geo: THREE.BufferGeometry; key: string }> = [];
    for (const s of ringSegs) {
      if (s.radius == null) continue;
      const innerR = s.radius - s.width / 2;
      const outerR = s.radius + s.width / 2;
      const geo = new THREE.RingGeometry(innerR, outerR, 96);
      geo.rotateX(-Math.PI / 2);
      results.push({ geo, key: `ring-${s.radius}` });
    }
    return results;
  }, [ringSegs]);

  // === 2. 车道中央线（十字主干道） ===
  const laneGeo = useMemo(() => {
    const lines: number[] = [];
    // 横向主干道中央线（沿 X 方向，z=0，全长）
    lines.push(-GROUND_SIZE/2 + 2, 0.04, 0, GROUND_SIZE/2 - 2, 0.04, 0);
    // 纵向主干道中央线（沿 Z 方向，x=0）
    lines.push(0, 0.04, -GROUND_SIZE/2 + 2, 0, 0.04, GROUND_SIZE/2 - 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    return geo;
  }, []);

  // === 3. 被动道路 — 街区与街区之间的小路（LineSegments） ===
  const passiveLanes = useMemo(() => {
    if (blocks.length < 2) return [];
    const segs: Array<{ x1: number; z1: number; x2: number; z2: number }> = [];
    for (let i = 0; i < blocks.length; i++) {
      const a = blocks[i];
      const dists: Array<{ idx: number; d: number }> = [];
      for (let j = 0; j < blocks.length; j++) {
        if (i === j) continue;
        const b = blocks[j];
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        dists.push({ idx: j, d: Math.sqrt(dx*dx + dz*dz) });
      }
      dists.sort((x, y) => x.d - y.d);
      for (let k = 0; k < Math.min(2, dists.length); k++) {
        const b = blocks[dists[k].idx];
        if (i < dists[k].idx) {
          segs.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z });
        }
      }
    }
    return segs;
  }, [blocks]);

  const passiveLaneGeo = useMemo(() => {
    const lines: number[] = [];
    for (const seg of passiveLanes) {
      lines.push(seg.x1, 0.04, seg.z1, seg.x2, 0.04, seg.z2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    return geo;
  }, [passiveLanes]);

  // === 4. 街区边界（按 typeKey 着色） ===
  const borderEdgeGeo = useMemo(() => {
    return new THREE.BoxGeometry(2, 0.08, 0.6);
  }, []);

  const borderInstances = useMemo(() => {
    if (blocks.length === 0) return [];
    return blocks.flatMap((b) => {
      const color = new THREE.Color(blockTypeColor(b.typeKey));
      const r = b.radius;
      return [
        { pos: [b.x, BLOCK_BORDER_Y, b.z + r] as [number, number, number], rotY: 0, color, scaleX: r * 2 },
        { pos: [b.x, BLOCK_BORDER_Y, b.z - r] as [number, number, number], rotY: 0, color, scaleX: r * 2 },
        { pos: [b.x + r, BLOCK_BORDER_Y, b.z] as [number, number, number], rotY: Math.PI / 2, color, scaleX: r * 2 },
        { pos: [b.x - r, BLOCK_BORDER_Y, b.z] as [number, number, number], rotY: Math.PI / 2, color, scaleX: r * 2 },
      ];
    }).slice(0, 256);
  }, [blocks]);

  // === 5. 街区中心标识（root 类型色圆盘） ===
  const centerDiskGeo = useMemo(() => {
    const geo = new THREE.CircleGeometry(0.8, 24);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const centerInstances = useMemo(() => {
    return blocks.map((b) => ({
      pos: [b.x, BLOCK_BORDER_Y + 0.001, b.z] as [number, number, number],
      color: new THREE.Color(blockTypeColor(b.typeKey)),
    }));
  }, [blocks]);

  // === 设置 InstancedMesh 的 matrix 和颜色 ===
  useEffect(() => {
    if (!borderInstRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    borderInstances.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.scale.set(item.scaleX ?? 1, 1, 1);
      dummy.updateMatrix();
      borderInstRef.current!.setMatrixAt(i, dummy.matrix);
      borderInstRef.current!.setColorAt(i, color.copy(item.color));
    });
    borderInstRef.current.instanceMatrix.needsUpdate = true;
    if (borderInstRef.current.instanceColor) {
      borderInstRef.current.instanceColor.needsUpdate = true;
    }
  }, [borderInstances]);

  useEffect(() => {
    if (!centerInstRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    centerInstances.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.updateMatrix();
      centerInstRef.current!.setMatrixAt(i, dummy.matrix);
      centerInstRef.current!.setColorAt(i, color.copy(item.color));
    });
    centerInstRef.current.instanceMatrix.needsUpdate = true;
    if (centerInstRef.current.instanceColor) {
      centerInstRef.current.instanceColor.needsUpdate = true;
    }
  }, [centerInstances]);

  // === 呼吸动画（地面微弱发光） ===
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groundMatRef.current) {
      groundMatRef.current.emissiveIntensity = 0.05 + Math.sin(t * 0.5) * 0.02;
    }
  });

  return (
    <group>
      {/* 1. 主题色地板（rotation 在 mesh 上，不能放 planeGeometry 子元素） */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          ref={groundMatRef}
          color={theme.colors.ground}
          roughness={0.9}
          metalness={0.1}
          emissive={theme.colors.ground}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* 2a. 主动道路 — 直道（road-straight GLB，含路缘 + 中央虚线） */}
      {/* 十字主干道（2 条）+ 放射干道（8 条），每条独立 mesh 按 length/width 缩放 */}
      {straightRoadGeo && (
        <group>
          {straightItems.map((item, i) => (
            <mesh
              key={`straight-${i}`}
              geometry={straightRoadGeo}
              position={item.pos}
              rotation={[0, item.rotY, 0]}
              scale={[item.scaleX, 1, item.scaleZ]}
              frustumCulled={false}
            >
              <meshStandardMaterial
                vertexColors
                roughness={0.85}
                metalness={0.05}
                side={THREE.DoubleSide}
                emissiveIntensity={accentIntensity * 0.2}
              />
            </mesh>
          ))}
          {radialItems.map((item, i) => (
            <mesh
              key={`radial-${i}`}
              geometry={straightRoadGeo}
              position={item.pos}
              rotation={[0, item.rotY, 0]}
              scale={[item.scaleX, 1, item.scaleZ]}
              frustumCulled={false}
            >
              <meshStandardMaterial
                vertexColors
                roughness={0.85}
                metalness={0.05}
                side={THREE.DoubleSide}
                emissiveIntensity={accentIntensity * 0.2}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* 2b. 直道 fallback：GLB 未加载时用纯色 PlaneGeometry（不含路缘/虚线） */}
      {!straightRoadGeo && (
        <group>
          {straightItems.map((item, i) => (
            <mesh
              key={`straight-fb-${i}`}
              geometry={fallbackStraightGeo}
              position={item.pos}
              rotation={[0, item.rotY, 0]}
              scale={[item.scaleX, 1, item.scaleZ]}
              frustumCulled={false}
            >
              <meshStandardMaterial
                color={isLight ? "#3a3a3a" : "#1a1a1a"}
                roughness={0.85}
                metalness={0.05}
              />
            </mesh>
          ))}
          {radialItems.map((item, i) => (
            <mesh
              key={`radial-fb-${i}`}
              geometry={fallbackStraightGeo}
              position={item.pos}
              rotation={[0, item.rotY, 0]}
              scale={[item.scaleX, 1, item.scaleZ]}
              frustumCulled={false}
            >
              <meshStandardMaterial
                color={isLight ? "#2e2e2e" : "#151515"}
                roughness={0.85}
                metalness={0.05}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* 2c. 环道（内外环各自独立 mesh，不同半径不能用同一 InstancedMesh） */}
      {ringGeometries.map((ring) => (
        <mesh
          key={ring.key}
          geometry={ring.geo}
          position={[0, ROAD_Y, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          frustumCulled={false}
          receiveShadow
        >
          <meshStandardMaterial
            color={ringRoadColor}
            emissive={isBlue ? theme.colors.accent : ringRoadColor}
            emissiveIntensity={isLight ? 0.0 : isBlue ? 0.12 : 0.04}
            roughness={0.85}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* 2d. 十字路口装饰（road-intersection-4 GLB，放在中心 (0, 0)） */}
      {/* 8×8 中心广场 + 4 边斑马线，强化路口视觉 */}
      {intersection4Geo && (
        <mesh
          geometry={intersection4Geo}
          position={[0, ROAD_Y, 0]}
          frustumCulled={false}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            vertexColors
            roughness={0.85}
            metalness={0.05}
            side={THREE.DoubleSide}
            emissiveIntensity={accentIntensity * 0.25}
          />
        </mesh>
      )}

      {/* 2e. 中心环岛装饰（road-roundabout GLB） */}
      {/* 已被 2d 十字路口装饰替代，仅在 2d 未加载时作为 fallback 中心装饰 */}
      {!intersection4Geo && roundaboutGeo && (
        <mesh
          geometry={roundaboutGeo}
          position={[0, ROAD_Y, 0]}
          frustumCulled={false}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            vertexColors
            roughness={0.85}
            metalness={0.05}
            side={THREE.DoubleSide}
            emissiveIntensity={accentIntensity * 0.3}
          />
        </mesh>
      )}

      {/* 3a. 主干道中央双黄线（仅当 GLB 未加载时显示，GLB 已含虚线） */}
      {!straightRoadGeo && (
        <lineSegments geometry={laneGeo} frustumCulled={false}>
          <lineBasicMaterial
            ref={laneMatRef}
            color={laneColor}
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* 3b. 被动道路 — 街区与街区之间的小路 */}
      {passiveLaneGeo.attributes.position && (
        <lineSegments geometry={passiveLaneGeo} frustumCulled={false}>
          <lineBasicMaterial
            ref={passiveMatRef}
            color={passiveLaneColor}
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* 4. 街区边界（按 typeKey 着色） */}
      {borderInstances.length > 0 && (
        <instancedMesh
          ref={borderInstRef}
          args={[borderEdgeGeo, undefined as unknown as THREE.Material, borderInstances.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial
            vertexColors
            roughness={0.6}
            metalness={0.2}
            emissiveIntensity={accentIntensity * 0.4}
            transparent
            opacity={0.85}
          />
        </instancedMesh>
      )}

      {/* 5. 街区中心标识（root 类型色圆盘） */}
      {centerInstances.length > 0 && (
        <instancedMesh
          ref={centerInstRef}
          args={[centerDiskGeo, undefined as unknown as THREE.Material, centerInstances.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial
            vertexColors
            emissiveIntensity={accentIntensity * 0.6}
            roughness={0.5}
            side={THREE.DoubleSide}
            transparent
            opacity={0.75}
          />
        </instancedMesh>
      )}
    </group>
  );
}
