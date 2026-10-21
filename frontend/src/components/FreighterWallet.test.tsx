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
 * Tests for FreighterWallet component (issue #11).
 * Covers: renders connect button, connect flow, disconnect flow,
 * network mismatch warning, missing extension error.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FreighterWallet } from './FreighterWallet';

// ── Helpers ───────────────────────────────────────────────────

type MockFreighter = {
  isConnected: ReturnType<typeof vi.fn>;
  getPublicKey: ReturnType<typeof vi.fn>;
  getNetwork: ReturnType<typeof vi.fn>;
  requestAccess: ReturnType<typeof vi.fn>;
};

function installMockFreighter(overrides: Partial<MockFreighter> = {}): MockFreighter {
  const mock: MockFreighter = {
    isConnected:  vi.fn().mockResolvedValue(false),
    getPublicKey: vi.fn().mockResolvedValue('GABCDEF1234567890ABCDEF1234567890ABCDEF12'),
    getNetwork:   vi.fn().mockResolvedValue('TESTNET'),
    requestAccess: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  (window as unknown as Record<string, unknown>).freighter = mock;
  return mock;
}

function removeMockFreighter() {
  delete (window as unknown as Record<string, unknown>).freighter;
}

// ── Tests ─────────────────────────────────────────────────────

describe('FreighterWallet', () => {
  afterEach(() => {
    removeMockFreighter();
    vi.restoreAllMocks();
  });

  it('renders "Connect Wallet" button when not connected', () => {
    installMockFreighter();
    render(<FreighterWallet />);
    expect(screen.getByRole('button', { name: /connect (freighter )?wallet/i })).toBeInTheDocument();
  });

  it('connects wallet and shows truncated address', async () => {
    const user = userEvent.setup();
    installMockFreighter();
    render(<FreighterWallet />);

    await user.click(screen.getByRole('button', { name: /connect (freighter )?wallet/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disconnect wallet/i })).toBeInTheDocument();
    });
    // Truncated address visible
    expect(screen.getByLabelText(/connected wallet address/i)).toBeInTheDocument();
  });

  it('disconnects wallet and returns to connect state', async () => {
    const user = userEvent.setup();
    installMockFreighter();
    render(<FreighterWallet />);

    await user.click(screen.getByRole('button', { name: /connect (freighter )?wallet/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /disconnect wallet/i })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /disconnect wallet/i }));
    expect(screen.getByRole('button', { name: /connect (freighter )?wallet/i })).toBeInTheDocument();
  });

  it('shows network mismatch warning when connected to wrong network', async () => {
    const user = userEvent.setup();
    installMockFreighter({
      getNetwork: vi.fn().mockResolvedValue('MAINNET'),
    });
    render(<FreighterWallet />);

    await user.click(screen.getByRole('button', { name: /connect (freighter )?wallet/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/network mismatch/i);
  });

  it('lets the user dismiss the mismatch warning and shows it again on reconnect', async () => {
    const user = userEvent.setup();
    installMockFreighter({
      getNetwork: vi.fn().mockResolvedValue('PUBLIC'),
    });
    render(<FreighterWallet />);

    await user.click(screen.getByRole('button', { name: /connect (freighter )?wallet/i }));
    await waitFor(() => expect(screen.getByTestId('network-mismatch')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /dismiss network warning/i }));
    expect(screen.queryByTestId('network-mismatch')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /disconnect wallet/i }));
    await user.click(screen.getByRole('button', { name: /connect (freighter )?wallet/i }));
    await waitFor(() => expect(screen.getByTestId('network-mismatch')).toBeInTheDocument());
  });

  it('shows error and install link when Freighter extension is missing', async () => {
    const user = userEvent.setup();
    removeMockFreighter(); // no freighter on window
    render(<FreighterWallet />);

    await user.click(screen.getByRole('button', { name: /connect (freighter )?wallet/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/not found/i);
    expect(screen.getByRole('link', { name: /install freighter/i })).toBeInTheDocument();
  });

  it('auto-restores session if Freighter is already connected', async () => {
    installMockFreighter({
      isConnected: vi.fn().mockResolvedValue(true),
    });
    render(<FreighterWallet />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /disconnect wallet/i })).toBeInTheDocument()
    );
  });

  it('shows "Connecting…" label while request is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const pending = new Promise<void>((res) => { resolve = res; });
    installMockFreighter({
      requestAccess: vi.fn().mockReturnValue(pending),
    });
    render(<FreighterWallet />);

    const btn = screen.getByRole('button', { name: /connect (freighter )?wallet/i });
    // Start click but don't await
    void user.click(btn);

    // The button text changes to "Connecting…" and becomes disabled
    await waitFor(() => {
      const connectingBtn = screen.getByRole('button', { name: /connect (freighter )?wallet/i });
      expect(connectingBtn).toBeDisabled();
      expect(connectingBtn).toHaveTextContent(/connecting/i);
    });

    resolve(); // finish the request
  });
});
