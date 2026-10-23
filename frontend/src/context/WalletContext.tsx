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
 * WalletContext — global wallet state for FreighterWallet (issue #10).
 *
 * Provides: address, network, connected, connect(), disconnect()
 * Available application-wide via <WalletProvider> in main.tsx.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

// ── Types ────────────────────────────────────────────────────

type FreighterApi = {
  isConnected: () => Promise<boolean>;
  getPublicKey: () => Promise<string>;
  getNetwork: () => Promise<string>;
  requestAccess: () => Promise<void>;
};

export interface WalletContextValue {
  /** Connected wallet public key, or null when disconnected */
  address: string | null;
  /** Stellar network reported by Freighter, or null */
  network: string | null;
  /** Whether the wallet is currently connected */
  connected: boolean;
  /** True while a connect() call is in flight */
  connecting: boolean;
  /** Last connection error message, or null */
  error: string | null;
  /** Request wallet access and read address + network */
  connect: () => Promise<void>;
  /** Clear wallet state (no on-chain action needed for Freighter) */
  disconnect: () => void;
}

// ── Context ──────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

function getFreighter(): FreighterApi | undefined {
  return (window as unknown as Record<string, unknown>).freighter as
    | FreighterApi
    | undefined;
}

// ── Provider ─────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session if Freighter is already connected
  useEffect(() => {
    const freighter = getFreighter();
    if (!freighter) return;
    freighter.isConnected().then((isConn) => {
      if (isConn) {
        freighter
          .getPublicKey()
          .then((addr) =>
            freighter.getNetwork().then((net) => {
              setAddress(addr);
              setNetwork(net);
              setConnected(true);
            }),
          )
          .catch(() => {/* silently ignore restore errors */});
      }
    });
  }, []);

  const connect = useCallback(async () => {
    const freighter = getFreighter();
    if (!freighter) {
      setError('Freighter extension not found. Please install it first.');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await freighter.requestAccess();
      const addr = await freighter.getPublicKey();
      const net = await freighter.getNetwork();
      setAddress(addr);
      setNetwork(net);
      setConnected(true);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to connect wallet.');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setNetwork(null);
    setConnected(false);
    setError(null);
  }, []);

  const value: WalletContextValue = {
    address,
    network,
    connected,
    connecting,
    error,
    connect,
    disconnect,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────

/**
 * useWallet — consume WalletContext.
 * Must be used inside <WalletProvider>.
 */
export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
}
