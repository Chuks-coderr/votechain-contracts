/**
 * Typed backend configuration (#518).
 *
 * The environment is parsed and validated once, on first use. Defaults are
 * declared below and documented in .env.example. Unset and empty are equal.
 */

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env) {
  const str = (name: string): string | undefined => env[name]?.trim() || undefined;

  const int = (name: string, fallback: number, min = 1, max = 2_147_483_647): number => {
    const raw = str(name);
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new ConfigError(`${name} must be an integer between ${min} and ${max}.`);
    }
    return value;
  };

  const rate = (name: string, fallback: number): number => {
    const raw = str(name);
    const value = raw === undefined ? fallback : Number(raw);
    if (!(value >= 0 && value <= 1)) {
      throw new ConfigError(`${name} must be a number between 0 and 1.`);
    }
    return value;
  };

  const sorobanSecret = str("SOROBAN_SECRET_KEY");

  return Object.freeze({
    port: int("PORT", 3001, 0, 65_535),
    /** Number of trusted reverse proxies in front of the API. */
    trustProxy: int("TRUST_PROXY", 0, 0),
    redisUrl: str("REDIS_URL"),
    databaseUrl: str("DATABASE_URL"),
    allowedOrigins: (str("ALLOWED_ORIGINS") ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim()),
    logLevel: str("LOG_LEVEL")?.toLowerCase() ?? "info",
    jsonBodyLimit: str("JSON_BODY_LIMIT") ?? "100kb",
    requestTimeoutMs: int("REQUEST_TIMEOUT_MS", 30_000),
    healthCheckTimeoutMs: int("HEALTH_CHECK_TIMEOUT_MS", 2_000),

    adminJwtSecret: str("ADMIN_JWT_SECRET"),
    adminStellarAddress: str("ADMIN_STELLAR_ADDRESS"),
    adminJwtTtlSeconds: int("ADMIN_JWT_TTL_SECONDS", 900),
    adminJwtRefreshWindowSeconds: int("ADMIN_JWT_REFRESH_WINDOW_SECONDS", 300, 0),
    adminJwtMaxSessionSeconds: int("ADMIN_JWT_MAX_SESSION_SECONDS", 28_800),
    adminAuthRateLimit: int("ADMIN_AUTH_RATE_LIMIT", 5),
    adminAuthBlockThreshold: int("ADMIN_AUTH_BLOCK_THRESHOLD", 10),
    adminAuthBlockWindowMs: int("ADMIN_AUTH_BLOCK_WINDOW_MS", 300_000),
    adminAuthBlockDurationMs: int("ADMIN_AUTH_BLOCK_DURATION_MS", 300_000),

    anonReadLimit: int("ANON_READ_LIMIT", 100),
    anonWriteLimit: int("ANON_WRITE_LIMIT", 10),
    apiKeyReadLimit: int("API_KEY_READ_LIMIT", 1000),
    apiKeyWriteLimit: int("API_KEY_WRITE_LIMIT", 100),
    abuseBurstThreshold: int("ABUSE_BURST_THRESHOLD", 1500),

    cspReportMaxBytes: int("CSP_REPORT_MAX_BYTES", 16_384),
    cspReportRateLimit: int("CSP_REPORT_RATE_LIMIT", 30),
    cspReportSampleRate: rate("CSP_REPORT_SAMPLE_RATE", 1),

    proposalListTtl: int("PROPOSAL_LIST_TTL", 30),
    proposalItemTtl: int("PROPOSAL_ITEM_TTL", 10),
    leaderboardCacheTtl: int("LEADERBOARD_CACHE_TTL", 60),

    stellarRpcUrl: str("STELLAR_RPC_URL"),
    sorobanRpcUrl: str("SOROBAN_RPC_URL") ?? "https://soroban-testnet.stellar.org",
    networkPassphrase:
      str("STELLAR_NETWORK_PASSPHRASE") ?? "Test SDF Network ; September 2015",
    governanceContractId: str("GOVERNANCE_CONTRACT_ID") ?? "",
    sorobanAccount: str("SOROBAN_ACCOUNT") ?? "",
    readAccount: str("READ_ACCOUNT") ?? str("SOROBAN_ACCOUNT") ?? "",
    proposerSecret: str("PROPOSER_SECRET_KEY") ?? sorobanSecret ?? "",
    finalizerSecret: str("FINALIZER_SECRET_KEY") ?? sorobanSecret ?? "",
    adminSecret: str("ADMIN_SECRET_KEY") ?? sorobanSecret ?? "",
  });
}

export type Config = ReturnType<typeof loadConfig>;

let cached: Config | undefined;

export function getConfig(): Config {
  return (cached ??= loadConfig());
}

/** Forces the next getConfig() to re-read the environment. Tests only. */
export function resetConfigForTesting(): void {
  cached = undefined;
}

/** Explicit allowlist, so a newly added secret is never logged by default. */
const LOGGABLE = [
  "port", "trustProxy", "allowedOrigins", "logLevel", "jsonBodyLimit",
  "requestTimeoutMs", "healthCheckTimeoutMs", "adminJwtTtlSeconds",
  "adminJwtRefreshWindowSeconds", "adminJwtMaxSessionSeconds",
  "adminAuthRateLimit", "adminAuthBlockThreshold", "adminAuthBlockWindowMs",
  "adminAuthBlockDurationMs", "anonReadLimit", "anonWriteLimit",
  "apiKeyReadLimit", "apiKeyWriteLimit", "abuseBurstThreshold",
  "cspReportMaxBytes", "cspReportRateLimit", "cspReportSampleRate",
  "proposalListTtl", "proposalItemTtl", "leaderboardCacheTtl",
  "networkPassphrase", "governanceContractId",
] as const satisfies readonly (keyof Config)[];

/** Non-secret settings for the startup log. URLs may hold credentials: omitted. */
export function publicConfig(config: Config): Record<string, unknown> {
  return Object.fromEntries(LOGGABLE.map((key) => [key, config[key]]));
}
