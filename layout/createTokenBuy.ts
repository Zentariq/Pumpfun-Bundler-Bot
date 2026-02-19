import fs from "fs";
import path from "path";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import bs58 from "bs58";
import {
  batchSize,
  Bundler_provider_wallet_keypair,
  bundleWalletNum,
  bundlerWalletName,
  extra_sol_amount,
  LP_wallet_keypair,
  PRIORITY_FEE,
  token,
  walletCreateInterval,
  walletTransferInterval,
} from "../settings";
import { rl, screen_clear } from "../menu/menu";
import { logToFile, tokenLaunchWaiting } from "../src/msgLog";
import { PumpFunSDK } from "../src/pumpfun/pumpfun";
import { readBundlerWallets, saveBundlerWalletsToFile, sleep } from "../src/util";
import { connection } from "../config";
import { execute } from "../executor/legacy";

const sdk = new PumpFunSDK(
  new AnchorProvider(connection, new NodeWallet(new Keypair()), { commitment: "confirmed" })
);

const MINT_FILE = path.join(process.cwd(), "wallets", "mintKeypair.bs58");

function pickMetadataUri(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const nested = m.metadata as Record<string, unknown> | undefined;
  return (
    (typeof m.metadataUri === "string" && m.metadataUri) ||
    (nested && typeof nested.metadataUri === "string" && nested.metadataUri) ||
    (typeof m.uri === "string" && m.uri) ||
    null
  );
}

function resolveImagePath(): string {
  const rel = (token.image || "").replace(/^\.\//, "");
  return path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
}

function priorityMicroLamports(): number {
  return Math.floor(((PRIORITY_FEE * 10 ** 9) / 500_000) * 10 ** 6);
}

async function ensureBundlerKeypairs(): Promise<Keypair[]> {
  const saved = readBundlerWallets(bundlerWalletName);
  if (saved.length >= bundleWalletNum) {
    return saved
      .slice(0, bundleWalletNum)
      .map((w: string) => Keypair.fromSecretKey(bs58.decode(w)));
  }

  logToFile(`Generating ${bundleWalletNum} bundler wallets (interval ${walletCreateInterval}s)...`);
  const out: string[] = [];
  for (let i = 0; i < bundleWalletNum; i++) {
    await sleep(walletCreateInterval * 1000);
    out.push(bs58.encode(Keypair.generate().secretKey));
  }
  saveBundlerWalletsToFile(out, bundlerWalletName);
  return out.map((w) => Keypair.fromSecretKey(bs58.decode(w)));
}

async function fundBundlers(walletKPs: Keypair[], lamportsEach: bigint): Promise<void> {
  for (let i = 0; i < walletKPs.length; i += batchSize) {
    const slice = walletKPs.slice(i, i + batchSize);
    const ixs: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 750_000 }),
    ];
    for (const kp of slice) {
      ixs.push(
        SystemProgram.transfer({
          fromPubkey: Bundler_provider_wallet_keypair.publicKey,
          toPubkey: kp.publicKey,
          lamports: lamportsEach,
        })
      );
    }
    let attempts = 0;
    while (attempts < 4) {
      try {
        const latestBlockhash = await connection.getLatestBlockhash();
        const tx = new VersionedTransaction(
          new TransactionMessage({
            payerKey: Bundler_provider_wallet_keypair.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: ixs,
          }).compileToV0Message()
        );
        tx.sign([Bundler_provider_wallet_keypair]);
        const sig = await execute(tx, latestBlockhash, 1);
        if (sig) logToFile(`Fund bundlers batch: https://solscan.io/tx/${sig}`);
        break;
      } catch {
        attempts++;
      }
    }
    await sleep(walletTransferInterval * 1000);
  }
}

