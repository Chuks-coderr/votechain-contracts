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
 * Request validation middleware using zod.
 *
 * Validates incoming request bodies against named schemas and returns
 * structured 400 responses on failure:
 *
 *   {
 *     "error": {
 *       "code": "VALIDATION_ERROR",
 *       "fields": [
 *         { "field": "title", "message": "String must contain at most 128 character(s)" }
 *       ]
 *     }
 *   }
 *
 * Usage:
 *   import { validateBody, createProposalSchema, castVoteSchema } from "./validation";
 *   router.post("/proposals", validateBody(createProposalSchema), handler);
 */

import { z, ZodSchema, ZodError } from "zod";
import { Request, Response, NextFunction } from "express";

// ── Schemas ───────────────────────────────────────────────────────────────────

/**
 * Proposal creation body schema.
 *
 * Mirrors the on-chain create_proposal parameters:
 *   - title:       1–128 characters
 *   - description: 1–1 024 characters
 *   - quorum:      positive integer (token units)
 *   - duration:    60–2 592 000 seconds (1 minute to 30 days)
 */
export const createProposalSchema = z.object({
  title: z
    .string({ required_error: "title is required" })
    .min(1, "title must be at least 1 character")
    .max(128, "title must not exceed 128 characters"),

  description: z
    .string({ required_error: "description is required" })
    .min(1, "description must be at least 1 character")
    .max(1_024, "description must not exceed 1024 characters"),

  quorum: z
    .number({ required_error: "quorum is required", invalid_type_error: "quorum must be a number" })
    .int("quorum must be an integer")
    .positive("quorum must be a positive integer"),

  duration: z
    .number({ required_error: "duration is required", invalid_type_error: "duration must be a number" })
    .int("duration must be an integer")
    .min(60, "duration must be at least 60 seconds")
    .max(2_592_000, "duration must not exceed 2592000 seconds (30 days)"),
});

/**
 * Cast vote body schema.
 *
 *   - proposal_id: positive integer
 *   - vote:        one of "Yes", "No", "Abstain"
 *   - voter:       56-character Stellar address starting with "G"
 */
export const castVoteSchema = z.object({
  proposal_id: z
    .number({ required_error: "proposal_id is required", invalid_type_error: "proposal_id must be a number" })
    .int("proposal_id must be an integer")
    .positive("proposal_id must be a positive integer"),

  vote: z.enum(["Yes", "No", "Abstain"], {
    required_error: "vote is required",
    invalid_type_error: 'vote must be one of "Yes", "No", or "Abstain"',
  }),

  voter: z
    .string({ required_error: "voter is required" })
    .length(56, "voter must be a 56-character Stellar address")
    .regex(/^G/, 'voter must start with "G" (Stellar public key format)'),
});

// ── Exported types ────────────────────────────────────────────────────────────

export type CreateProposalBody = z.infer<typeof createProposalSchema>;
export type CastVoteBody = z.infer<typeof castVoteSchema>;

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Returns an Express middleware that validates `req.body` against `schema`.
 *
 * On success:   calls `next()` with validated (and coerced) data attached to `req.body`.
 * On failure:   responds with 400 VALIDATION_ERROR and per-field error details.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (result.success) {
      // Replace raw body with the validated + coerced value
      req.body = result.data;
      return next();
    }

    const fields = formatZodErrors(result.error);
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        fields,
      },
    });
  };
}

// ── Error formatting ──────────────────────────────────────────────────────────

interface FieldError {
  field: string;
  message: string;
}

/**
 * Convert a ZodError into a flat array of field-level error objects.
 * Nested paths are joined with "." (e.g. "address.street").
 */
function formatZodErrors(error: ZodError): FieldError[] {
  return error.errors.map((issue) => ({
    field: issue.path.join(".") || "_root",
    message: issue.message,
  }));
}

// ── Nested object / array schemas ─────────────────────────────────────────────

/**
 * Supported webhook event names.
 */
