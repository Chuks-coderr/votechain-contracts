<!--
  Copyright 2024 VoteChain Contributors

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

# Proposal Tag Taxonomy

This document defines the predefined tag set for VoteChain governance proposals. Tags help
participants categorise proposals, filter the proposal list, and understand the nature and
urgency of each governance action at a glance.

---

## Predefined Tags

| Name        | Description                                                                                           | Example Use Case                                                          |
|-------------|-------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| `treasury`  | Proposals that allocate, transfer, or otherwise affect DAO treasury funds.                            | "Allocate 500,000 VOTE to Q4 marketing budget"                            |
| `technical` | Proposals involving contract upgrades, parameter changes, or other technical protocol modifications.  | "Upgrade governance contract to v1.2 with delegation support"             |
| `community` | Proposals focused on community programmes, events, partnerships, or social initiatives.               | "Sponsor ETH Global hackathon and fund travel grants for 10 contributors" |
| `security`  | Proposals that address security vulnerabilities, audits, or incident response.                        | "Fund third-party audit of the updated token contract"                    |
| `emergency` | Time-sensitive proposals requiring rapid action to prevent harm or mitigate an ongoing incident.      | "Pause contract after detection of re-entrancy vector"                    |
| `meta`      | Proposals that modify governance rules, voting parameters, or the tagging taxonomy itself.            | "Lower quorum threshold from 10 M to 5 M tokens"                         |
| `protocol`  | Proposals that affect on-chain protocol behaviour, fee structures, or integration standards.          | "Adopt SEP-41 allowance extension for DEX compatibility"                  |
| `grants`    | Proposals that award grants, bounties, or contributor compensation from the DAO.                      | "Award 50,000 VOTE grant to open-source indexer maintainer"               |

---

## Tagging Rules

1. **Maximum tags per proposal:** 5
2. **Tag length:** each tag must be between 1 and 32 characters (inclusive).
3. **Character set:** alphanumeric characters (`a–z`, `A–Z`, `0–9`) and hyphens (`-`) only.
   Spaces, underscores, and other special characters are not permitted.
4. **Case-insensitive:** `Treasury`, `treasury`, and `TREASURY` are treated as the same tag.
   Tags are normalised to lowercase before storage and comparison.
5. **Free-form tags:** in addition to the predefined set above, proposers may supply
   custom tags as long as they satisfy rules 2–4. Off-chain tooling and the frontend
   will display predefined tags with richer labels; custom tags are shown as-is.
6. **Duplicate tags** within a single proposal are ignored (deduplicated on write).

---

## Future Governance of the Taxonomy

The predefined tag set listed above is managed off-chain today (via a PR to this file).
A future meta-governance proposal may migrate tag taxonomy management fully on-chain,
allowing token holders to vote on additions, deprecations, and renames. Until that
proposal passes, changes to this document require a PR reviewed and merged by at least
one maintainer.

If you believe a new predefined tag should be added, open a GitHub Discussion and
tag it with the `governance` and `meta` labels.
