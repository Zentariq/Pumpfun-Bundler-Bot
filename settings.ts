import { UserToken } from "./src/types";
import {
  DEFAULT_TOKEN_BASE,
  keypairOrPlaceholder,
  loadSettingsManifest,
  resolveMintPkBs58,
} from "./settingsManifest";

const manifest = loadSettingsManifest();

export const token: UserToken = {
  ...DEFAULT_TOKEN_BASE,
  ...manifest.token,
  mintPk: resolveMintPkBs58(manifest),
};

export const LP_wallet_private_key = manifest.lpWalletPrivateKeyBs58;
export const LP_wallet_keypair = keypairOrPlaceholder(
  "lpWalletPrivateKeyBs58",
  LP_wallet_private_key,
  manifest.paths.lpWalletPrivateKeyBs58
);

export const Bundler_provider_private_key = manifest.bundlerProviderPrivateKeyBs58;
export const Bundler_provider_wallet_keypair = keypairOrPlaceholder(
  "bundlerProviderPrivateKeyBs58",
  Bundler_provider_private_key,
  manifest.paths.bundlerProviderPrivateKeyBs58
);

export const batchSize = manifest.batchSize;
export const bundleWalletNum = manifest.bundleWalletNum ?? manifest.batchSize * 4;

export const bundlerHoldingPercent = manifest.bundlerHoldingPercent;

export const walletCreateInterval = manifest.walletCreateInterval;

export const walletTransferInterval = manifest.walletTransferInterval;

export const holderTokenTransferInterval = manifest.holderTokenTransferInterval;

export const holderTokenAmountMax = manifest.holderTokenAmountMax;

export const holderTokenAmountMin = manifest.holderTokenAmountMin;

export const distNum = manifest.distNum;

export const remaining_token_percent = manifest.remaining_token_percent;

export const bundlerWalletName = manifest.bundlerWalletName;

export const holderWalletName = manifest.holderWalletName;

export const extra_sol_amount = manifest.extra_sol_amount;

export const PRIORITY_FEE = manifest.PRIORITY_FEE;

export const holderCreateInterval = manifest.holderCreateInterval;
