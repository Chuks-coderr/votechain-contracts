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
 * VoteHistory page — consumes ProposalContext and WalletContext (issue #10).
 * No prop-drilling: proposals come from context, wallet address pre-fills the filter.
 */
import React from 'react';
import VoteHistoryComponent from '../components/VoteHistory';
import { useProposals } from '../context/ProposalContext';

export default function VoteHistory() {
  const { proposals, loading, error } = useProposals();

  if (loading) return <p aria-live="polite">Loading vote history…</p>;
  if (error) return <p role="alert">Error: {error}</p>;

  return <VoteHistoryComponent proposals={proposals} />;
}
