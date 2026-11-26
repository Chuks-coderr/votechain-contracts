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
 * Contract service for interacting with the VoteChain governance contract
 * on Stellar Soroban via RPC.
 */

import { getConfig } from "../config";
import {
  Contract,
  Networks,
  rpc as SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
  Keypair,
} from "@stellar/stellar-sdk";

export interface Proposal {
  id: bigint;
  proposer: string;
  title: string;
  description: string;
  votesYes: bigint;
  votesNo: bigint;
  votesAbstain: bigint;
  quorum: bigint;
  startTime: bigint;
  endTime: bigint;
  state: ProposalState;
  executeAfter: bigint;
  supplySnapshot: bigint;
}

export type ProposalState = "Active" | "Passed" | "Rejected" | "Executed" | "Cancelled";

export interface VoteRecord {
  voteType: "Yes" | "No" | "Abstain";
  weight: bigint;
  commentHash: string | null;
}

export interface ContractConfig {
  admin: string;
  votingToken: string;
  minProposalBalance: bigint;
  proposalCooldown: bigint;
  restrictAdminVote: boolean;
  paused: boolean;
  timelockDuration: bigint;
  minDuration: bigint;
  maxDuration: bigint;
  version: [number, number, number];
  minQuorumBps: number;
}

export interface CreateProposalParams {
  proposer: string;
  title: string;
  description: string;
  quorum: bigint;
  durationSeconds: bigint;
}

export interface InitializeParams {
  admin: string;
  votingToken: string;
  minProposalBalance: bigint;
  proposalCooldown: bigint;
  minDuration: bigint;
  maxDuration: bigint;
  restrictAdminVote: boolean;
  timelockDuration: bigint;
  maxActiveProposals: bigint;
}

export interface TxResult<T> {
  hash: string;
  value: T;
}

const DEFAULT_BASE_FEE = "100";
const DEFAULT_TIMEOUT_SECONDS = 30;
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 30;

function voteToScVal(vote: "Yes" | "No" | "Abstain"): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(vote)]);
}

function proposalStateFromScVal(state: unknown): ProposalState {
  return String(state) as ProposalState;
}

function decodeProposal(native: Record<string, unknown>): Proposal {
  return {
    id: BigInt(native.id as string | number | bigint),
    proposer: native.proposer as string,
    title: native.title as string,
    description: native.description as string,
    votesYes: BigInt(native.votes_yes as string | number | bigint),
    votesNo: BigInt(native.votes_no as string | number | bigint),
    votesAbstain: BigInt(native.votes_abstain as string | number | bigint),
    quorum: BigInt(native.quorum as string | number | bigint),
    startTime: BigInt(native.start_time as string | number | bigint),
    endTime: BigInt(native.end_time as string | number | bigint),
    state: proposalStateFromScVal(native.state),
    executeAfter: BigInt(native.execute_after as string | number | bigint),
    supplySnapshot: BigInt(native.supply_snapshot as string | number | bigint),
  };
}

function decodeVoteRecord(native: Record<string, unknown>): VoteRecord {
  return {
    voteType: proposalStateFromScVal(native.vote_type) as "Yes" | "No" | "Abstain",
    weight: BigInt(native.weight as string | number | bigint),
    commentHash: (native.comment_hash as string | null | undefined) ?? null,
  };
}

export class ContractService {
  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;
  private readonly baseFee: string;
  private readonly timeoutSeconds: number;

  constructor(config: {
    rpcUrl: string;
    networkPassphrase: string;
    contractId: string;
    baseFee?: string;
    timeoutSeconds?: number;
  }) {
    this.server = new SorobanRpc.Server(config.rpcUrl);
    this.contract = new Contract(config.contractId);
    this.networkPassphrase = config.networkPassphrase;
    this.baseFee = config.baseFee ?? DEFAULT_BASE_FEE;
    this.timeoutSeconds = config.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  }

  private async buildAndSimulate(sourcePublicKey: string, operation: xdr.Operation) {
    const account = await this.server.getAccount(sourcePublicKey);
    const tx = new TransactionBuilder(account, {
      fee: this.baseFee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(this.timeoutSeconds)
      .build();

    const simulated = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simulated)) {
      throw new Error(`Contract simulation failed: ${simulated.error}`);
    }
    return { tx, simulated };
  }

