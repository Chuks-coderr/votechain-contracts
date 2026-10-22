import React, { useMemo } from 'react';
import type { Proposal, ProposalState, VoteRecord } from '../types';
import { sampleProposals } from '../data';

// ── Constants ──────────────────────────────────────────────────────────────────

const STELLAR_EXPERT_BASE = 'https://stellar.expert/explorer/public/account';

// ── Helpers ────────────────────────────────────────────────────────────────────

function stateBadgeClass(state: ProposalState): string {
  const map: Record<ProposalState, string> = {
    Active: 'badge--active',
    Passed: 'badge--passed',
    Rejected: 'badge--rejected',
    Executed: 'badge--executed',
    Cancelled: 'badge--cancelled',
  };
  return `state-badge ${map[state]}`;
}

function stateLabel(state: ProposalState): string {
  return state;
}

function pct(part: number, total: number): string {
  if (total === 0) return '0.0';
  return ((part / total) * 100).toFixed(1);
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function truncateAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface VoteBreakdownProps {
  votes: VoteRecord[];
  totalWeight: number;
}

function VoteBreakdown({ votes, totalWeight }: VoteBreakdownProps): React.ReactElement {
  const forWeight = votes
    .filter((v) => v.type === 'For')
    .reduce((s, v) => s + v.weight, 0);
  const againstWeight = votes
    .filter((v) => v.type === 'Against')
    .reduce((s, v) => s + v.weight, 0);
  const abstainWeight = votes
    .filter((v) => v.type === 'Abstain')
    .reduce((s, v) => s + v.weight, 0);

  const forPct = pct(forWeight, totalWeight);
  const againstPct = pct(againstWeight, totalWeight);
  const abstainPct = pct(abstainWeight, totalWeight);

  return (
    <section aria-labelledby="vote-breakdown-heading" className="proposal-detail__section">
      <h2 id="vote-breakdown-heading" className="proposal-detail__section-title">
        Vote breakdown
      </h2>

      {/* Stacked bar */}
      <div
        className="vote-breakdown__bar-wrap"
        role="img"
        aria-label={`For ${forPct}%, Against ${againstPct}%, Abstain ${abstainPct}%`}
      >
        <div className="vote-breakdown__bar-for" style={{ width: `${forPct}%` }} />
        <div className="vote-breakdown__bar-against" style={{ width: `${againstPct}%` }} />
        <div className="vote-breakdown__bar-abstain" style={{ width: `${abstainPct}%` }} />
      </div>

      {/* Counts */}
      <dl className="vote-breakdown__counts">
        <div className="vote-breakdown__count-item">
          <dt className="vote-breakdown__count-label vote-breakdown__count-label--for">
            <span className="vote-dot vote-dot--for" aria-hidden="true" />
            For
          </dt>
          <dd className="vote-breakdown__count-value">
            <strong>{fmt(forWeight)}</strong>
            <span className="vote-breakdown__pct"> ({forPct}%)</span>
          </dd>
        </div>
        <div className="vote-breakdown__count-item">
          <dt className="vote-breakdown__count-label vote-breakdown__count-label--against">
            <span className="vote-dot vote-dot--against" aria-hidden="true" />
            Against
          </dt>
          <dd className="vote-breakdown__count-value">
            <strong>{fmt(againstWeight)}</strong>
            <span className="vote-breakdown__pct"> ({againstPct}%)</span>
          </dd>
        </div>
        <div className="vote-breakdown__count-item">
          <dt className="vote-breakdown__count-label vote-breakdown__count-label--abstain">
            <span className="vote-dot vote-dot--abstain" aria-hidden="true" />
            Abstain
          </dt>
          <dd className="vote-breakdown__count-value">
            <strong>{fmt(abstainWeight)}</strong>
            <span className="vote-breakdown__pct"> ({abstainPct}%)</span>
          </dd>
        </div>
      </dl>

      <p className="vote-breakdown__total">
        Total weight cast: <strong>{fmt(totalWeight)}</strong> &mdash; {votes.length} vote
        {votes.length !== 1 ? 's' : ''}
      </p>
    </section>
  );
}

// ── 404 view ──────────────────────────────────────────────────────────────────

function ProposalNotFound({ id }: { id: string }): React.ReactElement {
  return (
    <main className="proposal-detail proposal-detail--not-found" aria-labelledby="not-found-heading">
      <h1 id="not-found-heading" className="proposal-detail__404-title">
        404 — Proposal not found
      </h1>
      <p className="proposal-detail__404-message">
        No proposal with ID <strong>{id}</strong> could be found. It may have been removed or the
        link is incorrect.
      </p>
      <a href="/" className="proposal-detail__back-link">
        &larr; Back to proposals
      </a>
    </main>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ProposalDetailProps {
  /**
   * The proposal ID to display. When omitted the component reads
   * `window.location.hash` (e.g. `#/proposal/P-101`) so it works without
   * a dedicated router.
   */
  proposalId?: string;
  /** Override the proposals data source (useful for testing). */
  proposals?: Proposal[];
}

/**
 * ProposalDetail
 *
 * Full-detail view for a single governance proposal. Renders:
 * - Title, description, state badge
 * - Vote breakdown (yes / no / abstain counts and percentages)
 * - Proposer address linked to Stellar Explorer
 * - Timing (created / end dates)
 * - Total weight and vote count
 * - Graceful 404 for unknown IDs
 */
export default function ProposalDetail({
  proposalId,
  proposals = sampleProposals,
}: ProposalDetailProps): React.ReactElement {
  // Resolve the ID from props or from the URL hash (e.g. #/proposal/P-101)
  const resolvedId = useMemo<string>(() => {
    if (proposalId) return proposalId;
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const match = hash.match(/\/proposal\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }, [proposalId]);

  const proposal = useMemo<Proposal | undefined>(
    () => proposals.find((p) => p.id === resolvedId),
    [proposals, resolvedId],
  );

  if (!resolvedId || !proposal) {
    return <ProposalNotFound id={resolvedId || '(unknown)'} />;
  }

  const {
    id,
    title,
    description,
    state,
    createdAt,
    endAt,
    votes,
    votesCount,
    totalWeight,
  } = proposal;

  return (
    <main
      className="proposal-detail"
      aria-labelledby="proposal-detail-heading"
    >
      {/* Back navigation */}
      <a href="/" className="proposal-detail__back-link">
        &larr; Back to proposals
      </a>

      {/* Header */}
      <header className="proposal-detail__header">
        <div className="proposal-detail__id-row">
          <span className="proposal-detail__id" aria-label={`Proposal ID: ${id}`}>
            #{id}
          </span>
          <span
            className={stateBadgeClass(state)}
            role="status"
            aria-label={`Status: ${stateLabel(state)}`}
          >
            {stateLabel(state)}
          </span>
        </div>
        <h1 id="proposal-detail-heading" className="proposal-detail__title">
          {title}
        </h1>
      </header>

      {/* Description */}
      <section
        aria-labelledby="proposal-description-heading"
        className="proposal-detail__section"
      >
        <h2
          id="proposal-description-heading"
          className="proposal-detail__section-title"
        >
          Description
        </h2>
        <p className="proposal-detail__description">{description}</p>
      </section>

      {/* Vote breakdown */}
      <VoteBreakdown votes={votes} totalWeight={totalWeight} />

      {/* Metadata */}
      <section
        aria-labelledby="proposal-meta-heading"
        className="proposal-detail__section"
      >
        <h2
          id="proposal-meta-heading"
          className="proposal-detail__section-title"
        >
          Details
        </h2>
        <dl className="proposal-detail__meta">
          <div className="proposal-detail__meta-item">
            <dt>Proposer</dt>
            <dd>
              <a
                href={`${STELLAR_EXPERT_BASE}/${proposal.votes[0]?.address ?? ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="proposal-detail__explorer-link"
                aria-label={`View proposer on Stellar Explorer`}
                title={`View on Stellar Expert`}
              >
                {truncateAddress(proposal.votes[0]?.address ?? '—')}
              </a>
            </dd>
          </div>
          <div className="proposal-detail__meta-item">
            <dt>Created</dt>
            <dd>
              <time dateTime={createdAt}>{createdAt}</time>
            </dd>
          </div>
          <div className="proposal-detail__meta-item">
            <dt>Voting ends</dt>
            <dd>
              <time dateTime={endAt}>{endAt}</time>
            </dd>
          </div>
          <div className="proposal-detail__meta-item">
            <dt>Votes cast</dt>
            <dd>{votesCount}</dd>
          </div>
          <div className="proposal-detail__meta-item">
            <dt>Total weight</dt>
            <dd>{fmt(totalWeight)}</dd>
          </div>
        </dl>
      </section>

      {/* Vote history table */}
      <section
        aria-labelledby="vote-history-heading"
        className="proposal-detail__section"
      >
        <h2
          id="vote-history-heading"
          className="proposal-detail__section-title"
        >
          Vote history
        </h2>
        <div className="table-wrapper" aria-live="polite">
          <table>
            <caption className="visually-hidden">
              Individual vote records for proposal {id}
            </caption>
            <thead>
              <tr>
                <th scope="col">Address</th>
                <th scope="col">Vote</th>
                <th scope="col">Weight</th>
                <th scope="col">Voted at</th>
              </tr>
            </thead>
            <tbody>
              {votes.map((vote, idx) => (
                <tr key={`${vote.address}-${idx}`}>
                  <td>
                    <a
                      href={`${STELLAR_EXPERT_BASE}/${vote.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="proposal-detail__explorer-link"
                      aria-label={`View ${vote.address} on Stellar Explorer`}
                    >
                      {truncateAddress(vote.address)}
                    </a>
                  </td>
                  <td>
                    <span
                      className={`vote-type-chip vote-type-chip--${vote.type.toLowerCase()}`}
                    >
                      {vote.type}
                    </span>
                  </td>
                  <td>{fmt(vote.weight)}</td>
                  <td>
                    <time dateTime={vote.votedAt}>{vote.votedAt}</time>
                  </td>
                </tr>
              ))}
              {votes.length === 0 && (
                <tr>
                  <td colSpan={4}>No votes recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
