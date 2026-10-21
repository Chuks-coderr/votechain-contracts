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

import { Keypair, Transaction } from "@stellar/stellar-sdk";

/**
 * Minimal signing abstraction so {@link VoteChainClient} can work with either
 * a raw secret key (server-side scripts, tests) or a browser wallet like
 * Freighter, without the rest of the SDK caring which one is in use.
 */
export interface Signer {
  /** The Stellar public key (G...) this signer signs on behalf of. */
  publicKey(): Promise<string>;
  /** Signs a base64-encoded transaction envelope XDR and returns the signed XDR. */
  signTransaction(xdr: string, networkPassphrase: string): Promise<string>;
}

/**
 * A {@link Signer} backed by a raw Stellar secret key (`S...`). Intended for
 * server-side integrations, scripts, and tests — never expose a secret key
 * in a browser context.
 */
export class RawKeySigner implements Signer {
  private readonly keypair: Keypair;

  constructor(secretKey: string) {
    this.keypair = Keypair.fromSecret(secretKey);
  }

  async publicKey(): Promise<string> {
    return this.keypair.publicKey();
  }

  async signTransaction(xdr: string, networkPassphrase: string): Promise<string> {
    const tx = new Transaction(xdr, networkPassphrase);
    tx.sign(this.keypair);
    return tx.toXDR();
  }
}

/**
 * Shape of the `window.freighter` (or injected) Freighter wallet API this
 * SDK depends on. Matches `@stellar/freighter-api`'s exported functions.
 */
export interface FreighterApi {
  isConnected(): Promise<{ isConnected: boolean } | boolean>;
  requestAccess(): Promise<{ address: string } | string>;
  getAddress(): Promise<{ address: string } | string>;
  signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<{ signedTxXdr: string } | string>;
}

/**
 * A {@link Signer} backed by the Freighter browser wallet extension.
 *
 * Usage:
 * ```ts
 * import * as freighterApi from "@stellar/freighter-api";
 * const signer = new FreighterSigner(freighterApi);
 * ```
 */
export class FreighterSigner implements Signer {
  constructor(private readonly freighter: FreighterApi) {}

  async publicKey(): Promise<string> {
    await this.freighter.requestAccess();
    const result = await this.freighter.getAddress();
    return typeof result === "string" ? result : result.address;
  }

  async signTransaction(xdr: string, networkPassphrase: string): Promise<string> {
    const result = await this.freighter.signTransaction(xdr, { networkPassphrase });
    return typeof result === "string" ? result : result.signedTxXdr;
  }
}
