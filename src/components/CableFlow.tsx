import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { cableColorForProtocol } from "../utils/colors";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface CableFlowProps {
  paths: THREE.Vector3[][];
  protocols?: string[];
  theme?: Theme;
  baseParticlesPerCable?: number;
  intensities?: number[];
  speed?: number;
}

interface Particle {
  pathIndex: number;
  pointIndex: number;
  t: number;
}

const DEFAULT_PARTICLES_PER_CABLE = 3;
const PARTICLE_SIZE = 0.13;

function hexToRgbNormalized(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return Number.isNaN(bigint) ? [1, 1, 1] : [r, g, b];
}

export default function CableFlow({
  paths,
  protocols = [],
  theme = FALLBACK_THEME,
  baseParticlesPerCable = DEFAULT_PARTICLES_PER_CABLE,
  intensities,
  speed = 1.8,
}: CableFlowProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const { particles, geometry, count } = useMemo(() => {
    // Reduce particle density as the number of cables grows.
    const adaptiveParticlesPerCable = paths.length > 60 ? 2 : paths.length > 30 ? 2 : baseParticlesPerCable;
    const p: Particle[] = [];
    for (let i = 0; i < paths.length; i++) {
      const intensity = intensities?.[i] ?? 1;
      const particleCount = Math.max(
        1,
        Math.round(adaptiveParticlesPerCable * intensity),
      );
      for (let j = 0; j < particleCount; j++) {
        p.push({
          pathIndex: i,
          pointIndex: 0,
          t: j / Math.max(particleCount, 1),
        });
      }
    }

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(p.length * 3);
    const colors = new Float32Array(p.length * 3);

    for (let i = 0; i < p.length; i++) {
      const protocol = protocols[p[i].pathIndex] ?? "";
      const [r, g, b] = hexToRgbNormalized(cableColorForProtocol(protocol, theme));
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return { particles: p, geometry: geo, count: p.length };
  }, [paths, protocols, baseParticlesPerCable, intensities, theme]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const positions = pointsRef.current.geometry.attributes.position
      .array as Float32Array;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const path = paths[p.pathIndex];
      if (!path || path.length < 2) continue;

      p.t += delta * speed;
      while (p.t >= 1) {
        p.t -= 1;
        p.pointIndex = (p.pointIndex + 1) % (path.length - 1);
      }

      const a = path[p.pointIndex];
      const b = path[p.pointIndex + 1];
      if (!a || !b) continue;

      positions[i * 3] = a.x + (b.x - a.x) * p.t;
      positions[i * 3 + 1] = a.y + (b.y - a.y) * p.t;
      positions[i * 3 + 2] = a.z + (b.z - a.z) * p.t;
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <points ref={pointsRef} geometry={geometry} renderOrder={2}>
      <pointsMaterial
        size={PARTICLE_SIZE}
        transparent
        opacity={0.85}
        depthWrite={false}
        sizeAttenuation
        vertexColors
      />
    </points>
  );
}
