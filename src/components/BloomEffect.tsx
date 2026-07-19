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
  strength = 0.3,
  radius = 0.5,
  threshold = 0.1,
  enableSMAA = true,
  enableVignette = true,
  enableSSAO = false,
  vignetteOffset = 0.95,
  vignetteDarkness = 0.6,
}: BloomEffectProps) {
  const { gl, scene, camera, size } = useThree();
  const composer = useRef<EffectComposer | null>(null);

  useEffect(() => {
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
  }, [gl, scene, camera, size.width, size.height, strength, radius, threshold,
    enableSMAA, enableVignette, enableSSAO, vignetteOffset, vignetteDarkness]);

  useEffect(() => {
    if (composer.current) {
      composer.current.setSize(size.width, size.height);
    }
  }, [size]);

  useFrame((_state, delta) => {
    composer.current?.render(delta);
  }, 2);

  return null;
}
