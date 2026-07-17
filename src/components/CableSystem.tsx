import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import type { Connection } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import { cableColorForProtocol } from "../utils/colors";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

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
const CURVE_SEGMENTS = 20;
const ARCH_HEIGHT = 2.5;

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

    const start = new THREE.Vector3(src.x, src.height, src.z);
    const end = new THREE.Vector3(dst.x, dst.y, dst.z);
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    mid.y = Math.max(start.y, end.y) + ARCH_HEIGHT;

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    cables.push({ path: curve.getPoints(CURVE_SEGMENTS), protocol: c.protocol });
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

function hexToRgbNormalized(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return Number.isNaN(bigint) ? [1, 1, 1] : [r, g, b];
}

export function buildBatchedCableGeometry(
  cables: CableData[],
  theme: Theme = FALLBACK_THEME,
): THREE.BufferGeometry {
  let vertexCount = 0;
  for (const cable of cables) {
    vertexCount += Math.max(0, cable.path.length - 1) * 2;
  }

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  let offset = 0;

  for (const cable of cables) {
    const [r, g, b] = hexToRgbNormalized(cableColorForProtocol(cable.protocol, theme));
    for (let i = 0; i < cable.path.length - 1; i++) {
      const a = cable.path[i];
      const c = cable.path[i + 1];
      if (!a || !c) continue;

      positions[offset * 6] = a.x;
      positions[offset * 6 + 1] = a.y;
      positions[offset * 6 + 2] = a.z;
      positions[offset * 6 + 3] = c.x;
      positions[offset * 6 + 4] = c.y;
      positions[offset * 6 + 5] = c.z;

      colors[offset * 6] = r;
      colors[offset * 6 + 1] = g;
      colors[offset * 6 + 2] = b;
      colors[offset * 6 + 3] = r;
      colors[offset * 6 + 4] = g;
      colors[offset * 6 + 5] = b;
      offset++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

export default function CableSystem({
  connections = [],
  positions = [],
  cables: providedCables,
  theme = FALLBACK_THEME,
  maxCables = 100,
}: CableSystemProps) {
  const prevGeoRef = useRef<THREE.BufferGeometry | null>(null);

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
    <lineSegments geometry={geometry} renderOrder={1}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.55}
        depthWrite={false}
        linewidth={1.2}
      />
    </lineSegments>
  );
}
