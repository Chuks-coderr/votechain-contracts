# Vote comments and IPFS pinning (issue #103)

`cast_vote` accepts an optional `comment_hash: Option<String>` — an IPFS CID
(max 64 bytes) that lets a voter attach rationale for their vote. The
governance contract does **not** validate the hash: it only enforces the
64-byte length cap (`ContractError::CommentHashTooLong`, error code 48). Trust
in the comment's integrity and availability comes entirely from IPFS's
content-addressing, not from on-chain checks.

This means comment content must be uploaded to IPFS (and pinned so it stays
retrievable) **before** the voter calls `cast_vote` with the resulting CID.
VoteChain does not run its own pinning service; integrators are expected to
use an existing pinning provider. The recommended flow:

## Off-chain upload flow

1. The voter writes their comment (plain text or a small JSON document) in
   the client app.
2. Before submitting the vote transaction, the client uploads the comment to
   an IPFS pinning service and receives back a CID:
   - [Pinata](https://www.pinata.cloud/) — `POST /pinning/pinFileToIPFS` or
     `pinJSONToIPFS` via their REST API or `@pinata/sdk`.
   - [web3.storage](https://web3.storage/) — `client.put([file])` via
     `@web3-storage/w3up-client`.
   - [Infura IPFS](https://www.infura.io/product/ipfs) — `POST /api/v0/add`.
   - A self-hosted `kubo` (go-ipfs) node with `ipfs add` + `ipfs pin add`.
3. The client passes the returned CID as `comment_hash` to `cast_vote`:
   ```ts
   await sdk.castVote({
     proposalId,
     vote: "Yes",
     commentHash: cid, // e.g. "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
   });
   ```
4. Once the vote is on-chain, any reader (frontend, indexer, other
   integrators) can resolve the CID through any public or private IPFS
   gateway, e.g. `https://ipfs.io/ipfs/<cid>` or `https://<cid>.ipfs.dweb.link`.

## Trust model and caveats

- The contract stores the CID string only — it never fetches or verifies
  IPFS content. A malicious or careless voter can submit any string up to 64
  bytes; the frontend must treat resolved content as untrusted user input
  (do not render it as raw HTML).
- If the comment is never pinned (or the pin later expires/is garbage
  collected), the CID becomes unresolvable — the vote itself remains valid
  and unaffected on-chain, only the comment link breaks.
- Because pinning is off-chain, there is no guarantee of long-term
  availability unless the integrator (or a third-party pinning service) keeps
  the content pinned. Projects that need durability should pin to more than
  one provider or use a persistent pinning service with an SLA.
