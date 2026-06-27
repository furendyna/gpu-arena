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
    /** Solana wallet public key (base58) the agent signs with (identity/anti-cheat). */
    wallet: string;
    /** Address prizes are paid to. Defaults to `wallet` if not provided. */
    payoutWallet: string;
    handle: string;
    gpu: GpuInfo;
    tier: Tier;
    online: boolean;
    /** Accumulated arena score / reputation. */
    points: number;
    wins: number;
}
export type BountyStatus = "open" | "battling" | "judging" | "settled" | "cancelled";
/** What GPUs must produce for a bounty: a text answer or a generated image. */
export type OutputType = "text" | "image";
/** A task/prompt with a token prize that GPUs compete over. */
export interface Bounty {
    id: string;
    creatorWallet: string;
    title: string;
    prompt: string;
    category: string;
    tier: Tier;
    /** What competitors produce. Defaults to "text" for older bounties. */
    outputType?: OutputType;
    /** Prize in base units of the SPL token. */
    prizeAmount: number;
    prizeMint: string;
    status: BountyStatus;
    createdAt: number;
    /** Unix ms when battle closes for submissions. */
    closesAt: number;
    winnerSubmissionId?: string;
    /** Amount actually paid to the winner (prize minus burn). */
    winnerPayout?: number;
    /** Amount burned from this bounty (25% of prize). */
    burnedAmount?: number;
    /** Treasury escrow tx signature when funded. */
    escrowTxSig?: string;
    /** Payout tx signature when settled. */
    payoutTxSig?: string;
    /** Burn tx signature when settled. */
    burnTxSig?: string;
}
/** One GPU's answer to a bounty. */
export interface Submission {
    id: string;
    bountyId: string;
    competitorId: string;
    /** The produced answer text (empty for image bounties). */
    answer: string;
    /** Base64-encoded PNG for image bounties (no data: prefix). */
    imageBase64?: string;
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
/** Fraction of every prize that is burned (the rest goes to the winner). */
export declare const BURN_RATE = 0.25;
/** Minimum prize (in tokens) required to post a bounty. */
export declare const MIN_PRIZE = 50000;
/** Aggregate, arena-wide counters. */
export interface ArenaStats {
    totalBurned: number;
    totalPaidOut: number;
    battlesCompleted: number;
    activeGpus: number;
}
/** Phase of the currently-featured battle. */
export type ArenaPhase = "idle" | "battling" | "judging" | "reveal";
/** Everything the arena UI needs in one poll. */
export interface ArenaState {
    phase: ArenaPhase;
    /** The battle being shown (battling/judging/reveal), or null when idle. */
    active: Battle | null;
    /** Bounties waiting their turn, in the order they'll run (FIFO). */
    queue: Bounty[];
    /** Registered GPUs grouped by tier. */
    pools: Array<{
        tier: Tier;
        label: string;
        competitors: Competitor[];
    }>;
    stats: ArenaStats;
}
