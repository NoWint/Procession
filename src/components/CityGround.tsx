import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface CityGroundProps {
  theme?: Theme;
}

export default function CityGround({ theme = FALLBACK_THEME }: CityGroundProps) {
  return (
    <group>
      <gridHelper
        args={[100, 50, theme.colors.grid, theme.colors.gridSecondary]}
        position={[0, 0, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color={theme.colors.ground}
          transparent
          opacity={0.85}
          roughness={0.9}
        />
      </mesh>
    </group>
  );
}