  private async simulateRead<T>(
    sourcePublicKey: string,
    operation: xdr.Operation,
    decode: (native: unknown) => T
  ): Promise<T> {
    const { simulated } = await this.buildAndSimulate(sourcePublicKey, operation);
    if (!SorobanRpc.Api.isSimulationSuccess(simulated) || !simulated.result) {
      throw new Error("Contract simulation returned no result");
    }
    return decode(scValToNative(simulated.result.retval));
  }

  private async invoke<T>(
    signerKeypair: Keypair,
    operation: xdr.Operation,
    decode: (native: unknown) => T
  ): Promise<TxResult<T>> {
    const sourcePublicKey = signerKeypair.publicKey();
    const { tx, simulated } = await this.buildAndSimulate(sourcePublicKey, operation);

    if (!SorobanRpc.Api.isSimulationSuccess(simulated)) {
      throw new Error("Contract simulation did not succeed");
    }

    const prepared = SorobanRpc.assembleTransaction(tx, simulated).build();
    prepared.sign(signerKeypair);

    const sendResult = await this.server.sendTransaction(prepared);
    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
    }

    let response = await this.server.getTransaction(sendResult.hash);
    let attempts = 0;
    while (response.status === "NOT_FOUND" && attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      response = await this.server.getTransaction(sendResult.hash);
      attempts += 1;
    }

    if (response.status !== "SUCCESS") {
      throw new Error(`Transaction did not succeed (status=${response.status})`);
    }

    const returnValue =
      "returnValue" in response && response.returnValue
        ? decode(scValToNative(response.returnValue))
        : (undefined as T);

