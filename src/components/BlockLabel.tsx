import { Html } from "@react-three/drei";

interface BlockLabelProps {
  blocks: { letter: string; x: number; z: number }[];
}

export default function BlockLabel({ blocks }: BlockLabelProps) {
  return (
    <group>
      {blocks.map((b) => (
        <Html
          key={b.letter}
          position={[b.x, 0.3, b.z]}
          center
          distanceFactor={20}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              color: "#8888dd",
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "monospace",
              textShadow: "0 0 20px rgba(100,100,255,0.5), 0 0 40px rgba(100,100,255,0.2)",
              letterSpacing: "2px",
              opacity: 0.7,
            }}
          >
            {b.letter}
          </div>
        </Html>
      ))}
    </group>
  );
}
