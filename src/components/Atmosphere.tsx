import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface AtmosphereProps {
  theme?: Theme;
  particleCount?: number;
}

const METEOR_COUNT = 5;

function randomSpherePoint(minR: number, maxR: number): THREE.Vector3 {
  const r = minR + Math.random() * (maxR - minR);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = Math.abs(r * Math.cos(phi)) * 0.7 + 5; // 偏上半球
  const z = r * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

export default function Atmosphere({
  theme = FALLBACK_THEME,
  particleCount = 1500,
}: AtmosphereProps) {
  // 星空层：位置 + 顶点颜色（近层 1000 颗 r=80-150，远层 500 颗 r=150-250）
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const cWhite = new THREE.Color("#ffffff");
    const cBlue = new THREE.Color(theme.colors.particle);
    const cYellow = new THREE.Color("#ffe9b0");
    const cRed = new THREE.Color("#ffb088");

    const nearCount = Math.floor(particleCount * (1000 / 1500));
    for (let i = 0; i < particleCount; i++) {
      const isNear = i < nearCount;
      const minR = isNear ? 80 : 150;
      const maxR = isNear ? 150 : 250;
      const p = randomSpherePoint(minR, maxR);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      // 80% 白、10% 蓝（取自主题 particle）、5% 黄白、5% 红橙
      const roll = Math.random();
      let c: THREE.Color;
      if (roll < 0.8) c = cWhite;
      else if (roll < 0.9) c = cBlue;
      else if (roll < 0.95) c = cYellow;
      else c = cRed;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors };
  }, [particleCount, theme.colors.particle]);

  // 流星层：5 条静态线段，每条 2 个顶点（起点与终点均在球壳上，距离 5-15）
  const meteorGeometries = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < METEOR_COUNT; i++) {
      const start = randomSpherePoint(80, 250);
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      const length = 5 + Math.random() * 10;
      const end = start.clone().add(dir.multiplyScalar(length));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]),
          3,
        ),
      );
      geos.push(geo);
    }
    return geos;
  }, []);

  const pointsRef = useRef<THREE.Points>(null);
  const pointsMatRef = useRef<THREE.PointsMaterial>(null);
  const meteorMatRefs = useRef<Array<THREE.LineBasicMaterial | null>>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // 星空整体缓慢闪烁
    if (pointsMatRef.current) {
      pointsMatRef.current.opacity = 0.25 + 0.1 * Math.sin(t * 0.4);
    }
    // 星空整体缓慢旋转
    if (pointsRef.current) {
      pointsRef.current.rotation.y = t * 0.008;
    }
    // 每条流星按各自相位淡入淡出，模拟偶尔划过
    for (let i = 0; i < METEOR_COUNT; i++) {
      const m = meteorMatRefs.current[i];
      if (m) {
        const phase = (i * Math.PI * 2) / METEOR_COUNT;
        const v = Math.max(0, Math.sin(t * 0.3 + phase));
        m.opacity = v * 0.25;
      }
    }
  });

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMatRef}
          size={0.6}
          sizeAttenuation
          transparent
          opacity={0.35}
          vertexColors
          depthWrite={false}
          fog={false}
        />
      </points>

      {meteorGeometries.map((geo, i) => (
        <lineSegments key={i} geometry={geo}>
          <lineBasicMaterial
            ref={(m) => {
              meteorMatRefs.current[i] = m;
            }}
            color="#ffffff"
            transparent
            opacity={0}
            depthWrite={false}
            fog={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}
