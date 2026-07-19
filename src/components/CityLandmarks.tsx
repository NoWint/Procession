import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGlbAssets } from "../hooks/useGlbAssets";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

/**
 * 城市地标组件（Phase B）。
 *
 * 渲染三类预建 GLB 地标：
 *   1. 中央雕塑塔（landmark-central-tower）：位于 (0,0,0) 中心广场，accent 色 emissive 呼吸
 *   2. 街边树木（street-tree）：InstancedMesh 沿垂直主干道两侧布置
 *   3. 路灯（streetlight-pole）：InstancedMesh 在每个十字路口，灯头单独 emissive 呼吸
 *
 * 不穿模保证：
 *   - 中央塔在中心广场 (0,0,0)，半径 10 内无建筑（BuildingCluster 的街区中心最近在 ±16）
 *   - 树木在垂直道路两侧 ±1.5（道路宽 1.5，半宽 0.75 + 0.75 边距 = 1.5），不与道路冲突
 *   - 路灯偏移路口 (0.8, 0, 0.8)，路口圆盘半径 1.1，不冲突
 *
 * GLB 未加载时降级为不显示（不报错）。
 * 性能：树木和路灯均使用 InstancedMesh。
 */
interface CityLandmarksProps {
  theme?: Theme;
}

// 网格常量（与 CityGround.tsx 保持一致）
const GROUND_SIZE = 160;
const BLOCK_STEP = 16;
const GRID_HALF = GROUND_SIZE / 2;
const ROAD_HALF_WIDTH = 0.75; // 主干道宽 1.5 的一半
const TREE_SIDE_OFFSET = ROAD_HALF_WIDTH + 0.75; // 1.5：道路半宽 + 边距
const LAMP_LOCAL_X = 0.8; // 灯头在 streetlight 局部空间的 x 偏移
const LAMP_Y = 4.0; // 灯头世界 y 高度

const dummy = new THREE.Object3D();

/** 稳定 hash（与 layout.ts 同算法）用于位置抖动 */
function hashSeed(seed: number): number {
  let h = seed | 0;
  h = (h ^ 61) ^ (h >>> 16);
  h = h + (h << 3);
  h = h ^ (h >>> 4);
  h = Math.imul(h, 0x27d4eb2d);
  h = h ^ (h >>> 15);
  return (h >>> 0) / 4294967296;
}

