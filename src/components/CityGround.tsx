export default function CityGround() {
  return (
    <group>
      <gridHelper args={[100, 50, "#1a4a8a", "#0a2240"]} position={[0, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#050510" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
