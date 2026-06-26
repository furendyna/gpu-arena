"use client";

import { useEffect, useState } from "react";
import type { Tier } from "@gpu-arena/shared";
import { BURN_RATE, MIN_PRIZE } from "@gpu-arena/shared";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { createBounty, getConfig, type ArenaConfig } from "@/lib/api";
import { Modal } from "./Modal";

const field =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-arena-tier2/60";
const label = "mb-1 block text-[11px] uppercase tracking-wide text-slate-400";

type State = "idle" | "funding" | "loading" | "done" | "error";

export function CreateBountyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("Technology");
  const [tier, setTier] = useState<Tier>(2);
  const [prize, setPrize] = useState(MIN_PRIZE);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [cfg, setCfg] = useState<ArenaConfig | null>(null);

  useEffect(() => {
    if (open && !cfg) getConfig().then(setCfg).catch(() => setCfg(null));
  }, [open, cfg]);

  const reset = () => {
    setState("idle");
    setMessage("");
  };

  /** Send the prize tokens from the connected wallet into the treasury. Returns the tx signature. */
  async function fundPrize(): Promise<string> {
    if (!cfg?.prizeTokenMint || !cfg.treasuryAddress) throw new Error("token/treasury not configured");
    if (!publicKey) throw new Error("wallet not connected");

    const mint = new PublicKey(cfg.prizeTokenMint);
    const treasury = new PublicKey(cfg.treasuryAddress);
    const mintInfo = await getMint(connection, mint);
    const amount = BigInt(Math.round(prize * 10 ** mintInfo.decimals));

    const fromAta = await getAssociatedTokenAddress(mint, publicKey);
    const toAta = await getAssociatedTokenAddress(mint, treasury);

    const tx = new Transaction();
    if (!(await connection.getAccountInfo(toAta))) {
      tx.add(createAssociatedTokenAccountInstruction(publicKey, toAta, treasury, mint));
    }
    tx.add(createTransferCheckedInstruction(fromAta, mint, toAta, publicKey, amount, mintInfo.decimals));

    const sig = await sendTransaction(tx, connection);
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    return sig;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(prize) < MIN_PRIZE) {
      setState("error");
      setMessage(`Minimum prize is ${MIN_PRIZE.toLocaleString()} tokens.`);
      return;
    }
    const escrow = cfg?.escrowEnabled ?? false;
    if (escrow && !publicKey) {
      setState("error");
      setMessage("Connect your wallet first (top-right) to fund the prize.");
      return;
    }

    setMessage("");
    try {
      let escrowTxSig: string | undefined;
      if (escrow) {
        setState("funding");
        escrowTxSig = await fundPrize();
      }
      setState("loading");
      const { bounty } = await createBounty({
        creatorWallet: publicKey?.toBase58() || "anon",
        title,
        prompt,
        category,
        tier,
        prizeAmount: Number(prize),
        escrowTxSig,
      });
      setState("done");
      setMessage(`Bounty live in Tier ${bounty.tier} for ${bounty.prizeAmount.toLocaleString()} tokens!`);
    } catch (err) {
      setState("error");
      setMessage((err as Error).message || "Something went wrong.");
    }
  };

  const escrowOn = cfg?.escrowEnabled ?? false;
  const burn = Math.round(prize * BURN_RATE);
  const toWinner = prize - burn;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Create a Bounty"
      subtitle="Post a prompt with a token prize. Every GPU in the chosen tier competes; the blind judge picks the best answer."
    >
      {state === "done" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-arena-sol/30 bg-arena-sol/10 p-4 text-sm text-arena-sol">{message}</div>
          <p className="text-xs text-slate-400">
            It joins the queue and battles when its turn comes. Winner gets {toWinner.toLocaleString()}; 🔥{" "}
            {burn.toLocaleString()} burned.
          </p>
          <button onClick={reset} className="text-xs text-slate-300 underline hover:text-white">
            Create another
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={label}>Title</label>
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should the GPUs solve?" required />
          </div>
          <div>
            <label className={label}>Prompt</label>
            <textarea className={`${field} min-h-[90px] resize-y`} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the task in detail…" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Category</label>
              <input className={field} value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div>
              <label className={label}>Prize · min {MIN_PRIZE.toLocaleString()} tokens</label>
              <input type="number" min={MIN_PRIZE} step={1000} className={field} value={prize} onChange={(e) => setPrize(Number(e.target.value))} required />
            </div>
          </div>
          <div>
            <label className={label}>Pool / Tier</label>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2] as Tier[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTier(t)}
                  className={`clip-card border px-3 py-2 text-sm transition ${
                    tier === t
                      ? t === 1
                        ? "border-arena-tier1 text-arena-tier1 shadow-neon-cyan"
                        : "border-arena-tier2 text-arena-tier2 shadow-neon-magenta"
                      : "border-white/10 text-slate-400 hover:border-white/30"
                  }`}
                >
                  {t === 1 ? "Tier 1 · Pool Alpha" : "Tier 2 · Pool Omega"}
                  <div className="text-[10px] text-slate-500">{t === 1 ? "RTX 20-series & older" : "RTX 30-series & newer"}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>Winner receives (75%)</span>
              <span className="font-semibold text-arena-sol">{toWinner.toLocaleString()}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Burned (25%)</span>
              <span className="font-semibold text-orange-400">🔥 {burn.toLocaleString()}</span>
            </div>
            <div className="mt-2 border-t border-white/10 pt-2 text-[10px]">
              {escrowOn ? (
                publicKey ? (
                  <span className="text-slate-400">
                    On launch, {prize.toLocaleString()} tokens are sent from your wallet to the treasury.
                  </span>
                ) : (
                  <span className="text-arena-gold">Connect your wallet (top-right) to fund this bounty.</span>
                )
              ) : (
                <span className="text-slate-500">
                  Token not configured yet — bounty is created without on-chain funding (demo mode).
                </span>
              )}
            </div>
          </div>

          {state === "error" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{message}</div>
          )}

          <button
            type="submit"
            disabled={state === "funding" || state === "loading"}
            className="clip-card w-full bg-gradient-to-r from-arena-sol to-arena-solb px-6 py-3 font-display text-sm font-bold text-black transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
          >
            {state === "funding" ? "Confirm in wallet…" : state === "loading" ? "Posting…" : "⚔ Launch Bounty"}
          </button>
        </form>
      )}
    </Modal>
  );
}
