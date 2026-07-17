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
  return (
    <div className={`error-state ${className}`}>
      {loading && (
        <div className="error-state-loader" aria-label="Loading">
          <span />
          <span />
          <span />
        </div>
      )}
      <div className="error-state-message">{message}</div>
      {detail && <div className="error-state-detail">{detail}</div>}
      {onRetry && (
        <button className="error-state-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
