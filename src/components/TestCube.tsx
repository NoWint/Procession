const MOCK_PROCESSES = [
  { name: "chrome", cpu: 35 },
  { name: "code", cpu: 60 },
  { name: "node", cpu: 15 },
  { name: "system", cpu: 5 },
  { name: "terminal", cpu: 25 },
];

export default function TestCube() {
  return (
    <group>
      {MOCK_PROCESSES.map((p, i) => (
        <mesh key={p.name} position={[i * 1.5 - 3, p.cpu / 10 / 2, 0]}>
          <boxGeometry args={[1, p.cpu / 10, 1]} />
          <meshStandardMaterial color="#4a9eff" />
        </mesh>
      ))}
    </group>
  );
}
