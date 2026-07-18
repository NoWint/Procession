import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface CityBackgroundProps {
  theme?: Theme;
  count?: number;
}

const dummy = new THREE.Object3D();

export default function CityBackground({
  theme = FALLBACK_THEME,
  count = 600,
}: CityBackgroundProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const data = useMemo(() => {
    const items: { x: number; z: number; height: number; angle: number }[] = [];
    const innerRadius = 28;
    const outerRadius = 70;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 0.5 + Math.random() * 4.5;
      items.push({ x, z, height, angle });
    }
    return items;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: theme.colors.system,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        emissive: theme.colors.coldBlue,
        emissiveIntensity: 0.15,
        roughness: 0.9,
        metalness: 0.1,
      }),
    [theme],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const color = new THREE.Color(theme.colors.system);
    data.forEach((d, i) => {
      dummy.position.set(d.x, d.height / 2, d.z);
      dummy.rotation.set(0, d.angle, 0);
      dummy.scale.set(0.4, d.height, 0.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [data, theme]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, material, count]}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}
