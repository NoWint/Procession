import { useMemo } from "react";
import * as THREE from "three";

interface RoadGridProps {
  gridSize?: number;
}

const BLOCK = 8.0;   // block center spacing
const STREET = 2.5;  // within-block street spacing

export default function RoadGrid({
  gridSize = 8,
}: RoadGridProps) {
  const { majorGeo, minorGeo } = useMemo(() => {
    const majorLines: number[] = [];
    const minorLines: number[] = [];
    const half = gridSize * BLOCK;

    // Major avenues (between block boundaries)
    for (let i = -gridSize; i <= gridSize; i++) {
      const z = (i + 0.5) * BLOCK;
      if (z >= -half && z <= half) {
        majorLines.push(-half, 0.005, z, half, 0.005, z);
      }
    }
    for (let i = -gridSize; i <= gridSize; i++) {
      const x = (i + 0.5) * BLOCK;
      if (x >= -half && x <= half) {
        majorLines.push(x, 0.005, -half, x, 0.005, half);
      }
    }

    // Minor streets (within each block, at STREET spacing)
    for (let bx = -gridSize; bx < gridSize; bx++) {
      for (let bz = -gridSize; bz < gridSize; bz++) {
        const ox = bx * BLOCK;
        const oz = bz * BLOCK;
        const localHalf = BLOCK / 2 - 0.3;
        // Horizontal streets within block
        for (let s = -BLOCK / 2 + STREET; s < BLOCK / 2 - 0.3; s += STREET) {
          minorLines.push(ox - localHalf, 0.005, oz + s, ox + localHalf, 0.005, oz + s);
        }
        // Vertical streets within block
        for (let s = -BLOCK / 2 + STREET; s < BLOCK / 2 - 0.3; s += STREET) {
          minorLines.push(ox + s, 0.005, oz - localHalf, ox + s, 0.005, oz + localHalf);
        }
      }
    }

    const majGeo = new THREE.BufferGeometry();
    majGeo.setAttribute("position", new THREE.Float32BufferAttribute(majorLines, 3));

    const minGeo = new THREE.BufferGeometry();
    minGeo.setAttribute("position", new THREE.Float32BufferAttribute(minorLines, 3));

    return { majorGeo: majGeo, minorGeo: minGeo };
  }, [gridSize]);

  return (
    <group>
      <lineSegments geometry={majorGeo} frustumCulled={false}>
        <lineBasicMaterial
          color="#8080ff"
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={minorGeo} frustumCulled={false}>
        <lineBasicMaterial
          color="#282850"
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}
