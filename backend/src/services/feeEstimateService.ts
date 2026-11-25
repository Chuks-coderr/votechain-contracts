import { createContractServiceFromEnv } from "./contractService";

export type VoteChoice = "Yes" | "No" | "Abstain";

export interface FeeEstimateParams {
  voter: string;
  proposalId: bigint;
  vote: VoteChoice;
}

export interface FeeEstimate {
  best_effort: true;
  /** "simulation" = real RPC simulation; "fallback" = static typical range. */
  source: "simulation" | "fallback";
  unit: "stroops";
  min: string;
  max: string;
}

const BASE_FEE = 100n;
/** Headroom for ledger state changing between simulation and submission. */
const HEADROOM_PERCENT = 25n;
const TIMEOUT_MS = 3000;

const FALLBACK: FeeEstimate = {
  best_effort: true,
  source: "fallback",
  unit: "stroops",
  min: "50000",
  max: "1000000",
};

type Simulator = (params: FeeEstimateParams) => Promise<bigint>;

const simulateFromEnv: Simulator = (p) =>
  createContractServiceFromEnv().estimateCastVoteResourceFee(p.voter, p.proposalId, p.vote);

/** Never throws: anything preventing a simulation yields the fallback range. */
export async function estimateCastVoteFee(
  params: FeeEstimateParams | null,
  simulate: Simulator = simulateFromEnv,
  timeoutMs = TIMEOUT_MS,
): Promise<FeeEstimate> {
  if (!params) return { ...FALLBACK };
  let timer: NodeJS.Timeout | undefined;
  try {
    const resourceFee = await Promise.race([
      simulate(params),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("fee simulation timed out")), timeoutMs);
      }),
    ]);
    const min = BASE_FEE + resourceFee;
    const max = BASE_FEE + (resourceFee * (100n + HEADROOM_PERCENT) + 99n) / 100n;
    return { ...FALLBACK, source: "simulation", min: min.toString(), max: max.toString() };
  } catch {
    return { ...FALLBACK };
  } finally {
    clearTimeout(timer);
  }
}
