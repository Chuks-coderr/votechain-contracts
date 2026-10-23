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
 * VoteChain — Proposals page
 *
 * Renders governance proposals with state badges, vote summaries,
 * countdown timers for active proposals, and paginated navigation.
 *
 * Data source: replace `MOCK_PROPOSALS` with a real Stellar RPC /
 * Horizon call to your deployed governance contract.
 */

'use strict';

import type { ProposalState, RawProposal } from './types';

// ── Configuration ────────────────────────────────────────────────────────────

const PAGE_SIZE = 10; // proposals per page

// ── Mock data ────────────────────────────────────────────────────────────────
// Replace this array with a live fetch from your Stellar RPC endpoint.
// Each object mirrors the on-chain `Proposal` struct.

const now: number = Math.floor(Date.now() / 1000);

const MOCK_PROPOSALS: RawProposal[] = [
  {
    id: 1,
    title: 'Increase minimum proposal balance to 500,000 tokens',
    proposer: 'GBXYZABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP',
    votes_yes: 4_200_000,
    votes_no: 1_100_000,
    votes_abstain: 300_000,
    quorum: 5_000_000,
    start_time: now - 86400,
    end_time: now + 3600 * 6,
    state: 'Active',
    execute_after: 0,
  },
  {
    id: 2,
    title: 'Enable admin vote restriction on self-created proposals',
    proposer: 'GCABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 8_500_000,
    votes_no: 900_000,
    votes_abstain: 600_000,
    quorum: 5_000_000,
    start_time: now - 172800,
    end_time: now - 3600,
    state: 'Passed',
    execute_after: now + 3600 * 24,
  },
  {
    id: 3,
    title: 'Reduce voting duration maximum from 30 days to 14 days',
    proposer: 'GDABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 1_200_000,
    votes_no: 3_800_000,
    votes_abstain: 200_000,
    quorum: 5_000_000,
    start_time: now - 259200,
    end_time: now - 86400,
    state: 'Rejected',
    execute_after: 0,
  },
  {
    id: 4,
    title: 'Deploy governance contract upgrade v1.1.0',
    proposer: 'GEABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 9_100_000,
    votes_no: 400_000,
    votes_abstain: 100_000,
    quorum: 5_000_000,
    start_time: now - 604800,
    end_time: now - 518400,
    state: 'Executed',
    execute_after: 0,
  },
  {
    id: 5,
    title: 'Add delegation support to governance contract',
    proposer: 'GFABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 500_000,
    votes_no: 200_000,
    votes_abstain: 50_000,
    quorum: 5_000_000,
    start_time: now - 3600,
    end_time: now + 3600 * 47,
    state: 'Active',
    execute_after: 0,
  },
  {
    id: 6,
    title: 'Cancel emergency proposal — superseded by proposal #7',
    proposer: 'GGABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 0,
    votes_no: 0,
    votes_abstain: 0,
    quorum: 5_000_000,
    start_time: now - 7200,
    end_time: now + 86400,
    state: 'Cancelled',
    execute_after: 0,
  },
  {
    id: 7,
    title: 'Set proposal cooldown period to 24 hours',
    proposer: 'GHABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 2_100_000,
    votes_no: 800_000,
    votes_abstain: 400_000,
    quorum: 5_000_000,
    start_time: now - 43200,
    end_time: now + 3600 * 30,
    state: 'Active',
    execute_after: 0,
  },
  {
    id: 8,
    title: 'Update treasury multisig signers',
    proposer: 'GIABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 7_200_000,
    votes_no: 1_300_000,
    votes_abstain: 500_000,
    quorum: 5_000_000,
    start_time: now - 345600,
    end_time: now - 259200,
    state: 'Passed',
    execute_after: now - 172800,
  },
  {
    id: 9,
    title: 'Increase quorum threshold to 10% of total supply',
    proposer: 'GJABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 3_000_000,
    votes_no: 3_100_000,
    votes_abstain: 900_000,
    quorum: 5_000_000,
    start_time: now - 432000,
    end_time: now - 345600,
    state: 'Rejected',
    execute_after: 0,
  },
  {
    id: 10,
    title: 'Enable on-chain timelock for all passed proposals',
    proposer: 'GKABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 6_800_000,
    votes_no: 700_000,
    votes_abstain: 200_000,
    quorum: 5_000_000,
    start_time: now - 1209600,
    end_time: now - 1123200,
    state: 'Executed',
    execute_after: 0,
  },
  {
    id: 11,
    title: 'Whitelist new token contract address for governance voting',
    proposer: 'GLABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 1_500_000,
    votes_no: 500_000,
    votes_abstain: 200_000,
    quorum: 5_000_000,
    start_time: now - 1800,
    end_time: now + 3600 * 71,
    state: 'Active',
    execute_after: 0,
  },
  {
    id: 12,
    title: 'Reduce maximum title length from 256 to 128 characters',
    proposer: 'GMABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRS',
    votes_yes: 4_400_000,
    votes_no: 2_200_000,
    votes_abstain: 800_000,
    quorum: 5_000_000,
    start_time: now - 518400,
    end_time: now - 432000,
    state: 'Passed',
    execute_after: now + 3600 * 12,
  },
];

