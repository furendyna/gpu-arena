import type { GpuInfo, Tier } from "./types";
/**
 * Returns the tier for a given raw GPU model string.
 * Conservative default: unknown hardware lands in Tier 1 (weaker pool) so a
 * spoofed/unrecognized card can never sneak into the stronger pool.
 */
export declare function tierForModel(rawName: string): Tier;
/** Build a trusted GpuInfo from an agent-detected raw model string. */
export declare function classifyGpu(rawName: string, memoryMb?: number): GpuInfo;
export declare const TIER_LABELS: Record<Tier, string>;
