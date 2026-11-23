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
 * Centralised, typed configuration for the VoteChain backend.
 *
 * Env vars are parsed exactly once at startup via loadConfig(). Every other
 * module reads from getConfig() instead of accessing process.env directly,
 * which keeps defaults documented in one place and makes secrets easy to
 * exclude from logs.
 *
 * Required vars (missing => process exit):
 *   REDIS_URL
 *
 * All other vars carry safe defaults documented below.
 */

import { log } from "./middleware/requestTracing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = "error" | "warn" | "info" | "debug";
export type NodeEnv = "development" | "production" | "staging";

export interface Config {
  // Core server
  PORT: number;
  NODE_ENV: NodeEnv;
  REDIS_URL: string;
  ALLOWED_ORIGINS: string[];
  LOG_LEVEL: LogLevel;
  JSON_BODY_LIMIT: string;
  HEALTH_CHECK_TIMEOUT_MS: number;

  // Admin authentication
  ADMIN_JWT_SECRET: string;
  ADMIN_STELLAR_ADDRESS: string | undefined;
  // Access token lifetime (ms). Short-lived by default.
  ADMIN_JWT_ACCESS_TTL_MS: number;
  // Refresh token lifetime (ms).
  ADMIN_JWT_REFRESH_TTL_MS: number;

  // Rate limiting (requests per minute)
  ANON_READ_LIMIT: number;
  ANON_WRITE_LIMIT: number;
  API_KEY_READ_LIMIT: number;
  API_KEY_WRITE_LIMIT: number;
  ABUSE_BURST_THRESHOLD: number;

  // Redis cache TTLs (seconds)
  PROPOSAL_LIST_TTL: number;
  PROPOSAL_ITEM_TTL: number;
  LEADERBOARD_CACHE_TTL: number;

  // Request timeout (ms) for long-running endpoints
  REQUEST_TIMEOUT_MS: number;

  // Response compression threshold (bytes). Responses at or above this size
  // are gzip-compressed for non-local clients.
  COMPRESSION_THRESHOLD: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envLogLevel(name: string, fallback: LogLevel): LogLevel {
  const raw = process.env[name]?.toLowerCase();
  const valid: LogLevel[] = ["error", "warn", "info", "debug"];
  return valid.includes(raw as LogLevel) ? (raw as LogLevel) : fallback;
}

function envNodeEnv(name: string, fallback: NodeEnv): NodeEnv {
  const raw = process.env[name]?.toLowerCase();
  const valid: NodeEnv[] = ["development", "production", "staging"];
  return valid.includes(raw as NodeEnv) ? (raw as NodeEnv) : fallback;
}

function envStringList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Secrets (never logged)
// ---------------------------------------------------------------------------

/**
 * Set of config keys whose values must never appear in startup logs.
 */
const SECRET_KEYS = new Set(["ADMIN_JWT_SECRET", "REDIS_URL", "DATABASE_URL"]);

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let loadedConfig: Config | null = null;

/**
 * Parses and validates environment configuration. Must be called exactly once
 * at process startup (before any route/service reads config). Exits the
 * process when a required variable is missing.
 */
export function loadConfig(): Config {
  if (loadedConfig) return loadedConfig;

  const required: string[] = [];
  if (!process.env.REDIS_URL) required.push("REDIS_URL");

  if (required.length > 0) {
    console.error(
      "[startup] Missing required environment variables:\n" +
        required.map((k) => `  • ${k}`).join("\n") +
        "\n\nSet these variables before starting the server. " +
        "See .env.example for reference."
    );
    process.exit(1);
  }

  const config: Config = {
    PORT: envInt("PORT", 3001),
    NODE_ENV: envNodeEnv("NODE_ENV", "development"),
    REDIS_URL: process.env.REDIS_URL!,
    ALLOWED_ORIGINS: envStringList("ALLOWED_ORIGINS", ["http://localhost:5173"]),
    LOG_LEVEL: envLogLevel("LOG_LEVEL", "info"),
    JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT ?? "100kb",
    HEALTH_CHECK_TIMEOUT_MS: envInt("HEALTH_CHECK_TIMEOUT_MS", 2000),

    ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET ?? "changeme",
    ADMIN_STELLAR_ADDRESS: process.env.ADMIN_STELLAR_ADDRESS,
    ADMIN_JWT_ACCESS_TTL_MS: envInt("ADMIN_JWT_ACCESS_TTL_MS", 15 * 60 * 1000), // 15 min
    ADMIN_JWT_REFRESH_TTL_MS: envInt("ADMIN_JWT_REFRESH_TTL_MS", 7 * 24 * 60 * 60 * 1000), // 7 days

    ANON_READ_LIMIT: envInt("ANON_READ_LIMIT", 100),
    ANON_WRITE_LIMIT: envInt("ANON_WRITE_LIMIT", 10),
    API_KEY_READ_LIMIT: envInt("API_KEY_READ_LIMIT", 1000),
    API_KEY_WRITE_LIMIT: envInt("API_KEY_WRITE_LIMIT", 100),
    ABUSE_BURST_THRESHOLD: envInt("ABUSE_BURST_THRESHOLD", 1500),

    PROPOSAL_LIST_TTL: envInt("PROPOSAL_LIST_TTL", 30),
    PROPOSAL_ITEM_TTL: envInt("PROPOSAL_ITEM_TTL", 10),
    LEADERBOARD_CACHE_TTL: envInt("LEADERBOARD_CACHE_TTL", 60),

    REQUEST_TIMEOUT_MS: envInt("REQUEST_TIMEOUT_MS", 30_000),

    COMPRESSION_THRESHOLD: envInt("COMPRESSION_THRESHOLD", 1024),
  };

  loadedConfig = config;
  logConfig(config);
  return config;
}

/**
 * Returns the config loaded by loadConfig(). Throws if called before
 * loadConfig() has run.
 */
export function getConfig(): Config {
  if (!loadedConfig) {
    throw new Error("config not loaded — call loadConfig() at startup first");
  }
  return loadedConfig;
}

/**
 * Logs the non-secret configuration at startup so operators can verify
 * effective defaults without secret values leaking into logs.
 */
function logConfig(config: Config): void {
  const nonSecret: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEYS.has(key)) continue;
    nonSecret[key] = value;
  }
  log("info", "configuration loaded", nonSecret);
}
