import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

interface RoadFlowProps {
  blockSpacing?: number;
  gridCount?: number;
  particleCount?: number;
}

/// Glowing particles along avenue lines — uses Points rotation for
/// cheap animation, no per-vertex CPU updates.
export default function RoadFlow({
  blockSpacing = 8.0,
  gridCount = 6,
  particleCount = 60,
}: RoadFlowProps) {
  const ref = useRef<THREE.Points>(null);

  const pos = useMemo(() => {
    const p = new Float32Array(particleCount * 3);
    const half = (gridCount * blockSpacing) / 2;
    for (let i = 0; i < particleCount; i++) {
      const isH = Math.random() > 0.5;
      const lineIdx = Math.floor(Math.random() * (gridCount * 2 + 1)) - gridCount;
      const t = Math.random();
      if (isH) {
        p[i * 3] = -half + t * half * 2;
        p[i * 3 + 1] = 0.15;
        p[i * 3 + 2] = (lineIdx + 0.5) * blockSpacing;
      } else {
        p[i * 3] = (lineIdx + 0.5) * blockSpacing;
        p[i * 3 + 1] = 0.15;
        p[i * 3 + 2] = -half + t * half * 2;
      }
    }
    return p;
  }, [blockSpacing, gridCount, particleCount]);

  // Rotate the entire group slowly — no per-vertex CPU work
  useFrame((_state, _delta) => {
    if (ref.current) {
      ref.current.rotation.y += 0.0005;
    }
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#8080ff"
        size={0.25}
        transparent
        opacity={0.2}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
