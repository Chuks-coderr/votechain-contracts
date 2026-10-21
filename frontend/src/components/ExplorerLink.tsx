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
 * ExplorerLink Component
 * 
 * Reusable component for rendering links to Stellar Explorer.
 * Automatically opens in a new tab with appropriate security headers.
 */

import React, { ReactNode } from 'react';
import { truncateAddress } from '../utils/explorer';

interface ExplorerLinkProps {
  /** URL to the explorer */
  href: string;
  /** Display text (truncated if address) */
  children: ReactNode;
  /** Optional CSS class */
  className?: string;
  /** Optional title/tooltip */
  title?: string;
  /** Whether to truncate long addresses (default: true) */
  truncate?: boolean;
}

/**
 * Link to Stellar Explorer
 * Opens in new tab with rel='noreferrer noopener' for security
 */
export const ExplorerLink: React.FC<ExplorerLinkProps> = ({
  href,
  children,
  className,
  title,
  truncate = true,
}) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
      title={title}
    >
      {typeof children === 'string' && truncate
        ? truncateAddress(children)
        : children}
    </a>
  );
};

interface TransactionLinkProps {
  /** Transaction hash */
  txHash: string;
  /** Explorer URL (use getTransactionExplorerUrl utility) */
  explorerUrl: string;
  /** Optional CSS class */
  className?: string;
  /** Display text (defaults to truncated txHash) */
  children?: ReactNode;
}

/**
 * Transaction link component
 * Displays transaction hash as clickable link to explorer
 */
export const TransactionLink: React.FC<TransactionLinkProps> = ({
  txHash,
  explorerUrl,
  className,
  children,
}) => {
  return (
    <ExplorerLink
      href={explorerUrl}
      className={className}
      title={`View transaction: ${txHash}`}
      truncate={false}
    >
      {children || truncateAddress(txHash, 8, 6)}
    </ExplorerLink>
  );
};

interface AccountLinkProps {
  /** Account public key */
  accountAddress: string;
  /** Explorer URL (use getAccountExplorerUrl utility) */
  explorerUrl: string;
  /** Optional CSS class */
  className?: string;
  /** Display text (defaults to truncated address) */
  children?: ReactNode;
  /** Whether to truncate (default: true) */
  truncate?: boolean;
}

/**
 * Account link component
 * Displays account address as clickable link to explorer
 */
export const AccountLink: React.FC<AccountLinkProps> = ({
  accountAddress,
  explorerUrl,
  className,
  children,
  truncate = true,
}) => {
  return (
    <ExplorerLink
      href={explorerUrl}
      className={className}
      title={`View account: ${accountAddress}`}
      truncate={truncate}
    >
      {children || accountAddress}
    </ExplorerLink>
  );
};
