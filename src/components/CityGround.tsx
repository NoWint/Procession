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

/**
 * 地面：主题色地板 + 主动道路骨架 + 被动道路填充 + 街区边界 + 中心环岛装饰。
 *
 * 范式（v2，2026-07-20）：
 *   1. 主动道路 — 固定骨架（十字/内外环/放射），由 computeRoadNetwork 提供
 *   2. 被动道路 — 街区与街区、街区与建筑之间的小路，自动连接
 *   3. 主地板 — 主题色铺满
 *   4. 街区边界 — 按 root 类型着色（typeKey，用于建筑着色，不再用于分组）
 *   5. 中心装饰 — road-roundabout GLB（Phase G）放置在 (0, 0) 作为城市中心环岛
 *
 * 主动道路用几何体直接渲染（高效覆盖大尺度路面）：
 *   - straight: PlaneGeometry(length, width)
 *   - ring:     RingGeometry(innerR, outerR, 64)
 *   - radial:   PlaneGeometry(length, width) + rotY
 *
 * 道路 GLB 资产（Phase G，由 useGlbAssets 加载）：
 *   - road-straight / road-intersection-4 / road-intersection-3 / road-curve / road-roundabout
 *   - 当前布局使用 road-roundabout 作为中心装饰；其他 4 个 GLB 已加载到 assets.roads
 *     供未来布局扩展（如显式放置 T 字/十字/弯道节点）时使用
 *
 * 被动道路用 LineSegments 渲染（细线，街区中心↔最近邻街区中心）：
 *   - 在两个街区中心之间画一条小路
 *   - 在街区内 root 位置画一个 1 单位的小圆（街区中心广场）
 */
