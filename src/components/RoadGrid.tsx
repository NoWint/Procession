import { useMemo } from "react";
import * as THREE from "three";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface RoadGridProps {
  theme?: Theme;
  gridSize?: number; // half the cell count in one direction
}

const CELL = 3.0;

export default function RoadGrid({
  theme = FALLBACK_THEME,
  gridSize = 12,
}: RoadGridProps) {
  const geometry = useMemo(() => {
    // Roads run along the grid lines between buildings.
    // Lines are drawn at half-cell offsets from the grid centers.
    const lines: THREE.Vector3[] = [];
    const extent = gridSize * CELL;

    // Horizontal roads (along X axis, at Z offsets)
    for (let i = -gridSize; i <= gridSize; i++) {
      const z = i * CELL + CELL / 2;
      if (z < -extent || z > extent) continue;
      lines.push(new THREE.Vector3(-extent, 0, z));
      lines.push(new THREE.Vector3(extent, 0, z));
    }

    // Vertical roads (along Z axis, at X offsets)
    for (let i = -gridSize; i <= gridSize; i++) {
      const x = i * CELL + CELL / 2;
      if (x < -extent || x > extent) continue;
      lines.push(new THREE.Vector3(x, 0, -extent));
      lines.push(new THREE.Vector3(x, 0, extent));
    }

    const geo = new THREE.BufferGeometry();
    const pos = lines.flatMap((v) => [v.x, v.y, v.z]);
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return geo;
  }, [gridSize]);

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        color={theme.colors.grid}
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </lineSegments>
  );
}
