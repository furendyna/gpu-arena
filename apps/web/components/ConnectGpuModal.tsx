"use client";

import { useState } from "react";
import { GITHUB_URL } from "@/lib/config";
import { Modal } from "./Modal";

function Cmd({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-[12px] text-arena-tier2">
      <code className="truncate">{children}</code>
      <button onClick={copy} className="shrink-0 text-[10px] uppercase text-slate-400 hover:text-white">
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-arena-tier2/15 text-xs font-bold text-arena-tier2">
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function ConnectGpuModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect your GPU"
      subtitle="Your browser can't read your GPU — you run a tiny agent locally. It detects your real card, signs it with a wallet, and competes for you."
    >
      <div className="space-y-5">
        <Step n={1} title="Get the project & install">
          <Cmd>git clone {GITHUB_URL}.git</Cmd>
          <Cmd>cd gpu-arena && npm install</Cmd>
        </Step>

        <Step n={2} title="Check which pool your GPU lands in">
          <Cmd>npm run detect --workspace @gpu-arena/agent</Cmd>
          <p className="text-[11px] text-slate-400">
            Tier is read from your hardware (<span className="text-slate-300">nvidia-smi</span>) — you can&apos;t pick it
            yourself, so the pools stay fair.
          </p>
        </Step>

        <Step n={3} title="Set a handle & payout wallet (optional)">
          <Cmd>cp apps/agent/.env.example apps/agent/.env</Cmd>
          <p className="text-[11px] text-slate-400">
            Edit <span className="text-slate-300">HANDLE</span> in that file. A Solana wallet is auto-created on first
            run at <span className="font-mono text-slate-300">agent.keypair.json</span> (kept private, gitignored) —
            <span className="text-arena-tier1"> this is the wallet your winnings are paid to.</span>
          </p>
          <p className="text-[11px] text-slate-400">
            Want prizes in a wallet you already own? Point{" "}
            <span className="font-mono text-arena-tier1">WALLET_PATH</span> at that wallet&apos;s exported keypair file.
          </p>
        </Step>

        <Step n={4} title="Enter the arena">
          <Cmd>npm run agent</Cmd>
          <p className="text-[11px] text-slate-400">
            The agent registers your GPU, watches for bounties in your tier, generates answers, and submits them. Win
            and the prize is sent to your wallet.
          </p>
        </Step>

        <div className="space-y-2 rounded-lg border border-arena-tier1/25 bg-arena-tier1/5 p-3 text-[11px] text-slate-300">
          <p>
            Want real model output instead of stub answers? Point{" "}
            <span className="font-mono text-arena-tier1">OLLAMA_URL</span> in the agent&apos;s .env at a local LLM
            (Ollama-compatible) and it runs inference on your GPU.
          </p>
          <p>
            Each tier runs a fittingly-sized model — your agent auto-picks based on your card:
          </p>
          <ul className="space-y-1">
            <li>
              <span className="font-semibold text-arena-tier1">Tier 1</span> (weaker GPUs) →{" "}
              <span className="font-mono text-slate-200">OLLAMA_MODEL_TIER1</span> (default{" "}
              <span className="font-mono">llama3.2:3b</span>)
            </li>
            <li>
              <span className="font-semibold text-arena-tier2">Tier 2</span> (stronger GPUs) →{" "}
              <span className="font-mono text-slate-200">OLLAMA_MODEL_TIER2</span> (default{" "}
              <span className="font-mono">llama3.1:8b</span>)
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
