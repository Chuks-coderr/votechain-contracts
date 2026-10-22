/**
 * Validation middleware for VoteChain backend API.
 *
 * Validates Stellar address format (G... 56-character base32 encoded public keys)
 * before requests reach the RPC layer, returning HTTP 400 on invalid input
 * rather than a confusing 500 from the Stellar RPC layer.
 */

import { Request, Response, NextFunction } from "express";

// Stellar public key: starts with 'G', exactly 56 characters, base32 alphabet (A-Z, 2-7)
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/**
 * Returns true if the given string is a valid Stellar public key (G-address).
 * Format: starts with 'G', 56 characters total, uppercase base32 (A-Z, 2-7).
 */
export function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_RE.test(address);
}

/**
 * Express middleware factory that validates a Stellar address in route params.
 *
 * Usage:
 *   router.get("/voters/:address/votes", validateAddressParam("address"), handler);
 *
 * Returns HTTP 400 with a descriptive error if the address is invalid.
 */
export function validateAddressParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const address = req.params[paramName];

    if (address === undefined || address === "") {
      res.status(400).json({
        code: "INVALID_STELLAR_ADDRESS",
        message: `Missing required address parameter: ${paramName}`,
      });
      return;
    }

    if (!isValidStellarAddress(address)) {
      res.status(400).json({
        code: "INVALID_STELLAR_ADDRESS",
        message: `Invalid Stellar address for parameter '${paramName}'. ` +
          `Expected a 56-character base32 public key starting with 'G' (e.g. GABC...XYZ).`,
      });
      return;
    }

    next();
  };
}

/**
 * Express middleware factory that validates a Stellar address in query params.
 *
 * Usage:
 *   router.get("/votes", validateAddressQuery("voter"), handler);
 *
 * Returns HTTP 400 with a descriptive error if the address is invalid.
 */
export function validateAddressQuery(queryName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const address = req.query[queryName];

    // Query param is optional — only validate if provided
    if (address === undefined) {
      next();
      return;
    }

    if (typeof address !== "string" || !isValidStellarAddress(address)) {
      res.status(400).json({
        code: "INVALID_STELLAR_ADDRESS",
        message: `Invalid Stellar address for query parameter '${queryName}'. ` +
          `Expected a 56-character base32 public key starting with 'G' (e.g. GABC...XYZ).`,
      });
      return;
    }

    next();
  };
}
