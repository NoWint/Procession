import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

interface RoadFlowProps {
  blockSpacing?: number;
  gridCount?: number;
  particleCount?: number;
}

export default function RoadFlow({
  blockSpacing = 8.0,
  gridCount = 8,
  particleCount = 120,
}: RoadFlowProps) {
  const ref = useRef<THREE.Points>(null);

  const { pos, spd } = useMemo(() => {
    const p = new Float32Array(particleCount * 3);
    const s = new Float32Array(particleCount);
    const half = (gridCount * blockSpacing) / 2;
    for (let i = 0; i < particleCount; i++) {
      const isH = Math.random() > 0.5;
      const lineIdx = Math.floor(Math.random() * (gridCount * 2 + 1)) - gridCount;
      const t = Math.random();
      if (isH) {
        const z = (lineIdx + 0.5) * blockSpacing;
        p[i * 3] = -half + t * half * 2;
        p[i * 3 + 1] = 0.15;
        p[i * 3 + 2] = z;
      } else {
        const x = (lineIdx + 0.5) * blockSpacing;
        p[i * 3] = x;
        p[i * 3 + 1] = 0.15;
        p[i * 3 + 2] = -half + t * half * 2;
      }
      s[i] = 0.2 + Math.random() * 0.4;
      if (Math.random() > 0.5) s[i] *= -1;
    }
    return { pos: p, spd: s };
  }, [blockSpacing, gridCount, particleCount]);

  useFrame((state, delta) => {
    const points = ref.current;
    if (!points) return;
    const arr = (points.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const half = (gridCount * blockSpacing) / 2;
    for (let i = 0; i < particleCount; i++) {
      arr[i * 3] += spd[i] * delta * 2;
      if (arr[i * 3] > half) arr[i * 3] = -half;
      if (arr[i * 3] < -half) arr[i * 3] = half;
      if (i % 3 === 0) {
        arr[i * 3 + 2] += Math.sin(state.clock.elapsedTime * 0.5 + i) * delta * 0.3;
      }
    }
    points.geometry.getAttribute("position").needsUpdate = true;
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
        opacity={0.5}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
