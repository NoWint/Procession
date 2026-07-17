import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Connection } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import { cableColorForProtocol } from "../utils/colors";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface CableSystemProps {
  connections: Connection[];
  positions: BuildingPosition[];
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

export default function CableSystem({
  connections,
  positions,
  theme = FALLBACK_THEME,
  maxCables = 100,
}: CableSystemProps) {
  const cables = useMemo(
    () => computeCableData(connections, positions, maxCables),
    [connections, positions, maxCables],
  );

  return (
    <group renderOrder={1}>
      {cables.map((cable, i) => (
        <Line
          key={i}
          points={cable.path}
          color={cableColorForProtocol(cable.protocol, theme)}
          lineWidth={1.2}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      ))}
    </group>
  );
}
