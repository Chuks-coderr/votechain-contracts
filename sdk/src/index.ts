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
 * @votechain/sdk — typed TypeScript SDK for the VoteChain governance
 * contract (issue #108).
 *
 * ```ts
 * import { VoteChainClient, RawKeySigner, Networks } from "@votechain/sdk";
 *
 * const client = new VoteChainClient({
 *   rpcUrl: "https://soroban-testnet.stellar.org",
 *   networkPassphrase: Networks.TESTNET,
 *   contractId: "C...",
 * });
 *
 * const signer = new RawKeySigner("S...");
 * await client.castVote(signer, { voter: await signer.publicKey(), proposalId: 1n, vote: "Yes" });
 * ```
 */

export { VoteChainClient, Networks } from "./client.js";
export type { VoteChainClientConfig } from "./client.js";
export { RawKeySigner, FreighterSigner } from "./signer.js";
export type { Signer, FreighterApi } from "./signer.js";
export type {
  Vote,
  ProposalState,
  Proposal,
  VoteRecord,
  InitializeParams,
  CreateProposalParams,
  CastVoteParams,
  TxResult,
} from "./types.js";
