import { useMemo } from "react";
import * as THREE from "three";
import type { BlockInfo } from "../utils/layout";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface BlockBoundaryProps {
  blocks: BlockInfo[];
  theme?: Theme;
}

const BOUNDARY_Y = 0.02;       // 边界高度（略高于地面，略低于道路）
const BOUNDARY_OPACITY = 0.3;  // 半透明发光

/// 街区边界：为每个街区绘制半透明发光矩形边框
/// 使用 lineLoop + lineBasicMaterial，颜色取 theme.colors.electricCyan
export default function BlockBoundary({ blocks, theme }: BlockBoundaryProps) {
  const geometries = useMemo(() => {
    return blocks.map((b) => {
      const points: number[] = [
        b.minX, BOUNDARY_Y, b.minZ,
        b.maxX, BOUNDARY_Y, b.minZ,
        b.maxX, BOUNDARY_Y, b.maxZ,
        b.minX, BOUNDARY_Y, b.maxZ,
      ];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      return { letter: b.letter, geo };
    });
  }, [blocks]);

  const color = theme?.colors.electricCyan ?? FALLBACK_THEME.colors.electricCyan;

  return (
    <group>
      {geometries.map(({ letter, geo }) => (
        <lineLoop key={letter} geometry={geo} frustumCulled={false}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={BOUNDARY_OPACITY}
            depthWrite={false}
          />
        </lineLoop>
      ))}
    </group>
  );
}
