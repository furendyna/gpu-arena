import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

/** Load an existing keypair file or create a new one (JSON array of secret bytes). */
export function loadOrCreateWallet(path: string): Keypair {
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`[agent] created new wallet at ${path}`);
  return kp;
}

export function signMessage(kp: Keypair, message: string): string {
  const sig = nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey);
  return bs58.encode(sig);
}
