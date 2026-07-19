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
}

export default function BloomEffect({
  enabled = true,
  strength = 0.05,
  radius = 0.4,
  threshold = 0.85,
  // 默认禁用 SMAA/Vignette/SSAO：Canvas 的 antialias:true 已提供 MSAA，SMAA 冗余；
  // Vignette 默认强度很轻，移除视觉影响极小。默认仅渲染 Render + Bloom 两个 pass。
  enableSMAA = false,
  enableVignette = false,
  enableSSAO = false,
  vignetteOffset = 0.95,
  vignetteDarkness = 0.6,
}: BloomEffectProps) {
  const { gl, scene, camera, size } = useThree();
  const composer = useRef<EffectComposer | null>(null);

  useEffect(() => {
    // enabled 为 false 时不构建 EffectComposer，避免占用渲染资源
    if (!enabled) {
      composer.current = null;
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

    c.addPass(new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      strength,
      radius,
      threshold,
    ));

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
    };
  }, [enabled, gl, scene, camera, size.width, size.height, strength, radius, threshold,
    enableSMAA, enableVignette, enableSSAO, vignetteOffset, vignetteDarkness]);

  useEffect(() => {
    if (composer.current) {
      composer.current.setSize(size.width, size.height);
    }
  }, [size]);

  useFrame((_state, delta) => {
    composer.current?.render(delta);
  }, 2);

  // 所有 hooks 已调用完毕，此处再判断 enabled，避免违反 hooks 规则。
  // enabled === false 时直接返回 null，EffectComposer 不渲染。
  if (!enabled) return null;
  return null;
}
