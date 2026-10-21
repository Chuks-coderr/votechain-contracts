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

/**
 * Skeleton loading components (issue #13).
 *
 * - ProposalListSkeleton  — 10 skeleton cards while proposals are fetching
 * - ProposalDetailSkeleton — mirrors the real ProposalDetail layout
 *
 * Accessibility:
 *   - The outermost wrapper carries aria-busy="true" and an aria-label
 *   - Individual shimmer blocks have aria-hidden="true" (decorative)
 *   - Compatible with both light and dark design tokens from styles.css
 */
import React from 'react';

// ── Shared primitives ─────────────────────────────────────────

interface BlockProps {
  /** Extra inline styles (width, height, etc.) */
  style?: React.CSSProperties;
  className?: string;
}

/** A single animated shimmer block */
function SkeletonBlock({ style, className }: BlockProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton-block${className ? ` ${className}` : ''}`}
      style={style}
    />
  );
}

// ── Single card skeleton ──────────────────────────────────────

function ProposalCardSkeleton() {
  return (
    <li className="proposal-card skeleton-card" aria-hidden="true">
      {/* card header row */}
      <div className="card-header">
        <div className="card-title-row">
          <SkeletonBlock style={{ width: '3rem', height: '0.7rem', marginBottom: '0.4rem' }} />
          <SkeletonBlock style={{ width: '75%', height: '1rem' }} />
        </div>
        <SkeletonBlock style={{ width: '5rem', height: '1.4rem', borderRadius: '999px' }} />
      </div>

      {/* vote bar */}
      <div style={{ marginBottom: '0.85rem' }}>
        <SkeletonBlock style={{ width: '100%', height: '6px', borderRadius: '999px', marginBottom: '0.5rem' }} />
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <SkeletonBlock style={{ width: '4rem', height: '0.75rem' }} />
          <SkeletonBlock style={{ width: '4rem', height: '0.75rem' }} />
          <SkeletonBlock style={{ width: '4rem', height: '0.75rem' }} />
        </div>
      </div>

      {/* card footer */}
      <div className="card-footer">
        <SkeletonBlock style={{ width: '8rem', height: '0.75rem' }} />
        <SkeletonBlock style={{ width: '5rem', height: '0.75rem' }} />
      </div>
    </li>
  );
}

// ── ProposalListSkeleton ─────────────────────────────────────

/**
 * Shows 10 skeleton cards while the proposal list is loading.
 * Wrap this in the same container you use for the real list.
 */
export function ProposalListSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading proposals, please wait"
      aria-live="polite"
    >
      {/* Toolbar placeholder */}
      <div className="toolbar" style={{ marginBottom: '1.5rem' }}>
        <SkeletonBlock style={{ flex: 1, height: '2.2rem', borderRadius: '0.625rem', minWidth: '200px' }} />
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} style={{ width: '5.5rem', height: '2rem', borderRadius: '999px' }} />
          ))}
        </div>
      </div>

      {/* 10 card skeletons */}
      <ul className="proposal-list" style={{ listStyle: 'none', padding: 0 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <ProposalCardSkeleton key={i} />
        ))}
      </ul>
    </section>
  );
}

// ── ProposalDetailSkeleton ────────────────────────────────────

/**
 * Mirrors the real ProposalDetail structure while data is loading.
 */
export function ProposalDetailSkeleton() {
  return (
    <article
      aria-busy="true"
      aria-label="Loading proposal details, please wait"
      aria-live="polite"
      style={{ padding: '2rem 0' }}
    >
      {/* Back link placeholder */}
      <SkeletonBlock style={{ width: '6rem', height: '0.875rem', marginBottom: '1.5rem' }} />

      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SkeletonBlock style={{ width: '3rem', height: '0.7rem', marginBottom: '0.5rem' }} />
          <SkeletonBlock style={{ width: '85%', height: '1.75rem', marginBottom: '0.4rem' }} />
          <SkeletonBlock style={{ width: '60%', height: '1.75rem' }} />
        </div>
        <SkeletonBlock style={{ width: '5.5rem', height: '1.75rem', borderRadius: '999px', flexShrink: 0 }} />
      </div>

      {/* Meta row (proposer / countdown / quorum) */}
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <SkeletonBlock style={{ width: '10rem', height: '0.8rem' }} />
        <SkeletonBlock style={{ width: '7rem', height: '0.8rem' }} />
        <SkeletonBlock style={{ width: '8rem', height: '0.8rem' }} />
      </div>

      {/* Vote bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <SkeletonBlock style={{ width: '100%', height: '12px', borderRadius: '999px', marginBottom: '0.75rem' }} />
        <div style={{ display: 'flex', gap: '2rem' }}>
          <SkeletonBlock style={{ width: '5rem', height: '0.875rem' }} />
          <SkeletonBlock style={{ width: '5rem', height: '0.875rem' }} />
          <SkeletonBlock style={{ width: '5rem', height: '0.875rem' }} />
        </div>
      </div>

      {/* Description block */}
      <div style={{ marginBottom: '2rem' }}>
        <SkeletonBlock style={{ width: '40%', height: '1rem', marginBottom: '0.75rem' }} />
        <SkeletonBlock style={{ width: '100%', height: '0.875rem', marginBottom: '0.5rem' }} />
        <SkeletonBlock style={{ width: '95%', height: '0.875rem', marginBottom: '0.5rem' }} />
        <SkeletonBlock style={{ width: '80%', height: '0.875rem', marginBottom: '0.5rem' }} />
        <SkeletonBlock style={{ width: '90%', height: '0.875rem' }} />
      </div>

      {/* Voter table placeholder */}
      <div>
        <SkeletonBlock style={{ width: '8rem', height: '1rem', marginBottom: '1rem' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '0.6rem' }}>
            <SkeletonBlock style={{ flex: 2, height: '0.8rem' }} />
            <SkeletonBlock style={{ flex: 1, height: '0.8rem' }} />
            <SkeletonBlock style={{ flex: 1, height: '0.8rem' }} />
            <SkeletonBlock style={{ flex: 1, height: '0.8rem' }} />
          </div>
        ))}
      </div>
    </article>
  );
}
