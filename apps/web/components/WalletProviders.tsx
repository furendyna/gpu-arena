"use client";

import { Buffer } from "buffer";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

// Solana/SPL libraries expect a global Buffer in the browser; Next doesn't add it.
if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}

/**
 * Wallet adapter context. Phantom/Solflare and other modern wallets register via
 * the Wallet Standard, so no per-wallet adapter packages are needed.
 */
export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => {
    const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as "mainnet-beta" | "devnet") || "mainnet-beta";
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(cluster);
  }, []);

  // Modern wallets register via the Wallet Standard, but explicitly listing the
  // common adapters guarantees they appear even when standard auto-detection
  // doesn't fire (browser injection timing, etc.).
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
