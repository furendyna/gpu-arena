import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
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

/** True if `addr` is a syntactically valid base58 Solana address. */
export function isValidSolanaAddress(addr: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(addr);
    return true;
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

/**
 * Detect whether a mint is owned by the classic SPL Token program or Token-2022
 * (pump.fun mints use Token-2022). Falls back to the classic program.
 */
async function getTokenProgramId(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (info && info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

/** Public treasury address (from the secret key, or TREASURY_ADDRESS), or null. */
export function getTreasuryAddress(): string | null {
  const kp = getTreasury();
  if (kp) return kp.publicKey.toBase58();
  return process.env.TREASURY_ADDRESS || null;
}

/** True if the API has enough config to require + verify on-chain escrow. */
export function escrowConfigured(): boolean {
  return Boolean(process.env.PRIZE_TOKEN_MINT && getTreasuryAddress());
}

/**
 * Verify that transaction `sig` deposited at least `uiAmount` of the prize token
 * into the treasury. Uses pre/post token balances so it works for any wallet UI.
 */
export async function verifyEscrowTransfer(sig: string, uiAmount: number): Promise<{ ok: boolean; reason?: string }> {
  const mintStr = process.env.PRIZE_TOKEN_MINT;
  const treasury = getTreasuryAddress();
  if (!mintStr || !treasury) return { ok: false, reason: "escrow not configured" };

  try {
    const connection = getConnection();
    const tx = await connection.getParsedTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return { ok: false, reason: "transaction not found / not confirmed yet" };
    if (tx.meta?.err) return { ok: false, reason: "transaction failed on-chain" };

    const pre = tx.meta?.preTokenBalances ?? [];
    const post = tx.meta?.postTokenBalances ?? [];
    const match = (b: { owner?: string; mint?: string }) => b.owner === treasury && b.mint === mintStr;
    const preAmt = pre.filter(match).reduce((s, b) => s + (b.uiTokenAmount.uiAmount ?? 0), 0);
    const postAmt = post.filter(match).reduce((s, b) => s + (b.uiTokenAmount.uiAmount ?? 0), 0);
    const received = postAmt - preAmt;
    if (received + 1e-9 < uiAmount) {
      return { ok: false, reason: `treasury received ${received}, expected >= ${uiAmount}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
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
  const tokenProgram = await getTokenProgramId(connection, mint);

  const mintInfo = await getMint(connection, mint, undefined, tokenProgram);
  const baseAmount = BigInt(Math.round(uiAmount * 10 ** mintInfo.decimals));

  const fromAta = await getOrCreateAssociatedTokenAccount(
    connection, treasury, mint, treasury.publicKey, false, undefined, undefined, tokenProgram,
  );
  const toAta = await getOrCreateAssociatedTokenAccount(
    connection, treasury, mint, winner, false, undefined, undefined, tokenProgram,
  );

  const signature = await transfer(
    connection,
    treasury,
    fromAta.address,
    toAta.address,
    treasury,
    baseAmount,
    [],
    undefined,
    tokenProgram,
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
  const tokenProgram = await getTokenProgramId(connection, mint);
  const mintInfo = await getMint(connection, mint, undefined, tokenProgram);
  const baseAmount = BigInt(Math.round(uiAmount * 10 ** mintInfo.decimals));

  const treasuryAta = await getOrCreateAssociatedTokenAccount(
    connection, treasury, mint, treasury.publicKey, false, undefined, undefined, tokenProgram,
  );
  const signature = await burn(
    connection, treasury, treasuryAta.address, mint, treasury, baseAmount, [], undefined, tokenProgram,
  );
  return { simulated: false, signature };
}
