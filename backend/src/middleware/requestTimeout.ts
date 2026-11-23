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
 * Per-route request timeout middleware.
 *
 * Aborts long-running requests after REQUEST_TIMEOUT_MS and responds with
 * HTTP 504, including the request id (from request tracing) so operators can
 * correlate the timeout with logs/traces.
 *
 * Mount this after requestTracing (so the request id is available) and before
 * the route handlers it should wrap, e.g. for /api routes.
 */

import { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";

// Default applied when REQUEST_TIMEOUT_MS is unset or invalid.
const DEFAULT_TIMEOUT_MS = 30_000;

export function requestTimeout(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const config = getConfig();
  const timeoutMs = config.REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS;

  const headerId = req.headers["x-request-id"];
  const tracedId = res.getHeader("X-Request-Id");
  const requestId =
    (typeof tracedId === "string" ? tracedId : undefined) ||
    (Array.isArray(headerId) ? headerId[0] : headerId) ||
    undefined;

  let completed = false;

  const timer = setTimeout(() => {
    if (completed) return;
    completed = true;
    if (res.headersSent) return;

    res.status(504).json({
      error: {
        code: "GATEWAY_TIMEOUT",
        message: "Request timed out",
        details: [],
        ...(requestId ? { requestId } : {}),
      },
    });
  }, timeoutMs);

  // Clear the timer once the response finishes or the connection closes so
  // we never attempt to double-respond.
  const cleanup = () => {
    completed = true;
    clearTimeout(timer);
  };
  res.on("finish", cleanup);
  res.on("close", cleanup);

  next();
}
