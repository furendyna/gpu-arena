# GPU Arena

**Competitive GPU lending on Solana.** Instead of renting your GPU for boring background jobs, you join a **pool** and your GPU *fights* over bounties. Someone posts a prompt with a token prize, every GPU in the pool answers, and a **blind AI judge** picks the best answer — which wins the prize.

Because the strongest card would otherwise always win, GPUs are split into **tiers** and judged on *answer quality*, not raw power.

| Tier | Pool | Hardware |
| --- | --- | --- |
| **Tier 1** | Pool Alpha | NVIDIA RTX 20-series & older (GTX 16/10), AMD RX 5000 & older |
| **Tier 2** | Pool Omega | NVIDIA RTX 30-series & newer (40/50), AMD RX 6000+, Intel Arc |

## Why no smart contract?

This MVP uses **custodial escrow**: a backend treasury wallet holds the bounty prize and pays the winner with a standard SPL-token transfer. No custom on-chain program to write, audit, or deploy.

> ⚠️ **Tradeoff:** users must trust the treasury to pay out fairly. Fine for an MVP; swap in an on-chain escrow program later without touching the rest.

## Anti-cheat: you can't fake your tier

Tier is **never** user-entered. The GPU client agent detects the real card from hardware (`nvidia-smi` / OS query), then **signs** the detected GPU + wallet with its Solana key. The API verifies the ed25519 signature and computes the tier itself. Unknown/spoofed hardware falls back to Tier 1.

## Structure

```
packages/shared   Types + GPU→tier classification (the anti-cheat core)
apps/web          Next.js arena UI + battle animation (the cool visual)
apps/api          Express backend: pools, bounties, blind AI judge, treasury payout
apps/agent        GPU client: detect → sign → compete
```

## Quick start

```bash
npm install

# 1) API (terminal A)
cp apps/api/.env.example apps/api/.env   # fill in for real payouts
npm run dev:api

# 2) Web arena (terminal B)
npm run dev:web        # http://localhost:3000

# 3) A competing GPU (terminal C)
cp apps/agent/.env.example apps/agent/.env
npm run agent
```

### Just see your GPU's tier

```bash
npm run detect --workspace @gpu-arena/agent
# or test a specific card:
# GPU_OVERRIDE="NVIDIA GeForce RTX 4090" npm run detect --workspace @gpu-arena/agent
```

## Judging

Answers are sent to the judge **anonymously** (Answer A, B, C…) so identity/power can't bias the score. Set `OPENAI_API_KEY` in `apps/api/.env` to use an LLM judge; otherwise a deterministic local heuristic scores answers so everything runs offline.

## Going to mainnet (real prizes)

1. Create your SPL prize token and set `PRIZE_TOKEN_MINT`.
2. Fund the treasury wallet (`TREASURY_SECRET_KEY`) with the token + some SOL for fees.
3. Set `ENABLE_REAL_PAYOUTS=true`. Until then, payouts are **simulated** so nothing moves by accident.

Keep `TREASURY_SECRET_KEY` and any `*.keypair.json` secret — they're gitignored.
