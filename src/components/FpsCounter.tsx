import { useFpsMonitor } from "../hooks/useFpsMonitor";

interface FpsCounterProps {
  className?: string;
}

export default function FpsCounter({ className }: FpsCounterProps) {
  const { fps, quality } = useFpsMonitor({
    sampleSize: 30,
    maxBuildings: 200,
  });

  // 沿用旧 UI：非 high 档位即视为"低帧"，触发红色警告样式
  const isLow = quality !== "high";

  return (
    <div className={`fps-counter ${isLow ? "fps-low" : ""} ${className ?? ""}`}>
      <span className="fps-value">{fps}</span>
      <span className="fps-label">FPS</span>
    </div>
  );
}
