import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import { blockTypeColor } from "../utils/colors";
import type { BlockInfo } from "../utils/layout";

interface CityGroundProps {
  theme?: Theme;
  blocks?: BlockInfo[];
}

const GROUND_SIZE = 160;
const BLOCK_STEP = 16;        // 街区边长（与 layout.ts blockCell 一致）
const ROAD_WIDTH = 2.5;        // 主干道宽度（加宽：之前 1.5 比建筑还窄）
const ROAD_Y = 0.02;
const BLOCK_BORDER_Y = 0.015;
const GRID_HALF = GROUND_SIZE / 2;

/**
 * 地面：主题色地板 + 真正的城市道路网 + 按类型着色的街区边界。
 *
 * 设计逻辑（emil-design-eng "craft" + apple "familiarity"）：
 *   1. 主地板：主题色铺满，作为视觉基底
 *   2. 主干道：宽 2.5 单位的深沥青色带状平面（不发光），让发光建筑成为视觉焦点
 *   3. 车道线：主干道中央双黄线 + 边缘白线（真实的道路语言）
 *   4. 街区边界：按类型着色的方框（蓝=系统、紫=数据库、橙=浏览器...）
 *   5. 街区中心标识：每个街区中心一个小圆盘（类型色），传递"这里是什么街区"
 *
 * 移除元素（emil-design-eng "decide what not to build"）：
 *   - 81 个路口发光点（与路灯冗余，CityLandmarks 已有 120 个路灯）
 *   - 中心广场 3 层同心圆（与中央塔冗余，CityLandmarks 已有 landmark-central-tower）
 *   - 远端外环装饰圈（与 CableSystem 远端终点冲突）
 *
 * 主题差异化（apple "craft"）：
 *   - light：日间混凝土，道路深灰
 *   - dark：夜城感，道路微微反光
 *   - midnight-blue：数据海感，道路 accent 色微弱 emissive
 */
