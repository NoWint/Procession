import { useI18n } from "../hooks/useI18n";

interface ErrorStateProps {
  message: string;
  detail?: string;
  onRetry?: () => void;
  loading?: boolean;
  className?: string;
}

export default function ErrorState({
  message,
  detail,
  onRetry,
  loading = false,
  className = "",
}: ErrorStateProps) {
  const { t } = useI18n();
  return (
    <div className={`error-state ${className}`}>
      {loading && (
        <div className="error-state-loader" aria-label={t("error.loading_aria")}>
          <span />
          <span />
          <span />
        </div>
      )}
      <div className="error-state-message">{message}</div>
      {detail && <div className="error-state-detail">{detail}</div>}
      {onRetry && (
        <button className="error-state-retry" onClick={onRetry}>
          {t("error.retry")}
        </button>
      )}
    </div>
  );
}
