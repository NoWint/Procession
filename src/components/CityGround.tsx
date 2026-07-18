import { useMemo } from "react";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import * as THREE from "three";

interface CityGroundProps {
  theme?: Theme;
}

export default function CityGround({ theme = FALLBACK_THEME }: CityGroundProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(55, 128);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  return (
    <group>
      <gridHelper
        args={[120, 100, theme.colors.gridSecondary, theme.colors.background]}
        position={[0, 0.01, 0]}
      />
      <mesh geometry={geometry} position={[0, -0.02, 0]} rotation={[0, 0, 0]}>
        <meshStandardMaterial
          color={theme.colors.ground}
          transparent
          opacity={0.85}
          roughness={0.95}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}
