interface QueryErrorNoticeProps {
  error: Error | null;
  hasData: boolean;
  onRetry: () => void;
}

export function QueryErrorNotice({ error, hasData, onRetry }: QueryErrorNoticeProps) {
  if (!error || hasData) return null;

  return (
    <div className="pharosville-query-error" role="alert">
      <span className="pharosville-query-error__seal" aria-hidden="true">!</span>
      <span className="pharosville-query-error__msg">Signal buoy obscured by fog.</span>
      <button type="button" onClick={onRetry}>Retry</button>
    </div>
  );
}
