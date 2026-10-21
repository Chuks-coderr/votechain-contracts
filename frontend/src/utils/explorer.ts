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
 * Stellar Explorer Deep-links Utility
 * 
 * Provides utilities for generating deep-links to Stellar Explorer
 * (stellar.expert) for transactions and accounts.
 * 
 * Network detection is based on VITE_STELLAR_NETWORK environment variable.
 */

export type StellarNetwork = 'testnet' | 'public';

/**
 * Get the current Stellar network from environment variables
 * @returns 'testnet' or 'public'
 */
export function getStellarNetwork(): StellarNetwork {
  const network = import.meta.env.VITE_STELLAR_NETWORK?.toLowerCase();
  
  if (network === 'public' || network === 'mainnet') {
    return 'public';
  }
  
  // Default to testnet
  return 'testnet';
}

/**
 * Get the explorer domain for the current network
 * @param customDomain Optional custom explorer domain for private networks
 * @returns Explorer domain (e.g., 'stellar.expert')
 */
export function getExplorerDomain(customDomain?: string): string {
  if (customDomain) {
    return customDomain;
  }
  
  return 'stellar.expert';
}

/**
 * Get the network path component for stellar.expert URLs
 * @returns Network path ('testnet' or 'public-network')
 */
export function getNetworkPath(): string {
  const network = getStellarNetwork();
  return network === 'public' ? 'public-network' : 'testnet';
}

/**
 * Generate a Stellar Explorer link for a transaction
 * @param txHash Transaction hash
 * @param explorerDomain Optional custom explorer domain
 * @returns Full URL to transaction on Stellar Explorer
 */
export function getTransactionExplorerUrl(
  txHash: string,
  explorerDomain?: string
): string {
  const domain = getExplorerDomain(explorerDomain);
  const network = getNetworkPath();
  
  // stellar.expert URL format: https://stellar.expert/explorer/{network}/tx/{txHash}
  return `https://${domain}/explorer/${network}/tx/${txHash}`;
}

/**
 * Generate a Stellar Explorer link for an account
 * @param accountAddress Account public key (starting with 'G')
 * @param explorerDomain Optional custom explorer domain
 * @returns Full URL to account on Stellar Explorer
 */
export function getAccountExplorerUrl(
  accountAddress: string,
  explorerDomain?: string
): string {
  const domain = getExplorerDomain(explorerDomain);
  const network = getNetworkPath();
  
  // stellar.expert URL format: https://stellar.expert/explorer/{network}/account/{address}
  return `https://${domain}/explorer/${network}/account/${accountAddress}`;
}

/**
 * Open a Stellar Explorer link in a new tab
 * @param url URL to open
 * @param target Target (defaults to '_blank')
 */
export function openExplorerLink(
  url: string,
  target: string = '_blank'
): void {
  window.open(url, target, 'noopener,noreferrer');
}

/**
 * Open a transaction in Stellar Explorer
 * @param txHash Transaction hash
 * @param explorerDomain Optional custom explorer domain
 */
export function openTransactionInExplorer(
  txHash: string,
  explorerDomain?: string
): void {
  const url = getTransactionExplorerUrl(txHash, explorerDomain);
  openExplorerLink(url);
}

/**
 * Open an account in Stellar Explorer
 * @param accountAddress Account public key
 * @param explorerDomain Optional custom explorer domain
 */
export function openAccountInExplorer(
  accountAddress: string,
  explorerDomain?: string
): void {
  const url = getAccountExplorerUrl(accountAddress, explorerDomain);
  openExplorerLink(url);
}

/**
 * Generate a React href for a transaction link
 * @param txHash Transaction hash
 * @param explorerDomain Optional custom explorer domain
 * @returns URL string for use in href attribute
 */
export function getTransactionHref(
  txHash: string,
  explorerDomain?: string
): string {
  return getTransactionExplorerUrl(txHash, explorerDomain);
}

/**
 * Generate a React href for an account link
 * @param accountAddress Account public key
 * @param explorerDomain Optional custom explorer domain
 * @returns URL string for use in href attribute
 */
export function getAccountHref(
  accountAddress: string,
  explorerDomain?: string
): string {
  return getAccountExplorerUrl(accountAddress, explorerDomain);
}

/**
 * Check if a string is a valid Stellar public key
 * @param address Address to validate
 * @returns true if valid Stellar public key format
 */
export function isValidStellarAddress(address: string): boolean {
  // Stellar public keys start with 'G' and are base32 encoded (56 characters)
  return /^G[A-Z2-7]{55}$/.test(address);
}

/**
 * Check if a string is a valid transaction hash
 * @param hash Hash to validate
 * @returns true if valid transaction hash format
 */
export function isValidTransactionHash(hash: string): boolean {
  // Transaction hashes are hex strings (64 characters)
  return /^[a-f0-9]{64}$/i.test(hash);
}

/**
 * Truncate an address for display
 * @param address Full Stellar address
 * @param startChars Number of chars to show at start (default 6)
 * @param endChars Number of chars to show at end (default 4)
 * @returns Truncated address (e.g., 'GXXXXX...XXXX')
 */
export function truncateAddress(
  address: string,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (address.length <= startChars + endChars) {
    return address;
  }
  
  return `${address.substring(0, startChars)}...${address.substring(
    address.length - endChars
  )}`;
}

/**
 * Copy address to clipboard
 * @param address Address to copy
 * @returns Promise that resolves when copy completes
 */
export async function copyAddressToClipboard(address: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(address);
  } catch (err) {
    console.error('Failed to copy address to clipboard:', err);
    throw err;
  }
}
