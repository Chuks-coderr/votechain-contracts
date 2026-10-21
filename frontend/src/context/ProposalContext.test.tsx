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
 * Unit tests for ProposalContext state transitions (issue #302).
 *
 * Tests cover:
 *  1. initial load  — loading=true on mount → proposals set, loading=false
 *  2. content check — proposals array contains expected items after load
 *  3. refresh       — refresh() re-fetches and updates proposals
 *  4. error state   — when the fetcher rejects, error is set and loading=false
 *
 * The optional `fetcher` prop injected on <ProposalProvider> is used so tests
 * have full control over timing and failure modes without requiring MSW or a
 * real network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ProposalProvider, useProposals } from './ProposalContext';
import type { Proposal } from '../types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockProposals: Proposal[] = [
  {
    id: 'P-001',
    title: 'Test Active Proposal',
    description: 'A proposal that is currently active.',
    proposer: 'GTEST1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    state: 'Active',
    createdAt: '2026-01-01',
    endAt: '2026-02-01',
    quorum: 100,
    votesCount: 5,
    totalWeight: 500,
    votes: [],
  },
  {
    id: 'P-002',
    title: 'Test Passed Proposal',
    description: 'A proposal that has already passed.',
    proposer: 'GTEST2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    state: 'Passed',
    createdAt: '2025-12-01',
    endAt: '2026-01-01',
    quorum: 50,
    votesCount: 12,
    totalWeight: 1200,
    votes: [],
  },
];

const updatedProposals: Proposal[] = [
  {
    id: 'P-003',
    title: 'Refreshed Proposal',
    description: 'This proposal appeared after a refresh.',
    proposer: 'GTEST3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    state: 'Active',
    createdAt: '2026-03-01',
    endAt: '2026-04-01',
    quorum: 200,
    votesCount: 3,
    totalWeight: 300,
    votes: [],
  },
];

// ── Helper: consumer component ────────────────────────────────────────────────

function ContextConsumer() {
  const { proposals, loading, error, refresh } = useProposals();
  return (
    <div>
      {loading && <span data-testid="loading">loading</span>}
      {error && <span data-testid="error">{error}</span>}
      <ul data-testid="proposal-list">
        {proposals.map((p) => (
          <li key={p.id} data-testid="proposal-item">
            {p.title}
          </li>
        ))}
      </ul>
      <button onClick={refresh} data-testid="refresh-btn">
        Refresh
      </button>
    </div>
  );
}

function renderWithFetcher(fetcher: () => Promise<Proposal[]>) {
  return render(
    <ProposalProvider fetcher={fetcher}>
      <ContextConsumer />
    </ProposalProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProposalContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Initial load ─────────────────────────────────────────────────────────

  describe('initial load', () => {
    it('shows loading indicator while fetch is in flight', async () => {
      // Fetcher that never resolves during this assertion window
      let resolve: (value: Proposal[]) => void;
      const pending = new Promise<Proposal[]>((res) => {
        resolve = res;
      });

      renderWithFetcher(() => pending);

      // Loading indicator must be visible immediately after mount
      expect(screen.getByTestId('loading')).toBeInTheDocument();

      // Settle the pending promise so the component cleans up without leaks
      await act(async () => {
        resolve!(mockProposals);
        await pending;
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });
    });

    it('populates proposals and hides loading after fetch resolves', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce(mockProposals);

      renderWithFetcher(fetcher);

      // Wait for loading to disappear
      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      // Both proposals should be rendered
      const items = screen.getAllByTestId('proposal-item');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Test Active Proposal');
      expect(items[1]).toHaveTextContent('Test Passed Proposal');

      // Error must not be shown
      expect(screen.queryByTestId('error')).not.toBeInTheDocument();

      // Fetcher called exactly once on mount
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  // ── 2. Content / filter check ───────────────────────────────────────────────

  describe('proposals content', () => {
    it('exposes the full proposals array with correct state values', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce(mockProposals);

      renderWithFetcher(fetcher);

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      const items = screen.getAllByTestId('proposal-item');
      // Active proposal is present
      expect(items.some((el) => el.textContent === 'Test Active Proposal')).toBe(true);
      // Passed proposal is present
      expect(items.some((el) => el.textContent === 'Test Passed Proposal')).toBe(true);
    });

    it('renders an empty list when the fetcher resolves with no proposals', async () => {
      const fetcher = vi.fn().mockResolvedValueOnce([]);

      renderWithFetcher(fetcher);

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      expect(screen.queryAllByTestId('proposal-item')).toHaveLength(0);
      expect(screen.queryByTestId('error')).not.toBeInTheDocument();
    });
  });

  // ── 3. Refresh / state update ───────────────────────────────────────────────

  describe('refresh()', () => {
    it('re-fetches proposals when refresh is called', async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(mockProposals)  // initial load
        .mockResolvedValueOnce(updatedProposals); // after refresh

      renderWithFetcher(fetcher);

      // Wait for initial load to complete
      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      expect(screen.getAllByTestId('proposal-item')).toHaveLength(2);

      // Trigger refresh
      await act(async () => {
        fireEvent.click(screen.getByTestId('refresh-btn'));
      });

      // Wait for the refreshed data
      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      const items = screen.getAllByTestId('proposal-item');
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent('Refreshed Proposal');

      // Fetcher must have been called twice total
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('shows loading indicator during the refresh fetch', async () => {
      let resolveRefresh: (value: Proposal[]) => void;
      const refreshPending = new Promise<Proposal[]>((res) => {
        resolveRefresh = res;
      });

      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(mockProposals)
        .mockReturnValueOnce(refreshPending);

      renderWithFetcher(fetcher);

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      // Trigger refresh — fetcher returns a pending promise
      fireEvent.click(screen.getByTestId('refresh-btn'));

      // Loading must reappear immediately
      expect(screen.getByTestId('loading')).toBeInTheDocument();

      // Settle the refresh
      await act(async () => {
        resolveRefresh!(updatedProposals);
        await refreshPending;
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });
    });
  });

  // ── 4. Error state ──────────────────────────────────────────────────────────

  describe('error state', () => {
    it('sets error and clears loading when the fetcher rejects', async () => {
      const fetcher = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network unavailable'));

      renderWithFetcher(fetcher);

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      // Error message must be rendered
      expect(screen.getByTestId('error')).toHaveTextContent('Network unavailable');

      // No proposals should be shown
      expect(screen.queryAllByTestId('proposal-item')).toHaveLength(0);
    });

    it('uses a fallback message when the rejection has no message property', async () => {
      const fetcher = vi.fn().mockRejectedValueOnce('plain string error');

      renderWithFetcher(fetcher);

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('error')).toHaveTextContent(
        'Failed to fetch proposals.',
      );
    });

    it('clears the error and reloads proposals on a successful refresh after a failure', async () => {
      const fetcher = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(mockProposals);

      renderWithFetcher(fetcher);

      // Wait for the error to appear
      await waitFor(() => {
        expect(screen.getByTestId('error')).toBeInTheDocument();
      });

      // Retry via refresh button
      await act(async () => {
        fireEvent.click(screen.getByTestId('refresh-btn'));
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      // Error must be cleared, proposals displayed
      expect(screen.queryByTestId('error')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('proposal-item')).toHaveLength(2);
    });
  });
});
