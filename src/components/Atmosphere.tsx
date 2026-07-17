import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface AtmosphereProps {
  theme?: Theme;
  particleCount?: number;
}

export default function Atmosphere({
  theme = FALLBACK_THEME,
  particleCount = 200,
}: AtmosphereProps) {
  const particles = useMemo(() => {
    const count = particleCount;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    return positions;
  }, [particleCount]);

  const ref = useRef<THREE.Points>(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.02;
    }
  });

  return (
    <>
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={theme.colors.particle}
          size={0.2}
          transparent
          opacity={0.6}
          sizeAttenuation
        />
      </points>
      <EffectComposer>
        <Bloom
          intensity={theme.mode === "dark" ? 0.5 : 0.35}
          luminanceThreshold={theme.mode === "dark" ? 0.4 : 0.55}
          luminanceSmoothing={0.4}
        />
      </EffectComposer>
    </>
  );
}