async function sendBuys(mint: PublicKey, walletKPs: Keypair[], buySol: number): Promise<void> {
  const lamports = BigInt(Math.floor(buySol * LAMPORTS_PER_SOL));
  for (let i = 0; i < walletKPs.length; i++) {
    const kp = walletKPs[i];
    try {
      const buyIxs = await sdk.getBuyInstructionsBySolAmount(kp.publicKey, mint, lamports, 0);
      const latestBlockhash = await connection.getLatestBlockhash();
      const instructions: TransactionInstruction[] = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports() }),
        ...buyIxs,
      ];
      const tx = new VersionedTransaction(
        new TransactionMessage({
          payerKey: kp.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions,
        }).compileToV0Message()
      );
      tx.sign([kp]);
      const sig = await execute(tx, latestBlockhash, 1);
      if (sig) logToFile(`Bundler ${i + 1} buy: https://solscan.io/tx/${sig}`);
    } catch (e) {
      logToFile(`Bundler ${i + 1} buy failed: ${String(e)}`);
    }
    await sleep(400);
  }
}

export async function presimulateLaunch(): Promise<void> {
  logToFile("Presimulate: metadata upload, create tx, and sample buy (if mint / bundlers exist)...");

  if (!token.name?.trim() || !token.symbol?.trim()) {
    logToFile("Set token.name and token.symbol in settings.ts first.");
    return;
  }

  const imagePath = resolveImagePath();
  if (!fs.existsSync(imagePath)) {
    logToFile(`Token image not found: ${imagePath} — fix token.image in settings.`);
    return;
  }

  try {
    const buf = fs.readFileSync(imagePath);
    const blob = new Blob([buf]);
    const metaResp = await sdk.createTokenMetadata({
      name: token.name,
      symbol: token.symbol,
      description: token.description || " ",
      file: blob,
      twitter: token.twitter,
      telegram: token.telegram,
      website: token.website,
    });
    const uri = pickMetadataUri(metaResp);
    if (!uri) {
      logToFile(`Could not read metadata URI from pump.fun response: ${JSON.stringify(metaResp)}`);
      return;
    }
    logToFile(`Metadata URI: ${uri}`);

    const mint = Keypair.generate();
    const createIx = await sdk.getCreateInstructions(
      LP_wallet_keypair.publicKey,
      token.name,
      token.symbol,
      uri,
      mint
    );
    const bh = await connection.getLatestBlockhash();
    const createTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: LP_wallet_keypair.publicKey,
        recentBlockhash: bh.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports() }),
          createIx,
        ],
      }).compileToV0Message()
    );
    createTx.sign([LP_wallet_keypair, mint]);
    const simCreate = await connection.simulateTransaction(createTx, { sigVerify: false });
    logToFile(
      `Create tx simulation: err=${JSON.stringify(simCreate.value.err)} unitsConsumed=${simCreate.value.unitsConsumed ?? "?"}`
    );

    const mintPk = token.mintPk?.trim();
    if (!mintPk) {
      logToFile("No token.mintPk yet — skipping buy simulation until after a successful create.");
      return;
    }

    const saved = readBundlerWallets(bundlerWalletName);
    if (!saved.length) {
      logToFile("No bundler wallets — skipping buy simulation.");
      return;
    }

    const mintPub = Keypair.fromSecretKey(bs58.decode(mintPk)).publicKey;
    const kp = Keypair.fromSecretKey(bs58.decode(saved[0]));
    const testLamports = BigInt(Math.min(50_000_000, Math.floor(0.05 * LAMPORTS_PER_SOL)));
    const buyIxs = await sdk.getBuyInstructionsBySolAmount(kp.publicKey, mintPub, testLamports, 0);
    const bh2 = await connection.getLatestBlockhash();
    const buyTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: kp.publicKey,
        recentBlockhash: bh2.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports() }),
          ...buyIxs,
        ],
      }).compileToV0Message()
    );
    buyTx.sign([kp]);
    const simBuy = await connection.simulateTransaction(buyTx, { sigVerify: false });
    logToFile(
      `Sample buy simulation (bundler 1): err=${JSON.stringify(simBuy.value.err)} unitsConsumed=${simBuy.value.unitsConsumed ?? "?"}`
    );
  } catch (e) {
    logToFile(`Presimulate error: ${String(e)}`);
  }
}

