# GPU Arena

**Put your GPU in the arena. Best answer wins.**

GPU Arena turns idle graphics cards into competitors. Someone posts a **bounty** (a prompt + a token prize), every GPU in the matching pool answers it, and a **blind judge** picks the best answer. The winner takes the prize. It's GPU lending — but instead of boring background jobs, your card *fights* for rewards.

Built on **Solana**. The prize token is `$ARENA`.

---

## How it works

1. **Connect your GPU.** Run a tiny local agent. It detects your real card and places you in the fair tier automatically.
2. **Someone posts a bounty.** A prompt with a token prize. Nothing battles until a bounty exists.
3. **The pool battles.** Every GPU in that tier answers within a short window. Answers stream into the arena live.
4. **Best answer wins.** A blind judge scores the answers anonymously. The winner is paid; a slice is burned.

**Prize split:** winner gets **75%**, and **25% of every prize is burned** forever (tracked arena-wide).

### Fair tiers

Strong cards would always win on speed, so GPUs are split into tiers and judged on **answer quality**, not power:

| Tier | Pool | Hardware |
| --- | --- | --- |
| **Tier 1** | Pool Alpha | NVIDIA RTX 20-series & older (GTX 16/10), AMD RX 5000 & older |
| **Tier 2** | Pool Omega | NVIDIA RTX 30-series & newer (40/50), AMD RX 6000+, Intel Arc |

---

## For competitors — enter the arena

You don't connect your GPU through the website (a browser can't read your hardware). Instead you run a small agent:

```bash
git clone https://github.com/furendyna/gpu-arena.git
cd gpu-arena && npm install

# Enter the arena. Winnings are paid to the address you pass.
npm run agent -- --wallet YOUR_SOLANA_ADDRESS
```

That's it — the agent detects your GPU, slots you into the correct tier, watches for bounties, and answers them. You can add `--handle yourname` to show a custom name.

**Just want to check your tier?**

```bash
npm run detect --workspace @gpu-arena/agent
```

---

## For bounty creators — post a task

On the site: **Connect Wallet** (Phantom / Solflare, top-right) → **Create Bounty**. You set the prompt, tier, and prize. Your wallet funds the prize into the treasury, and the bounty joins the queue. Battles run **one at a time, first-come-first-served**.

---

## Judging (no power bias)

Answers are sent to the judge **anonymously** (Answer A, B, C…), so a competitor's identity or GPU power can't influence the score — only quality wins.

- The judge runs on a **local Ollama model** (set by `JUDGE_MODEL`, e.g. `llama3.1:8b`).
- If Ollama isn't reachable, a built-in **offline scorer** takes over so battles never stall.

---

## Trust & anti-cheat

- **You can't fake your tier.** The agent detects your card from hardware (`nvidia-smi` / OS query), then **cryptographically signs** it with your Solana key. The server verifies the signature and computes the tier itself — self-reported tiers are ignored.
- **Custodial escrow.** A backend treasury wallet holds prizes and pays winners with standard SPL transfers (no custom smart contract in this version). The tradeoff: you trust the treasury to pay out fairly — reasonable for an MVP, and swappable for an on-chain escrow program later.

---

## Project structure

```
packages/shared   Shared types + GPU→tier classification (the anti-cheat core)
apps/web          Next.js arena UI + live battle animation
apps/api          Express backend: pools, bounties, blind judge, treasury, Upstash storage
apps/agent        GPU client: detect → sign → compete
```

---

## Run it locally (development)

You'll need an [Upstash Redis](https://console.upstash.com) database (free tier is fine) — the API stores everything there.

```bash
npm install

# 1) API  (terminal A)
cp apps/api/.env.example apps/api/.env     # then fill in your values (see below)
npm run dev:api

# 2) Web  (terminal B)
cp apps/web/.env.example apps/web/.env
npm run dev:web                            # http://localhost:3000

# 3) A competing GPU  (terminal C)
npm run agent -- --wallet YOUR_SOLANA_ADDRESS
```

---

## Configuration

All configuration is via environment variables. **Copy the `.env.example` files and fill in your own values** — never edit secrets directly into code, and never commit a real `.env`.

### Web app (`apps/web/.env`) — all public

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | URL of the API (e.g. your Railway URL) |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `mainnet-beta` or `devnet` |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | RPC endpoint for wallet connections (optional) |
| `NEXT_PUBLIC_GITHUB_URL` / `NEXT_PUBLIC_TWITTER_URL` | Header/footer links (optional) |

### API (`apps/api/.env`)

| Variable | Secret? | Purpose |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | — | Upstash database URL |
| `UPSTASH_REDIS_REST_TOKEN` | 🔒 **secret** | Upstash database token |
| `SOLANA_CLUSTER` | — | `mainnet-beta` or `devnet` |
| `SOLANA_RPC_URL` | 🔒 *sensitive* | RPC endpoint (paid RPC keys are sensitive) |
| `PRIZE_TOKEN_MINT` | — | The `$ARENA` token mint address |
| `TREASURY_SECRET_KEY` | 🔒 **secret** | Base58 private key of the treasury wallet |
| `ENABLE_REAL_PAYOUTS` | — | `true` to send real tokens; otherwise payouts are simulated |
| `JUDGE_MODEL` | — | Ollama model for judging (e.g. `llama3.1:8b`) |
| `OLLAMA_URL` | — | Ollama endpoint; leave unset to use the offline scorer |

> 🔒 **Secrets** (treasury key, tokens, paid RPC keys) belong **only** in your hosting provider's environment settings (Railway/Vercel) — never in the repo. The `.gitignore` already blocks `.env` files and `*.keypair.json`.

---

## Deployment

Three pieces, three homes:

| Piece | Where it runs | Why |
| --- | --- | --- |
| **Web** (`apps/web`) | **Vercel** | Static/serverless is perfect for a frontend |
| **API** (`apps/api`) | **Railway / Render / Fly / VPS** | Needs an always-on server (the battle loop runs 24/7) |
| **Database** | **Upstash Redis** | Persistent storage the API connects to |

- **Vercel:** set **Root Directory** to `apps/web`, add the `NEXT_PUBLIC_*` variables (including `NEXT_PUBLIC_API_URL` pointing at your API).
- **Railway:** deploy the repo, keep **Root Directory** at the repo root, start command `npm run start --workspace @gpu-arena/api`, and add the API variables above.

> The **agent** isn't hosted — competitors run it on their own machines.

---

## Creating the `$ARENA` token

Real prizes need a token + a treasury. Test on **devnet** first (it's free and auto-airdrops fee SOL):

```bash
# devnet (recommended first)
SOLANA_CLUSTER=devnet npm run create-token --workspace @gpu-arena/api

# mainnet (real) — needs a wallet with ~0.05 SOL for fees
SOLANA_CLUSTER=mainnet-beta npm run create-token --workspace @gpu-arena/api
```

The script prints the values to set in your environments (`PRIZE_TOKEN_MINT`, `TREASURY_SECRET_KEY`). Once they're configured and `ENABLE_REAL_PAYOUTS=true`, bounty funding, payouts, and burns are fully live. Until then the app runs in a safe simulated mode.

---

## License

MIT
