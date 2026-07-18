import { useRef, useMemo, useEffect } from "react";
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

export interface Particle {
  pathIndex: number;
  pointIndex: number;
  t: number;
}

const DEFAULT_PARTICLES_PER_CABLE = 4;
const PARTICLE_SIZE = 0.34;

function createParticleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.55)");
  gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.15)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const PARTICLE_TEXTURE = createParticleTexture();

export function updateParticles(
  particles: Particle[],
  paths: THREE.Vector3[][],
  delta: number,
  speed: number,
  positions: Float32Array,
): void {
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
}

export default function CableFlow({
  paths,
  protocols = [],
  theme = FALLBACK_THEME,
  baseParticlesPerCable = DEFAULT_PARTICLES_PER_CABLE,
  intensities,
  speed = 3.2,
}: CableFlowProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const particlesRef = useRef<Particle[]>([]);
  const pathsRef = useRef<THREE.Vector3[][]>(paths);
  pathsRef.current = paths;

  const { geometry, count } = useMemo(() => {
    // Reduce particle density as the number of cables grows.
    const adaptiveParticlesPerCable = paths.length > 60 ? 3 : paths.length > 30 ? 3 : baseParticlesPerCable;
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
    particlesRef.current = p;

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(p.length * 3);
    const colors = new Float32Array(p.length * 3);

    for (let i = 0; i < p.length; i++) {
      const protocol = protocols[p[i].pathIndex] ?? "";
      const base = new THREE.Color(cableColorForProtocol(protocol, theme));
      const bright = base.clone().offsetHSL(0, 0, 0.35).lerp(new THREE.Color(0xffffff), 0.25);
      colors[i * 3] = bright.r;
      colors[i * 3 + 1] = bright.g;
      colors[i * 3 + 2] = bright.b;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return { geometry: geo, count: p.length };
  }, [paths, protocols, baseParticlesPerCable, intensities, theme]);

  // Dispose previous geometry when a new one is created to avoid GPU memory leaks.
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const positions = pointsRef.current.geometry.attributes.position
      .array as Float32Array;

    updateParticles(particlesRef.current, pathsRef.current, delta, speed, positions);
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <points ref={pointsRef} geometry={geometry} renderOrder={2}>
      <pointsMaterial
        size={PARTICLE_SIZE}
        transparent
        opacity={0.98}
        depthWrite={false}
        sizeAttenuation
        vertexColors
        blending={THREE.AdditiveBlending}
        map={PARTICLE_TEXTURE}
      />
    </points>
  );
}
