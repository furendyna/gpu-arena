import type { ArenaStats, Bounty, Competitor, Submission } from "@gpu-arena/shared";
import { classifyGpu } from "@gpu-arena/shared";
import { randomUUID } from "node:crypto";

/** Simple in-memory store. Swap for a real DB (Postgres/Redis) later. */
class Store {
  competitors = new Map<string, Competitor>();
  bounties = new Map<string, Bounty>();
  submissions = new Map<string, Submission>();
  stats: ArenaStats = { totalBurned: 0, totalPaidOut: 0, battlesCompleted: 0, activeGpus: 0 };

  upsertCompetitor(input: {
    wallet: string;
    handle: string;
    rawName: string;
    memoryMb?: number;
  }): Competitor {
    const gpu = classifyGpu(input.rawName, input.memoryMb);
    const existing = [...this.competitors.values()].find((c) => c.wallet === input.wallet);
    const competitor: Competitor = {
      id: existing?.id ?? randomUUID(),
      wallet: input.wallet,
      handle: input.handle,
      gpu,
      tier: gpu.tier,
      online: true,
      points: existing?.points ?? 0,
      wins: existing?.wins ?? 0,
    };
    this.competitors.set(competitor.id, competitor);
    return competitor;
  }

  competitorByWallet(wallet: string): Competitor | undefined {
    return [...this.competitors.values()].find((c) => c.wallet === wallet);
  }

  createBounty(input: Omit<Bounty, "id" | "status" | "createdAt">): Bounty {
    const bounty: Bounty = {
      ...input,
      id: randomUUID(),
      status: "open",
      createdAt: Date.now(),
    };
    this.bounties.set(bounty.id, bounty);
    return bounty;
  }

  addSubmission(input: Omit<Submission, "id" | "createdAt">): Submission {
    const sub: Submission = { ...input, id: randomUUID(), createdAt: Date.now() };
    this.submissions.set(sub.id, sub);
    return sub;
  }

  submissionsFor(bountyId: string): Submission[] {
    return [...this.submissions.values()].filter((s) => s.bountyId === bountyId);
  }

  /** Open bounties waiting to battle, oldest first (FIFO queue order). */
  queuedBounties(): Bounty[] {
    return [...this.bounties.values()]
      .filter((b) => b.status === "open")
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** The next bounty that should battle, or undefined if the queue is empty. */
  nextQueued(): Bounty | undefined {
    return this.queuedBounties()[0];
  }
}

export const store = new Store();

/** Seed a few competitors + a sample bounty so the API is browsable out of the box. */
export function seed() {
  const seedComps: Array<[string, string, string, number]> = [
    ["frostbyte", "9xQeAlpha1", "NVIDIA GeForce RTX 2060", 6144],
    ["neonkid", "7Kp2Alpha2", "NVIDIA GeForce RTX 2080 Ti", 11264],
    ["overclocked", "Bk7tOmega1", "NVIDIA GeForce RTX 4090", 24576],
    ["tensorrush", "Dq8wOmega3", "NVIDIA GeForce RTX 4080 Super", 16384],
  ];
  for (const [handle, wallet, rawName, mem] of seedComps) {
    store.upsertCompetitor({ handle, wallet, rawName, memoryMb: mem });
  }
  store.stats.activeGpus = store.competitors.size;
  // No seeded bounty: the arena stays idle until someone creates one.
}
