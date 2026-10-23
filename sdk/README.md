# @votechain/sdk

Typed TypeScript SDK for the VoteChain governance Soroban contract. Wraps
manual XDR construction and Soroban RPC calls behind typed methods so
integrators do not need to hand-build contract invocations.

## Install

```bash
npm install @votechain/sdk
```

## Usage

```ts
import { VoteChainClient, RawKeySigner, Networks } from "@votechain/sdk";

const client = new VoteChainClient({
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  contractId: "C...", // from config/testnet.toml
});

// Raw secret key signing (server-side scripts, tests):
const signer = new RawKeySigner("S...");

// Or Freighter wallet signing in a browser:
// import * as freighterApi from "@stellar/freighter-api";
// const signer = new FreighterSigner(freighterApi);

const voter = await signer.publicKey();
await client.castVote(signer, { voter, proposalId: 1n, vote: "Yes" });

const proposal = await client.getProposal(voter, 1n);
console.log(proposal.title, proposal.state);
```

## API

- `initialize(signer, params)`
- `createProposal(signer, params) -> { hash, value: proposalId }`
- `castVote(signer, params)` — `params.commentHash` is optional (issue #103)
- `finalise(signer, proposalId)`
- `getProposal(readAs, proposalId) -> Proposal`
- `listProposals(readAs, offset, limit) -> Proposal[]`
- `hasVoted(readAs, proposalId, voter) -> boolean`
- `getVote(readAs, proposalId, voter) -> VoteRecord | null`

All returned objects are fully typed (no `any`); `i128`/`u64` contract
fields are returned as `bigint`.

See `docs/examples/javascript.md` for a full walkthrough, including how the
raw XDR pattern this SDK wraps looks without it.
