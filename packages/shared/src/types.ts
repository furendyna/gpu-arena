/** Pool tiers. Tier 1 = weaker cards (RTX 20-series & older), Tier 2 = stronger (RTX 30-series & newer). */
export type Tier = 1 | 2;

export type Vendor = "nvidia" | "amd" | "intel" | "unknown";

/** Hardware-detected GPU info reported by the client agent (never user-entered). */
export interface GpuInfo {
  /** Raw model string from nvidia-smi / system, e.g. "NVIDIA GeForce RTX 3060". */
  rawName: string;
  vendor: Vendor;
  /** Normalized model, e.g. "RTX 3060". */
  model: string;
  /** VRAM in MB if known. */
  memoryMb?: number;
  /** Computed pool tier. */
  tier: Tier;
}

/** A GPU owner connected to the arena. */
export interface Competitor {
  id: string;
  /** Solana wallet public key (base58). */
  wallet: string;
  handle: string;
  gpu: GpuInfo;
  tier: Tier;
  online: boolean;
  /** Accumulated arena score / reputation. */
  points: number;
  wins: number;
}

export type BountyStatus = "open" | "battling" | "judging" | "settled" | "cancelled";

/** A task/prompt with a token prize that GPUs compete over. */
export interface Bounty {
  id: string;
  creatorWallet: string;
  title: string;
  prompt: string;
  category: string;
  tier: Tier;
  /** Prize in base units of the SPL token. */
  prizeAmount: number;
  prizeMint: string;
  status: BountyStatus;
  createdAt: number;
  /** Unix ms when battle closes for submissions. */
  closesAt: number;
  winnerSubmissionId?: string;
  /** Treasury escrow tx signature when funded. */
  escrowTxSig?: string;
  /** Payout tx signature when settled. */
  payoutTxSig?: string;
}

/** One GPU's answer to a bounty. */
export interface Submission {
  id: string;
  bountyId: string;
  competitorId: string;
  /** The produced answer text. */
  answer: string;
  /** ms the GPU took to produce the answer. */
  latencyMs: number;
  createdAt: number;
  /** Blind judge score 0-100, set after judging. */
  score?: number;
  /** Short judge rationale. */
  rationale?: string;
}

/** Live battle view for the arena UI. */
export interface Battle {
  bounty: Bounty;
  competitors: Competitor[];
  submissions: Submission[];
}
