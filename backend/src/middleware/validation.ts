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