export default function CityLandmarks({ theme = FALLBACK_THEME }: CityLandmarksProps) {
  const { assets } = useGlbAssets();

  const towerMeshRef = useRef<THREE.Mesh>(null);
  const towerMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const treeMeshRef = useRef<THREE.InstancedMesh>(null);
  const streetlightMeshRef = useRef<THREE.InstancedMesh>(null);
  const lampMeshRef = useRef<THREE.InstancedMesh>(null);
  const lampMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // 主题分类
  const themeName = theme.name.toLowerCase();
  const isBlue = themeName.includes("blue") || themeName.includes("midnight");
  const isLight = theme.mode === "light";

  // 主题强度（任务 3.4：light 0.6 / dark 1.2 / blue 2.0）
  const towerIntensity = isLight ? 0.6 : isBlue ? 2.0 : 1.2;
  // 路灯灯头：dark/blue 更亮
  const lampIntensity = isLight ? 1.0 : 2.0;

  // === 中央塔材质：MeshStandardMaterial + onBeforeCompile 注入 accent 色 ===
  // 保留 PBR（roughness/metalness/lighting 不变），仅在 emissive 输出上乘 accent 色
  const towerMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.5,
      emissive: 0xffffff,
      emissiveIntensity: 1.0,
    });

    const accentUniform = { value: new THREE.Color(theme.colors.accent) };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uAccentColor = accentUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec3 uAccentColor;",
        )
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uAccentColor;",
        );
    };

    mat.customProgramCacheKey = () => "procession-landmark-tower-v1";
    mat.userData.accentUniform = accentUniform;

    return mat;
    // 仅在首次创建（theme 切换通过下面的 useEffect 同步 uniform）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题切换：更新 accent 色 + emissive 强度基准
  useEffect(() => {
    const u = towerMaterial.userData.accentUniform as { value: THREE.Color } | undefined;
    if (u) u.value.set(theme.colors.accent);
    if (towerMatRef.current) {
      towerMatRef.current.emissiveIntensity = towerIntensity;
    }
  }, [theme, towerMaterial, towerIntensity]);

  // === 树木材质：vertexColors:true（GLB 中已 bake trunk 棕/crown 绿），按主题 tint ===
  // light：纯色（饱和）；dark：偏黄绿；blue：蓝绿
  const treeTint = useMemo(() => {
    if (isLight) return new THREE.Color(1.0, 1.0, 1.0);
    if (isBlue) return new THREE.Color(0.85, 1.0, 1.1);
    return new THREE.Color(1.0, 1.05, 0.85);
  }, [isLight, isBlue]);

  const treeMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: treeTint,
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
    });
  }, [treeTint]);

  // === 路灯 杆/弧臂/基座/灯头外壳 材质（深灰金属） ===
  const streetlightMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.6,
      metalness: 0.6,
    });
  }, []);

  // === 树木位置：沿 11 条垂直主干道两侧，每条 6 棵，共 66 棵 ===
  // 道路在 x = -GRID_HALF + i*BLOCK_STEP (i=0..10)
  // 两侧 ±1.5（道路宽 1.5，半宽 0.75 + 0.75 边距）
  // 6 棵树沿 z 均匀分布（避开路口 z=-GRID_HALF+j*BLOCK_STEP），alternating side
  const treePositions = useMemo(() => {
    const pts: { x: number; z: number; rotY: number }[] = [];
    const numTreesPerRoad = 6;
    const numRoads = 11;
    for (let i = 0; i < numRoads; i++) {
      const roadX = -GRID_HALF + i * BLOCK_STEP;
      for (let k = 0; k < numTreesPerRoad; k++) {
        // z 沿道路均匀分布：t = (k+0.5)/6，避开路口（路口在整数 BLOCK_STEP 处）
        const t = (k + 0.5) / numTreesPerRoad;
        const z = -GRID_HALF + t * GROUND_SIZE;
        // 两侧 ±1.5，alternating
        const side = k % 2 === 0 ? 1 : -1;
        const sideOffset = side * TREE_SIDE_OFFSET;
        // hashSeed 决定位置抖动（±0.5）
        const seed = i * 1000 + k;
        const jitterX = (hashSeed(seed) - 0.5) * 0.5;
        const jitterZ = (hashSeed(seed + 500) - 0.5) * 0.5;
        pts.push({
          x: roadX + sideOffset + jitterX,
          z: z + jitterZ,
          rotY: hashSeed(seed + 1000) * Math.PI * 2,
        });
      }
    }
    return pts;
  }, []);

  // === 路灯位置：每个十字路口偏移 (0.8, 0, 0.8)，跳过中心广场避免与中央塔冲突 ===
  // 11×11 = 121 个路口，跳过中心 1 个 → 120 个路灯
  const streetlightPositions = useMemo(() => {
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const x = -GRID_HALF + i * BLOCK_STEP;
        const z = -GRID_HALF + j * BLOCK_STEP;
        // 跳过中心广场（中央塔位置）
        if (Math.abs(x) < 1 && Math.abs(z) < 1) continue;
        // 偏移路口 (0.8, 0, 0.8)，避免与路口圆盘（半径 1.1）冲突
        pts.push({ x: x + 0.8, z: z + 0.8 });
      }
    }
    return pts;
  }, []);

  // === 初始化树木 InstancedMesh ===
  useEffect(() => {
    const mesh = treeMeshRef.current;
    if (!mesh) return;
    for (let i = 0; i < treePositions.length; i++) {
      const p = treePositions[i];
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = treePositions.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [treePositions]);

  // === 初始化路灯 InstancedMesh ===
  useEffect(() => {
    const mesh = streetlightMeshRef.current;
    if (!mesh) return;
    for (let i = 0; i < streetlightPositions.length; i++) {
      const p = streetlightPositions[i];
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = streetlightPositions.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [streetlightPositions]);

  // === 初始化灯头 InstancedMesh（叠加发光球在 streetlight 灯头位置） ===
  useEffect(() => {
    const mesh = lampMeshRef.current;
    if (!mesh) return;
    for (let i = 0; i < streetlightPositions.length; i++) {
      const p = streetlightPositions[i];
      // 灯头在 streetlight 局部 (0.8, 4.0, 0)；streetlight 已偏移到 (p.x, 0, p.z)
      dummy.position.set(p.x + LAMP_LOCAL_X, LAMP_Y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = streetlightPositions.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [streetlightPositions]);

  // === 呼吸动画：中央塔 emissive + 路灯灯头 emissive ===
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (towerMatRef.current) {
      towerMatRef.current.emissiveIntensity =
        towerIntensity * (0.8 + Math.sin(t * 1.2) * 0.25);
    }
    if (lampMatRef.current) {
      lampMatRef.current.emissiveIntensity =
        lampIntensity * (0.85 + Math.sin(t * 2.0 + 0.5) * 0.15);
    }
  });

  const towerGeometry = assets.landmarks?.["landmark-central-tower"];
  const treeGeometry = assets.landmarks?.["street-tree"];
  const streetlightGeometry = assets.landmarks?.["streetlight-pole"];

  return (
    <group>
      {/* 中央雕塑塔：位置 (0,0,0)，单个 mesh，accent emissive 呼吸 */}
      {towerGeometry && (
        <mesh
          ref={towerMeshRef}
          geometry={towerGeometry}
          material={towerMaterial}
          position={[0, 0, 0]}
          castShadow
        />
      )}

      {/* 街边树木：InstancedMesh，主干道两侧（66 棵） */}
      {treeGeometry && treePositions.length > 0 && (
        <instancedMesh
          ref={treeMeshRef}
          args={[treeGeometry, treeMaterial, treePositions.length]}
          castShadow
          frustumCulled={false}
        />
      )}

      {/* 路灯杆/弧臂/基座/灯头外壳：InstancedMesh，每个十字路口（120 个） */}
      {streetlightGeometry && streetlightPositions.length > 0 && (
        <instancedMesh
          ref={streetlightMeshRef}
          args={[streetlightGeometry, streetlightMaterial, streetlightPositions.length]}
          castShadow
          frustumCulled={false}
        />
      )}

      {/* 路灯灯头 emissive 球：单独 InstancedMesh，叠加在灯头位置，黄白光呼吸 */}
      {streetlightPositions.length > 0 && (
        <instancedMesh
          ref={lampMeshRef}
          args={[undefined, undefined, streetlightPositions.length]}
          frustumCulled={false}
        >
          <sphereGeometry args={[0.2, 12, 10]} />
          <meshStandardMaterial ref={lampMatRef} {...{
            color: 0xffeb99,
            emissive: 0xffeb99,
            emissiveIntensity: lampIntensity,
            roughness: 0.3,
          }} />
        </instancedMesh>
      )}
    </group>
  );
}
