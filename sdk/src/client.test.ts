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
 * Issue #296 – SDK unit tests with mocked Stellar RPC
 *
 * VoteChainClient wraps raw Soroban-RPC calls.  These tests mock
 * `SorobanRpc.Server` and its responses so no live Stellar node is required.
 *
 * Coverage:
 *  - getProposal: success, simulation error, network timeout, missing result
 *  - listProposals: success, RPC error
 *  - castVote: success (poll loop), submission ERROR status, invalid response
 *  - hasVoted: true/false
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import {
  SorobanRpc,
  nativeToScVal,
  xdr,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { VoteChainClient, type VoteChainClientConfig } from "./client.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_CONTRACT_ID =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_RPC_URL = "https://soroban-testnet.stellar.org";
const TEST_PASSPHRASE = "Test SDF Network ; September 2015";
const TEST_ACCOUNT =
  "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

const CLIENT_CONFIG: VoteChainClientConfig = {
  rpcUrl: TEST_RPC_URL,
  networkPassphrase: TEST_PASSPHRASE,
  contractId: TEST_CONTRACT_ID,
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Returns a plain object that mirrors what scValToNative returns for a Proposal. */
function makeProposalNative(id = 1n): Record<string, unknown> {
  return {
    id,
    proposer: TEST_ACCOUNT,
    title: "Test proposal",
    description: "A governance description",
    votes_yes: 100n,
    votes_no: 0n,
    votes_abstain: 0n,
    quorum: 50n,
    start_time: 0n,
    end_time: 9_999_999n,
    state: "Active",
    execute_after: 0n,
    supply_snapshot: 1_000_000n,
  };
}

/** A minimal mock Signer that signs by returning the XDR unchanged. */
const mockSigner = {
  publicKey: vi.fn().mockResolvedValue(TEST_ACCOUNT),
  signTransaction: vi.fn().mockImplementation(async (xdrStr: string) => xdrStr),
};

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

let mockServer: {
  getAccount: MockInstance;
  simulateTransaction: MockInstance;
  sendTransaction: MockInstance;
  getTransaction: MockInstance;
};

// Spy stubs for SorobanRpc static helpers – set per test as needed.
let isSimulationErrorSpy: MockInstance;
let isSimulationSuccessSpy: MockInstance;
let assembleTransactionSpy: MockInstance;

beforeEach(() => {
  // Fresh mock server instance for every test.
  mockServer = {
    getAccount: vi.fn().mockResolvedValue({
      id: TEST_ACCOUNT,
      sequence: "100",
      accountId: () => TEST_ACCOUNT,
      incrementSequenceNumber: () => {},
      sequenceNumber: () => "100",
    }),
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getTransaction: vi.fn(),
  };

  // Inject mock server via the constructor spy.
  vi.spyOn(SorobanRpc, "Server" as keyof typeof SorobanRpc).mockImplementation(
    () => mockServer as unknown as SorobanRpc.Server
  );

  // Default: no simulation errors.
  isSimulationErrorSpy = vi
    .spyOn(SorobanRpc.Api, "isSimulationError")
    .mockReturnValue(false);
  isSimulationSuccessSpy = vi
    .spyOn(SorobanRpc.Api, "isSimulationSuccess")
    .mockReturnValue(true);

  // assembleTransaction returns a builder with a minimal build/toXDR stub.
  assembleTransactionSpy = vi
    .spyOn(SorobanRpc, "assembleTransaction")
    .mockReturnValue({
      build: () => ({
        toXDR: () => "MOCK_XDR_BASE64",
      }),
    } as unknown as ReturnType<typeof SorobanRpc.assembleTransaction>);

  // TransactionBuilder.fromXDR: return a minimal object.
  vi.spyOn(TransactionBuilder, "fromXDR").mockReturnValue({
    toXDR: () => "MOCK_XDR_BASE64",
  } as unknown as ReturnType<typeof TransactionBuilder.fromXDR>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a successful simulation response for a read-only call. */
function makeSimSuccess(native: unknown) {
  return {
    result: { retval: nativeToScVal(native) },
    minResourceFee: "100",
    cost: { cpuInsns: "0", memBytes: "0" },
    transactionData: "",
    latestLedger: 1000,
  } as unknown as SorobanRpc.Api.SimulateTransactionSuccessResponse;
}

/** Build a simulation error response. */
function makeSimError(message = "Contract error") {
  return {
    error: message,
    latestLedger: 1000,
  } as unknown as SorobanRpc.Api.SimulateTransactionErrorResponse;
}

// ---------------------------------------------------------------------------
// getProposal
// ---------------------------------------------------------------------------

describe("VoteChainClient.getProposal", () => {
  it("decodes a successful simulation into a Proposal object", async () => {
    const native = makeProposalNative();
    mockServer.simulateTransaction.mockResolvedValue(makeSimSuccess(native));

    const client = new VoteChainClient(CLIENT_CONFIG);
    const proposal = await client.getProposal(TEST_ACCOUNT, 1n);

    expect(proposal.id).toBe(1n);
    expect(proposal.title).toBe("Test proposal");
    expect(proposal.description).toBe("A governance description");
    expect(proposal.state).toBe("Active");
    expect(proposal.votesYes).toBe(100n);
    expect(proposal.quorum).toBe(50n);
    expect(mockServer.getAccount).toHaveBeenCalledWith(TEST_ACCOUNT);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it("throws when the simulation returns an error response", async () => {
    mockServer.simulateTransaction.mockResolvedValue(
      makeSimError("Contract not found")
    );
    isSimulationErrorSpy.mockReturnValue(true);
    isSimulationSuccessSpy.mockReturnValue(false);

    const client = new VoteChainClient(CLIENT_CONFIG);
    await expect(client.getProposal(TEST_ACCOUNT, 1n)).rejects.toThrow(
      "simulation failed"
    );
  });

  it("throws when the network request rejects (RPC timeout)", async () => {
    mockServer.simulateTransaction.mockRejectedValue(
      new Error("Network timeout")
    );

    const client = new VoteChainClient(CLIENT_CONFIG);
    await expect(client.getProposal(TEST_ACCOUNT, 1n)).rejects.toThrow(
      "Network timeout"
    );
  });

  it("throws when simulation succeeds but returns no result value", async () => {
    // Success shape but `result` is missing.
    mockServer.simulateTransaction.mockResolvedValue({
      minResourceFee: "100",
      cost: { cpuInsns: "0", memBytes: "0" },
      transactionData: "",
      latestLedger: 1000,
    } as unknown as SorobanRpc.Api.SimulateTransactionSuccessResponse);

    const client = new VoteChainClient(CLIENT_CONFIG);
    await expect(client.getProposal(TEST_ACCOUNT, 1n)).rejects.toThrow(
      "simulation returned no result"
    );
  });
});

// ---------------------------------------------------------------------------
// listProposals
// ---------------------------------------------------------------------------

describe("VoteChainClient.listProposals", () => {
  it("returns an array of decoded Proposal objects", async () => {
    const proposals = [makeProposalNative(1n), makeProposalNative(2n)];
    mockServer.simulateTransaction.mockResolvedValue(
      makeSimSuccess(proposals)
    );

    const client = new VoteChainClient(CLIENT_CONFIG);
    const result = await client.listProposals(TEST_ACCOUNT, 0n, 10n);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1n);
    expect(result[1].id).toBe(2n);
  });

  it("returns an empty array when the contract returns an empty vec", async () => {
    mockServer.simulateTransaction.mockResolvedValue(makeSimSuccess([]));

    const client = new VoteChainClient(CLIENT_CONFIG);
    const result = await client.listProposals(TEST_ACCOUNT, 0n, 10n);
    expect(result).toHaveLength(0);
  });

  it("throws on RPC error during listProposals", async () => {
    mockServer.simulateTransaction.mockResolvedValue(makeSimError("RPC error"));
    isSimulationErrorSpy.mockReturnValue(true);
    isSimulationSuccessSpy.mockReturnValue(false);

    const client = new VoteChainClient(CLIENT_CONFIG);
    await expect(
      client.listProposals(TEST_ACCOUNT, 0n, 10n)
    ).rejects.toThrow("simulation failed");
  });
});

// ---------------------------------------------------------------------------
// castVote
// ---------------------------------------------------------------------------

describe("VoteChainClient.castVote", () => {
  function setupVoteSimSuccess() {
    mockServer.simulateTransaction.mockResolvedValue({
      result: { retval: xdr.ScVal.scvVoid() },
      minResourceFee: "100",
      cost: { cpuInsns: "0", memBytes: "0" },
      transactionData: "",
      latestLedger: 1000,
    } as unknown as SorobanRpc.Api.SimulateTransactionSuccessResponse);
  }

  it("polls until SUCCESS and returns the tx hash", async () => {
    setupVoteSimSuccess();

    mockServer.sendTransaction.mockResolvedValue({
      status: "PENDING",
      hash: "txhash_abc123",
    } as unknown as SorobanRpc.Api.SendTransactionResponse);

    mockServer.getTransaction
      .mockResolvedValueOnce({
        status: "NOT_FOUND",
      } as SorobanRpc.Api.GetTransactionResponse)
      .mockResolvedValue({
        status: "SUCCESS",
        returnValue: xdr.ScVal.scvVoid(),
      } as unknown as SorobanRpc.Api.GetTransactionResponse);

    const client = new VoteChainClient(CLIENT_CONFIG);
    const result = await client.castVote(mockSigner, {
      voter: TEST_ACCOUNT,
      proposalId: 1n,
      vote: "Yes",
    });

    expect(result.hash).toBe("txhash_abc123");
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(1);
    // At least two getTransaction polls (NOT_FOUND then SUCCESS).
    expect(mockServer.getTransaction).toHaveBeenCalledTimes(2);
  });

  it("throws when sendTransaction returns ERROR status", async () => {
    setupVoteSimSuccess();

    mockServer.sendTransaction.mockResolvedValue({
      status: "ERROR",
      errorResult: { code: "txFailed" },
    } as unknown as SorobanRpc.Api.SendTransactionResponse);

    const client = new VoteChainClient(CLIENT_CONFIG);
    await expect(
      client.castVote(mockSigner, {
        voter: TEST_ACCOUNT,
        proposalId: 1n,
        vote: "Yes",
      })
    ).rejects.toThrow("submission failed");
  });

  it("throws when simulation fails for castVote", async () => {
    mockServer.simulateTransaction.mockResolvedValue(
      makeSimError("Contract paused")
    );
    isSimulationErrorSpy.mockReturnValue(true);
    isSimulationSuccessSpy.mockReturnValue(false);

    const client = new VoteChainClient(CLIENT_CONFIG);
    await expect(
      client.castVote(mockSigner, {
        voter: TEST_ACCOUNT,
        proposalId: 1n,
        vote: "No",
      })
    ).rejects.toThrow("simulation failed");
  });
});

// ---------------------------------------------------------------------------
// hasVoted
// ---------------------------------------------------------------------------

describe("VoteChainClient.hasVoted", () => {
  it("returns true when the RPC simulation returns a truthy boolean", async () => {
    mockServer.simulateTransaction.mockResolvedValue(
      makeSimSuccess(true)
    );

    const client = new VoteChainClient(CLIENT_CONFIG);
    const result = await client.hasVoted(TEST_ACCOUNT, 1n, TEST_ACCOUNT);
    expect(result).toBe(true);
  });

  it("returns false when the RPC simulation returns false", async () => {
    mockServer.simulateTransaction.mockResolvedValue(
      makeSimSuccess(false)
    );

    const client = new VoteChainClient(CLIENT_CONFIG);
    const result = await client.hasVoted(TEST_ACCOUNT, 1n, TEST_ACCOUNT);
    expect(result).toBe(false);
  });

  it("throws on simulation error", async () => {
    mockServer.simulateTransaction.mockResolvedValue(
      makeSimError("Invalid contract")
    );
    isSimulationErrorSpy.mockReturnValue(true);
    isSimulationSuccessSpy.mockReturnValue(false);

    const client = new VoteChainClient(CLIENT_CONFIG);
    await expect(
      client.hasVoted(TEST_ACCOUNT, 1n, TEST_ACCOUNT)
    ).rejects.toThrow("simulation failed");
  });
});
