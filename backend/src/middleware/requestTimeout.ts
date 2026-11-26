import { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";
import { log } from "./requestTracing";

/**
 * Responds 504 when a request exceeds `timeoutMs` (#519). Mount it again on a
 * specific route to override the timeout set by an outer mount.
 *
 * Handlers can pass `res.locals.abortSignal` to downstream calls to cancel them.
 */
export function requestTimeout(timeoutMs = getConfig().requestTimeoutMs) {
  return (req: Request, res: Response, next: NextFunction): void => {
    clearTimeout(res.locals.requestTimer);
    const controller = new AbortController();
    res.locals.abortSignal = controller.signal;

    const timer = setTimeout(() => {
      controller.abort();
      log("warn", "request timed out", { path: req.path, timeoutMs });

      if (res.headersSent) {
        // Mid-stream: the status can't change, so drop the connection.
        res.destroy();
        return;
      }

      const requestId = res.getHeader("X-Request-Id");
      res.status(504).json({
        error: {
          code: "REQUEST_TIMEOUT",
          message: "The request timed out.",
          details: [],
          request_id: requestId,
        },
      });

      // The handler may still be running. Discard its late response rather
      // than letting ERR_HTTP_HEADERS_SENT become an unhandled rejection.
      const ignore = () => res;
      res.setHeader = ignore as typeof res.setHeader;
      res.removeHeader = ignore as typeof res.removeHeader;
      res.writeHead = ignore as typeof res.writeHead;
      res.write = (() => true) as typeof res.write;
      res.end = ignore as typeof res.end;
    }, timeoutMs);

    res.locals.requestTimer = timer;
    res.once("finish", () => clearTimeout(timer));
    res.once("close", () => clearTimeout(timer));
    next();
  };
}
