import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

interface BloomEffectProps {
  strength?: number;
  radius?: number;
  threshold?: number;
}

export default function BloomEffect({
  strength = 0.3,
  radius = 0.5,
  threshold = 0.1,
}: BloomEffectProps) {
  const { gl, scene, camera, size } = useThree();
  const composer = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      strength,
      radius,
      threshold,
    ));
    composer.current = c;

    return () => {
      c.dispose();
    };
  }, [gl, scene, camera, size.width, size.height, strength, radius, threshold]);

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
