import { createHash } from "crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Adds a content-derived ETag to successful responses (#521). Must be mounted
 * before the Redis cache middleware so cache hits are covered too. Express
 * compares it with If-None-Match when sending, and answers 304 on a match.
 */
export function proposalEtag(_req: Request, res: Response, next: NextFunction): void {
  const originalSend = res.send.bind(res);
  res.send = (body?: unknown) => {
    if (res.statusCode === 200 && typeof body === "string") {
      const hash = createHash("sha256").update(body).digest("base64url");
      res.setHeader("ETag", `"${hash}"`);
      // Clients may store the payload but must revalidate it.
      res.setHeader("Cache-Control", "private, no-cache");
    }
    return originalSend(body);
  };
  next();
}
