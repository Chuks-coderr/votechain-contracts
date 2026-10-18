/**
 * ProposalList page — paginated governance proposal browser
 *
 * Features (per issue #208):
 *  - At most PAGE_SIZE (20) proposals rendered per page.
 *  - Pagination controls (prev / page numbers / next) are keyboard-navigable.
 *  - Current page is reflected in the URL query param (?page=N) for
 *    shareability and browser back/forward navigation.
 *  - Loading skeleton is shown while the (mock) data fetch is in progress.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Proposal, ProposalState } from '../types';
import { sampleProposals } from '../data';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Read ?page=N from the URL; clamps to [1, maxPage]. */
function getPageFromUrl(maxPage: number): number {
  if (typeof window === 'undefined') return 1;
  const raw = new URLSearchParams(window.location.search).get('page');
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) ? Math.max(1, Math.min(n, maxPage)) : 1;
}

/** Push ?page=N into the browser history without reloading the page. */
function setPageInUrl(page: number) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (page === 1) {
    url.searchParams.delete('page');
  } else {
    url.searchParams.set('page', String(page));
  }
  window.history.pushState({}, '', url.toString());
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i}>
          <span className="pl-skeleton" />
        </td>
      ))}
    </tr>
  );
}

function LoadingSkeleton() {
  return (
    <div className="table-wrapper" aria-busy="true" aria-label="Loading proposals…">
      <table>
        <caption className="visually-hidden">Loading proposals</caption>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Title</th>
            <th scope="col">State</th>
            <th scope="col">Created</th>
            <th scope="col">End date</th>
            <th scope="col">Votes</th>
            <th scope="col">Weight</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination controls
// ---------------------------------------------------------------------------

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build a compact page-number list: always show first, last, current ±1,
  // and fill with '…' where there are gaps.
  const pages: (number | '…')[] = [];
  const add = (n: number) => {
    if (!pages.includes(n)) pages.push(n);
  };

  add(1);
  for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
    add(p);
  }
  add(totalPages);

  const withEllipsis: (number | '…')[] = [];
  let prev: number | null = null;
  for (const p of pages as number[]) {
    if (prev !== null && p - prev > 1) withEllipsis.push('…');
    withEllipsis.push(p);
    prev = p;
  }

  return (
    <nav className="pl-pagination" aria-label="Proposal pagination">
      <button
        className="pl-page-btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>Previous</span>
      </button>

      <ol className="pl-page-numbers" aria-label="Page numbers" role="list">
        {withEllipsis.map((p, i) =>
          p === '…' ? (
            <li key={`ellipsis-${i}`} className="pl-ellipsis" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                className={`pl-page-num${p === currentPage ? ' pl-page-num-active' : ''}`}
                onClick={() => onPageChange(p as number)}
                aria-label={`Page ${p}`}
                aria-current={p === currentPage ? 'page' : undefined}
                disabled={p === currentPage}
              >
                {p}
              </button>
            </li>
          )
        )}
      </ol>

      <button
        className="pl-page-btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        <span>Next</span>
        <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Sort / filter helpers
// ---------------------------------------------------------------------------

const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'votes',  label: 'Most votes' },
  { value: 'ending', label: 'Ending soon' },
] as const;

type SortKey = (typeof sortOptions)[number]['value'];
type StateFilter = 'All' | ProposalState;

function sortProposals(list: Proposal[], key: SortKey): Proposal[] {
  return [...list].sort((a, b) => {
    if (key === 'newest') return b.createdAt.localeCompare(a.createdAt);
    if (key === 'oldest') return a.createdAt.localeCompare(b.createdAt);
    if (key === 'votes')  return b.votesCount - a.votesCount;
    return a.endAt.localeCompare(b.endAt); // ending soon
  });
}

// ---------------------------------------------------------------------------
// Mock async fetch — replace with real API call
// ---------------------------------------------------------------------------

async function fetchProposals(): Promise<Proposal[]> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 600));
  // In production: fetch('/api/proposals?limit=…&offset=…') and pass
  // pagination params to receive only the current page from the server.
  return sampleProposals;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ProposalListPage() {
  const [allProposals, setAllProposals] = useState<Proposal[]>([]);
  const [loading, setLoading]           = useState(true);
  const [searchText, setSearchText]     = useState('');
  const [stateFilter, setStateFilter]   = useState<StateFilter>('All');
  const [sortKey, setSortKey]           = useState<SortKey>('newest');
  const [currentPage, setCurrentPage]   = useState(1);

  const tableRef = useRef<HTMLDivElement>(null);

  // Initial data fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProposals().then((data) => {
      if (!cancelled) {
        setAllProposals(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Build filtered + sorted list
  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return sortProposals(
      allProposals.filter((p) => {
        const matchText  = [p.title, p.description].some((v) => v.toLowerCase().includes(q));
        const matchState = stateFilter === 'All' || p.state === stateFilter;
        return matchText && matchState;
      }),
      sortKey
    );
  }, [allProposals, searchText, stateFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Sync page from URL on first load (after data is available)
  useEffect(() => {
    if (!loading) {
      setCurrentPage(getPageFromUrl(totalPages));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Clamp currentPage when filters change
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  // Current slice
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    setPageInUrl(page);
    // Scroll table into view on page change for keyboard users
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // When filters change, reset to page 1
  function resetPage() {
    setCurrentPage(1);
    setPageInUrl(1);
  }

  // Navigate back/forward with browser history
  useEffect(() => {
    function onPopState() {
      setCurrentPage(getPageFromUrl(totalPages));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [totalPages]);

  const statusMsg = loading
    ? 'Loading proposals…'
    : `Showing ${paginated.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–${
        Math.min(currentPage * PAGE_SIZE, filtered.length)
      } of ${filtered.length} proposals`;

  return (
    <section aria-labelledby="pl-heading" className="card">
      {/* Heading */}
      <div className="header">
        <div>
          <h2 id="pl-heading">Governance Proposals</h2>
          <p>Browse, filter, and paginate all on-chain governance proposals.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <label>
          Search
          <input
            aria-label="Search proposals"
            type="search"
            value={searchText}
            placeholder="Search title or description"
            onChange={(e) => { setSearchText(e.target.value); resetPage(); }}
          />
        </label>
        <label>
          State
          <select
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value as StateFilter); resetPage(); }}
          >
            <option value="All">All</option>
            <option value="Active">Active</option>
            <option value="Passed">Passed</option>
            <option value="Rejected">Rejected</option>
            <option value="Executed">Executed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={sortKey} onChange={(e) => { setSortKey(e.target.value as SortKey); resetPage(); }}>
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Live status for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {statusMsg}
      </div>

      {/* Table or skeleton */}
      <div ref={tableRef}>
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <div className="table-wrapper">
            <table>
              <caption className="visually-hidden">
                {statusMsg}
              </caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Title</th>
                  <th scope="col">State</th>
                  <th scope="col">Created</th>
                  <th scope="col">End date</th>
                  <th scope="col">Votes</th>
                  <th scope="col">Weight</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.title}</td>
                    <td>
                      <span className={`status-chip status-${p.state.toLowerCase()}`}>
                        {p.state}
                      </span>
                    </td>
                    <td>{p.createdAt}</td>
                    <td>{p.endAt}</td>
                    <td>{p.votesCount}</td>
                    <td>{p.totalWeight.toLocaleString()}</td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={7}>No proposals match your search and filter criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {!loading && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      {/* Human-readable page info */}
      {!loading && totalPages > 1 && (
        <p className="pl-page-info" aria-live="polite" aria-atomic="true">
          {statusMsg}
        </p>
      )}
    </section>
  );
}