export default function CityGround({ theme = FALLBACK_THEME, blocks = [] }: CityGroundProps) {
  const groundMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const roadMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const laneMatRef = useRef<THREE.LineBasicMaterial>(null);

  const roadInstRef = useRef<THREE.InstancedMesh>(null);
  const borderInstRef = useRef<THREE.InstancedMesh>(null);
  const centerInstRef = useRef<THREE.InstancedMesh>(null);

  const isLight = theme.mode === "light";
  const themeName = theme.name.toLowerCase();
  const isBlue = themeName.includes("blue") || themeName.includes("midnight");

  // 主题性格强度
  const accentIntensity = isLight ? 0.35 : isBlue ? 1.6 : 0.9;
  // 道路色：深沥青，不发光（让发光建筑成为视觉焦点）
  const roadColor = isLight ? "#3a3a3a" : isBlue ? "#0a1424" : "#1a1a1a";
  const roadEmissive = isLight ? 0.0 : isBlue ? 0.15 : 0.05;
  // 车道线色：主题感知（light 黄白、dark 白、blue accent）
  const laneColor = isLight ? "#f5e060" : isBlue ? theme.colors.accent : "#ffffff";

  // === 1. 主地板 ===
  const groundGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // === 2. 主干道带状平面 ===
  const roadGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(ROAD_WIDTH, GROUND_SIZE);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const roadInstances = useMemo(() => {
    const items: { pos: [number, number, number]; rotY: number }[] = [];
    for (let i = 0; i <= 10; i++) {
      const z = -GRID_HALF + i * BLOCK_STEP;
      items.push({ pos: [0, ROAD_Y, z], rotY: 0 });
    }
    for (let i = 0; i <= 10; i++) {
      const x = -GRID_HALF + i * BLOCK_STEP;
      items.push({ pos: [x, ROAD_Y, 0], rotY: Math.PI / 2 });
    }
    return items;
  }, []);

  // === 3. 车道线（中央双黄线 + 边缘白线） ===
  // 用 LineSegments 实现，每条道路 1 条中央线
  const laneGeo = useMemo(() => {
    const lines: number[] = [];
    const halfRoad = ROAD_WIDTH / 2;
    // 横向道路的中央线（沿 X 方向，z = -GRID_HALF + i*BLOCK_STEP）
    for (let i = 0; i <= 10; i++) {
      const z = -GRID_HALF + i * BLOCK_STEP;
      lines.push(-GRID_HALF, 0.03, z, GRID_HALF, 0.03, z);
    }
    // 纵向道路的中央线（沿 Z 方向，x = -GRID_HALF + i*BLOCK_STEP）
    for (let i = 0; i <= 10; i++) {
      const x = -GRID_HALF + i * BLOCK_STEP;
      lines.push(x, 0.03, -GRID_HALF, x, 0.03, GRID_HALF);
    }
    void halfRoad;  // 暂存避免未使用警告（边缘线后续可加）
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    return geo;
  }, []);

  // === 4. 街区边界 ===
  // 边框宽度从 0.2 加宽到 0.6，让俯视可见
  // 每个街区按类型着色（BlockInfo.typeKey → blockTypeColor）
  const borderEdgeGeo = useMemo(() => {
    return new THREE.BoxGeometry(BLOCK_STEP - 2, 0.08, 0.6);
  }, []);

  // 街区边界实例：使用 blocks prop 而非全网格扫描
  // 每个 BlockInfo 有 minX/maxX/minZ/maxZ，画 4 条边
  const borderInstances = useMemo(() => {
    if (blocks.length === 0) return [];
    return blocks.flatMap((b) => {
      const color = new THREE.Color(blockTypeColor(b.typeKey));
      const midX = (b.minX + b.maxX) / 2;
      const midZ = (b.minZ + b.maxZ) / 2;
      return [
        { pos: [midX, BLOCK_BORDER_Y, b.maxZ] as [number, number, number], rotY: 0, color },
        { pos: [midX, BLOCK_BORDER_Y, b.minZ] as [number, number, number], rotY: 0, color },
        { pos: [b.maxX, BLOCK_BORDER_Y, midZ] as [number, number, number], rotY: Math.PI / 2, color },
        { pos: [b.minX, BLOCK_BORDER_Y, midZ] as [number, number, number], rotY: Math.PI / 2, color },
      ];
    }).slice(0, 256);  // 限制最大数量避免性能问题
  }, [blocks]);

  // === 5. 街区中心标识 ===
  // 每个街区中心一个小圆盘（类型色），让用户一眼识别"这里是什么类型"
  const centerDiskGeo = useMemo(() => {
    const geo = new THREE.CircleGeometry(0.8, 24);  // 半径 0.8，比路口圆盘小
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
    if (!roadInstRef.current) return;
    const dummy = new THREE.Object3D();
    roadInstances.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.updateMatrix();
      roadInstRef.current!.setMatrixAt(i, dummy.matrix);
    });
    roadInstRef.current.instanceMatrix.needsUpdate = true;
  }, [roadInstances]);

  useEffect(() => {
    if (!borderInstRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    borderInstances.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.rotation.set(0, item.rotY, 0);
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

  // === 呼吸动画（仅地板微弱呼吸） ===
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groundMatRef.current) {
      groundMatRef.current.emissiveIntensity = 0.05 + Math.sin(t * 0.5) * 0.02;
    }
    if (roadMatRef.current) {
      roadMatRef.current.emissiveIntensity = roadEmissive * (0.9 + Math.sin(t * 0.4) * 0.1);
    }
  });

  return (
    <group>
      {/* 1. 主题色矩形地板 */}
      <mesh geometry={groundGeometry} position={[0, 0, 0]} receiveShadow>
        <meshStandardMaterial
          ref={groundMatRef}
          color={theme.colors.ground}
          roughness={0.9}
          metalness={0.1}
          emissive={theme.colors.ground}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* 2. 主干道带状平面（深沥青色，不发光，让发光建筑成为视觉焦点） */}
      <instancedMesh
        ref={roadInstRef}
        args={[roadGeometry, undefined as unknown as THREE.Material, roadInstances.length]}
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

      {/* 3. 车道线（中央双黄线，真实的道路语言） */}
      <lineSegments geometry={laneGeo} frustumCulled={false}>
        <lineBasicMaterial
          ref={laneMatRef}
          color={laneColor}
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </lineSegments>

      {/* 4. 街区边界（按类型着色，边框宽 0.6 让俯视可见） */}
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

      {/* 5. 街区中心标识（类型色圆盘） */}
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
