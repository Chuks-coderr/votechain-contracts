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
 * Tests for GovernanceDashboard component (issues #11, #104).
 * Covers: loading state, renders chart sections after real API data loads,
 * renders pie chart, line chart, quorum stat, top-voters table, and the
 * new #104 participation/pass-rate/retention stat tiles.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GovernanceDashboard } from '../pages/GovernanceDashboard';

// Mock response shape matching GET /api/governance/analytics
// (backend/src/routes/analytics.ts).
const MOCK_ANALYTICS = {
  participation_rate: { '1': 0.5, '2': 0.75 },
  pass_rate: 0.6,
  avg_quorum_fill_rate: 0.8,
  voter_retention: ['GABC...1234'],
  by_state: { Active: 3, Passed: 12, Rejected: 5, Executed: 10, Cancelled: 2 },
  computed_at: '2026-01-01T00:00:00.000Z',
};

// ── Tests ─────────────────────────────────────────────────────

describe('GovernanceDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_ANALYTICS,
      })
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows a loading message on initial render', () => {
    render(<GovernanceDashboard />);
    expect(screen.getByText(/loading governance statistics/i)).toBeInTheDocument();
  });

  it('fetches from the governance analytics API endpoint', async () => {
    render(<GovernanceDashboard />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/governance/analytics'));
  });

  it('renders "Proposals by State" section after data loads', async () => {
    render(<GovernanceDashboard />);
    await waitFor(() =>
      expect(screen.getByText(/proposals by state/i)).toBeInTheDocument()
    );
  });

  it('renders "Participation Rate Over Time" section after data loads', async () => {
    render(<GovernanceDashboard />);
    await waitFor(() =>
      expect(screen.getByText(/participation rate over time/i)).toBeInTheDocument()
    );
  });

  it('renders "Avg Quorum Achievement" section using the real avg_quorum_fill_rate', async () => {
    render(<GovernanceDashboard />);
    await waitFor(() =>
      expect(screen.getByText(/avg quorum achievement/i)).toBeInTheDocument()
    );
    // MOCK_ANALYTICS.avg_quorum_fill_rate = 0.8 → 80%
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('renders the 30-day pass rate stat tile from real API data', async () => {
    render(<GovernanceDashboard />);
    await waitFor(() => expect(screen.getByText(/30-day pass rate/i)).toBeInTheDocument());
    // MOCK_ANALYTICS.pass_rate = 0.6 → 60%
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('renders the voter retention stat tile with the retained voter count', async () => {
    render(<GovernanceDashboard />);
    const label = await screen.findByText(/retained voters/i);
    // The count is rendered as a sibling above the label within the same tile.
    const tile = label.parentElement;
    expect(tile?.textContent).toContain('1');
  });

  it('renders "Top Voters" table with voter rows from voter_retention', async () => {
    render(<GovernanceDashboard />);
    await waitFor(() =>
      expect(screen.getByText(/top 10 voters/i)).toBeInTheDocument()
    );
    expect(screen.getByText('GABC...1234')).toBeInTheDocument();
  });

  it('renders the pie chart SVG with an accessible label', async () => {
    render(<GovernanceDashboard />);
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: /proposals by state pie chart/i })
      ).toBeInTheDocument()
    );
  });

  it('renders the line chart SVG with an accessible label', async () => {
    render(<GovernanceDashboard />);
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: /voter participation rate over time/i })
      ).toBeInTheDocument()
    );
  });

  it('shows "Last updated" timestamp after data loads, noting the 60s refresh', async () => {
    render(<GovernanceDashboard />);
    await waitFor(() =>
      expect(screen.getByText(/last updated/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/refreshes every 60s/i)).toBeInTheDocument();
  });
});
