import { useMemo } from "react";
import * as THREE from "three";

interface RoadGridProps {
  gridSize?: number;
}


const STREET = 2.5;  // spacing within a block

export default function RoadGrid({
  gridSize = 12,
}: RoadGridProps) {
  const geometry = useMemo(() => {
    const lines: THREE.Vector3[] = [];
    const extent = gridSize * STREET;

    // Major roads: between block centers at BLOCK spacing
    for (let i = -gridSize; i <= gridSize; i++) {
      const z = i * STREET + STREET / 2;
      if (z >= -extent && z <= extent) {
        lines.push(new THREE.Vector3(-extent, 0.01, z));
        lines.push(new THREE.Vector3(extent, 0.01, z));
      }
    }
    for (let i = -gridSize; i <= gridSize; i++) {
      const x = i * STREET + STREET / 2;
      if (x >= -extent && x <= extent) {
        lines.push(new THREE.Vector3(x, 0.01, -extent));
        lines.push(new THREE.Vector3(x, 0.01, extent));
      }
    }

    const geo = new THREE.BufferGeometry();
    const pos = lines.flatMap((v) => [v.x, v.y, v.z]);
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return geo;
  }, [gridSize]);

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        color="#1a1a35"
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </lineSegments>
  );
}
