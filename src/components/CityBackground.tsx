import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface CityBackgroundProps {
  theme?: Theme;
  count?: number;
}

const dummy = new THREE.Object3D();

const LIGHT_COUNT = 400;
const WARM_WHITE = "#ffe9b0";
const COLD_BLUE = "#4aa8ff";
const PURPLE = "#9d7bff";

interface BuildingData {
  x: number;
  z: number;
  height: number;
  baseSize: number;
  angle: number;
}

function generateRing(
  count: number,
  radiusMin: number,
  radiusMax: number,
  heightMin: number,
  heightMax: number,
): BuildingData[] {
  const items: BuildingData[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
    items.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      height: heightMin + Math.random() * (heightMax - heightMin),
      baseSize: 0.6 + Math.random() * (1.5 - 0.6),
      angle,
    });
  }
  return items;
}

function applyInstancedMesh(
  mesh: THREE.InstancedMesh,
  buildings: BuildingData[],
  color: THREE.Color,
) {
  buildings.forEach((b, i) => {
    dummy.position.set(b.x, b.height / 2, b.z);
    dummy.rotation.set(0, b.angle, 0);
    dummy.scale.set(b.baseSize, b.height, b.baseSize);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function createLightsGeometry(buildings: BuildingData[]): THREE.BufferGeometry {
  const positions = new Float32Array(LIGHT_COUNT * 3);
  const colors = new Float32Array(LIGHT_COUNT * 3);
  const warmColor = new THREE.Color(WARM_WHITE);
  const coldColor = new THREE.Color(COLD_BLUE);
  const purpleColor = new THREE.Color(PURPLE);

  for (let i = 0; i < LIGHT_COUNT; i++) {
    if (buildings.length === 0) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 35 + Math.random() * 50;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 1 + Math.random() * 20;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    } else {
      const b = buildings[Math.floor(Math.random() * buildings.length)];
      positions[i * 3] = b.x + (Math.random() - 0.5) * b.baseSize;
      positions[i * 3 + 1] = b.height + 0.5;
      positions[i * 3 + 2] = b.z + (Math.random() - 0.5) * b.baseSize;
    }

    const r = Math.random();
    const color = r < 0.5 ? warmColor : r < 0.8 ? coldColor : purpleColor;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

export default function CityBackground({
  theme = FALLBACK_THEME,
  count = 300,
}: CityBackgroundProps) {
  const innerMeshRef = useRef<THREE.InstancedMesh>(null);
  const outerMeshRef = useRef<THREE.InstancedMesh>(null);
  const pointsRef = useRef<THREE.Points>(null);

  // 60% inner ring, 40% outer ring (180 + 120 when count = 300)
  const innerCount = Math.max(0, Math.round(count * 0.6));
  const outerCount = Math.max(0, count - innerCount);

  const innerBuildings = useMemo(
    () => generateRing(innerCount, 35, 55, 3, 15),
    [innerCount],
  );
  const outerBuildings = useMemo(
    () => generateRing(outerCount, 60, 85, 5, 25),
    [outerCount],
  );

  const allBuildings = useMemo(
    () => [...innerBuildings, ...outerBuildings],
    [innerBuildings, outerBuildings],
  );

  const innerMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: theme.colors.surfaceElevated,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        emissive: theme.colors.coldBlue,
        emissiveIntensity: 0.15,
        roughness: 0.9,
        metalness: 0.1,
        fog: true,
      }),
    [theme],
  );

  const outerMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: theme.colors.surfaceElevated,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        emissive: theme.colors.coldBlue,
        emissiveIntensity: 0.15,
        roughness: 0.9,
        metalness: 0.1,
        fog: true,
      }),
    [theme],
  );

  const lightsGeometry = useMemo(
    () => createLightsGeometry(allBuildings),
    [allBuildings],
  );

  const lightsMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.4,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    const color = new THREE.Color(theme.colors.surfaceElevated);
    if (innerMeshRef.current) {
      applyInstancedMesh(innerMeshRef.current, innerBuildings, color);
    }
    if (outerMeshRef.current) {
      applyInstancedMesh(outerMeshRef.current, outerBuildings, color);
    }
  }, [innerBuildings, outerBuildings, theme]);

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.005;
    }
  });

  return (
    <group>
      {innerCount > 0 && (
        <instancedMesh
          ref={innerMeshRef}
          args={[undefined, innerMaterial, innerCount]}
          castShadow={false}
          receiveShadow={false}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {outerCount > 0 && (
        <instancedMesh
          ref={outerMeshRef}
          args={[undefined, outerMaterial, outerCount]}
          castShadow={false}
          receiveShadow={false}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      <points
        ref={pointsRef}
        geometry={lightsGeometry}
        material={lightsMaterial}
      />
    </group>
  );
}
