import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type React from "react";

interface CitySceneProps {
  children?: React.ReactNode;
}

export default function CityScene({ children }: CitySceneProps) {
  return (
    <Canvas camera={{ position: [10, 10, 10], fov: 60 }}>
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 20, 5]} intensity={0.8} />
      <OrbitControls />
      {children}
    </Canvas>
  );
}
