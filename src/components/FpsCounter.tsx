import { useFpsMonitor } from "../hooks/useFpsMonitor";
import { useI18n } from "../hooks/useI18n";

interface FpsCounterProps {
  className?: string;
}

export default function FpsCounter({ className }: FpsCounterProps) {
  const { fps, quality } = useFpsMonitor({
    sampleSize: 30,
    maxBuildings: 200,
  });
  const { t } = useI18n();

  // 沿用旧 UI：非 high 档位即视为"低帧"，触发红色警告样式
  const isLow = quality !== "high";

  return (
    <div className={`fps-counter ${isLow ? "fps-low" : ""} ${className ?? ""}`}>
      <span className="fps-value">{fps}</span>
      <span className="fps-label">{t("fps.label")}</span>
    </div>
  );
}
