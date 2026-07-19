import { Html } from "@react-three/drei";
import type { BlockInfo } from "../utils/layout";

interface BlockLabelProps {
  blocks: BlockInfo[];
}

/// 字母街区标签：街区中心上方显示字母 + 进程数副标题
/// y=2.0（高于建筑根部，避免被遮挡）；字号 36px；副标题显示进程总数
export default function BlockLabel({ blocks }: BlockLabelProps) {
  return (
    <group>
      {blocks.map((b) => (
        <Html
          key={b.letter}
          position={[b.x, 2.0, b.z]}
          center
          distanceFactor={20}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              color: "#8888dd",
              fontSize: "36px",
              fontWeight: 700,
              fontFamily: "monospace",
              textShadow: "0 0 20px rgba(100,100,255,0.5), 0 0 40px rgba(100,100,255,0.2)",
              letterSpacing: "2px",
              opacity: 0.75,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              whiteSpace: "nowrap",
              lineHeight: 1.1,
            }}
          >
            <span>{b.letter}</span>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 500,
                opacity: 0.65,
                marginTop: "2px",
                letterSpacing: "1px",
              }}
            >
              {b.letter} · {b.processCount} processes
            </span>
          </div>
        </Html>
      ))}
    </group>
  );
}
