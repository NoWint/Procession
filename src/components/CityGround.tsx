import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface CityGroundProps {
  theme?: Theme;
}

const waterVertexShader = `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const waterFragmentShader = `
uniform float uTime;
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorldPos;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 p = vWorldPos.xz;
  float t = uTime * 0.3;
  float w1 = sin(p.x * 0.3 + t) * 0.5 + 0.5;
  float w2 = sin(p.y * 0.4 - t * 1.3) * 0.5 + 0.5;
  float w3 = sin(length(p) * 0.5 - t * 2.0) * 0.5 + 0.5;
  float waves = (w1 + w2 + w3) / 3.0;

  float dist = length(p);
  float edgeFade = smoothstep(30.0, 35.0, dist) * (1.0 - smoothstep(70.0, 90.0, dist));

  vec3 color = mix(uColorDeep, uColorShallow, waves);
  float alpha = uOpacity * edgeFade * (0.6 + waves * 0.4);

  gl_FragColor = vec4(color, alpha);
}
`;

export default function CityGround({ theme = FALLBACK_THEME }: CityGroundProps) {
  const plazaMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // Main city disk geometry (radius 30)
  const cityGeometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(30, 96);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // Outer water geometry (radius 90)
  const waterGeometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(90, 96);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // Central plaza geometry (radius 5)
  const plazaGeometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(5, 64);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // Square grid lines clipped to main disk (radius 30)
  const gridGeo = useMemo(() => {
    const size = 60;
    const divs = 30;
    const step = size / divs;
    const lines: number[] = [];
    const half = size / 2;
    for (let i = -divs / 2; i <= divs / 2; i++) {
      const p = i * step;
      lines.push(-half, 0.005, p, half, 0.005, p);
      lines.push(p, 0.005, -half, p, 0.005, half);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    return geo;
  }, []);

  // 16 radiation roads from center to radius 28 (every 22.5 degrees)
  const roadGeo = useMemo(() => {
    const lines: number[] = [];
    const innerR = 0;
    const outerR = 28;
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      lines.push(x * innerR, 0.02, z * innerR, x * outerR, 0.02, z * outerR);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    return geo;
  }, []);

  // Water ShaderMaterial - created once to preserve uTime continuity;
  // uniform colors are refreshed via useEffect when theme changes.
  const waterMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColorDeep: {
            value: new THREE.Color(theme.colors.coldBlue).multiplyScalar(0.3),
          },
          uColorShallow: {
            value: new THREE.Color(theme.colors.electricCyan),
          },
          uOpacity: { value: 0.35 },
        },
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
        transparent: true,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Sync water uniform colors when theme palette changes
  useEffect(() => {
    waterMaterial.uniforms.uColorDeep.value
      .set(theme.colors.coldBlue)
      .multiplyScalar(0.3);
    waterMaterial.uniforms.uColorShallow.value.set(theme.colors.electricCyan);
  }, [theme.colors.coldBlue, theme.colors.electricCyan, waterMaterial]);

  // Per-frame updates: water uTime + plaza emissiveIntensity pulse
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    waterMaterial.uniforms.uTime.value = t;
    if (plazaMatRef.current) {
      plazaMatRef.current.emissiveIntensity = 0.15 + Math.sin(t * 1.5) * 0.05;
    }
  });

  return (
    <group>
      {/* Outer water (lowest, largest) */}
      <mesh geometry={waterGeometry} position={[0, -0.02, 0]}>
        <primitive object={waterMaterial} attach="material" />
      </mesh>

      {/* Main city disk */}
      <mesh geometry={cityGeometry} position={[0, -0.01, 0]} receiveShadow>
        <meshStandardMaterial
          color={theme.colors.ground}
          roughness={0.85}
          metalness={0.2}
        />
      </mesh>

      {/* Grid lines within main disk */}
      <lineSegments geometry={gridGeo} frustumCulled={false}>
        <lineBasicMaterial
          color="#6060c0"
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </lineSegments>

      {/* 16 radiation roads */}
      <lineSegments geometry={roadGeo} frustumCulled={false}>
        <lineBasicMaterial
          color={theme.colors.electricCyan}
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </lineSegments>

      {/* Central plaza (top, glowing + pulsing) */}
      <mesh geometry={plazaGeometry} position={[0, 0.01, 0]} receiveShadow>
        <meshStandardMaterial
          ref={plazaMatRef}
          color={theme.colors.accent}
          emissive={theme.colors.accent}
          emissiveIntensity={0.15}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}
