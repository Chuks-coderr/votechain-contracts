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

import type { Proposal } from './types';

export const sampleProposals: Proposal[] = [
  {
    id: 'P-101',
    title: 'Launch cross-chain governance module',
    description: 'Enable cross-chain voting and proposal execution for greater participation.',
    state: 'Active',
    createdAt: '2026-04-10',
    endAt: '2026-05-08',
    votesCount: 68,
    totalWeight: 7120,
    votes: [
      { address: 'GCFX4Q...', type: 'For', weight: 1920, votedAt: '2026-04-14' },
      { address: 'GB3K7J...', type: 'Against', weight: 320, votedAt: '2026-04-16' },
      { address: 'GDQNS6...', type: 'For', weight: 120, votedAt: '2026-04-18' }
    ]
  },
  {
    id: 'P-102',
    title: 'Reduce proposal quorum threshold',
    description: 'Lower the quorum required to finalise proposals and improve governance velocity.',
    state: 'Passed',
    createdAt: '2026-02-02',
    endAt: '2026-02-20',
    votesCount: 112,
    totalWeight: 11240,
    votes: [
      { address: 'GCFX4Q...', type: 'For', weight: 2300, votedAt: '2026-02-05' },
      { address: 'GB3K7J...', type: 'For', weight: 1800, votedAt: '2026-02-06' }
    ]
  },
  {
    id: 'P-103',
    title: 'Add vote delegation support',
    description: 'Allow token holders to delegate their voting power to trusted delegates.',
    state: 'Rejected',
    createdAt: '2026-01-15',
    endAt: '2026-02-01',
    votesCount: 41,
    totalWeight: 5410,
    votes: [
      { address: 'GCFX4Q...', type: 'Against', weight: 720, votedAt: '2026-01-20' },
      { address: 'GDQNS6...', type: 'For', weight: 510, votedAt: '2026-01-18' }
    ]
  },
  {
    id: 'P-104',
    title: 'Enable finalized execution notifications',
    description: 'Send on-chain notifications when proposals are executed or cancelled.',
    state: 'Executed',
    createdAt: '2025-12-05',
    endAt: '2025-12-25',
    votesCount: 89,
    totalWeight: 9690,
    votes: [
      { address: 'GB3K7J...', type: 'For', weight: 980, votedAt: '2025-12-12' },
      { address: 'GDQNS6...', type: 'For', weight: 450, votedAt: '2025-12-14' }
    ]
  },
  {
    id: 'P-105',
    title: 'Improve token minting authorisation flow',
    description: 'Refine the authorization flow for token minting and burn operations.',
    state: 'Cancelled',
    createdAt: '2025-11-20',
    endAt: '2025-12-10',
    votesCount: 25,
    totalWeight: 2400,
    votes: [
      { address: 'GCFX4Q...', type: 'Abstain', weight: 140, votedAt: '2025-11-22' }
    ]
  }
];
