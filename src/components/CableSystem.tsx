import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Connection } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import { cableColorForProtocol } from "../utils/colors";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

const cableVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  attribute vec3 color;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vColor = color;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cableFragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  uniform float uTime;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.2);

    // Time-based pulse along the cable
    float pulse = sin(vUv.x * 12.0 - uTime * 3.0) * 0.5 + 0.5;

    vec3 glow = vColor * 2.0 + vColor * fresnel * 1.6;
    glow += vColor * pulse * 0.6;

    // Head/tail fade along cable
    float fade = smoothstep(0.0, 0.1, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x));
    glow *= 0.45 + 0.55 * fade;

    gl_FragColor = vec4(glow, 0.92);
  }
`;

interface CableSystemProps {
  connections?: Connection[];
  positions?: BuildingPosition[];
  cables?: CableData[];
  theme?: Theme;
  maxCables?: number;
}

export interface CableData {
  path: THREE.Vector3[];
  protocol: string;
}

const EXTERNAL_RADIUS_MIN = 12;
const EXTERNAL_RADIUS_VAR = 4;
const ARCH_HEIGHT = 4.0;

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function parseHost(addr: string): string {
  return addr.split(":")[0] ?? addr;
}

function isNullHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::" || host === "";
}

export function remoteEndpointPosition(remoteAddr: string): { x: number; y: number; z: number } {
  const host = parseHost(remoteAddr);
  if (isNullHost(host)) {
    return { x: 0, y: 0, z: 0 };
  }
  const h = hashString(host);
  const angle = (h % 360) * (Math.PI / 180);
  const radius = EXTERNAL_RADIUS_MIN + ((h % 1000) / 1000) * EXTERNAL_RADIUS_VAR;
  return {
    x: Math.cos(angle) * radius,
    y: 0.1,
    z: Math.sin(angle) * radius,
  };
}

export function computeCableData(
  connections: Connection[],
  positions: BuildingPosition[],
  maxCables: number = 100,
): CableData[] {
  const posMap = new Map<number, BuildingPosition>();
  for (const p of positions) {
    posMap.set(p.pid, p);
  }

  const cables: CableData[] = [];
  for (const c of connections) {
    if (cables.length >= maxCables) break;

    const src = posMap.get(c.pid);
    if (!src) continue;

    const dst = remoteEndpointPosition(c.remote_addr);
    if (dst.x === 0 && dst.y === 0 && dst.z === 0) continue;

    const start = new THREE.Vector3(src.x, src.height * 0.7, src.z);
    const end = new THREE.Vector3(dst.x, dst.y + 1, dst.z);
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    mid.y = Math.max(start.y, end.y) + ARCH_HEIGHT;

    const control1 = new THREE.Vector3().lerpVectors(start, mid, 0.5);
    const control2 = new THREE.Vector3().lerpVectors(mid, end, 0.5);

    const curve = new THREE.CatmullRomCurve3([start, control1, control2, end]);
    cables.push({ path: curve.getPoints(50), protocol: c.protocol });
  }

  return cables;
}

export function computeCablePaths(
  connections: Connection[],
  positions: BuildingPosition[],
  maxCables: number = 100,
): THREE.Vector3[][] {
  return computeCableData(connections, positions, maxCables).map((c) => c.path);
}

export function buildBatchedCableGeometry(
  cables: CableData[],
  theme: Theme = FALLBACK_THEME,
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  const colorArray: number[] = [];

  for (const cable of cables) {
    const curve = new THREE.CatmullRomCurve3(cable.path);
    const tube = new THREE.TubeGeometry(curve, 32, 0.14, 10, false);
    const count = tube.attributes.position.count;
    const color = new THREE.Color(cableColorForProtocol(cable.protocol, theme));
    for (let i = 0; i < count; i++) {
      colorArray.push(color.r, color.g, color.b);
    }
    geometries.push(tube);
  }

  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  const merged = mergeGeometries(geometries, false);
  if (!merged) return new THREE.BufferGeometry();

  merged.setAttribute("color", new THREE.Float32BufferAttribute(colorArray, 3));
  return merged;
}

export default function CableSystem({
  connections = [],
  positions = [],
  cables: providedCables,
  theme = FALLBACK_THEME,
  maxCables = 100,
}: CableSystemProps) {
  const prevGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useEffect(() => {
    const clock = new THREE.Clock();
    let rafId = 0;
    const animate = () => {
      if (materialRef.current) {
        materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const cables = useMemo(
    () => providedCables ?? computeCableData(connections, positions, maxCables),
    [providedCables, connections, positions, maxCables],
  );

  const geometry = useMemo(
    () => buildBatchedCableGeometry(cables, theme),
    [cables, theme],
  );

  useEffect(() => {
    const prev = prevGeoRef.current;
    prevGeoRef.current = geometry;
    return () => {
      if (prev && prev !== geometry) {
        prev.dispose();
      }
    };
  }, [geometry]);

  if (cables.length === 0) return null;

  return (
    <mesh geometry={geometry} renderOrder={1}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={cableVertexShader}
        fragmentShader={cableFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
        }}
      />
    </mesh>
  );
}
