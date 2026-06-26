/**
 * One-time setup: create the $ARENA SPL token + treasury and mint the supply.
 *
 *   npm run create-token --workspace @gpu-arena/api
 *
 * Cluster is taken from SOLANA_CLUSTER / SOLANA_RPC_URL (defaults to mainnet-beta).
 * STRONGLY recommended: test on devnet first (SOLANA_CLUSTER=devnet) — it can
 * airdrop fee SOL automatically and costs nothing.
 *
 * The treasury keypair is reused from TREASURY_SECRET_KEY if set; otherwise a new
 * one is generated and saved to apps/api/treasury.keypair.json (gitignored).
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import bs58 from "bs58";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DECIMALS = Number(process.env.TOKEN_DECIMALS || 9);
const INITIAL_SUPPLY = Number(process.env.INITIAL_SUPPLY || 1_000_000_000); // 1B tokens
const cluster = (process.env.SOLANA_CLUSTER as "devnet" | "mainnet-beta") || "mainnet-beta";
const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl(cluster);

function loadOrCreateTreasury(): { kp: Keypair; created: boolean } {
  if (process.env.TREASURY_SECRET_KEY) {
    return { kp: Keypair.fromSecretKey(bs58.decode(process.env.TREASURY_SECRET_KEY)), created: false };
  }
  const path = join(__dirname, "..", "treasury.keypair.json");
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
    return { kp: Keypair.fromSecretKey(Uint8Array.from(raw)), created: false };
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  return { kp, created: true };
}

async function main() {
  const connection = new Connection(rpcUrl, "confirmed");
  const { kp: treasury, created } = loadOrCreateTreasury();

  console.log(`\nGPU Arena — token setup`);
  console.log(`cluster:  ${cluster}`);
  console.log(`treasury: ${treasury.publicKey.toBase58()}${created ? " (newly generated)" : ""}`);

  let balance = await connection.getBalance(treasury.publicKey);
  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    if (cluster === "devnet") {
      console.log("airdropping 1 devnet SOL for fees…");
      const sig = await connection.requestAirdrop(treasury.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      balance = await connection.getBalance(treasury.publicKey);
    } else {
      console.error(
        `\n✋ Treasury has ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL. Fund it with ~0.05 SOL for fees, then re-run:\n   ${treasury.publicKey.toBase58()}\n`,
      );
      process.exit(1);
    }
  }
  console.log(`balance:  ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  console.log(`\ncreating mint (${DECIMALS} decimals)…`);
  const mint = await createMint(connection, treasury, treasury.publicKey, treasury.publicKey, DECIMALS);

  console.log(`minting ${INITIAL_SUPPLY.toLocaleString()} tokens to treasury…`);
  const ata = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);
  await mintTo(connection, treasury, mint, ata.address, treasury, BigInt(INITIAL_SUPPLY) * BigInt(10) ** BigInt(DECIMALS));

  console.log(`\n✅ Done.\n`);
  console.log(`Add these to apps/api/.env:`);
  console.log(`  PRIZE_TOKEN_MINT=${mint.toBase58()}`);
  if (created) console.log(`  TREASURY_SECRET_KEY=${bs58.encode(treasury.secretKey)}`);
  console.log(`\nAnd to apps/web/.env (public):`);
  console.log(`  NEXT_PUBLIC_PRIZE_TOKEN_MINT=${mint.toBase58()}`);
  console.log(`  NEXT_PUBLIC_TREASURY_ADDRESS=${treasury.publicKey.toBase58()}`);
  console.log(`  NEXT_PUBLIC_SOLANA_RPC_URL=${rpcUrl}`);
  console.log(`\n⚠️  Keep TREASURY_SECRET_KEY secret. It controls the treasury + mint authority.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
