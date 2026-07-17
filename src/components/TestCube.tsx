import type { ProcessInfo } from "../utils/types";

const MOCK_PROCESSES: Pick<ProcessInfo, "name" | "cpu">[] = [
  { name: "chrome", cpu: 35 },
  { name: "code", cpu: 60 },
  { name: "node", cpu: 15 },
  { name: "system", cpu: 5 },
  { name: "terminal", cpu: 25 },
];

interface TestCubeProps {
  processes?: ProcessInfo[];
}

export default function TestCube({ processes }: TestCubeProps) {
  const data = processes?.length ? processes : MOCK_PROCESSES;

  return (
    <group>
      {data.map((p, i) => (
        <mesh key={p.name} position={[i * 1.5 - 3, p.cpu / 10 / 2, 0]}>
          <boxGeometry args={[1, p.cpu / 10, 1]} />
          <meshStandardMaterial color="#4a9eff" />
        </mesh>
      ))}
    </group>
  );
}
