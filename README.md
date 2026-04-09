# Pump.fun bundler (TypeScript)

Interactive CLI for Pump.fun–related workflows: token launch, bundled buys, SOL and token distribution across bundler/holder wallets, balance checks, and optional Jito bundle execution. Configuration is split between **environment variables** (RPC and global compute defaults) and a root **`id.json` manifest** (keys, token metadata, and timing / sizing knobs).

## Requirements

- **Node.js** 20+ recommended  
- **Solana RPC** with HTTP and WebSocket endpoints (same provider, matching cluster)  
- **Optional:** Jito block engine + bundle JSON-RPC URL for bundle submission paths in the codebase  
- **SOL** on the wallets you configure for fees, tips, and trading

## Quick start

1. **Clone and install**

   ```bash
   git clone https://github.com/Zentariq/Pumpfun-Bundler-Bot.git
   cd Pumpfun-Bundler-Bot
   npm install
   ```

   Use your own fork or mirror URL if different.

2. **Environment (`.env`)**

   Copy the template and fill every variable (empty values cause the app to exit on startup when `config.ts` loads).

   ```bash
   cp .env.example .env
   ```

   See [Environment variables](#environment-variables) below.

3. **Manifest (`id.json`)**

   Copy the example and edit in place:

   ```bash
   cp id.example.json id.json
   ```

   `id.json` is **gitignored**. It holds base58 secrets and/or **paths to key files**, plus token metadata and runtime tuning. See [Using `id.json`](#using-idjson) for the full schema and behavior.

4. **Run the CLI**

   ```bash
   npm start
   ```

   On Windows, if `cp` is unavailable, use `copy .env.example .env` and `copy id.example.json id.json`.

---

## Using `id.json`

### What it is

- **Location:** project root, filename **`id.json`** (fixed in [`settingsManifest.ts`](settingsManifest.ts) as `MANIFEST_FILE`).
- **Format:** a single **JSON object** (not a bare Solana keypair byte array). Invalid or missing files fall back to internal defaults and may warn in the console.
- **Consumed by:** `settings.ts` → `loadSettingsManifest()` → exports such as `token`, `LP_wallet_keypair`, `Bundler_provider_wallet_keypair`, `batchSize`, `PRIORITY_FEE`, etc.

### Secrets: three logical keys

The app needs material for three roles:

| Role | Purpose (typical) |
|------|-------------------|
| **Mint** | New token mint secret (base58), used as `token.mintPk` after resolution |
| **LP wallet** | Liquidity / pool–related signing |
| **Bundler provider** | Primary signer for many flows (bundles, LUT close script, etc.) |

For **LP** and **Bundler provider**, the effective secret is resolved by [`keypairOrPlaceholder`](settingsManifest.ts):

1. **Inline base58** in `lpWalletPrivateKeyBs58` or `bundlerProviderPrivateKeyBs58` (non-empty string), or  
2. **`paths.*`** — a filesystem path **or** another raw base58 string (see next section).

If neither yields a valid keypair, the code **warns** and uses a **random placeholder** `Keypair` — which will **not** match your real wallets. Always verify keys load correctly (e.g. check exported public keys match your funded accounts).

### Mint public/secret string (`token.mintPk`)

[`resolveMintPkBs58`](settingsManifest.ts) picks the mint string in this order:

1. `mintPrivateKeyBs58` (non-empty)  
2. `token.mintPk` (non-empty)  
3. `paths.mintKeypairBs58`: if that path **exists**, the **file contents** (trimmed) are used as the mint secret string; otherwise, if the path value itself is valid base58, it is used as inline secret  

Legacy aliases merged into the same fields include `mint_private_key`, `configuredMintPk`, `LP_wallet_private_key`, `Bundler_provider_private_key`, and older `paths.lpWalletKeypairJson` / `paths.bundlerProviderKeypairJson` names.

### `paths` — files vs inline base58

Each `paths.*` value can be:

- **Absolute path** or **path relative to the project root** (`process.cwd()`).  
- If the path **exists** as a file:
  - **JSON array of numbers** (Solana CLI keypair export) → decoded as secret key  
  - **JSON object** with numeric `secretKey` array → same  
  - Otherwise, file is read as **UTF-8 text** and interpreted as **base58**  
- If the path does **not** exist as a file, the string is treated as **inline base58** (same as filling the top-level `*PrivateKeyBs58` fields).

Supported base58 decodes: **64-byte** secret key or **32-byte** seed (see `keypairFromBs58String` in [`settingsManifest.ts`](settingsManifest.ts)).

### Example — inline secrets (typical)

The usual setup is to keep **`paths.*` empty** and put base58 material directly on the manifest (same idea as [`id.example.json`](id.example.json)):

```json
{
  "paths": {
    "mintKeypairBs58": "",
    "lpWalletPrivateKeyBs58": "",
    "bundlerProviderPrivateKeyBs58": ""
  },
  "mintPrivateKeyBs58": "<base58 mint secret>",
  "lpWalletPrivateKeyBs58": "<base58 LP secret>",
  "bundlerProviderPrivateKeyBs58": "<base58 bundler provider secret>"
}
```

### Optional — file-backed keys

If you do not want secrets inside `id.json`, set `paths.*` to an **absolute path** or a path **relative to the project root** (any folder you use), pointing at a Solana CLI keypair JSON file or a UTF-8 file whose contents are base58. Non-file `paths.*` strings are still treated as inline base58 (same rules as the **`paths`** subsection above).

### Token metadata (`token`)

The `token` object is merged onto defaults (`DEFAULT_TOKEN_BASE` in [`settingsManifest.ts`](settingsManifest.ts)). Typical fields (see [`src/types.ts`](src/types.ts)):

- `name`, `symbol`, `description`, `showName`  
- `createOn` (e.g. `"Pump.fun"`)  
- `twitter`, `telegram`, `website`  
- `image` — path to image file (example: `./src/image/2.jpg`)

Resolved `token` (including `mintPk`) is exported from `settings.ts`.

### Timing, batching, and economics (numeric fields)

These are read from the manifest and exported from `settings.ts` (defaults exist if keys are omitted):

| Field | Typical meaning |
|-------|-----------------|
| `batchSize` | Batch size for wallet groups |
| `bundleWalletNum` | Total bundler wallets (defaults to `batchSize * 4` if omitted) |
| `bundlerHoldingPercent` | Target holding share for bundler logic |
| `walletCreateInterval` | Delay (seconds) between wallet creation steps |
| `walletTransferInterval` | Delay between transfers |
| `holderTokenTransferInterval` | Delay for holder token moves |
| `holderTokenAmountMax` / `holderTokenAmountMin` | Randomized holder amounts (token units) |
| `distNum` | Distribution parameter |
| `remaining_token_percent` | Remaining supply percentage for flows that use it |
| `bundlerWalletName` / `holderWalletName` | Base names for persisted bundler/holder wallet files |
| `extra_sol_amount` | Extra SOL buffer for operations |
| `PRIORITY_FEE` | SOL amount used in several layouts to derive **per-transaction** compute unit price (see [Fees: `.env` vs `id.json`](#fees-env-vs-idjson)) |
| `holderCreateInterval` | Delay for holder wallet creation |

Exact semantics are defined by the `layout/` and `src/` modules that import each export.

### If `id.json` is missing

[`loadSettingsManifest`](settingsManifest.ts) falls back to [`defaultManifest()`](settingsManifest.ts). Treat that as a last resort: **add a real `id.json`** (copy [`id.example.json`](id.example.json)) and set mint / LP / bundler provider material—usually inline base58 as above—so signing keys are explicit and not left to placeholder defaults.

---

## Environment variables

Loaded by [`config.ts`](config.ts) via `dotenv` from **`.env`** in the project root. All of the following are **required** (missing → log + `process.exit(1)`):

| Variable | Role |
|----------|------|
| `RPC_ENDPOINT` | HTTP RPC URL |
| `RPC_WEBSOCKET_ENDPOINT` | WebSocket URL (`wss://...`) |
| `BLOCKENGINE_URL` | Jito block engine **host only** (no scheme), e.g. `frankfurt.mainnet.block-engine.jito.wtf` |
| `LILJITO_RPC_ENDPOINT` | HTTPS URL for bundle JSON-RPC (e.g. `https://<region>.mainnet.block-engine.jito.wtf/api/v1/bundles`) |
| `JITO_FEE` | Tip in SOL; converted to lamports in config |
| `COMPUTE_UNIT_PRICE` | Micro-lamports per compute unit for code paths that import it from `config` |

See [`.env.example`](.env.example) for placeholders and comments.

### Fees: `.env` vs `id.json`

- **`COMPUTE_UNIT_PRICE`** (`.env`): used where the code imports `COMPUTE_UNIT_PRICE` from `config` (e.g. some bulk send paths).  
- **`PRIORITY_FEE`** (`id.json`): SOL-based value converted to micro-lamports in other flows (e.g. [`layout/createTokenBuy.ts`](layout/createTokenBuy.ts), [`layout/manualRebuy.ts`](layout/manualRebuy.ts), parts of [`index.ts`](index.ts)).

Set both consistently with how your RPC and Jito submission behave under load.

---

## CLI overview (`npm start`)

Main menu ([`menu/menu.ts`](menu/menu.ts)):

1. **Token Launch** — presimulate, or create token / pool and bundle buy ([`layout/`](layout/)).  
2. **Token Sell & Buy** — e.g. sell from each bundler.  
3. **Gather SOL** — gather from all or one bundler, or distribute SOL to bundlers.  
4. **Balances** — SOL and token balances for bundlers.  
5. **Exit**

Submenus guide numeric choices; some prompts accept `c` to cancel (see individual `layout/*` files).

---

## npm scripts

| Command | Description |
|---------|-------------|
| `npm start` / `npm run dev` | Run [`index.ts`](index.ts) (main menu) |
| `npm run close` | Run [`closeLut.ts`](closeLut.ts) — close an address lookup table; uses `Bundler_provider_wallet_keypair` from settings and LUT data from project utilities |
| `npm run gather` | Runs `gather.ts` if present (see [`package.json`](package.json)) |

---

## Additional docs

- [`docs/README.md`](docs/README.md) — notes on bundled assets (e.g. sample bubblemap image).

---

## Security

- **Never commit** `.env`, `id.json`, `settings.ts`, or other sensitive files listed in [`.gitignore`](.gitignore).  
- Treat **`id.json`** and any key file as **full wallet access**; use dedicated hot wallets and minimal balances where possible.  
- If you see `[settings] ... using a random placeholder keypair`, fix `id.json` / paths immediately before spending real funds.

---

## License

ISC — see [`package.json`](package.json).