// ── State ────────────────────────────────────────────────────────────────────

let currentPage: number = 1;
let activeFilter: string = 'all';
let searchQuery: string = '';
let countdownTimers: ReturnType<typeof setInterval>[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a large number with locale-aware thousands separators.
 */
function fmt(n: number): string {
  return n.toLocaleString();
}

/**
 * Truncate a Stellar address to first 6 + last 4 characters.
 */
function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Return seconds remaining until a Unix timestamp.
 */
function secondsUntil(endTime: number): number {
  return Math.max(0, endTime - Math.floor(Date.now() / 1000));
}

/**
 * Format a duration in seconds as a human-readable string.
 */
function formatDuration(secs: number): string {
  if (secs <= 0) return 'Ended';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h remaining`;
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m ${s}s remaining`;
  return `${s}s remaining`;
}

/**
 * Return true if fewer than 1 hour remains (used to apply "ending soon" style).
 */
function isEndingSoon(secs: number): boolean {
  return secs > 0 && secs < 3600;
}

/**
 * Map a proposal state string to a CSS class suffix.
 */
function badgeClass(state: ProposalState): string {
  return `badge-${state.toLowerCase()}`;
}

// ── Filtering ────────────────────────────────────────────────────────────────

function filteredProposals(): RawProposal[] {
  return MOCK_PROPOSALS.filter((p: RawProposal) => {
    const matchesFilter =
      activeFilter === 'all' || p.state.toLowerCase() === activeFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      p.title.toLowerCase().includes(q) ||
      String(p.id).includes(q) ||
      p.proposer.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });
}

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * Build the HTML for a single proposal card.
 */
function renderCard(p: RawProposal): string {
  const total = p.votes_yes + p.votes_no + p.votes_abstain;
  const yesP = total > 0 ? ((p.votes_yes / total) * 100).toFixed(1) : 0;
  const noP = total > 0 ? ((p.votes_no / total) * 100).toFixed(1) : 0;
  const absP = total > 0 ? ((p.votes_abstain / total) * 100).toFixed(1) : 0;

  const isActive = p.state === 'Active';
  const secs = isActive ? secondsUntil(p.end_time) : 0;
  const endingSoon = isActive && isEndingSoon(secs);

  const countdownHtml = isActive
    ? `
    <span class="countdown${endingSoon ? ' ending-soon' : ''}" data-end="${p.end_time}" aria-label="Time remaining: ${formatDuration(secs)}">
      <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.4"/>
        <path d="M7 4v3l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <span class="countdown-text">${formatDuration(secs)}</span>
    </span>`
    : '';

  const quorumMet = total >= p.quorum;
  const quorumPct =
    p.quorum > 0 ? Math.min(100, (total / p.quorum) * 100).toFixed(0) : 0;

  return `
    <li class="proposal-card" role="article" aria-label="Proposal ${p.id}: ${p.title}">
      <div class="card-header">
        <div class="card-title-row">
          <div class="proposal-id" aria-label="Proposal ID">#${p.id}</div>
          <h2 class="proposal-title">${escapeHtml(p.title)}</h2>
        </div>
        <span class="state-badge ${badgeClass(p.state)}" role="status" aria-label="Status: ${p.state}">
          ${p.state}
        </span>
      </div>

      <div class="vote-summary" aria-label="Vote summary">
        <div class="vote-bar-wrap" role="img" aria-label="Yes ${yesP}%, No ${noP}%, Abstain ${absP}%">
          <div class="vote-bar-yes"     style="width:${yesP}%"></div>
          <div class="vote-bar-no"      style="width:${noP}%"></div>
          <div class="vote-bar-abstain" style="width:${absP}%"></div>
        </div>
        <div class="vote-counts">
          <span class="vote-count-item">
            <span class="vote-dot dot-yes" aria-hidden="true"></span>
            Yes <strong>${fmt(p.votes_yes)}</strong>
          </span>
          <span class="vote-count-item">
            <span class="vote-dot dot-no" aria-hidden="true"></span>
            No <strong>${fmt(p.votes_no)}</strong>
          </span>
          <span class="vote-count-item">
            <span class="vote-dot dot-abstain" aria-hidden="true"></span>
            Abstain <strong>${fmt(p.votes_abstain)}</strong>
          </span>
        </div>
      </div>

      <div class="card-footer">
        <span class="proposer-info">
          <span class="proposer-label">Proposer</span>
          <span class="proposer-address" title="${escapeHtml(p.proposer)}">${truncateAddress(p.proposer)}</span>
        </span>
        <span class="quorum-info" aria-label="Quorum ${quorumPct}% of ${fmt(p.quorum)} required${quorumMet ? ', met' : ', not yet met'}">
          Quorum ${quorumPct}%${quorumMet ? ' ✓' : ''}
        </span>
        ${countdownHtml}
      </div>
    </li>`;
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Countdown tick ────────────────────────────────────────────────────────────

function tickCountdowns(): void {
  document.querySelectorAll<HTMLElement>('.countdown[data-end]').forEach((el) => {
    const endTime = parseInt(el.dataset['end'] ?? '0', 10);
    const secs = secondsUntil(endTime);
    const text = el.querySelector('.countdown-text');
    if (text) text.textContent = formatDuration(secs);
    el.setAttribute('aria-label', `Time remaining: ${formatDuration(secs)}`);
    if (isEndingSoon(secs)) {
      el.classList.add('ending-soon');
    } else {
      el.classList.remove('ending-soon');
    }
  });
}

// ── Render page ───────────────────────────────────────────────────────────────

function render(): void {
  // Clear existing countdown intervals
  countdownTimers.forEach(clearInterval);
  countdownTimers = [];

  const list = document.getElementById('proposal-list') as HTMLUListElement | null;
  const emptyState = document.getElementById('empty-state') as HTMLElement | null;
  const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('next-btn') as HTMLButtonElement | null;
  const pageInfo = document.getElementById('page-info') as HTMLElement | null;
  const liveRegion = document.getElementById('live-region') as HTMLElement | null;

  if (!list || !emptyState || !prevBtn || !nextBtn || !pageInfo || !liveRegion) return;

  const filtered = filteredProposals();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Clamp current page
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  if (page.length === 0) {
    list.innerHTML = '';
    emptyState.hidden = false;
    liveRegion.textContent = 'No proposals match your filter.';
  } else {
    emptyState.hidden = true;
    list.innerHTML = page.map(renderCard).join('');
    liveRegion.textContent = `Showing ${page.length} proposal${page.length !== 1 ? 's' : ''}.`;
  }

  // Pagination controls
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;

  // Start countdown ticker for active proposals
  if (page.some((p: RawProposal) => p.state === 'Active')) {
    const timer = setInterval(tickCountdowns, 1000);
    countdownTimers.push(timer);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Filter buttons
  document.querySelectorAll<HTMLButtonElement>('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset['filter'] ?? 'all';
      currentPage = 1;

      // Update aria-pressed on all buttons
      document.querySelectorAll<HTMLButtonElement>('.filter-btn').forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', String(isActive));
      });

      render();
    });
  });

  // Search input — debounced
  let searchTimer: ReturnType<typeof setTimeout>;
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  searchInput?.addEventListener('input', (e: Event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = (e.target as HTMLInputElement).value.trim();
      currentPage = 1;
      render();
    }, 250);
  });

  // Pagination
  document.getElementById('prev-btn')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  document.getElementById('next-btn')?.addEventListener('click', () => {
    const total = Math.ceil(filteredProposals().length / PAGE_SIZE);
    if (currentPage < total) {
      currentPage++;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // ── Theme toggle logic ───────────────────────────────────────────────────────
  const themeToggle = document.getElementById('theme-toggle') as HTMLButtonElement | null;

  function updateThemeToggleUI(isDark: boolean): void {
    if (!themeToggle) return;
    themeToggle.setAttribute(
      'aria-label',
      isDark ? 'Switch to light mode' : 'Switch to dark mode',
    );
    themeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    themeToggle.innerHTML = isDark
      ? `<svg class="theme-toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2"></path>
          <path d="M12 20v2"></path>
          <path d="m4.93 4.93 1.41 1.41"></path>
          <path d="m17.66 17.66 1.41 1.41"></path>
          <path d="M2 12h2"></path>
          <path d="M20 12h2"></path>
          <path d="m6.34 17.66-1.41 1.41"></path>
          <path d="m19.07 4.93-1.41 1.41"></path>
        </svg>`
      : `<svg class="theme-toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
        </svg>`;
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateThemeToggleUI(isDark);
    });
    // Set initial icon state based on the current class of <html>
    updateThemeToggleUI(document.documentElement.classList.contains('dark'));
  }

  // Initial render
  render();
});
