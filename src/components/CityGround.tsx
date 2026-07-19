import { useMemo } from "react";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import * as THREE from "three";

interface CityGroundProps {
  theme?: Theme;
}

export default function CityGround({ theme: _theme = FALLBACK_THEME }: CityGroundProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(55, 128);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const gridGeo = useMemo(() => {
    const size = 90;
    const divs = 40;
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

  return (
    <group>
      <lineSegments geometry={gridGeo} frustumCulled={false}>
        <lineBasicMaterial
          color="#404080"
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </lineSegments>
      <mesh geometry={geometry} position={[0, -0.01, 0]}>
        <meshBasicMaterial color="#202045" toneMapped={false} />
      </mesh>
    </group>
  );
}
