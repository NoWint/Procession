import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface BloomEffectProps {
  /** 是否启用 Bloom 后处理。false 时不渲染 EffectComposer，由调用方（如 useFpsMonitor）按需控制。默认 true。 */
  enabled?: boolean;
  strength?: number;
  radius?: number;
  threshold?: number;
  enableSMAA?: boolean;
  enableVignette?: boolean;
  enableSSAO?: boolean;
  vignetteOffset?: number;
  vignetteDarkness?: number;
  /**
   * P0-2 主题切换 spring 过渡 + 项目硬约束：
   * Bloom 参数必须随主题动态调整（深色主题 strength 更高，浅色主题更低）。
   * 传入 theme 后，target strength 由 theme.mode 决定，并在 useFrame 中 lerp 过渡。
   * 若同时传入 strength prop，theme 优先。
   */
  theme?: Theme;
}

// 主题相关默认值（项目硬约束：dark 更高、light 更低）
const BLOOM_STRENGTH_DARK = 0.08;
const BLOOM_STRENGTH_LIGHT = 0.03;

export default function BloomEffect({
  enabled = true,
  strength,
  radius = 0.4,
  threshold = 0.85,
  // 默认禁用 SMAA/Vignette/SSAO：Canvas 的 antialias:true 已提供 MSAA，SMAA 冗余；
  // Vignette 默认强度很轻，移除视觉影响极小。默认仅渲染 Render + Bloom 两个 pass。
  enableSMAA = false,
  enableVignette = false,
  enableSSAO = false,
  vignetteOffset = 0.95,
  vignetteDarkness = 0.6,
  theme = FALLBACK_THEME,
}: BloomEffectProps) {
  const { gl, scene, camera, size } = useThree();
  const composer = useRef<EffectComposer | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);

  // P0-2 目标 strength：theme 优先，否则用 prop，否则用暗主题默认
  const targetStrength = theme
    ? theme.mode === "dark"
      ? BLOOM_STRENGTH_DARK
      : BLOOM_STRENGTH_LIGHT
    : strength ?? BLOOM_STRENGTH_DARK;
  // 用 ref 缓存 target，避免 useFrame 闭包陈旧
  const targetStrengthRef = useRef(targetStrength);
  targetStrengthRef.current = targetStrength;

  // 初始 strength 取 target，避免第一帧硬切
  const initialStrength = targetStrength;

  useEffect(() => {
    // enabled 为 false 时不构建 EffectComposer，避免占用渲染资源
    if (!enabled) {
      composer.current = null;
      bloomPassRef.current = null;
      return;
    }

    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));

    if (enableSSAO) {
      const ssao = new SSAOPass(scene, camera, size.width, size.height);
      ssao.kernelRadius = 8;
      ssao.minDistance = 0.002;
      ssao.maxDistance = 0.1;
      c.addPass(ssao);
    }

    // 注意：strength 不再作为 useEffect 依赖（否则 spring 每帧会重建 composer）。
    // useFrame 中通过 bloomPassRef 平滑 lerp strength 到 target。
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      initialStrength,
      radius,
      threshold,
    );
    bloomPassRef.current = bloom;
    c.addPass(bloom);

    if (enableVignette) {
      const vPass = new ShaderPass(VignetteShader);
      vPass.uniforms.offset.value = vignetteOffset;
      vPass.uniforms.darkness.value = vignetteDarkness;
      c.addPass(vPass);
    }

    if (enableSMAA) {
      c.addPass(new SMAAPass());
    }

    composer.current = c;

    return () => {
      c.dispose();
      bloomPassRef.current = null;
    };
    // 故意不将 strength / targetStrength 纳入依赖：
    // strength 现在通过 useFrame lerp 而非重建 composer 实现。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gl, scene, camera, size.width, size.height,
    enableSMAA, enableVignette, enableSSAO, vignetteOffset, vignetteDarkness,
    radius, threshold, initialStrength]);

  useEffect(() => {
    if (composer.current) {
      composer.current.setSize(size.width, size.height);
    }
  }, [size]);

  // P0-2 spring 过渡：strength 在每帧 lerp 到 target，避免主题切换硬切
  useFrame((_state, delta) => {
    if (bloomPassRef.current) {
      const cur = bloomPassRef.current.strength;
      const target = targetStrengthRef.current;
      // 帧率无关的指数衰减 lerp，时间常数 0.3s（Apple critically damped, response 0.3）
      const k = 1 - Math.exp(-delta / 0.3);
      bloomPassRef.current.strength = THREE.MathUtils.lerp(cur, target, k);
    }
    composer.current?.render(delta);
  }, 2);

  // 所有 hooks 已调用完毕，此处再判断 enabled，避免违反 hooks 规则。
  // enabled === false 时直接返回 null，EffectComposer 不渲染。
  if (!enabled) return null;
  return null;
}
