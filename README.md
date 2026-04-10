# Pump.fun bundler (TypeScript)

Interactive CLI for Pump.fun–related flows: token launch, buy/sell bundling, holder and SOL distribution, and Jito bundle execution.

## Requirements

- Node.js 20+ recommended
- A Solana RPC (HTTP + WebSocket) and optional Jito endpoints

## Setup

1. Install dependencies:

   ```bash
   git clone https://github.com/Zentariq/Pumpfun-Bundler-Bot.git
   cd Pumpfun-Bundler-Bot
   npm install
   ```

2. Copy environment template and fill in values:

   ```bash
   cp .env.example .env
   ```

   See [.env.example](.env.example) for `RPC_ENDPOINT`, `RPC_WEBSOCKET_ENDPOINT`, Jito URLs, fees, and compute unit price.

3. Copy settings and wallet metadata (real files are gitignored):

   - Copy `settings.example.ts` → `settings.ts` and adjust.
   - Copy `id.example.json` → `id.json` if you use that layout.

## Scripts

| Command        | Description                    |
| -------------- | ------------------------------ |
| `npm start`    | Run the main menu (`index.ts`) |
| `npm run dev`  | Same as `start`                |
| `npm run close`| Run `closeLut.ts`              |

## Docs

Extra notes and assets live under [docs/](docs/README.md) (including the sample bubblemap image).

## License

ISC (see [package.json](package.json)).
