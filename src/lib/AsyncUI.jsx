import React from 'react';

/**
 * Shared feedback primitives for asynchronous UI.
 *
 * Keep the operation itself immediate. `useDelayedPending` only delays the
 * animated indicator so quick responses do not flash a spinner or skeleton.
 */
export const useDelayedPending = (pending, delay = 260) => {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!pending) {
      setVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay, pending]);

  return pending && visible;
};

export const Spinner = ({ size = 'sm', label = '', className = '' }) => (
  <span
    className={`rmx-spinner is-${size}${className ? ` ${className}` : ''}`}
    aria-hidden={label ? undefined : 'true'}
    role={label ? 'status' : undefined}
    aria-label={label || undefined}
  />
);

const longestLabel = labels => labels
  .filter(value => typeof value === 'string')
  .sort((a, b) => b.length - a.length)[0] || '';

export const AsyncButtonContent = ({
  pending = false,
  pendingLabel = 'Working…',
  complete = false,
  completeLabel = 'Done',
  delay = 180,
  children,
}) => {
  const showSpinner = useDelayedPending(pending, delay);
  const label = pending ? pendingLabel : complete ? completeLabel : children;
  const reservedLabel = longestLabel([children, pendingLabel, completeLabel]);

  return (
    <span className="rmx-button-content">
      {reservedLabel ? <span className="rmx-button-label-sizer" aria-hidden="true">{reservedLabel}</span> : null}
      <span className="rmx-button-visible">
        {showSpinner ? <Spinner /> : null}
        <span>{label}</span>
      </span>
    </span>
  );
};

export const InlineStatus = ({
  tone = 'neutral',
  children,
  busy = false,
  className = '',
  assertive = false,
}) => (
  <span
    className={`rmx-inline-status is-${tone}${className ? ` ${className}` : ''}`}
    role="status"
    aria-live={assertive ? 'assertive' : 'polite'}
    aria-busy={busy || undefined}
  >
    {busy ? <Spinner /> : null}
    <span>{children}</span>
  </span>
);

export const RefreshingIndicator = ({ active, label = 'Refreshing data…', delay = 260 }) => {
  const visible = useDelayedPending(active, delay);
  if (!visible) return null;
  return <InlineStatus busy className="rmx-refreshing-indicator">{label}</InlineStatus>;
};

export const Skeleton = ({ className = '', width, height, rounded = false }) => (
  <span
    className={`rmx-skeleton${rounded ? ' is-rounded' : ''}${className ? ` ${className}` : ''}`}
    style={{ width, height }}
    aria-hidden="true"
  />
);

export const ContentSkeleton = ({
  variant = 'cards',
  count = 3,
  label = 'Loading content…',
  className = '',
}) => {
  const items = Array.from({ length: Math.max(1, count) }, (_, index) => index);
  return (
    <div
      className={`rmx-content-skeleton is-${variant}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label}
      aria-busy="true"
    >
      {items.map(index => variant === 'table' ? (
        <div className="rmx-skeleton-row" key={index} aria-hidden="true">
          <Skeleton rounded />
          <span><Skeleton /><Skeleton width="68%" /></span>
          <Skeleton width="42%" />
          <Skeleton width="56%" />
        </div>
      ) : variant === 'list' ? (
        <div className="rmx-skeleton-list-item" key={index} aria-hidden="true">
          <Skeleton rounded />
          <span><Skeleton width="72%" /><Skeleton /><Skeleton width="46%" /></span>
        </div>
      ) : (
        <div className="rmx-skeleton-card" key={index} aria-hidden="true">
          <Skeleton className="rmx-skeleton-media" />
          <Skeleton width="38%" />
          <Skeleton width="82%" />
          <Skeleton />
          <Skeleton width="58%" />
        </div>
      ))}
    </div>
  );
};

export const ErrorState = ({
  title = 'Something went wrong',
  message = 'We could not finish that request.',
  onRetry,
  retryLabel = 'Try again',
  compact = false,
  className = '',
}) => (
  <div className={`rmx-async-state is-error${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`} role="alert">
    <span className="rmx-state-mark" aria-hidden="true">!</span>
    <div>
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
      {onRetry ? <button className="btn btn-outline-navy btn-sm" type="button" onClick={onRetry}>{retryLabel}</button> : null}
    </div>
  </div>
);

export const EmptyState = ({
  title = 'Nothing here yet',
  message = '',
  action,
  actionLabel = 'Continue',
  compact = false,
  className = '',
}) => (
  <div className={`rmx-async-state is-empty${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}>
    <span className="rmx-state-mark" aria-hidden="true">—</span>
    <div>
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
      {action ? <button className="btn btn-outline-navy btn-sm" type="button" onClick={action}>{actionLabel}</button> : null}
    </div>
  </div>
);

export const AsyncState = ({
  loading = false,
  error = '',
  empty = false,
  onRetry,
  loadingLabel = 'Loading content…',
  errorTitle,
  emptyTitle,
  emptyMessage,
  skeleton = 'cards',
  skeletonCount = 3,
  delay = 260,
  preserve = false,
  children,
}) => {
  const showLoading = useDelayedPending(loading, delay);

  if (error && !preserve) {
    return <ErrorState title={errorTitle} message={error} onRetry={onRetry} />;
  }
  if (loading && !preserve) {
    return showLoading
      ? <ContentSkeleton variant={skeleton} count={skeletonCount} label={loadingLabel} />
      : <div className={`rmx-loading-reserve is-${skeleton}`} aria-busy="true" aria-label={loadingLabel} />;
  }
  if (empty) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }
  return (
    <div className="rmx-async-content" aria-busy={loading || undefined}>
      {loading && preserve ? <RefreshingIndicator active label={loadingLabel} /> : null}
      {error && preserve ? <ErrorState title={errorTitle} message={error} onRetry={onRetry} compact /> : null}
      {children}
    </div>
  );
};

export const ProgressStatus = ({
  label,
  detail = '',
  percent,
  stage = '',
  error = '',
  complete = false,
  onRetry,
  onCancel,
  className = '',
}) => {
  const hasMeasuredProgress = Number.isFinite(percent);
  const safePercent = hasMeasuredProgress ? Math.max(0, Math.min(100, Number(percent))) : null;
  const statusLabel = error || (complete ? `${label} complete` : stage || label);

  return (
    <div
      className={`rmx-progress-status${error ? ' is-error' : ''}${complete ? ' is-complete' : ''}${className ? ` ${className}` : ''}`}
      role={error ? 'alert' : 'status'}
      aria-live="polite"
      aria-busy={!error && !complete}
    >
      <div className="rmx-progress-copy">
        <strong>{statusLabel}</strong>
        {detail ? <span>{detail}</span> : null}
        {safePercent !== null ? <span>{Math.round(safePercent)}% complete</span> : null}
      </div>
      {safePercent !== null ? (
        <progress max="100" value={safePercent} aria-label={statusLabel}>{Math.round(safePercent)}%</progress>
      ) : !error && !complete ? (
        <div className="rmx-indeterminate-track" aria-hidden="true"><span /></div>
      ) : null}
      {(onRetry || onCancel) ? (
        <div className="rmx-progress-actions">
          {onRetry ? <button type="button" className="btn btn-outline-navy btn-sm" onClick={onRetry}>Retry</button> : null}
          {onCancel ? <button type="button" className="btn btn-outline-navy btn-sm" onClick={onCancel}>Cancel</button> : null}
        </div>
      ) : null}
    </div>
  );
};

