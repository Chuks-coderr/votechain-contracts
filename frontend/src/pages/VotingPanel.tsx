/**
 * VotingPanel page
 *
 * Displays voting controls, quorum progress, and the vote-tally breakdown
 * for a single governance proposal.
 *
 * Mobile-first layout:
 *  - All fixed-width values replaced with fluid / max-width alternatives.
 *  - Vote buttons stack vertically on small viewports (< 480 px) and sit
 *    side-by-side on wider ones.
 *  - Quorum progress bar scales correctly at every breakpoint.
 *  - Minimum tested viewport: 320 px.
 */

import React, { useState } from 'react';
import type { Proposal, VoteRecord } from '../types';

// ---------------------------------------------------------------------------
// Demo / stub data — replace with real contract call
// ---------------------------------------------------------------------------
const STUB_PROPOSAL: Proposal = {
  id: '1',
  title: 'Increase minimum proposal balance to 500,000 tokens',
  description:
    'This proposal raises the minimum token balance required to submit a new governance proposal from 100,000 to 500,000 VCH, reducing spam and ensuring proposers have meaningful stake.',
  state: 'Active',
  createdAt: '2026-10-10',
  endAt: '2026-10-25',
  votesCount: 142,
  totalWeight: 5_600_000,
  votes: [
    { address: 'GBXYZ...MNOP', type: 'For',     weight: 4_200_000, votedAt: '2026-10-11' },
    { address: 'GCABC...PQRS', type: 'Against', weight: 1_100_000, votedAt: '2026-10-12' },
    { address: 'GDABC...PQRS', type: 'Abstain', weight:   300_000, votedAt: '2026-10-13' },
  ],
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface QuorumBarProps {
  totalWeight: number;
  quorumTarget: number;
  yes: number;
  no: number;
  abstain: number;
}

function QuorumBar({ totalWeight, quorumTarget, yes, no, abstain }: QuorumBarProps) {
  const pct = (n: number) => Math.min(100, (n / quorumTarget) * 100).toFixed(1);
  const reached = totalWeight >= quorumTarget;

  return (
    <div className="vp-quorum" aria-label="Quorum progress">
      <div className="vp-quorum-header">
        <span className="vp-quorum-label">Quorum progress</span>
        <span className={`vp-quorum-status ${reached ? 'vp-quorum-reached' : 'vp-quorum-pending'}`}>
          {reached ? '✓ Quorum reached' : `${((totalWeight / quorumTarget) * 100).toFixed(0)}% of quorum`}
        </span>
      </div>

      {/* Segmented progress bar */}
      <div
        className="vp-bar-track"
        role="progressbar"
        aria-valuenow={totalWeight}
        aria-valuemin={0}
        aria-valuemax={quorumTarget}
        aria-label={`${pct(totalWeight)}% of quorum`}
      >
        <div className="vp-bar-yes"     style={{ width: `${pct(yes)}%` }}     title={`For: ${yes.toLocaleString()}`} />
        <div className="vp-bar-no"      style={{ width: `${pct(no)}%` }}      title={`Against: ${no.toLocaleString()}`} />
        <div className="vp-bar-abstain" style={{ width: `${pct(abstain)}%` }} title={`Abstain: ${abstain.toLocaleString()}`} />
      </div>

      {/* Legend */}
      <ul className="vp-tally-list" aria-label="Vote tally">
        <li className="vp-tally-item">
          <span className="vp-dot vp-dot-yes" aria-hidden="true" />
          <span>For</span>
          <strong>{yes.toLocaleString()}</strong>
        </li>
        <li className="vp-tally-item">
          <span className="vp-dot vp-dot-no" aria-hidden="true" />
          <span>Against</span>
          <strong>{no.toLocaleString()}</strong>
        </li>
        <li className="vp-tally-item">
          <span className="vp-dot vp-dot-abstain" aria-hidden="true" />
          <span>Abstain</span>
          <strong>{abstain.toLocaleString()}</strong>
        </li>
      </ul>
    </div>
  );
}

interface VoteButtonsProps {
  onVote: (choice: VoteRecord['type']) => void;
  disabled: boolean;
  chosen: VoteRecord['type'] | null;
}

function VoteButtons({ onVote, disabled, chosen }: VoteButtonsProps) {
  return (
    <div className="vp-vote-buttons" role="group" aria-label="Cast your vote">
      {(['For', 'Against', 'Abstain'] as const).map((choice) => (
        <button
          key={choice}
          className={`vp-vote-btn vp-vote-btn-${choice.toLowerCase()}${chosen === choice ? ' vp-vote-btn-selected' : ''}`}
          onClick={() => onVote(choice)}
          disabled={disabled}
          aria-pressed={chosen === choice}
        >
          {choice === 'For' && <span aria-hidden="true">👍 </span>}
          {choice === 'Against' && <span aria-hidden="true">👎 </span>}
          {choice === 'Abstain' && <span aria-hidden="true">🤐 </span>}
          {choice}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function VotingPanel() {
  const proposal = STUB_PROPOSAL;
  const [chosen, setChosen] = useState<VoteRecord['type'] | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const yesWeight     = proposal.votes.filter((v) => v.type === 'For').reduce((s, v) => s + v.weight, 0);
  const noWeight      = proposal.votes.filter((v) => v.type === 'Against').reduce((s, v) => s + v.weight, 0);
  const abstainWeight = proposal.votes.filter((v) => v.type === 'Abstain').reduce((s, v) => s + v.weight, 0);
  const QUORUM_TARGET = 5_000_000;
  const isActive      = proposal.state === 'Active';

  function handleVote(choice: VoteRecord['type']) {
    setChosen(choice);
    setStatusMsg('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    // TODO: replace with actual Stellar contract invocation
    setSubmitted(true);
    setStatusMsg(`Your vote "${chosen}" has been recorded.`);
  }

  return (
    <div className="vp-container">
      {/* Proposal header */}
      <section className="card vp-header-card" aria-labelledby="vp-title">
        <span className={`status-chip status-${proposal.state.toLowerCase()}`}>{proposal.state}</span>
        <h1 id="vp-title" className="vp-title">{proposal.title}</h1>
        <p className="vp-desc">{proposal.description}</p>
        <dl className="vp-meta">
          <div>
            <dt>Proposal ID</dt>
            <dd>#{proposal.id}</dd>
          </div>
          <div>
            <dt>End date</dt>
            <dd>{proposal.endAt}</dd>
          </div>
          <div>
            <dt>Total votes</dt>
            <dd>{proposal.votesCount}</dd>
          </div>
        </dl>
      </section>

      {/* Quorum / tally */}
      <section className="card" aria-label="Vote tally and quorum">
        <QuorumBar
          totalWeight={proposal.totalWeight}
          quorumTarget={QUORUM_TARGET}
          yes={yesWeight}
          no={noWeight}
          abstain={abstainWeight}
        />
      </section>

      {/* Voting form */}
      <section className="card" aria-labelledby="vp-vote-heading">
        <h2 id="vp-vote-heading" className="vp-section-heading">Cast your vote</h2>

        {!isActive && (
          <p className="vp-inactive-notice" role="alert">
            This proposal is no longer active. Voting is closed.
          </p>
        )}

        {isActive && !submitted && (
          <form onSubmit={handleSubmit} noValidate>
            <VoteButtons onVote={handleVote} disabled={submitted} chosen={chosen} />
            <button
              type="submit"
              className="vp-submit-btn"
              disabled={!chosen}
              aria-describedby="vp-status"
            >
              Confirm vote
            </button>
          </form>
        )}

        {submitted && (
          <p className="vp-success" role="status">
            ✅ {statusMsg}
          </p>
        )}

        {/* Live region for screen readers */}
        <div id="vp-status" aria-live="polite" aria-atomic="true" className="visually-hidden">
          {statusMsg}
        </div>
      </section>
    </div>
  );
}