    return { hash: sendResult.hash, value: returnValue };
  }

  // ── Write calls ──────────────────────────────────────────────────────────

  async initialize(signerKeypair: Keypair, params: InitializeParams): Promise<TxResult<void>> {
    const op = this.contract.call(
      "initialize",
      nativeToScVal(params.admin, { type: "address" }),
      nativeToScVal(params.votingToken, { type: "address" }),
      nativeToScVal(params.minProposalBalance, { type: "i128" }),
      nativeToScVal(params.proposalCooldown, { type: "u64" }),
      nativeToScVal(params.minDuration, { type: "u64" }),
      nativeToScVal(params.maxDuration, { type: "u64" }),
      nativeToScVal(params.restrictAdminVote, { type: "bool" }),
      nativeToScVal(params.timelockDuration, { type: "u64" }),
      nativeToScVal(params.maxActiveProposals, { type: "u64" })
    );
    return this.invoke(signerKeypair, op, () => undefined);
  }

  async createProposal(signerKeypair: Keypair, params: CreateProposalParams): Promise<TxResult<bigint>> {
    const op = this.contract.call(
      "create_proposal",
      nativeToScVal(params.proposer, { type: "address" }),
      nativeToScVal(params.title, { type: "string" }),
      nativeToScVal(params.description, { type: "string" }),
      nativeToScVal(params.quorum, { type: "i128" }),
      nativeToScVal(params.durationSeconds, { type: "u64" })
    );
    return this.invoke(signerKeypair, op, (native) => BigInt(native as string | number | bigint));
  }

  /** Minimum resource fee (stroops) for cast_vote; simulates only, never submits. */
  async estimateCastVoteResourceFee(
    voter: string,
    proposalId: bigint,
    vote: "Yes" | "No" | "Abstain"
  ): Promise<bigint> {
    const op = this.contract.call(
      "cast_vote",
      nativeToScVal(voter, { type: "address" }),
      nativeToScVal(proposalId, { type: "u64" }),
      voteToScVal(vote),
      xdr.ScVal.scvVoid()
    );
    const { simulated } = await this.buildAndSimulate(voter, op);
    if (!SorobanRpc.Api.isSimulationSuccess(simulated)) {
      throw new Error("Contract simulation did not succeed");
    }
    return BigInt(simulated.minResourceFee);
  }

  async castVote(
    signerKeypair: Keypair,
    voter: string,
    proposalId: bigint,
    vote: "Yes" | "No" | "Abstain",
    commentHash?: string
  ): Promise<TxResult<void>> {
    const commentVal = commentHash
      ? nativeToScVal(commentHash, { type: "string" })
      : xdr.ScVal.scvVoid();
    const op = this.contract.call(
      "cast_vote",
      nativeToScVal(voter, { type: "address" }),
      nativeToScVal(proposalId, { type: "u64" }),
      voteToScVal(vote),
      commentVal
    );
    return this.invoke(signerKeypair, op, () => undefined);
  }

  async finalise(signerKeypair: Keypair, proposalId: bigint): Promise<TxResult<void>> {
    const op = this.contract.call("finalise", nativeToScVal(proposalId, { type: "u64" }));
    return this.invoke(signerKeypair, op, () => undefined);
  }

  async execute(signerKeypair: Keypair, admin: string, proposalId: bigint): Promise<TxResult<void>> {
    const op = this.contract.call(
      "execute",
      nativeToScVal(admin, { type: "address" }),
      nativeToScVal(proposalId, { type: "u64" })
    );
    return this.invoke(signerKeypair, op, () => undefined);
  }

  // ── Read-only calls ──────────────────────────────────────────────────────

  async getProposal(readAs: string, proposalId: bigint): Promise<Proposal> {
    const op = this.contract.call("get_proposal", nativeToScVal(proposalId, { type: "u64" }));
    return this.simulateRead(readAs, op, (native) => decodeProposal(native as Record<string, unknown>));
  }

  async listProposals(readAs: string, offset: bigint, limit: bigint): Promise<Proposal[]> {
    const op = this.contract.call(
      "list_proposals",
      nativeToScVal(offset, { type: "u64" }),
      nativeToScVal(limit, { type: "u64" })
    );
    return this.simulateRead(readAs, op, (native) =>
      (native as Record<string, unknown>[]).map(decodeProposal)
    );
  }

  async getConfig(readAs: string): Promise<ContractConfig> {
    const op = this.contract.call("get_config");
    const native = await this.simulateRead(readAs, op, (native) => native as Record<string, unknown>);
    return {
      admin: native.admin as string,
      votingToken: native.voting_token as string,
      minProposalBalance: BigInt(native.min_proposal_balance as string | number | bigint),
      proposalCooldown: BigInt(native.proposal_cooldown as string | number | bigint),
      restrictAdminVote: native.restrict_admin_vote as boolean,
      paused: native.paused as boolean,
      timelockDuration: BigInt(native.timelock_duration as string | number | bigint),
      minDuration: BigInt(native.min_duration as string | number | bigint),
      maxDuration: BigInt(native.max_duration as string | number | bigint),
      version: native.version as [number, number, number],
      minQuorumBps: native.min_quorum_bps as number,
    };
  }

  async hasVoted(readAs: string, proposalId: bigint, voter: string): Promise<boolean> {
    const op = this.contract.call(
      "has_voted",
      nativeToScVal(proposalId, { type: "u64" }),
      nativeToScVal(voter, { type: "address" })
    );
    return this.simulateRead(readAs, op, (native) => Boolean(native));
  }

  async getVote(readAs: string, proposalId: bigint, voter: string): Promise<VoteRecord | null> {
    const op = this.contract.call(
      "get_vote",
      nativeToScVal(proposalId, { type: "u64" }),
      nativeToScVal(voter, { type: "address" })
    );
    const native = await this.simulateRead(readAs, op, (native) => native);
    if (native == null) return null;
    return decodeVoteRecord(native as Record<string, unknown>);
  }
}

// Factory function to create ContractService from environment variables
export function createContractServiceFromEnv(): ContractService {
  const rpcUrl = getConfig().sorobanRpcUrl;
  const networkPassphrase = getConfig().networkPassphrase;
  const contractId = getConfig().governanceContractId;

  if (!contractId) {
    throw new Error("GOVERNANCE_CONTRACT_ID environment variable not set");
  }

  return new ContractService({
    rpcUrl,
    networkPassphrase,
    contractId,
  });
}