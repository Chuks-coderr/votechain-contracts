// Copyright 2024 VoteChain Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

interface QuorumProgressBarProps {
  /** Total vote weight cast so far. Maps to Proposal.totalWeight. */
  totalVotes: number;
  /** Minimum total vote weight required for the proposal to be finalisable. */
  quorum: number;
  /** When true, also renders exact "totalVotes / quorum votes" figures. */
  showExactNumbers?: boolean;
}

/**
 * Displays a progress bar indicating how close a proposal is to meeting its
 * quorum threshold.
 *
 * Colour coding:
 *   - orange  (#f97316) — less than 50 % of quorum reached
 *   - green   (#22c55e) — 50 %–99 % of quorum reached
 *   - brighter green (#16a34a) — quorum fully met (≥ 100 %)
 *
 * Accessible via ARIA progressbar role with valuenow / valuemin / valuemax.
 */
export default function QuorumProgressBar({
  totalVotes,
  quorum,
  showExactNumbers = false,
}: QuorumProgressBarProps) {
  const pct = Math.min(100, quorum > 0 ? (totalVotes / quorum) * 100 : 0);
  const pctRounded = Math.round(pct);

  const fillColor =
    pct >= 100 ? '#16a34a' : pct >= 50 ? '#22c55e' : '#f97316';

  const label = pct >= 100 ? 'Quorum met!' : `Quorum: ${pctRounded}% reached`;

  return (
    <div style={{ width: '100%' }}>
      {/* Track */}
      <div
        role="progressbar"
        aria-valuenow={pctRounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Quorum progress"
        style={{
          width: '100%',
          height: '8px',
          backgroundColor: '#e5e7eb',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        {/* Fill */}
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: fillColor,
            borderRadius: '4px',
            transition: 'width 0.3s ease, background-color 0.3s ease',
          }}
        />
      </div>

      {/* Text label */}
      <p
        style={{
          margin: '4px 0 0',
          fontSize: '0.75rem',
          color: fillColor,
          fontWeight: 500,
        }}
      >
        {label}
      </p>

      {/* Exact numbers (optional) */}
      {showExactNumbers && (
        <p
          style={{
            margin: '2px 0 0',
            fontSize: '0.75rem',
            color: '#6b7280',
          }}
        >
          {totalVotes.toLocaleString()} / {quorum.toLocaleString()} votes
        </p>
      )}
    </div>
  );
}
