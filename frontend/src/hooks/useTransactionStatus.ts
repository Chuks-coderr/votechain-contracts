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

import { useCallback, useRef, useState } from "react";

const HORIZON_BASE = "https://horizon-testnet.stellar.org";
const EXPLORER_BASE = "https://stellar.expert/explorer/testnet/tx";
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20; // 60 seconds max

export type TxStatus = "idle" | "pending" | "confirmed" | "failed";

export type TxState = {
  hash: string | null;
  status: TxStatus;
  error: string | null;
  explorerUrl: string | null;
};

export function useTransactionStatus() {
  const [tx, setTx] = useState<TxState>({
    hash: null,
    status: "idle",
    error: null,
    explorerUrl: null,
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (hash: string) => {
      try {
        const res = await fetch(`${HORIZON_BASE}/transactions/${hash}`);
        if (res.ok) {
          stopPolling();
          setTx((prev) => ({ ...prev, status: "confirmed" }));
          return;
        }
        if (res.status === 404) {
          // Still pending
          pollCount.current += 1;
          if (pollCount.current >= MAX_POLLS) {
            stopPolling();
            setTx((prev) => ({
              ...prev,
              status: "failed",
              error: "Transaction not confirmed after 60 seconds.",
            }));
          }
          return;
        }
        // Unexpected error
        stopPolling();
        setTx((prev) => ({
          ...prev,
          status: "failed",
          error: `Unexpected response: ${res.status}`,
        }));
      } catch (e: unknown) {
        stopPolling();
        setTx((prev) => ({
          ...prev,
          status: "failed",
          error: (e as { message?: string })?.message ?? "Network error while checking transaction.",
        }));
      }
    },
    [stopPolling]
  );

  const submit = useCallback(
    (hash: string) => {
      stopPolling();
      pollCount.current = 0;
      setTx({
        hash,
        status: "pending",
        error: null,
        explorerUrl: `${EXPLORER_BASE}/${hash}`,
      });
      pollRef.current = setInterval(() => pollStatus(hash), POLL_INTERVAL_MS);
    },
    [pollStatus, stopPolling]
  );

  const retry = useCallback(
    (hash: string) => {
      if (hash) submit(hash);
    },
    [submit]
  );

  const reset = useCallback(() => {
    stopPolling();
    setTx({ hash: null, status: "idle", error: null, explorerUrl: null });
  }, [stopPolling]);

  return { tx, submit, retry, reset };
}
