import type { ArenaState, Bounty, Tier } from "@gpu-arena/shared";
import { API_URL } from "./config";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface CreateBountyInput {
  creatorWallet: string;
  title: string;
  prompt: string;
  category: string;
  tier: Tier;
  prizeAmount: number;
  escrowTxSig?: string;
}

export function createBounty(input: CreateBountyInput) {
  return http<{ bounty: Bounty }>("/api/bounties", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listBounties() {
  return http<{ bounties: Bounty[] }>("/api/bounties");
}

export function getArenaState() {
  return http<ArenaState>("/api/arena/state");
}

export interface ArenaConfig {
  cluster: string;
  rpcUrl: string | null;
  prizeTokenMint: string | null;
  treasuryAddress: string | null;
  escrowEnabled: boolean;
  minPrize: number;
  burnRate: number;
}

export function getConfig() {
  return http<ArenaConfig>("/api/config");
}

export function checkHealth() {
  return http<{ ok: boolean; cluster: string }>("/api/health");
}
