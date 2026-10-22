// Copyright 2024 VoteChain Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this License except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { TransactionToast } from "../components/TransactionToast";
import { useTransactionStatus } from "../hooks/useTransactionStatus";
import { useWallet } from "../context/WalletContext";

// ---------------------------------------------------------------------------
// Contract constraint constants — must mirror the governance contract.
// ---------------------------------------------------------------------------

const MAX_TITLE_LEN = 128;
const MAX_DESC_LEN = 1024;
const MIN_DURATION = 60; // 1 minute
const MAX_DURATION = 2_592_000; // 30 days
const MAX_TAGS = 5;
const MAX_TAG_LEN = 32;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProposalTemplate {
  template_id: string;
  title: string;
  description: string;
  quorum: number;
  duration: number;
}

interface TemplateApiResponse {
  templates: ProposalTemplate[];
}

interface FormState {
  title: string;
  description: string;
  quorum: string;
  duration: string;
  tags: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

// ---------------------------------------------------------------------------
// Freighter signing helper (mirrors VotingPanel.tsx pattern)
// ---------------------------------------------------------------------------

type FreighterApi = {
  isConnected: () => Promise<boolean>;
  getPublicKey: () => Promise<string>;
  getNetwork: () => Promise<string>;
  requestAccess: () => Promise<void>;
  signTransaction: (xdr: string, opts?: { network?: string }) => Promise<string>;
};

function getFreighter(): FreighterApi | undefined {
  return (window as unknown as Record<string, unknown>).freighter as
    | FreighterApi
    | undefined;
}

/**
 * Build a minimal create_proposal XDR and sign it with Freighter.
 * In production this would call the Stellar SDK to build a real
 * contract invocation XDR.
 */
async function createProposalViaFreighter(
  title: string,
  description: string,
  quorum: number,
  duration: number,
  network: string
): Promise<string> {
  const freighter = getFreighter();
  if (!freighter) throw new Error("Freighter extension not found.");

  const payload = btoa(
    JSON.stringify({
      fn: "create_proposal",
      title,
      description,
      quorum,
      duration,
    })
  );

  const signedXdr = await freighter.signTransaction(payload, { network });

  // Derive a deterministic mock hash from the signed XDR.
  const encoder = new TextEncoder();
  const data = encoder.encode(signedXdr);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};

  // Title: 1-128 chars, non-empty
  if (!form.title.trim()) {
    errors.title = "Title is required.";
  } else if (form.title.length > MAX_TITLE_LEN) {
    errors.title = `Title must be at most ${MAX_TITLE_LEN} characters.`;
  }

  // Description: 1-1024 chars, non-empty
  if (!form.description.trim()) {
    errors.description = "Description is required.";
  } else if (form.description.length > MAX_DESC_LEN) {
    errors.description = `Description must be at most ${MAX_DESC_LEN} characters.`;
  }

  // Quorum: must be a positive integer
  const quorumNum = parseInt(form.quorum, 10);
  if (!form.quorum || isNaN(quorumNum) || quorumNum <= 0) {
    errors.quorum = "Quorum must be a positive number.";
  }

  // Duration: must be within [MIN_DURATION, MAX_DURATION]
  const durationNum = parseInt(form.duration, 10);
  if (!form.duration || isNaN(durationNum) || durationNum < MIN_DURATION) {
    errors.duration = `Duration must be at least ${MIN_DURATION} seconds (1 minute).`;
  } else if (durationNum > MAX_DURATION) {
    errors.duration = `Duration must be at most ${MAX_DURATION} seconds (30 days).`;
  }

  // Tags: optional, but if present validate format
  if (form.tags.trim()) {
    const tagList = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > MAX_TAGS) {
      errors.tags = `At most ${MAX_TAGS} tags allowed.`;
    } else {
      for (const tag of tagList) {
        if (tag.length > MAX_TAG_LEN) {
          errors.tags = `Each tag must be at most ${MAX_TAG_LEN} characters.`;
          break;
        }
        if (!/^[a-zA-Z0-9-]+$/.test(tag)) {
          errors.tags = "Tags may only contain letters, numbers, and hyphens.";
          break;
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateProposal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { connected, connecting, connect, address, network } = useWallet();
  const { tx, submit, retry, reset } = useTransactionStatus();

  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    quorum: "",
    duration: "",
    tags: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // ── Fetch available templates ────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/proposals/templates");
      if (!res.ok) return;
      const data: TemplateApiResponse = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      // Templates are optional; silently degrade
    }
  }, []);

  useEffect(() => {
    if (connected) fetchTemplates();
  }, [connected, fetchTemplates]);

