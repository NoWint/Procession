import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ListeningPort } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import { useI18n } from "../hooks/useI18n";

interface PortHarborsProps {
  ports: ListeningPort[];
  positions: BuildingPosition[];
  theme?: Theme;
  maxHarbors?: number;
}

export interface HarborData {
  port: number;
  protocol: string;
  address: string;
  pid: number;
  x: number;
  z: number;
  isPublic: boolean;
}

const HARBOR_RADIUS_MIN = 14;
const HARBOR_RADIUS_VAR = 4.5;
const DOCK_SIZE = 0.35;
const CABLE_SEGMENTS = 16;
const CABLE_ARCH_HEIGHT = 1.8;
const PUBLIC_COLOR = "#ffb84d";

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function isPublicAddress(address: string): boolean {
  const a = address.trim();
  return a === "0.0.0.0" || a === "::" || a === "";
}

export function computeHarborData(
  ports: ListeningPort[],
  positions: BuildingPosition[],
  maxHarbors: number = 40,
): HarborData[] {
  const visiblePids = new Set(positions.map((p) => p.pid));
  const sorted = [...ports]
    .filter((p) => visiblePids.has(p.pid))
    .sort((a, b) => b.port - a.port)
    .slice(0, maxHarbors);

  return sorted.map((p) => {
    const key = `${p.port}-${p.protocol}`;
    const h = hashString(key);
    const angle = (h % 360) * (Math.PI / 180);
    const radius = HARBOR_RADIUS_MIN + ((h % 1000) / 1000) * HARBOR_RADIUS_VAR;
    return {
      port: p.port,
      protocol: p.protocol,
      address: p.address,
      pid: p.pid,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      isPublic: isPublicAddress(p.address),
    };
  });
}

function buildCableGeometry(
  harbors: HarborData[],
  positions: BuildingPosition[],
): THREE.BufferGeometry {
  const posMap = new Map<number, BuildingPosition>();
  for (const p of positions) {
    posMap.set(p.pid, p);
  }

  let segmentCount = 0;
  const segments: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];

  for (const harbor of harbors) {
    const building = posMap.get(harbor.pid);
    if (!building) continue;

    const start = new THREE.Vector3(building.x, building.height * 0.6, building.z);
    const end = new THREE.Vector3(harbor.x, 0.15, harbor.z);
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    mid.y = Math.max(start.y, end.y) + CABLE_ARCH_HEIGHT;

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(CABLE_SEGMENTS);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a && b) {
        segments.push({ start: a, end: b });
      }
    }
  }

  segmentCount = segments.length;
  const positionsAttr = new Float32Array(segmentCount * 6);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    positionsAttr[i * 6] = s.start.x;
    positionsAttr[i * 6 + 1] = s.start.y;
    positionsAttr[i * 6 + 2] = s.start.z;
    positionsAttr[i * 6 + 3] = s.end.x;
    positionsAttr[i * 6 + 4] = s.end.y;
    positionsAttr[i * 6 + 5] = s.end.z;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positionsAttr, 3));
  return geo;
}

export default function PortHarbors({
  ports,
  positions,
  theme = FALLBACK_THEME,
  maxHarbors = 40,
}: PortHarborsProps) {
  const dockMeshRef = useRef<THREE.InstancedMesh>(null);
  const cableGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const { t } = useI18n();

  const harbors = useMemo(
    () => computeHarborData(ports, positions, maxHarbors),
    [ports, positions, maxHarbors],
  );

  const dockColors = useMemo(() => {
    return harbors.map((h) => new THREE.Color(h.isPublic ? PUBLIC_COLOR : theme.colors.system));
  }, [harbors, theme.colors.system]);

  useEffect(() => {
    if (!dockMeshRef.current) return;
    const dummy = new THREE.Object3D();
    harbors.forEach((h, i) => {
      dummy.position.set(h.x, 0.15, h.z);
      dummy.scale.set(DOCK_SIZE, DOCK_SIZE * 0.5, DOCK_SIZE);
      dummy.updateMatrix();
      dockMeshRef.current!.setMatrixAt(i, dummy.matrix);
      dockMeshRef.current!.setColorAt(i, dockColors[i]);
    });
    dockMeshRef.current.instanceMatrix.needsUpdate = true;
    if (dockMeshRef.current.instanceColor) {
      dockMeshRef.current.instanceColor.needsUpdate = true;
    }
  }, [harbors, dockColors]);

  const cableGeometry = useMemo(
    () => buildCableGeometry(harbors, positions),
    [harbors, positions],
  );

  useEffect(() => {
    const prev = cableGeoRef.current;
    cableGeoRef.current = cableGeometry;
    return () => {
      if (prev && prev !== cableGeometry) {
        prev.dispose();
      }
    };
  }, [cableGeometry]);

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (event.instanceId === undefined) return;
      setHoveredIndex(event.instanceId);
    },
    [],
  );

  const handlePointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHoveredIndex(null);
  }, []);

  if (harbors.length === 0) return null;

  const hoveredHarbor = hoveredIndex !== null ? harbors[hoveredIndex] : null;

  return (
    <group>
      <instancedMesh
        ref={dockMeshRef}
        args={[undefined, undefined, harbors.length]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.6}
          emissive={theme.colors.accent}
          emissiveIntensity={0.08}
        />
      </instancedMesh>

      <lineSegments geometry={cableGeometry} renderOrder={1}>
        <lineBasicMaterial
          color={theme.colors.accent}
          transparent
          opacity={0.15}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {hoveredHarbor && (
        <Html
          position={[hoveredHarbor.x, 0.6, hoveredHarbor.z]}
          center
          distanceFactor={14}
          style={{ pointerEvents: "none" }}
        >
          <div className="harbor-label">
            <div className="harbor-label-port">
              {hoveredHarbor.port}/{hoveredHarbor.protocol.toUpperCase()}
            </div>
            <div className="harbor-label-address">{hoveredHarbor.address}</div>
            <div className="harbor-label-scope">
              {hoveredHarbor.isPublic ? t("harbor.public") : t("harbor.private")}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
