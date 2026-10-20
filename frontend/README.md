# VoteChain Frontend — Proposals Page

A lightweight React + Vite frontend for browsing governance proposals: state badges, vote
summaries, countdown timers for active proposals, wallet connection, and vote history.

## Structure

```
frontend/
├── index.html             # Main HTML entry point
├── src/
│   ├── App.tsx            # Root component; renders TransactionToast at app root
│   ├── main.tsx           # ReactDOM entry
│   ├── proposals.ts       # Proposal rendering, filtering, pagination, countdown logic
│   ├── types.ts           # Shared TypeScript types (Proposal, RawProposal, etc.)
│   ├── data.ts            # Static data helpers
│   ├── index.css          # Base styles
│   ├── styles.css         # All styles (WCAG 2.1 AA compliant)
│   ├── components/
│   │   ├── ErrorBoundary.tsx      # Error boundary with fallback card and Report issue link
│   │   ├── TransactionToast.tsx   # Transaction status toast (pending/confirmed/failed)
│   │   ├── FreighterWallet.tsx    # Freighter wallet connector
│   │   ├── ProposalList.tsx       # Proposal list component
│   │   └── VoteHistory.tsx        # Wallet vote history view
│   ├── hooks/
│   │   └── useTransactionStatus.ts  # Hook for polling Horizon transaction status
│   ├── pages/
│   │   ├── GovernanceDashboard.tsx
│   │   ├── ProposalDetail.tsx
│   │   ├── ProposalList.tsx
│   │   └── VotingPanel.tsx
│   └── utils/
│       └── csv.ts
└── scripts/
    └── bundle-size.js     # Bundle size checker (enforces 250 KB gzip limit)
```

## Running locally

```bash
cd frontend
npm install
npm run dev
```

Or build for production:

```bash
npm run build
npm run preview
```

## Component playground (Storybook)

Browse and interact with shared UI components in isolation:

```bash
npm run storybook
```

Opens at http://localhost:6006. Stories live next to each component as `*.stories.tsx`.

To build a static Storybook snapshot (e.g. for CI artefacts):

```bash
npm run build-storybook
# output → frontend/storybook-static/
```

## Connecting to a live contract

In `src/proposals.ts`, replace the `MOCK_PROPOSALS` array with a real fetch from your
Stellar RPC endpoint. The expected shape of each proposal object matches the on-chain
`Proposal` struct (see `src/types.ts` → `RawProposal`):

```ts
{
  id:            number,   // u64 from contract
  title:         string,
  proposer:      string,   // Stellar address (G...)
  votes_yes:     number,
  votes_no:      number,
  votes_abstain: number,
  quorum:        number,
  start_time:    number,   // Unix timestamp (seconds)
  end_time:      number,   // Unix timestamp (seconds)
  state:         'Active' | 'Passed' | 'Rejected' | 'Executed' | 'Cancelled',
  execute_after: number,   // Unix timestamp; 0 if not applicable
}
```

## Accessing Stellar Explorer

### Overview

The frontend includes utilities for generating and linking to [Stellar Expert](https://stellar.expert/) (or custom explorer domains) to view transaction provenance and account details.

### Configuration

Set the Stellar network in your `.env`:

```bash
# For testnet (default)
VITE_STELLAR_NETWORK=testnet

# For public network (mainnet)
VITE_STELLAR_NETWORK=public

# For custom explorer (e.g., private networks)
VITE_STELLAR_EXPLORER_DOMAIN=steexp.com
```

### Using Explorer Links

#### Utility Functions

```typescript
import {
  getTransactionExplorerUrl,
  getAccountExplorerUrl,
  openTransactionInExplorer,
  openAccountInExplorer,
  truncateAddress,
} from '@/utils/explorer';

// Generate URLs
const txUrl = getTransactionExplorerUrl('abc123def...');
const accountUrl = getAccountExplorerUrl('GXXXXXX...');

// Open in new tab
openTransactionInExplorer('abc123def...');
openAccountInExplorer('GXXXXXX...');

// Truncate for display
const short = truncateAddress('GXXXXXX...', 6, 4);  // → 'GXXXXX...XXXX'
```

#### React Hook

```typescript
import { useExplorerLink } from '@/hooks/useExplorerLink';

export function MyComponent() {
  const { 
    getTransactionUrl, 
    getAccountUrl, 
    openTransaction,
    openAccount,
  } = useExplorerLink();

  return (
    <>
      <button onClick={() => openTransaction('txhash...')}>
        View Transaction
      </button>
      <a href={getAccountUrl('GXXXXXX...')} target="_blank" rel="noreferrer noopener">
        View Account
      </a>
    </>
  );
}
```

#### React Components

```typescript
import { TransactionLink, AccountLink } from '@/components/ExplorerLink';
import { getTransactionExplorerUrl, getAccountExplorerUrl } from '@/utils/explorer';

export function ProposalCard() {
  return (
    <div>
      <TransactionLink
        txHash="abc123def..."
        explorerUrl={getTransactionExplorerUrl('abc123def...')}
      />
      
      <AccountLink
        accountAddress="GXXXXXX..."
        explorerUrl={getAccountExplorerUrl('GXXXXXX...')}
        className="proposer-link"
      />
    </div>
  );
}
```

### Security

All explorer links:
- Open in a new tab (`target="_blank"`)
- Include `rel="noreferrer noopener"` to prevent `window.opener` access
- Are validated against Stellar address format before rendering
- Support custom explorer domains for private networks

### Examples

Display truncated transaction hash as link:

```typescript
<a 
  href={getTransactionExplorerUrl(txHash)}
  target="_blank" 
  rel="noreferrer noopener"
>
  {truncateAddress(txHash, 8, 6)}  // → 'abcd...cdef'
</a>
```

Display full account address with tooltip:

```typescript
<a 
  href={getAccountExplorerUrl(proposer)}
  target="_blank" 
  rel="noreferrer noopener"
  title={`View account: ${proposer}`}
>
  {truncateAddress(proposer)}  // → 'GXXXXX...XXXX'
</a>
```

## Accessibility

- WCAG 2.1 AA compliant
- All colour combinations meet ≥ 4.5:1 contrast ratio
- Skip-to-content link for keyboard users
- `aria-live` regions for dynamic content updates
- `aria-pressed` on filter toggle buttons
- `aria-label` on all interactive and informational elements
- Fully keyboard navigable
- Respects `prefers-reduced-motion`

The React entry point runs `@axe-core/react` only in development mode. CI builds
the production preview and runs `npm run audit:a11y`; the axe command fails the
job when it finds WCAG violations. Keep text and badge foreground/background
pairs at a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large
text or UI components in both light and dark themes.

## Network configuration

The target Stellar network is set at build time via `VITE_STELLAR_NETWORK`:

| Value | Behaviour |
|-------|-----------|
| `TESTNET` (default) | Warns if the connected Freighter wallet is on mainnet (`PUBLIC`), to prevent accidental mainnet fees. |
| `MAINNET` | Shows a prominent warning if the wallet is on testnet or any non-mainnet network. |

```bash
VITE_STELLAR_NETWORK=MAINNET npm run build
```

The warning can be dismissed, but it is shown again every time the wallet reconnects.

## Security: rendering user content

Proposal titles and descriptions are user-supplied. Always render them as JSX text
nodes — never with `dangerouslySetInnerHTML`. The ESLint rule `react/no-danger` is
enabled to enforce this. If rich-text rendering is ever required, sanitise the HTML
with `dompurify` using an explicit tag/attribute allowlist before rendering.