  // ── Template selection ────────────────────────────────────────────────────

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplate(templateId);
    if (templateId === "") {
      // Clear — reset form to empty
      setForm({ title: "", description: "", quorum: "", duration: "", tags: "" });
      return;
    }
    const tmpl = templates.find((tp) => tp.template_id === templateId);
    if (!tmpl) return;
    setForm({
      title: tmpl.title,
      description: tmpl.description,
      quorum: tmpl.quorum > 0 ? String(tmpl.quorum) : "",
      duration: tmpl.duration > 0 ? String(tmpl.duration) : "",
      tags: "",
    });
    setErrors({});
  }

  // ── Form helpers ──────────────────────────────────────────────────────────

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error on edit
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!network) return;
    setSubmitting(true);
    try {
      const quorumNum = parseInt(form.quorum, 10);
      const durationNum = parseInt(form.duration, 10);
      const hash = await createProposalViaFreighter(
        form.title.trim(),
        form.description.trim(),
        quorumNum,
        durationNum,
        network
      );
      submit(hash);
      // Navigate to proposal list after a short delay so the toast is visible
      setTimeout(() => navigate("/"), 2000);
    } catch (err: unknown) {
      submit("error");
      console.error("[CreateProposal] error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Wallet not connected — show prompt
  if (!connected) {
    return (
      <section aria-labelledby="create-proposal-title">
        <h2 id="create-proposal-title">Create Proposal</h2>
        <div className="wallet-prompt" role="status">
          <p>
            Connect your Freighter wallet to create a governance proposal.
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            aria-label="Connect Freighter wallet"
            className="btn-primary"
          >
            {connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="create-proposal-title" className="card">
      <h2 id="create-proposal-title">Create Proposal</h2>

      <TransactionToast
        tx={tx}
        onRetry={tx.hash ? () => retry(tx.hash!) : undefined}
        onDismiss={reset}
      />

      {/* Template picker */}
      {templates.length > 0 && (
        <div className="template-picker" style={{ marginBottom: 24 }}>
          <label htmlFor="template-select" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
            Proposal Template (optional)
          </label>
          <select
            id="template-select"
            value={selectedTemplate}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            aria-label="Select a proposal template"
            aria-describedby="template-help"
          >
            <option value="">— No template (blank form) —</option>
            {templates.map((tmpl) => (
              <option key={tmpl.template_id} value={tmpl.template_id}>
                {tmpl.template_id}
              </option>
            ))}
          </select>
          <p id="template-help" style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
            Select a pre-approved template to auto-fill proposal defaults.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid">
          {/* Title */}
          <label style={{ gridColumn: "1 / -1" }}>
            Title
            <input
              type="text"
              value={form.title}
              maxLength={MAX_TITLE_LEN}
              onChange={(e) => updateField("title", e.target.value)}
              aria-label="Proposal title"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "title-error" : "title-help"}
              placeholder="Enter proposal title"
            />
          </label>
          <p id="title-help" style={{ fontSize: 12, color: "#888" }}>
            {form.title.length} / {MAX_TITLE_LEN} characters
          </p>
          {errors.title && (
            <p id="title-error" role="alert" style={{ color: "#ef5350", fontSize: 13 }}>
              {errors.title}
            </p>
          )}

          {/* Description */}
          <label style={{ gridColumn: "1 / -1" }}>
            Description
            <textarea
              value={form.description}
              maxLength={MAX_DESC_LEN}
              rows={5}
              onChange={(e) => updateField("description", e.target.value)}
              aria-label="Proposal description"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "desc-error" : "desc-help"}
              placeholder="Enter proposal description"
            />
          </label>
          <p id="desc-help" style={{ fontSize: 12, color: "#888" }}>
            {form.description.length} / {MAX_DESC_LEN} characters
          </p>
          {errors.description && (
            <p id="desc-error" role="alert" style={{ color: "#ef5350", fontSize: 13 }}>
              {errors.description}
            </p>
          )}

          {/* Quorum */}
          <label>
            Quorum (token units)
            <input
              type="number"
              value={form.quorum}
              min={1}
              onChange={(e) => updateField("quorum", e.target.value)}
              aria-label="Quorum threshold"
              aria-invalid={!!errors.quorum}
              aria-describedby={errors.quorum ? "quorum-error" : "quorum-help"}
              placeholder="e.g. 5000000"
            />
          </label>
          <p id="quorum-help" style={{ fontSize: 12, color: "#888" }}>
            Minimum total votes required to pass.
          </p>
          {errors.quorum && (
            <p id="quorum-error" role="alert" style={{ color: "#ef5350", fontSize: 13 }}>
              {errors.quorum}
            </p>
          )}

          {/* Duration */}
          <label>
            Duration (seconds)
            <input
              type="number"
              value={form.duration}
              min={MIN_DURATION}
              max={MAX_DURATION}
              onChange={(e) => updateField("duration", e.target.value)}
              aria-label="Voting duration in seconds"
              aria-invalid={!!errors.duration}
              aria-describedby={errors.duration ? "duration-error" : "duration-help"}
              placeholder={`${MIN_DURATION} – ${MAX_DURATION}`}
            />
          </label>
          <p id="duration-help" style={{ fontSize: 12, color: "#888" }}>
            Voting period ({MIN_DURATION}s – {MAX_DURATION}s, i.e. 1 min to 30 days).
          </p>
          {errors.duration && (
            <p id="duration-error" role="alert" style={{ color: "#ef5350", fontSize: 13 }}>
              {errors.duration}
            </p>
          )}

          {/* Tags */}
          <label style={{ gridColumn: "1 / -1" }}>
            Tags (optional, comma-separated)
            <input
              type="text"
              value={form.tags}
              maxLength={MAX_TAGS * (MAX_TAG_LEN + 2)}
              onChange={(e) => updateField("tags", e.target.value)}
              aria-label="Proposal tags"
              aria-invalid={!!errors.tags}
              aria-describedby={errors.tags ? "tags-error" : "tags-help"}
              placeholder="treasury, governance, upgrade"
            />
          </label>
          <p id="tags-help" style={{ fontSize: 12, color: "#888" }}>
            Up to {MAX_TAGS} tags, letters/numbers/hyphens only, max {MAX_TAG_LEN} chars each.
          </p>
          {errors.tags && (
            <p id="tags-error" role="alert" style={{ color: "#ef5350", fontSize: 13 }}>
              {errors.tags}
            </p>
          )}
        </div>

        {/* Submit */}
        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="btn-primary"
          >
            {submitting ? "Submitting…" : "Create Proposal"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Cancel and return to proposal list"
          >
            Cancel
          </button>
        </div>
      </form>

      {connected && address && (
        <p className="wallet-info" aria-label="Connected wallet address" style={{ marginTop: 16 }}>
          Connected: {address.slice(0, 6)}…{address.slice(-4)}
        </p>
      )}
    </section>
  );
}
