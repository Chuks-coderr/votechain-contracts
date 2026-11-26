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
 * Gzip compression middleware for large JSON responses.
 *
 * Intercepts res.send/res.json and, when the client advertises gzip support
 * and the body is at or above COMPRESSION_THRESHOLD bytes, replaces the
 * payload with its gzip rendering and sets Content-Encoding: gzip.
 *
 * /metrics is explicitly excluded (Prometheus scrapes plain text).
 *
 * Intended mount: app.use("/api", compression) so API routes (proposals,
 * leaderboard) are compressed while /metrics and health are not.
 */

import { Request, Response, NextFunction } from "express";
import zlib from "zlib";
import { getConfig } from "../config";

// Default threshold (1 KB) when COMPRESSION_THRESHOLD is unset/invalid.
const DEFAULT_THRESHOLD = 1024;

export function compression(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const config = getConfig();
  const threshold = config.COMPRESSION_THRESHOLD || DEFAULT_THRESHOLD;
  const path = req.path;

  // /metrics is never compressed (Prometheus text exposition format).
  if (path === "/metrics" || path.startsWith("/metrics")) {
    return next();
  }

  const acceptEncoding = req.headers["accept-encoding"] || "";
  const acceptsGzip = /\bgzip\b/.test(String(acceptEncoding));
  if (!acceptsGzip) {
    return next();
  }

  const originalSend = res.send.bind(res);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res.send as any) = function (body: any): Response {
    if (body === undefined || body === null) {
      return originalSend(body);
    }

    let buf: Buffer;
    let isJson = false;

    if (Buffer.isBuffer(body)) {
      buf = body;
    } else if (typeof body === "string") {
      buf = Buffer.from(body);
    } else {
      buf = Buffer.from(JSON.stringify(body));
      isJson = true;
    }

    if (buf.length < threshold) {
      if (isJson) res.setHeader("Content-Type", "application/json");
      return originalSend(buf);
    }

    let zipped: Buffer;
    try {
      zipped = zlib.gzipSync(buf);
    } catch {
      if (isJson) res.setHeader("Content-Type", "application/json");
      return originalSend(buf);
    }

    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", String(zipped.length));
    if (isJson) res.setHeader("Content-Type", "application/json");
    return originalSend(zipped);
  };

  next();
}
