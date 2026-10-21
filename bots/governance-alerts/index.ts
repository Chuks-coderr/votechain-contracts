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
 * VoteChain governance alerts bot.
 *
 * Polls the backend API for proposals and posts to a Discord channel (via an
 * incoming webhook) when a proposal is created, finalised, or executed.
 *
 * Environment:
 *   DISCORD_WEBHOOK_URL  (required) Discord webhook URL — store as a secret
 *   API_URL              Backend base URL (default http://localhost:3001)
 *   FRONTEND_URL         Frontend base URL for deep links (default http://localhost:3000)
 *   POLL_INTERVAL_MS     Poll interval in ms (default 30000)
 */

interface Proposal {
  id: number | string;
  title?: string;
  state?: string;
  status?: string;
  executed?: boolean;
}

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const API_URL = (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 30000);

const FINAL_STATES = new Set(["passed", "rejected", "failed", "defeated", "succeeded", "cancelled", "expired"]);

type EventKind = "ProposalCreated" | "ProposalFinalised" | "ProposalExecuted";

const seen = new Map<string, string>();
let initialised = false;

function stateOf(p: Proposal): string {
  if (p.executed) return "executed";
  return String(p.state ?? p.status ?? "active").toLowerCase();
}

export function formatMessage(kind: EventKind, p: Proposal): string {
  const title = p.title ?? "(untitled)";
  const link = `${FRONTEND_URL}/proposals/${p.id}`;
  const headline: Record<EventKind, string> = {
    ProposalCreated: "🗳️ **New proposal created**",
    ProposalFinalised: "✅ **Proposal finalised**",
    ProposalExecuted: "🚀 **Proposal executed**",
  };
  return [
    headline[kind],
    `**#${p.id}** — ${title}`,
    `State: \`${stateOf(p)}\``,
    link,
  ].join("\n");
}

async function post(content: string): Promise<void> {
  const res = await fetch(WEBHOOK as string, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) console.error(`Discord webhook failed: ${res.status} ${await res.text()}`);
}

async function fetchProposals(): Promise<Proposal[]> {
  const res = await fetch(`${API_URL}/proposals`);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const body = (await res.json()) as Proposal[] | { data?: Proposal[]; proposals?: Proposal[] };
  if (Array.isArray(body)) return body;
  return body.data ?? body.proposals ?? [];
}

async function tick(): Promise<void> {
  const proposals = await fetchProposals();
  for (const p of proposals) {
    const key = String(p.id);
    const state = stateOf(p);
    const prev = seen.get(key);
    seen.set(key, state);
    // First poll seeds the cache so existing proposals are not re-announced.
    if (!initialised || prev === state) continue;
    if (prev === undefined) await post(formatMessage("ProposalCreated", p));
    else if (state === "executed") await post(formatMessage("ProposalExecuted", p));
    else if (FINAL_STATES.has(state)) await post(formatMessage("ProposalFinalised", p));
  }
  initialised = true;
}

async function main(): Promise<void> {
  if (!WEBHOOK) {
    console.error("DISCORD_WEBHOOK_URL is required");
    process.exit(1);
  }
  console.log(`Governance alerts bot polling ${API_URL}/proposals every ${POLL_INTERVAL_MS}ms`);
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("Poll failed:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

if (require.main === module) void main();
