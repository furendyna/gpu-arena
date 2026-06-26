import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getMint,
  transfer,
  burn,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Verify that `signatureB58` is a valid ed25519 signature of `message`
 * produced by the holder of `walletB58`. This is how we trust an agent's
 * self-reported (but hardware-detected) GPU info: the agent must sign it.
 */
export function verifyWalletSignature(
  walletB58: string,
  message: string,
  signatureB58: string,
): boolean {
  try {
    const pub = bs58.decode(walletB58);
    const sig = bs58.decode(signatureB58);
    const msg = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch {
    return false;
  }
}

function getConnection(): Connection {
  const url =
    process.env.SOLANA_RPC_URL ||
    clusterApiUrl((process.env.SOLANA_CLUSTER as any) || "mainnet-beta");
  return new Connection(url, "confirmed");
}

function getTreasury(): Keypair | null {
  const secret = process.env.TREASURY_SECRET_KEY;
  if (!secret) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch (err) {
    console.error("[solana] invalid TREASURY_SECRET_KEY:", err);
    return null;
  }
}

export interface PayoutResult {
  simulated: boolean;
  signature?: string;
  reason?: string;
}

/**
 * Custodial payout: send `uiAmount` of the prize token from the treasury to the
 * winner. Guarded by ENABLE_REAL_PAYOUTS so nothing moves on mainnet by accident.
 */
export async function payoutToWinner(
  winnerWalletB58: string,
  uiAmount: number,
): Promise<PayoutResult> {
  const enabled = process.env.ENABLE_REAL_PAYOUTS === "true";
  const mintStr = process.env.PRIZE_TOKEN_MINT;
  const treasury = getTreasury();

  if (!enabled || !mintStr || !treasury) {
    return {
      simulated: true,
      reason: !enabled
        ? "ENABLE_REAL_PAYOUTS is false"
        : !mintStr
          ? "PRIZE_TOKEN_MINT not set"
          : "TREASURY_SECRET_KEY not set",
    };
  }

  const connection = getConnection();
  const mint = new PublicKey(mintStr);
  const winner = new PublicKey(winnerWalletB58);

  const mintInfo = await getMint(connection, mint);
  const baseAmount = BigInt(Math.round(uiAmount * 10 ** mintInfo.decimals));

  const fromAta = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);
  const toAta = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, winner);

  const signature = await transfer(
    connection,
    treasury,
    fromAta.address,
    toAta.address,
    treasury,
    baseAmount,
  );
  return { simulated: false, signature };
}

/**
 * Permanently burn `uiAmount` of the prize token from the treasury (25% of the
 * prize). Guarded by ENABLE_REAL_PAYOUTS like payouts; otherwise simulated.
 */
export async function burnPrize(uiAmount: number): Promise<PayoutResult> {
  if (uiAmount <= 0) return { simulated: true, reason: "nothing to burn" };

  const enabled = process.env.ENABLE_REAL_PAYOUTS === "true";
  const mintStr = process.env.PRIZE_TOKEN_MINT;
  const treasury = getTreasury();

  if (!enabled || !mintStr || !treasury) {
    return {
      simulated: true,
      reason: !enabled
        ? "ENABLE_REAL_PAYOUTS is false"
        : !mintStr
          ? "PRIZE_TOKEN_MINT not set"
          : "TREASURY_SECRET_KEY not set",
    };
  }

  const connection = getConnection();
  const mint = new PublicKey(mintStr);
  const mintInfo = await getMint(connection, mint);
  const baseAmount = BigInt(Math.round(uiAmount * 10 ** mintInfo.decimals));

  const treasuryAta = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);
  const signature = await burn(connection, treasury, treasuryAta.address, mint, treasury, baseAmount);
  return { simulated: false, signature };
}
