import { useFpsMonitor } from "../hooks/useFpsMonitor";

interface FpsCounterProps {
  className?: string;
}

export default function FpsCounter({ className }: FpsCounterProps) {
  const { fps, isLow } = useFpsMonitor({
    sampleSize: 30,
    lowThreshold: 28,
    highThreshold: 50,
  });

  return (
    <div className={`fps-counter ${isLow ? "fps-low" : ""} ${className ?? ""}`}>
      <span className="fps-value">{fps}</span>
      <span className="fps-label">FPS</span>
    </div>
  );
}
