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
 * Helpers for rendering the optional IPFS comment hash attached to a vote
 * (issue #103). The chain stores only the CID string — it does not validate
 * or resolve it. Resolution/display is entirely an off-chain concern.
 */

/** Default public IPFS gateway used to resolve a CID for display. */
const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/**
 * Returns `true` if `commentHash` is a non-empty string, i.e. the voter
 * attached an off-chain comment to their vote.
 */
export function hasComment(commentHash: string | null | undefined): commentHash is string {
  return typeof commentHash === 'string' && commentHash.trim().length > 0;
}

/**
 * Builds a clickable gateway URL for a given IPFS CID.
 *
 * This does not verify that the CID is well-formed or that content exists
 * at the resulting URL — the contract does not validate comment hashes
 * on-chain, so the link may 404 if the content was never pinned.
 */
export function ipfsGatewayUrl(commentHash: string, gateway: string = DEFAULT_IPFS_GATEWAY): string {
  return `${gateway}${commentHash.trim()}`;
}
