import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { Bundler_provider_wallet_keypair, bundlerWalletName, bundleWalletNum } from "../settings";
import { rl, screen_clear } from "../menu/menu";
import { gatherWaiting, logToFile } from "../src/msgLog";
import { readBundlerWallets, sleep } from "../src/util";
import { connection } from "../config";
import { execute } from "../executor/legacy";
import { outputBalance } from "../utils";

const MAX_TRANSFERS_PER_TX = 12;

export const sol_distribute = async () => {
  screen_clear();
  logToFile("Distribute SOL from bundler provider to bundler wallets...");

  const savedWallets = readBundlerWallets(bundlerWalletName);
  if (!savedWallets.length) {
    logToFile(`No wallets in wallets/${bundlerWalletName}.json — generate bundlers first (e.g. Token Launch → Create).`);
    gatherWaiting();
    return;
  }

  const walletKPs = savedWallets
    .slice(0, bundleWalletNum)
    .map((w: string) => Keypair.fromSecretKey(bs58.decode(w)));

  rl.question(
    "\t[Distribute] SOL amount per bundler wallet (c cancel): ",
    async (answer: string) => {
      if (answer === "c") {
        gatherWaiting();
        return;
      }

      const solAmount = parseFloat(answer);
      if (isNaN(solAmount) || solAmount <= 0) {
        logToFile("Invalid amount.");
        await sleep(1500);
        sol_distribute();
        return;
      }

      const lamportsEach = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));

      try {
        for (let batchStart = 0; batchStart < walletKPs.length; batchStart += MAX_TRANSFERS_PER_TX) {
          const batch = walletKPs.slice(batchStart, batchStart + MAX_TRANSFERS_PER_TX);
          const ixs: TransactionInstruction[] = [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 750_000 }),
          ];
          for (const kp of batch) {
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
              const messageV0 = new TransactionMessage({
                payerKey: Bundler_provider_wallet_keypair.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
                instructions: ixs,
              }).compileToV0Message();
              const transaction = new VersionedTransaction(messageV0);
              transaction.sign([Bundler_provider_wallet_keypair]);
              const sim = await connection.simulateTransaction(transaction, { sigVerify: true });
              if (sim.value.err) {
                logToFile(`Simulation error batch ${batchStart}: ${JSON.stringify(sim.value.err)}`);
              }
              const txSig = await execute(transaction, latestBlockhash, 1);
              if (txSig) {
                logToFile(`SOL distributed (batch ${batchStart / MAX_TRANSFERS_PER_TX + 1}): https://solscan.io/tx/${txSig}`);
              }
              break;
            } catch (e) {
              attempts++;
              if (attempts > 3) logToFile(`Distribute batch failed after retries: ${String(e)}`);
            }
          }
          await sleep(500);
        }
        logToFile("SOL distribution finished.");
      } catch (error) {
        logToFile(`SOL distribute error: ${String(error)}`);
      }

      await outputBalance(Bundler_provider_wallet_keypair.publicKey);
      gatherWaiting();
    }
  );
};
