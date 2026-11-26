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
 * POST /csp-report
 *
 * Receives Content-Security-Policy violation reports forwarded by Nginx
 * (see frontend/deploy/nginx.conf and docs/security/SEC-012-content-security-policy.md).
 *
 * Browsers send these with either:
 *   - Content-Type: application/csp-report       (legacy `report-uri` format)
 *   - Content-Type: application/reports+json     (newer `report-to` format)
 *
 * Neither is parsed by the default express.json() middleware (which only
 * handles application/json), so this route carries its own JSON body
 * parser configured for those content types. Without it, every report
 * Nginx forwards here previously fell through to the 404 handler and was
 * silently dropped — meaning CSP violations (including real XSS attempts)
 * were never logged.
 */

import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import { getConfig } from "../config";

const router = Router();

const cspReportBodyParser = express.json({
  type: ["application/csp-report", "application/reports+json", "application/json"],
  limit: getConfig().cspReportMaxBytes,
});

const WINDOW_MS = 60_000;
const MAX_REPORTS_PER_REQUEST = 10;
const MAX_TRACKED_IPS = 10_000;
const windows = new Map<string, { count: number; resetAt: number }>();

/**
 * Per-IP fixed window, in memory so it still holds when Redis is down (#516).
 * Runs before body parsing so dropped reports cost nothing to parse.
 */
function cspReportRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  let entry = windows.get(ip);
  if (!entry || now >= entry.resetAt) {
    // Re-insert so the map stays ordered by expiry; evict the oldest when full.
    windows.delete(ip);
    if (windows.size >= MAX_TRACKED_IPS) {
      windows.delete(windows.keys().next().value as string);
    }
    entry = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(ip, entry);
  }
  if (++entry.count > getConfig().cspReportRateLimit) {
    res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
    res.status(429).json({
      error: { code: "RATE_LIMITED", message: "Too many CSP reports", details: [] },
    });
    return;
  }
  next();
}

router.post(
  "/csp-report",
  cspReportRateLimit,
  cspReportBodyParser,
  (req: Request, res: Response) => {
    const body = req.body;

    // report-uri format: { "csp-report": { ... } }
    // report-to format:  [ { type: "csp-violation", body: { ... } }, ... ]
    const reports = Array.isArray(body)
      ? body
      : body && body["csp-report"]
        ? [body["csp-report"]]
        : body
          ? [body]
          : [];

    for (const report of reports.slice(0, MAX_REPORTS_PER_REQUEST)) {
      if (Math.random() >= getConfig().cspReportSampleRate) continue;
      console.warn("[csp-violation]", JSON.stringify(report));
    }

    // Browsers do not read the response body for report endpoints;
    // 204 No Content is the conventional response.
    res.status(204).end();
  }
);

export default router;
