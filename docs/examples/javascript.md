# JavaScript Examples — Governance Contract

These examples use `@votechain/sdk` (issue #108) to interact with a deployed
VoteChain governance contract on Stellar Testnet. The SDK wraps the manual
XDR construction and raw Soroban RPC calls shown in the "Without the SDK"
section below, so integrators normally never need to write that code
themselves.

---

## Setup

```bash
npm install @votechain/sdk
```

```js
import { VoteChainClient, RawKeySigner, FreighterSigner, Networks } from "@votechain/sdk";

const GOVERNANCE_CONTRACT_ID = "C..."; // from config/testnet.toml

const client = new VoteChainClient({
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  contractId: GOVERNANCE_CONTRACT_ID,
});

// Signing option 1: raw secret key (server-side scripts, tests only —
// never expose a secret key in a browser context).
const signer = new RawKeySigner("S..."); // signer

// Signing option 2: Freighter wallet, for browser apps.
// import * as freighterApi from "@stellar/freighter-api";
// const signer = new FreighterSigner(freighterApi);
```

---

## initialize

```js
await client.initialize(signer, {
  admin: await signer.publicKey(),
  votingToken: "C...<TOKEN_CONTRACT_ID>",
  minProposalBalance: 0n,
  proposalCooldown: 0n,
  minDuration: 3600n,
  maxDuration: 2_592_000n,
  restrictAdminVote: false,
  timelockDuration: 0n,
  maxActiveProposals: 0n, // 0 = use the contract default of 50
});
```

---

## createProposal

```js
const { hash, value: proposalId } = await client.createProposal(signer, {
  proposer: await signer.publicKey(),
  title: "Increase treasury allocation",
  description: "Allocate 10% more to the dev fund",
  quorum: 1000n,
  durationSeconds: 604800n, // 7 days
});

console.log(`Created proposal ${proposalId} in tx ${hash}`);
```

---

## castVote

```js
const voter = await signer.publicKey();

await client.castVote(signer, {
  voter,
  proposalId: 1n,
  vote: "Yes", // "Yes" | "No" | "Abstain"
});

// Optionally attach an off-chain comment CID (issue #103). The chain does
// not validate the hash — pin the comment to IPFS first, see
// docs/comment-pinning.md.
await client.castVote(signer, {
  voter,
  proposalId: 1n,
  vote: "Yes",
  commentHash: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
});
```

---

## finalise

```js
// Call after the voting period has ended.
await client.finalise(signer, 1n);
```

---

## Read-only calls

```js
const readAs = await signer.publicKey(); // any funded account works for simulated reads

const proposal = await client.getProposal(readAs, 1n);
console.log(proposal.title, proposal.state, proposal.votesYes);

const proposals = await client.listProposals(readAs, 0n, 50n);

const voted = await client.hasVoted(readAs, 1n, voter);

const record = await client.getVote(readAs, 1n, voter);
if (record) {
  console.log(record.voteType, record.weight, record.commentHash);
}
```

---

## Notes

- Replace `"C..."` and `"S..."` with values from `config/testnet.toml` and
  your funded testnet keypair.
- Fund a testnet account at [https://friendbot.stellar.org](https://friendbot.stellar.org/?addr=<YOUR_ADDRESS>).
- `i128`/`u64` contract fields (`quorum`, `votesYes`, proposal IDs, …) are
  returned as `bigint`.
- See `sdk/README.md` for the full API surface.

---

## Without the SDK (raw `@stellar/stellar-sdk`)

This is the manual pattern `@votechain/sdk` wraps — kept here for anyone
who needs to construct calls the SDK does not yet cover, or wants to see
what is happening under the hood.

```bash
npm install @stellar/stellar-sdk
```

```js
import {
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const GOVERNANCE_CONTRACT_ID = "C..."; // from config/testnet.toml

const server = new SorobanRpc.Server(RPC_URL);
const contract = new Contract(GOVERNANCE_CONTRACT_ID);
const keypair = Keypair.fromSecret("S..."); // signer

/** Build, simulate, sign, and submit a contract call. */
async function invoke(operation) {
  const account = await server.getAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(keypair);

  const sendResult = await server.sendTransaction(preparedTx);
  if (sendResult.status === "ERROR") throw new Error(sendResult.errorResult);

  // Poll for confirmation
  let response;
  do {
    await new Promise((r) => setTimeout(r, 1000));
    response = await server.getTransaction(sendResult.hash);
  } while (response.status === "NOT_FOUND");

  return response;
}

async function castVote(voterKeypair, proposalId, vote) {
  const voteVal = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(vote)]); // "Yes" | "No" | "Abstain"
  const op = contract.call(
    "cast_vote",
    nativeToScVal(voterKeypair.publicKey(), { type: "address" }),
    nativeToScVal(proposalId, { type: "u64" }),
    voteVal,
    xdr.ScVal.scvVoid() // no comment hash
  );
  return invoke(op);
}

await castVote(keypair, 1n, "Yes");
```
