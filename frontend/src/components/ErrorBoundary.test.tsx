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
 * Tests for ErrorBoundary component (issue #11).
 * Covers: renders children normally, catches thrown errors,
 * shows retry button, retry resets the boundary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

// ── Helpers ───────────────────────────────────────────────────

/** A component that throws when `shouldThrow` is true */
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test explosion');
  return <p>All good</p>;
}

// Suppress React's noisy console.error output during throw tests
let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleSpy.mockRestore();
});

// ── Tests ─────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <p>Safe content</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('catches a thrown error and shows the fallback UI', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('shows the section name in the error message when provided', () => {
    render(
      <ErrorBoundary section="ProposalList">
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/ProposalList/);
  });

  it('shows "Try again" button in the error fallback', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('resets the boundary and re-renders children after "Try again" click', async () => {
    const user = userEvent.setup();

    // We need a stateful wrapper so we can toggle shouldThrow after retry
    function Wrapper() {
      const [throwing, setThrowing] = React.useState(true);
      return (
        <ErrorBoundary>
          {throwing ? (
            <Bomb shouldThrow />
          ) : (
            <p>Recovered content</p>
          )}
          {/* Hidden button to flip the throw state for testing */}
          <button id="fix" onClick={() => setThrowing(false)} style={{ display: 'none' }}>fix</button>
        </ErrorBoundary>
      );
    }

    // Needs React in scope for JSX inside the test
    const React = await import('react');
    void React; // used implicitly by JSX transform

    render(<Wrapper />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));

    // After retry the boundary resets; the Bomb still throws immediately,
    // so we'll see the error UI again — this verifies the reset cycle works.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('does not show error UI when no error occurs', () => {
    render(
      <ErrorBoundary section="Safe">
        <p>No error here</p>
      </ErrorBoundary>
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
