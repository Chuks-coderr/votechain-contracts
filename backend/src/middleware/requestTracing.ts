import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { Request, Response, NextFunction } from "express";

type RequestContext = { requestId: string };

const requestContext = new AsyncLocalStorage<RequestContext>();
const levels = ["error", "warn", "info", "debug"] as const;
type LogLevel = (typeof levels)[number];

function configuredLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  return levels.includes(level as LogLevel) ? (level as LogLevel) : "info";
}

function shouldLog(level: LogLevel) {
  return levels.indexOf(level) <= levels.indexOf(configuredLevel());
}

/**
 * Structured JSON logger. Every line includes timestamp, level, message,
 * and request_id (when called within a traced request).
 *
 * Error logs automatically include a `stack` field when an Error is passed
 * under `fields.error`.
 */
export function log(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
) {
  if (!shouldLog(level)) return;

  // Promote Error objects to serialisable form
  const extra: Record<string, unknown> = { ...fields };
  if (extra.error instanceof Error) {
    extra.error = { message: extra.error.message, stack: extra.error.stack };
  }

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    request_id: requestContext.getStore()?.requestId ?? undefined,
    ...extra,
  };

  // Remove undefined keys so the output stays clean
  for (const key of Object.keys(entry)) {
    if (entry[key] === undefined) delete entry[key];
  }

  const output = JSON.stringify(entry);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

/**
 * Express middleware that:
 *  - assigns / forwards a request ID (X-Request-Id header)
 *  - runs the rest of the chain inside an AsyncLocalStorage context so that
 *    every log() call within a request automatically carries request_id
 *  - emits a structured access log on response finish with method, path,
 *    status, and duration_ms
 */
export function requestTracing(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("X-Request-Id");
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();

  res.setHeader("X-Request-Id", requestId);

  const startMs = Date.now();

  res.on("finish", () => {
    const duration_ms = Date.now() - startMs;
    const level: LogLevel = res.statusCode >= 500 ? "error" : "info";
    log(level, "request completed", {
      request_id: requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms,
    });
  });

  requestContext.run({ requestId }, next);
}
