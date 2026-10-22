import React from 'react';

interface QuorumProgressBarProps {
  /** Current vote weight that counts toward quorum (yes + no + abstain). */
  current: number;
  /** The quorum threshold (total weight required). */
  quorum: number;
  /** Optional CSS class to apply to the outer wrapper. */
  className?: string;
}

/**
 * QuorumProgressBar
 *
 * Displays how close the current participation is to meeting quorum.
 * Fully accessible: exposes role="progressbar" with aria-valuenow,
 * aria-valuemin, aria-valuemax, and aria-label so screen readers can
 * convey quorum status without relying on the visual bar.
 */
export function QuorumProgressBar({
  current,
  quorum,
  className,
}: QuorumProgressBarProps): React.ReactElement {
  const percentage =
    quorum > 0 ? Math.min(100, Math.round((current / quorum) * 100)) : 0;
  const quorumMet = current >= quorum;

  return (
    <div
      className={`quorum-progress-wrapper${className ? ` ${className}` : ''}`}
    >
      {/* Human-readable label — satisfies aria-labelledby requirement */}
      <span id="quorum-progress-label" className="quorum-progress-label">
        Quorum progress: {percentage}%{quorumMet ? ' (met)' : ' (not yet met)'}
      </span>

      {/* Track element with full progressbar role */}
      <div
        role="progressbar"
        aria-labelledby="quorum-progress-label"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`quorum-progress-track${quorumMet ? ' quorum-met' : ''}`}
      >
        <div
          className="quorum-progress-fill"
          style={{ width: `${percentage}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export default QuorumProgressBar;