export default function CityGround({ theme = FALLBACK_THEME, blocks = [] }: CityGroundProps) {
  const groundMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const roadMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const radialMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const ringMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const passiveMatRef = useRef<THREE.LineBasicMaterial>(null);
  const laneMatRef = useRef<THREE.LineBasicMaterial>(null);
  const borderInstRef = useRef<THREE.InstancedMesh>(null);
  const centerInstRef = useRef<THREE.InstancedMesh>(null);

  // === 道路 GLB 资产（Phase G） ===
  // road-roundabout 用作中心装饰；其他 4 个 GLB 已加载供未来布局扩展使用
  const { assets } = useGlbAssets();
  const roundaboutGeo = assets.roads?.["road-roundabout"];

  const isLight = theme.mode === "light";
  const themeName = theme.name.toLowerCase();
  const isBlue = themeName.includes("blue") || themeName.includes("midnight");

  const accentIntensity = isLight ? 0.35 : isBlue ? 1.6 : 0.9;
  const roadColor = isLight ? "#3a3a3a" : isBlue ? "#0a1424" : "#1a1a1a";
  const roadEmissive = isLight ? 0.0 : isBlue ? 0.15 : 0.05;
  const radialRoadColor = isLight ? "#2e2e2e" : isBlue ? "#0a1a2c" : "#151515";
  const ringRoadColor = isLight ? "#323232" : isBlue ? "#0c1a2c" : "#1c1c1c";
  const laneColor = isLight ? "#f5e060" : isBlue ? theme.colors.accent : "#ffffff";
  const passiveLaneColor = isLight ? "#b0b0b0" : isBlue ? "#5a7cb0" : "#666666";

  // === 1. 主动道路骨架 ===
  const network: RoadNetwork = useMemo(() => computeRoadNetwork(), []);

  // 把 segments 分成三类：straight / radial / ring，每类一个 InstancedMesh
  const straightSegs = useMemo(() => network.segments.filter((s) => s.type === "straight"), [network]);
  const radialSegs = useMemo(() => network.segments.filter((s) => s.type === "radial"), [network]);
  const ringSegs = useMemo(() => network.segments.filter((s) => s.type === "ring"), [network]);

  // straight 直道几何：最长那条
  const straightGeo = useMemo(() => {
    const maxLen = Math.max(...straightSegs.map((s) => s.length), 1);
    const width = straightSegs[0]?.width ?? 4;
    const geo = new THREE.PlaneGeometry(maxLen, width);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [straightSegs]);

  const straightInst = useMemo(() => {
    const maxLen = Math.max(...straightSegs.map((s) => s.length), 1);
    return straightSegs.map((s) => ({
      pos: [s.x, ROAD_Y, s.z] as [number, number, number],
      rotY: s.rotY,
      scaleX: s.length / maxLen,
    }));
  }, [straightSegs]);

  // radial 放射道几何
  const radialGeo = useMemo(() => {
    const maxLen = Math.max(...radialSegs.map((s) => s.length), 1);
    const width = radialSegs[0]?.width ?? 2.5;
    const geo = new THREE.PlaneGeometry(maxLen, width);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [radialSegs]);

  const radialInst = useMemo(() => {
    const maxLen = Math.max(...radialSegs.map((s) => s.length), 1);
    return radialSegs.map((s) => {
      // 中心在 (startX + cos*length/2, startZ + sin*length/2)
      const midX = s.x + Math.cos(s.rotY) * s.length / 2;
      const midZ = s.z + Math.sin(s.rotY) * s.length / 2;
      return {
        pos: [midX, ROAD_Y, midZ] as [number, number, number],
        rotY: s.rotY,
        scaleX: s.length / maxLen,
      };
    });
  }, [radialSegs]);

  // ring 环道几何
  const ringGeo = useMemo(() => {
    // 用 RingGeometry(innerR, outerR, 64) 画一个环形带
    const seg = ringSegs[0];
    if (!seg || seg.radius == null) return new THREE.RingGeometry(1, 2, 32);
    const innerR = seg.radius - seg.width / 2;
    const outerR = seg.radius + seg.width / 2;
    const geo = new THREE.RingGeometry(innerR, outerR, 96);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [ringSegs]);

  const ringInstances = useMemo(() => {
    return ringSegs.map((s) => ({
      pos: [s.x, ROAD_Y, s.z] as [number, number, number],
      rotY: 0,
    }));
  }, [ringSegs]);

  // === 2. 车道中央线（十字主干道 + 环道） ===
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
  // 策略：连接每个街区中心到其最近的 2 个街区中心（最小生成树近似）
  const passiveLanes = useMemo(() => {
    if (blocks.length < 2) return [];
    const segs: Array<{ x1: number; z1: number; x2: number; z2: number }> = [];
    // 为每个街区找最近的 2 个邻居（避免完全图，控制小路数量）
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
      // 取最近 2 个
      for (let k = 0; k < Math.min(2, dists.length); k++) {
        const b = blocks[dists[k].idx];
        // 去重（i<j 才加）
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
      // 用 4 条边构成一个正方形边界
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

  // 设置 straight 主干道 instance matrix（带 scale）
  const straightInstRef = useRef<THREE.InstancedMesh>(null);
  const radialInstRef = useRef<THREE.InstancedMesh>(null);
  const ringInstRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!straightInstRef.current) return;
    const dummy = new THREE.Object3D();
    straightInst.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.scale.set(item.scaleX, 1, 1);
      dummy.updateMatrix();
      straightInstRef.current!.setMatrixAt(i, dummy.matrix);
    });
    straightInstRef.current.instanceMatrix.needsUpdate = true;
  }, [straightInst]);

  useEffect(() => {
    if (!radialInstRef.current) return;
    const dummy = new THREE.Object3D();
    radialInst.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.scale.set(item.scaleX, 1, 1);
      dummy.updateMatrix();
      radialInstRef.current!.setMatrixAt(i, dummy.matrix);
    });
    radialInstRef.current.instanceMatrix.needsUpdate = true;
  }, [radialInst]);

  useEffect(() => {
    if (!ringInstRef.current) return;
    const dummy = new THREE.Object3D();
    ringInstances.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.updateMatrix();
      ringInstRef.current!.setMatrixAt(i, dummy.matrix);
    });
    ringInstRef.current.instanceMatrix.needsUpdate = true;
  }, [ringInstances]);

  // === 呼吸动画 ===
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groundMatRef.current) {
      groundMatRef.current.emissiveIntensity = 0.05 + Math.sin(t * 0.5) * 0.02;
    }
    if (roadMatRef.current) {
      roadMatRef.current.emissiveIntensity = roadEmissive * (0.9 + Math.sin(t * 0.4) * 0.1);
    }
    if (radialMatRef.current) {
      radialMatRef.current.emissiveIntensity = roadEmissive * 0.7 * (0.9 + Math.sin(t * 0.5) * 0.1);
    }
    if (ringMatRef.current) {
      ringMatRef.current.emissiveIntensity = roadEmissive * 0.85 * (0.9 + Math.sin(t * 0.3) * 0.1);
    }
  });

  return (
    <group>
      {/* 1. 主题色地板 */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} rotation-x={-Math.PI / 2} />
        <meshStandardMaterial
          ref={groundMatRef}
          color={theme.colors.ground}
          roughness={0.9}
          metalness={0.1}
          emissive={theme.colors.ground}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* 2a. 主干道（十字交叉的两条） */}
      {straightInst.length > 0 && (
        <instancedMesh
          ref={straightInstRef}
          args={[straightGeo, undefined as unknown as THREE.Material, straightInst.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial
            ref={roadMatRef}
            color={roadColor}
            emissive={isBlue ? theme.colors.accent : roadColor}
            emissiveIntensity={roadEmissive}
            roughness={0.85}
            metalness={0.05}
          />
        </instancedMesh>
      )}

      {/* 2b. 环道（内外环） */}
      {ringInstances.length > 0 && (
        <instancedMesh
          ref={ringInstRef}
          args={[ringGeo, undefined as unknown as THREE.Material, ringInstances.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial
            ref={ringMatRef}
            color={ringRoadColor}
            emissive={isBlue ? theme.colors.accent : ringRoadColor}
            emissiveIntensity={roadEmissive * 0.85}
            roughness={0.85}
            metalness={0.05}
          />
        </instancedMesh>
      )}

      {/* 2c. 放射干道 */}
      {radialInst.length > 0 && (
        <instancedMesh
          ref={radialInstRef}
          args={[radialGeo, undefined as unknown as THREE.Material, radialInst.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial
            ref={radialMatRef}
            color={radialRoadColor}
            emissive={isBlue ? theme.colors.accent : radialRoadColor}
            emissiveIntensity={roadEmissive * 0.7}
            roughness={0.85}
            metalness={0.05}
          />
        </instancedMesh>
      )}

      {/* 2d. 中心环岛装饰（Phase G：road-roundabout GLB） */}
      {/* 放置在十字主干道交汇处 (0, 0)，作为城市中心地标 */}
      {roundaboutGeo && (
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

      {/* 3a. 主干道中央双黄线 */}
      <lineSegments geometry={laneGeo} frustumCulled={false}>
        <lineBasicMaterial
          ref={laneMatRef}
          color={laneColor}
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </lineSegments>

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
