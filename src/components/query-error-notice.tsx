interface QueryErrorNoticeProps {
  error: Error | null;
  hasData: boolean;
  onRetry: () => void;
}

export function QueryErrorNotice({ error, hasData, onRetry }: QueryErrorNoticeProps) {
  if (!error || hasData) return null;

  return (
    <div className="pharosville-query-error" role="alert">
      <span>Market signal fetch failed.</span>
      <button type="button" onClick={onRetry}>Retry</button>
    </div>
  );
}
