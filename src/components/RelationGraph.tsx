import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import type { ProcessRelation } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

export interface RelationEdge {
  sourcePid: number;
  targetPid: number;
  kind: "parent-child" | "ipc";
}

interface RelationGraphProps {
  positions: BuildingPosition[];
  relations: ProcessRelation[];
  theme?: Theme;
  selectedPid?: number | null;
  hoveredPid?: number | null;
  maxParentChildEdges?: number;
  maxIpcEdges?: number;
}

const DEFAULT_MAX_PARENT_CHILD = 120;
const DEFAULT_MAX_IPC = 80;

function hexToRgbNormalized(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return Number.isNaN(bigint) ? [1, 1, 1] : [r, g, b];
}

function darken([r, g, b]: [number, number, number], factor: number): [number, number, number] {
  return [r * factor, g * factor, b * factor];
}

export function computeRelationEdges(
  positions: BuildingPosition[],
  relations: ProcessRelation[],
  maxParentChild: number = DEFAULT_MAX_PARENT_CHILD,
  maxIpc: number = DEFAULT_MAX_IPC,
): RelationEdge[] {
  const visiblePids = new Set(positions.map((p) => p.pid));
  const parentChild: RelationEdge[] = [];
  const ipc: RelationEdge[] = [];

  for (const rel of relations) {
    if (!visiblePids.has(rel.pid)) continue;

    for (const childPid of rel.children) {
      if (parentChild.length >= maxParentChild) break;
      if (visiblePids.has(childPid)) {
        parentChild.push({ sourcePid: rel.pid, targetPid: childPid, kind: "parent-child" });
      }
    }

    for (const peerPid of rel.ipc_peers) {
      if (ipc.length >= maxIpc) break;
      if (visiblePids.has(peerPid) && rel.pid < peerPid) {
        ipc.push({ sourcePid: rel.pid, targetPid: peerPid, kind: "ipc" });
      }
    }
  }

  return parentChild.concat(ipc);
}

function buildRelationGeometry(
  edges: RelationEdge[],
  positions: BuildingPosition[],
  theme: Theme,
  selectedPid: number | null,
  hoveredPid: number | null,
): THREE.BufferGeometry {
  const vertexCount = edges.length * 2;
  const positionsAttr = new Float32Array(vertexCount * 3);
  const colorsAttr = new Float32Array(vertexCount * 3);

  const accent = hexToRgbNormalized(theme.colors.accent);
  const active = hexToRgbNormalized(theme.colors.active);
  const parentChildColor = darken(accent, 0.85);
  const ipcColor = darken(accent, 0.55);

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const src = positions.find((p) => p.pid === edge.sourcePid);
    const dst = positions.find((p) => p.pid === edge.targetPid);
    if (!src || !dst) continue;

    const isParentChild = edge.kind === "parent-child";
    const yOffset = isParentChild ? 0.12 : 0.25;
    const start = new THREE.Vector3(src.x, src.height + yOffset, src.z);
    const end = new THREE.Vector3(dst.x, dst.height + yOffset, dst.z);

    const involved =
      edge.sourcePid === selectedPid ||
      edge.targetPid === selectedPid ||
      edge.sourcePid === hoveredPid ||
      edge.targetPid === hoveredPid;

    const [r, g, b] = involved ? active : isParentChild ? parentChildColor : ipcColor;

    positionsAttr[i * 6] = start.x;
    positionsAttr[i * 6 + 1] = start.y;
    positionsAttr[i * 6 + 2] = start.z;
    positionsAttr[i * 6 + 3] = end.x;
    positionsAttr[i * 6 + 4] = end.y;
    positionsAttr[i * 6 + 5] = end.z;

    colorsAttr[i * 6] = r;
    colorsAttr[i * 6 + 1] = g;
    colorsAttr[i * 6 + 2] = b;
    colorsAttr[i * 6 + 3] = r;
    colorsAttr[i * 6 + 4] = g;
    colorsAttr[i * 6 + 5] = b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positionsAttr, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colorsAttr, 3));
  return geo;
}

export default function RelationGraph({
  positions,
  relations,
  theme = FALLBACK_THEME,
  selectedPid = null,
  hoveredPid = null,
  maxParentChildEdges = DEFAULT_MAX_PARENT_CHILD,
  maxIpcEdges = DEFAULT_MAX_IPC,
}: RelationGraphProps) {
  const prevGeoRef = useRef<THREE.BufferGeometry | null>(null);

  const edges = useMemo(
    () => computeRelationEdges(positions, relations, maxParentChildEdges, maxIpcEdges),
    [positions, relations, maxParentChildEdges, maxIpcEdges],
  );

  const geometry = useMemo(
    () => buildRelationGeometry(edges, positions, theme, selectedPid, hoveredPid),
    [edges, positions, theme, selectedPid, hoveredPid],
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

  if (edges.length === 0) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={2}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.2}
        depthWrite={false}
        linewidth={1}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}