export const create_Buy = async () => {
  screen_clear();
  logToFile("Create Token & Pool and Bundle Buy");

  if (!token.name?.trim() || !token.symbol?.trim()) {
    logToFile("Set token.name and token.symbol in settings.ts before launching.");
    tokenLaunchWaiting();
    return;
  }

  const imagePath = resolveImagePath();
  if (!fs.existsSync(imagePath)) {
    logToFile(`Token image missing: ${imagePath}`);
    tokenLaunchWaiting();
    return;
  }

  rl.question("\t[Create] SOL per bundler for buy (e.g. 0.02), c cancel: ", async (answer: string) => {
    if (answer === "c") {
      tokenLaunchWaiting();
      return;
    }

    const buySol = parseFloat(answer);
    if (isNaN(buySol) || buySol <= 0) {
      logToFile("Invalid buy amount.");
      await sleep(1500);
      create_Buy();
      return;
    }

    try {
      const walletKPs = await ensureBundlerKeypairs();
      const fundLamports =
        BigInt(Math.ceil(buySol * LAMPORTS_PER_SOL)) +
        BigInt(Math.ceil(extra_sol_amount * LAMPORTS_PER_SOL));

      const buf = fs.readFileSync(imagePath);
      const blob = new Blob([buf]);
      logToFile("Uploading metadata to pump.fun...");
      const metaResp = await sdk.createTokenMetadata({
        name: token.name,
        symbol: token.symbol,
        description: token.description || " ",
        file: blob,
        twitter: token.twitter,
        telegram: token.telegram,
        website: token.website,
      });
      const uri = pickMetadataUri(metaResp);
      if (!uri) {
        logToFile(`Bad metadata response: ${JSON.stringify(metaResp)}`);
        tokenLaunchWaiting();
        return;
      }

      const mint = Keypair.generate();
      const createIx = await sdk.getCreateInstructions(
        LP_wallet_keypair.publicKey,
        token.name,
        token.symbol,
        uri,
        mint
      );
      const bh = await connection.getLatestBlockhash();
      const createTx = new VersionedTransaction(
        new TransactionMessage({
          payerKey: LP_wallet_keypair.publicKey,
          recentBlockhash: bh.blockhash,
          instructions: [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports() }),
            createIx,
          ],
        }).compileToV0Message()
      );
      createTx.sign([LP_wallet_keypair, mint]);
      logToFile("Sending create transaction...");
      const createSig = await execute(createTx, bh, 1);
      if (!createSig) {
        logToFile("Create transaction failed or was not confirmed.");
        tokenLaunchWaiting();
        return;
      }
      logToFile(`Token created: https://solscan.io/tx/${createSig}`);

      if (!fs.existsSync(path.dirname(MINT_FILE))) {
        fs.mkdirSync(path.dirname(MINT_FILE), { recursive: true });
      }
      fs.writeFileSync(MINT_FILE, bs58.encode(mint.secretKey), "utf8");
      logToFile(`Mint keypair saved to wallets/mintKeypair.bs58 — token.mintPk can read this after app restart, or paste the file contents into settings.`);

      logToFile(`Funding ${walletKPs.length} bundlers (${Number(fundLamports) / LAMPORTS_PER_SOL} SOL each incl. buffer)...`);
      await fundBundlers(walletKPs, fundLamports);

      logToFile("Submitting bundler buys...");
      await sendBuys(mint.publicKey, walletKPs, buySol);
      logToFile("Create + buy flow finished.");
    } catch (e) {
      logToFile(`create_Buy error: ${String(e)}`);
    }

    tokenLaunchWaiting();
  });
};
