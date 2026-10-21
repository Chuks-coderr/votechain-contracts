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
 * React Hook for Stellar Explorer links
 * 
 * Provides a reusable hook for generating and opening explorer links
 * with support for custom explorer domains.
 */

import { useCallback, useMemo } from 'react';
import {
  getTransactionExplorerUrl,
  getAccountExplorerUrl,
  openExplorerLink,
  getExplorerDomain,
} from '../utils/explorer';

interface ExplorerLinkConfig {
  /**
   * Custom explorer domain (e.g., 'steexp.com' for private networks)
   * Defaults to 'stellar.expert' if not provided
   */
  customExplorerDomain?: string;
}

/**
 * Hook for generating and opening Stellar Explorer links
 * @param config Configuration options
 * @returns Object with methods for explorer navigation
 */
export function useExplorerLink(config?: ExplorerLinkConfig) {
  const explorerDomain = useMemo(
    () => getExplorerDomain(config?.customExplorerDomain),
    [config?.customExplorerDomain]
  );

  const getTransactionUrl = useCallback(
    (txHash: string) => getTransactionExplorerUrl(txHash, explorerDomain),
    [explorerDomain]
  );

  const getAccountUrl = useCallback(
    (accountAddress: string) => getAccountExplorerUrl(accountAddress, explorerDomain),
    [explorerDomain]
  );

  const openTransaction = useCallback(
    (txHash: string) => {
      const url = getTransactionUrl(txHash);
      openExplorerLink(url);
    },
    [getTransactionUrl]
  );

  const openAccount = useCallback(
    (accountAddress: string) => {
      const url = getAccountUrl(accountAddress);
      openExplorerLink(url);
    },
    [getAccountUrl]
  );

  return {
    explorerDomain,
    getTransactionUrl,
    getAccountUrl,
    openTransaction,
    openAccount,
  };
}
