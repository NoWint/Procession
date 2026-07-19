import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGlbAssets } from "../hooks/useGlbAssets";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

/**
 * 远景城市剪影组件（Phase D）。
 *
 * 渲染 4 个 InstancedMesh（每个 1 个实例），分别布置在地图边缘外 ±100 单位的 4 个方向：
 *   - +z 边：rotation 0°
 *   - -z 边：rotation 180°
 *   - +x 边：rotation 90°
 *   - -x 边：rotation 270°（-90°）
 *
 * 几何来自 skyline-silhouette.glb（50 个扁平剪影建筑沿 X 轴排列的合并 BufferGeometry）。
 *
 * 材质：MeshStandardMaterial + onBeforeCompile 注入主题 accent emissive。
 *   - light：剪影灰色，无 emissive
 *   - dark：剪影深色，accent emissive 0.2
 *   - midnight-blue：剪影深蓝，accent emissive 0.5
 *
 * GLB 未加载时不显示远景（不报错）。
 * 性能：4 个 InstancedMesh（count=1），通过 R3F position/rotation 设置变换，
 * 实例矩阵保持单位矩阵，让 Three.js frustumCulled 基于正确世界包围球工作。
 */
interface SkylineProps {
  theme?: Theme;
}

/** 4 个边缘的偏移与旋转（绕 Y 轴） */
const EDGES: Array<{ pos: [number, number, number]; rotY: number }> = [
  { pos: [0, 0, 100], rotY: 0 },             // +z
  { pos: [0, 0, -100], rotY: Math.PI },      // -z
  { pos: [100, 0, 0], rotY: Math.PI / 2 },   // +x
  { pos: [-100, 0, 0], rotY: -Math.PI / 2 }, // -x
];

const dummy = new THREE.Object3D();

/**
 * 主题分类（剪影色 + accent emissive 强度）。
 * 与 SkyDome / CityLandmarks 中的主题分类保持一致（name + mode 双判定）。
 */
export interface SkylineTheme {
  /** 剪影基础色 */
  silhouetteColor: string;
  /** accent emissive 强度（light=0 不发光 / dark=0.2 / midnight-blue=0.5） */
  emissiveIntensity: number;
}

export function resolveSkylineTheme(theme: Theme): SkylineTheme {
  const name = theme.name.toLowerCase();
  if (theme.mode === "light") {
    return { silhouetteColor: "#4a4a4a", emissiveIntensity: 0.0 };
  }
  if (name.includes("blue") || name.includes("midnight")) {
    return { silhouetteColor: "#1a2a4a", emissiveIntensity: 0.5 };
  }
  return { silhouetteColor: "#1a1a1a", emissiveIntensity: 0.2 };
}

export default function Skyline({ theme = FALLBACK_THEME }: SkylineProps) {
  const { assets } = useGlbAssets();

  // 4 个 InstancedMesh 引用（useRef 必须在顶层调用，不能放在循环里）
  const meshRefs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];

  const skylineTheme = useMemo(() => resolveSkylineTheme(theme), [theme]);

  // === 材质：MeshStandardMaterial + onBeforeCompile 注入 accent emissive ===
  // 保留 PBR（roughness/metalness/lighting 不变），仅在 emissive 输出上乘 accent 色
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(skylineTheme.silhouetteColor),
      roughness: 0.95,
      metalness: 0.0,
      emissive: 0xffffff,
      emissiveIntensity: skylineTheme.emissiveIntensity,
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

    mat.customProgramCacheKey = () => "procession-skyline-v1";
    mat.userData.accentUniform = accentUniform;

    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题切换：更新 silhouette 色 + accent + emissive 强度
  useEffect(() => {
    material.color.set(skylineTheme.silhouetteColor);
    material.emissiveIntensity = skylineTheme.emissiveIntensity;
    const u = material.userData.accentUniform as { value: THREE.Color } | undefined;
    if (u) u.value.set(theme.colors.accent);
  }, [theme, skylineTheme, material]);

  const geometry = assets.skyline?.["skyline-silhouette"];

  // 设置每个 InstancedMesh 的实例 0 矩阵为单位矩阵
  // （变换通过 R3F position/rotation prop 在 InstancedMesh 自身完成，
  //   这样 frustumCulled 基于正确世界包围球工作）
  useEffect(() => {
    if (!geometry) return;
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    meshRefs.forEach((ref) => {
      const mesh = ref.current;
      // 在测试环境（jsdom）下 ref.current 是 DOM 元素而非 THREE.InstancedMesh，
      // 通过 isInstancedMesh 标志跳过非真实 InstancedMesh 的引用。
      if (!mesh || !(mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
      mesh.setMatrixAt(0, dummy.matrix);
      mesh.count = 1;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [geometry]);

  if (!geometry) return null;

  return (
    <group>
      {EDGES.map((edge, i) => (
        <instancedMesh
          key={i}
          ref={meshRefs[i]}
          args={[geometry, material, 1]}
          position={edge.pos}
          rotation={[0, edge.rotY, 0]}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </group>
  );
}
