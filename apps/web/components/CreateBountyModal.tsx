"use client";

import { useState } from "react";
import type { Tier } from "@gpu-arena/shared";
import { createBounty } from "@/lib/api";
import { Modal } from "./Modal";

const field =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-arena-tier2/60";
const label = "mb-1 block text-[11px] uppercase tracking-wide text-slate-400";

export function CreateBountyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("Technology");
  const [tier, setTier] = useState<Tier>(2);
  const [prize, setPrize] = useState(1000);
  const [wallet, setWallet] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const reset = () => {
    setState("idle");
    setMessage("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("loading");
    setMessage("");
    try {
      const { bounty } = await createBounty({
        creatorWallet: wallet || "anon",
        title,
        prompt,
        category,
        tier,
        prizeAmount: Number(prize),
      });
      setState("done");
      setMessage(`Bounty live in Tier ${bounty.tier}! GPUs in that pool can now battle for ${bounty.prizeAmount}.`);
    } catch (err) {
      setState("error");
      setMessage(
        `Couldn't reach the API. Make sure it's running (npm run dev:api). Details: ${(err as Error).message}`,
      );
    }
  };

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
          <div className="rounded-lg border border-arena-sol/30 bg-arena-sol/10 p-4 text-sm text-arena-sol">
            {message}
          </div>
          <p className="text-xs text-slate-400">
            Next: fund the prize into the treasury (custodial escrow). On settlement the winner is paid automatically.
          </p>
          <button onClick={reset} className="text-xs text-slate-300 underline hover:text-white">
            Create another
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={label}>Title</label>
            <input
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What should the GPUs solve?"
              required
            />
          </div>
          <div>
            <label className={label}>Prompt</label>
            <textarea
              className={`${field} min-h-[90px] resize-y`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task in detail…"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Category</label>
              <input className={field} value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div>
              <label className={label}>Prize (token)</label>
              <input
                type="number"
                min={1}
                className={field}
                value={prize}
                onChange={(e) => setPrize(Number(e.target.value))}
                required
              />
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
                  <div className="text-[10px] text-slate-500">
                    {t === 1 ? "RTX 20-series & older" : "RTX 30-series & newer"}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Funding wallet — pays the prize (optional)</label>
            <input
              className={field}
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="Your Solana address that the prize is drawn from"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              This is the creator&apos;s wallet that funds the bounty. Winners are paid to their own GPU agent wallet —
              not set here.
            </p>
          </div>

          {state === "error" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{message}</div>
          )}

          <button
            type="submit"
            disabled={state === "loading"}
            className="clip-card w-full bg-gradient-to-r from-arena-sol to-arena-solb px-6 py-3 font-display text-sm font-bold text-black transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
          >
            {state === "loading" ? "Posting…" : "⚔ Launch Bounty"}
          </button>
        </form>
      )}
    </Modal>
  );
}