export const webhookEventSchema = z.enum(
  ["proposal_created", "vote_cast", "proposal_finalised"],
  {
    required_error: "events is required",
    invalid_type_error:
      "events must contain only supported event names (proposal_created, vote_cast, proposal_finalised)",
  }
);

/**
 * Webhook configuration body schema.
 *
 * Demonstrates nested object and array validation with numeric type coercion:
 *   - address:       56-character Stellar address starting with "G"
 *   - webhook_url:   URL
 *   - events:        non-empty array of supported event names
 *   - retry:         optional nested object (max_attempts, backoff_seconds),
 *                    string numbers are coerced to integers
 *   - metadata:      optional flat record of string values
 */
export const webhookConfigSchema = z.object({
  address: z
    .string({ required_error: "address is required" })
    .length(56, "address must be a 56-character Stellar address")
    .regex(/^G/, 'address must start with "G" (Stellar public key format)'),

  webhook_url: z
    .string({ required_error: "webhook_url is required" })
    .url("webhook_url must be a valid URL"),

  events: z
    .array(webhookEventSchema, {
      required_error: "events is required",
      invalid_type_error: "events must be an array of supported event names",
    })
    .min(1, "events must contain at least one event")
    .max(16, "events must not contain more than 16 entries"),

  retry: z
    .object({
      max_attempts: z.coerce
        .number({
          required_error: "retry.max_attempts is required",
          invalid_type_error: "retry.max_attempts must be a number",
        })
        .int("retry.max_attempts must be an integer")
        .min(1, "retry.max_attempts must be at least 1")
        .max(10, "retry.max_attempts must not exceed 10"),

      backoff_seconds: z.coerce
        .number({
          required_error: "retry.backoff_seconds is required",
          invalid_type_error: "retry.backoff_seconds must be a number",
        })
        .int("retry.backoff_seconds must be an integer")
        .min(0, "retry.backoff_seconds must not be negative")
        .max(3_600, "retry.backoff_seconds must not exceed 3600"),
    })
    .optional(),

  metadata: z.record(z.string()).optional(),
});

export type WebhookConfigBody = z.infer<typeof webhookConfigSchema>;

// ── Nesting depth limiting ────────────────────────────────────────────────────

/**
 * Default maximum nesting depth for request bodies.
 *
 * The root body counts as depth 1, so with the default a payload may contain
 * at most 10 levels of nested objects/arrays.
 */
export const DEFAULT_MAX_DEPTH = 10;

/**
 * Compute the nesting depth of a JSON-compatible value.
 *
 * Primitives have depth 0; an object or array adds 1 on top of its deepest
 * child. There is no circular-reference handling because JSON request bodies
 * cannot contain cycles.
 */
export function measureDepth(value: unknown): number {
  if (Array.isArray(value)) {
    if (value.length === 0) return 1;
    let max = 0;
    for (const item of value) {
      const childDepth = measureDepth(item);
      if (childDepth > max) max = childDepth;
    }
    return 1 + max;
  }

  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return 1;
    let max = 0;
    for (const key of keys) {
      const childDepth = measureDepth((value as Record<string, unknown>)[key]);
      if (childDepth > max) max = childDepth;
    }
    return 1 + max;
  }

  return 0;
}

/**
 * Returns an Express middleware that rejects overly deep request bodies with a
 * 400 before delegating to `validateBody` for schema (incl. nested) validation.
 *
 * This is additive: it reuses `validateBody` unchanged, so existing schemas and
 * behavior are unaffected. Pass `maxDepth` to override `DEFAULT_MAX_DEPTH`.
 */
export function validateBodyWithDepthLimit<T>(
  schema: ZodSchema<T>,
  maxDepth: number = DEFAULT_MAX_DEPTH
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const depth = measureDepth(req.body);

    if (depth > maxDepth) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          fields: [
            {
              field: "_root",
              message: `request body exceeds maximum nesting depth of ${maxDepth}`,
            },
          ],
        },
      });
      return;
    }

    return validateBody(schema)(req, res, next);
  };
}
