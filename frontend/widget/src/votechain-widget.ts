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
 * <votechain-proposals> — embeddable read-only governance widget.
 *
 * Attributes:
 *   api-url      Base URL of the VoteChain API  (required)
 *   theme        "light" | "dark"               (default: "light")
 *   limit        Max proposals to show           (default: 5)
 *   filter-state Proposal state to filter by     (default: "active")
 *                Pass "" to show all states.
 *
 * Usage:
 *   <script src="votechain-widget.js"></script>
 *   <votechain-proposals api-url="https://api.votechain.dev" theme="dark" limit="3"></votechain-proposals>
 */

interface Proposal {
  id: string | number;
  title: string;
  state: string;
  yes_votes?: number;
  no_votes?: number;
  abstain_votes?: number;
  voting_ends_at?: string;
}

const STYLES = `
:host {
  display: block;
  font-family: system-ui, sans-serif;
  box-sizing: border-box;
}
.vc-widget {
  border: 1px solid var(--vc-border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vc-bg, #ffffff);
  color: var(--vc-text, #1a202c);
}
.vc-widget.dark {
  --vc-bg: #1a202c;
  --vc-text: #f7fafc;
  --vc-border: #2d3748;
  --vc-card-bg: #2d3748;
  --vc-meta: #a0aec0;
  --vc-badge-bg: #4a5568;
  --vc-badge-text: #e2e8f0;
}
.vc-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--vc-border, #e2e8f0);
  font-weight: 600;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 8px;
}
.vc-header svg {
  flex-shrink: 0;
}
.vc-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.vc-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--vc-border, #e2e8f0);
  background: var(--vc-card-bg, transparent);
}
.vc-item:last-child {
  border-bottom: none;
}
.vc-item-title {
  font-size: 0.9rem;
  font-weight: 500;
  margin-bottom: 6px;
  line-height: 1.4;
}
.vc-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: var(--vc-meta, #718096);
}
.vc-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: var(--vc-badge-bg, #edf2f7);
  color: var(--vc-badge-text, #4a5568);
}
.vc-badge.active   { background: #c6f6d5; color: #22543d; }
.vc-badge.passed   { background: #bee3f8; color: #2a4365; }
.vc-badge.rejected { background: #fed7d7; color: #742a2a; }
.vc-badge.executed { background: #e9d8fd; color: #44337a; }
.vc-badge.cancelled{ background: #fefcbf; color: #744210; }
.dark .vc-badge.active   { background: #276749; color: #c6f6d5; }
.dark .vc-badge.passed   { background: #2a4365; color: #bee3f8; }
.dark .vc-badge.rejected { background: #742a2a; color: #fed7d7; }
.dark .vc-badge.executed { background: #44337a; color: #e9d8fd; }
.dark .vc-badge.cancelled{ background: #744210; color: #fefcbf; }
.vc-votes {
  display: flex;
  gap: 6px;
  font-size: 0.75rem;
}
.vc-vote-yes  { color: #38a169; }
.vc-vote-no   { color: #e53e3e; }
.vc-vote-abs  { color: var(--vc-meta, #718096); }
.vc-empty, .vc-error, .vc-loading {
  padding: 24px 16px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--vc-meta, #718096);
}
.vc-footer {
  padding: 8px 16px;
  text-align: right;
  font-size: 0.72rem;
  color: var(--vc-meta, #718096);
  border-top: 1px solid var(--vc-border, #e2e8f0);
}
.vc-footer a {
  color: inherit;
  text-decoration: none;
}
.vc-footer a:hover {
  text-decoration: underline;
}
`;

class VotechainProposals extends HTMLElement {
  private shadow: ShadowRoot;
  private _abortController: AbortController | null = null;

  static get observedAttributes() {
    return ["api-url", "theme", "limit", "filter-state"];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
    this._fetchProposals();
  }

  disconnectedCallback() {
    this._abortController?.abort();
  }

  attributeChangedCallback() {
    if (this.isConnected) {
      this._abortController?.abort();
      this._render();
      this._fetchProposals();
    }
  }

  private get _apiUrl(): string {
    return (this.getAttribute("api-url") ?? "").replace(/\/$/, "");
  }

  private get _theme(): "light" | "dark" {
    return this.getAttribute("theme") === "dark" ? "dark" : "light";
  }

  private get _limit(): number {
    const v = parseInt(this.getAttribute("limit") ?? "5", 10);
    return isNaN(v) || v < 1 ? 5 : v;
  }

  private get _filterState(): string {
    const v = this.getAttribute("filter-state");
    return v === null ? "active" : v;
  }

  private _render(content = '<p class="vc-loading" role="status">Loading proposals…</p>') {
    const dark = this._theme === "dark" ? "dark" : "";
    this.shadow.innerHTML = `
      <style>${STYLES}</style>
      <div class="vc-widget ${dark}" part="widget">
        <div class="vc-header" part="header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Governance Proposals
        </div>
        ${content}
        <div class="vc-footer" part="footer">
          Powered by <a href="https://github.com/veracindarella/votechain-contracts"
            target="_blank" rel="noopener noreferrer">VoteChain</a>
        </div>
      </div>
    `;
  }

  private async _fetchProposals() {
    const apiUrl = this._apiUrl;
    if (!apiUrl) {
      this._render('<p class="vc-error" role="alert">Set the <code>api-url</code> attribute.</p>');
      return;
    }

    this._abortController = new AbortController();

    let url = `${apiUrl}/api/proposals?limit=${this._limit}`;
    if (this._filterState) {
      url += `&state=${encodeURIComponent(this._filterState)}`;
    }

    try {
      const res = await fetch(url, {
        signal: this._abortController.signal,
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }

      const data = await res.json();
      const proposals: Proposal[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.proposals)
        ? data.proposals
        : [];

      this._renderProposals(proposals);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      this._render('<p class="vc-error" role="alert">Failed to load proposals.</p>');
    }
  }

  private _renderProposals(proposals: Proposal[]) {
    if (proposals.length === 0) {
      this._render('<p class="vc-empty">No proposals found.</p>');
      return;
    }

    const items = proposals
      .slice(0, this._limit)
      .map((p) => {
        const state = (p.state ?? "").toLowerCase();
        const badgeClass = ["active", "passed", "rejected", "executed", "cancelled"].includes(state)
          ? state
          : "";

        const votes =
          p.yes_votes !== undefined
            ? `<span class="vc-votes">
                <span class="vc-vote-yes">✓ ${p.yes_votes}</span>
                <span class="vc-vote-no">✗ ${p.no_votes ?? 0}</span>
                <span class="vc-vote-abs">~ ${p.abstain_votes ?? 0}</span>
               </span>`
            : "";

        const ends = p.voting_ends_at
          ? `<span>Ends ${new Date(p.voting_ends_at).toLocaleDateString()}</span>`
          : "";

        return `
          <li class="vc-item" part="proposal-item">
            <div class="vc-item-title">${this._escape(String(p.title ?? "Untitled"))}</div>
            <div class="vc-meta">
              <span class="vc-badge ${badgeClass}">${this._escape(p.state ?? "unknown")}</span>
              ${votes}
              ${ends}
            </div>
          </li>`;
      })
      .join("");

    this._render(`<ul class="vc-list" aria-label="Governance proposals">${items}</ul>`);
  }

  private _escape(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

customElements.define("votechain-proposals", VotechainProposals);
