import type { ArenaStats, Bounty, Competitor, Submission } from "@gpu-arena/shared";
import { classifyGpu } from "@gpu-arena/shared";
import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

/**
 * Durable store backed by Upstash Redis with a fast in-memory cache.
 *
 * - Reads are served from memory (sync) so the arena loop + polling stay snappy.
 * - Every write is mirrored to Redis (write-through) so nothing is lost on restart.
 * - On boot we hydrate the cache from Redis (see `hydrate()`).
 *
 * Assumes a single API instance (the battle orchestrator is a single loop).
 */

const K = {
  competitors: "arena:competitors", // hash: id -> Competitor JSON
  bounties: "arena:bounties", // hash: id -> Bounty JSON
  submissions: "arena:submissions", // hash: id -> Submission JSON
  stats: "arena:stats", // string: ArenaStats JSON
};

function makeRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. " +
        "Create an Upstash Redis database and set these in apps/api/.env.",
    );
  }
  // Store/return raw strings; we (de)serialize JSON ourselves for predictability.
  return new Redis({ url, token, automaticDeserialization: false });
}

class Store {
  private redis = makeRedis();

  competitors = new Map<string, Competitor>();
  bounties = new Map<string, Bounty>();
  submissions = new Map<string, Submission>();
  stats: ArenaStats = { totalBurned: 0, totalPaidOut: 0, battlesCompleted: 0, activeGpus: 0 };

  /** Load everything from Redis into the in-memory cache. Call once on boot. */
  async hydrate(): Promise<void> {
    const [comps, bounties, subs, stats] = await Promise.all([
      this.redis.hgetall<Record<string, string>>(K.competitors),
      this.redis.hgetall<Record<string, string>>(K.bounties),
      this.redis.hgetall<Record<string, string>>(K.submissions),
      this.redis.get<string>(K.stats),
    ]);

    for (const v of Object.values(comps ?? {})) {
      const c = parse<Competitor>(v);
      if (c) this.competitors.set(c.id, c);
    }
    for (const v of Object.values(bounties ?? {})) {
      const b = parse<Bounty>(v);
      if (b) this.bounties.set(b.id, b);
    }
    for (const v of Object.values(subs ?? {})) {
      const s = parse<Submission>(v);
      if (s) this.submissions.set(s.id, s);
    }
    const st = parse<ArenaStats>(stats);
    if (st) this.stats = st;

    // Reconcile: any battle interrupted by a restart goes back into the queue.
    for (const b of this.bounties.values()) {
      if (b.status === "battling" || b.status === "judging") {
        b.status = "open";
        await this.saveBounty(b);
      }
    }

    console.log(
      `[store] hydrated from Upstash: ${this.competitors.size} GPUs, ${this.bounties.size} bounties, ${this.submissions.size} submissions`,
    );
  }

  async saveCompetitor(c: Competitor): Promise<void> {
    this.competitors.set(c.id, c);
    await this.redis.hset(K.competitors, { [c.id]: JSON.stringify(c) });
  }

  async saveBounty(b: Bounty): Promise<void> {
    this.bounties.set(b.id, b);
    await this.redis.hset(K.bounties, { [b.id]: JSON.stringify(b) });
  }

  async saveSubmission(s: Submission): Promise<void> {
    this.submissions.set(s.id, s);
    await this.redis.hset(K.submissions, { [s.id]: JSON.stringify(s) });
  }

  async saveStats(): Promise<void> {
    await this.redis.set(K.stats, JSON.stringify(this.stats));
  }

  async upsertCompetitor(input: {
    wallet: string;
    payoutWallet?: string;
    handle: string;
    rawName: string;
    memoryMb?: number;
  }): Promise<Competitor> {
    const gpu = classifyGpu(input.rawName, input.memoryMb);
    const existing = [...this.competitors.values()].find((c) => c.wallet === input.wallet);
    const competitor: Competitor = {
      id: existing?.id ?? randomUUID(),
      wallet: input.wallet,
      payoutWallet: input.payoutWallet || input.wallet,
      handle: input.handle,
      gpu,
      tier: gpu.tier,
      online: true,
      points: existing?.points ?? 0,
      wins: existing?.wins ?? 0,
    };
    await this.saveCompetitor(competitor);
    return competitor;
  }

  competitorByWallet(wallet: string): Competitor | undefined {
    return [...this.competitors.values()].find((c) => c.wallet === wallet);
  }

  async createBounty(input: Omit<Bounty, "id" | "status" | "createdAt">): Promise<Bounty> {
    const bounty: Bounty = {
      ...input,
      id: randomUUID(),
      status: "open",
      createdAt: Date.now(),
    };
    await this.saveBounty(bounty);
    return bounty;
  }

  async addSubmission(input: Omit<Submission, "id" | "createdAt">): Promise<Submission> {
    const sub: Submission = { ...input, id: randomUUID(), createdAt: Date.now() };
    await this.saveSubmission(sub);
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

function parse<T>(raw: string | null | undefined): T | null {
  if (raw == null) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  } catch {
    return null;
  }
}

export const store = new Store();

/** Hydrate the cache from Upstash on boot. */
export async function initStore(): Promise<void> {
  await store.hydrate();
}
