import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

interface CityTreesProps {
  blockSpacing?: number;
  gridCount?: number;
}

const _d = new THREE.Object3D();

export default function CityTrees({
  blockSpacing = 8.0,
  gridCount = 8,
}: CityTreesProps) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);

  const { pts, n } = useMemo(() => {
    const items: [number, number][] = [];
    const half = (gridCount * blockSpacing) / 2;
    for (let col = -gridCount; col <= gridCount; col++) {
      for (let row = -gridCount; row <= gridCount; row++) {
        const x = (col + 0.5) * blockSpacing;
        const z = (row + 0.5) * blockSpacing;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
        if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
        items.push([x, z]);
      }
    }
    return { pts: items, n: items.length };
  }, [blockSpacing, gridCount]);

  // One-time color attribute initialization
  const inited = useRef(false);

  useFrame(({ clock }) => {
    const t = trunkRef.current;
    const c = crownRef.current;
    if (!t || !c) return;

    const pulse = Math.sin(clock.elapsedTime * 0.5) * 0.12 + 0.88;

    for (let i = 0; i < n; i++) {
      const x = pts[i][0];
      const z = pts[i][1];

      _d.position.set(x, 1.0, z);
      _d.scale.set(0.15, 2.0, 0.15);
      _d.updateMatrix();
      t.setMatrixAt(i, _d.matrix);

      _d.position.set(x, 2.6 * pulse, z);
      _d.scale.set(0.7 * pulse, 0.7 * pulse, 0.7 * pulse);
      _d.updateMatrix();
      c.setMatrixAt(i, _d.matrix);
    }

    t.count = n;
    t.instanceMatrix.needsUpdate = true;
    c.count = n;
    c.instanceMatrix.needsUpdate = true;

    // Init colors once
    if (!inited.current && n > 0) {
      inited.current = true;
      const _col = new THREE.Color();
      const tcArr = new Float32Array(n * 3);
      const ccArr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        tcArr[i * 3] = 0.3; tcArr[i * 3 + 1] = 0.2; tcArr[i * 3 + 2] = 0.4;
        _col.setHSL(0.6 + Math.sin(i * 2.3) * 0.05, 0.8, 0.4 + Math.sin(i * 1.7) * 0.1 + 0.1);
        ccArr[i * 3] = _col.r; ccArr[i * 3 + 1] = _col.g; ccArr[i * 3 + 2] = _col.b;
      }
      const tcAttr = new THREE.InstancedBufferAttribute(tcArr, 3);
      const ccAttr = new THREE.InstancedBufferAttribute(ccArr, 3);
      t.geometry.setAttribute("instanceColor", tcAttr);
      t.instanceColor = tcAttr;
      c.geometry.setAttribute("instanceColor", ccAttr);
      c.instanceColor = ccAttr;
    }
  });

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, n]} frustumCulled={false}>
        <cylinderGeometry args={[0.1, 0.15, 2, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, n]} frustumCulled={false}>
        <sphereGeometry args={[0.6, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
