# Getting started

Use Node.js 24 and the npm version it includes. The pinned Astro release requires at least Node.js 22.22.0. Run these commands from the repository root.

## Website and app

```sh
npm --prefix apps/site ci
ZERONYM_NETWORK=mainnet SITE_URL=https://zeronym.lat npm --prefix apps/site run dev
```

Open Astro's printed local URL. The app is at `/app/`, payment links at `/pay/` and documentation at `/docs/`.

The mainnet flag selects the shipped mainnet addresses and prover files. The local app still reads the live chain. Use the local proof tests below for transaction testing without real funds.

```sh
ZERONYM_NETWORK=mainnet npm --prefix apps/site run check
ZERONYM_NETWORK=mainnet SITE_URL=https://zeronym.lat npm --prefix apps/site run build
```

The static build is written to `apps/site/dist`. Astro's development server does not provide the Cloudflare Worker's relayer, pool statistics or waitlist endpoints.

## Contracts and proof tests

```sh
node scripts/ci/install-pool.mjs
npm --prefix contracts/pool run compile
node scripts/ci/prepare-prover.mjs
npm --prefix contracts/pool test
```

The install helper handles bundled optional dependency metadata in the shipped lockfile and restores that lockfile after installation. The prover helper prepares the test build directory from the committed browser WASM and proving key, after checking their hashes. It does not create a new trusted setup.

The pool tests use Ganache and real Groth16 proofs. They cover shielding, private sends, withdrawals, double spends, changed recipients, wrong assets and disabled deposits. No mainnet transaction is sent.

Additional checks:

```sh
node scripts/ci/check-prover.mjs
node --test scripts/ci/client.test.mjs
```

The ETH exit suite is separate:

```sh
npm --prefix contracts/pool run test:eth-exit
```

It uses a local mainnet fork and needs a reachable Robinhood Chain RPC. It is not part of the routine pool workflow. Check the test's RPC configuration before running it.

## Cloudflare Worker

The Worker serves `/api/relay`, `/api/pool`, waitlist routes and live documentation responses. Its configuration is in [`apps/site/wrangler.jsonc`](../apps/site/wrangler.jsonc).

To deploy your own instance:

1. Create your own Cloudflare Worker and D1 database.
2. Set your account and database IDs in your local configuration. The published configuration deliberately contains placeholders.
3. Apply the SQL files in `apps/site/migrations` to your database.
4. Configure the relayer key and RPC URL as Worker secrets, outside source control.
5. Build the mainnet site before deploying the Worker and its assets.

From `apps/site`, the secret commands are:

```sh
npx wrangler secret put RELAYER_KEY
npx wrangler secret put RPC_URL
```

The relayer uses a funded account to pay network gas. Never place its private key, a recovery phrase or an authenticated RPC URL in committed configuration. Keep `.env` and `.dev.vars` files local.

## Read-only mainnet verification

With site dependencies installed:

```sh
node apps/site/public/verify/verify-mainnet.mjs
node apps/site/public/verify/verify-mainnet.mjs --json
```

This reads the public chain and submits no transactions. It checks admin powers, classifies pool transactions and rechecks their proofs. The public RPC is the default; set `RPC_URL` in your shell to use another endpoint.

## Deployed source and archived inputs

The shipped `contracts/pool/verification/std-pool.json` predates the current pool admin interface: it includes a deposit-cap mapping and a three-argument `setToken`, whereas the current source has no deposit cap and uses two arguments. The archive is preserved unchanged. Use the verified source on the deployed pool's explorer or Sourcify page when comparing deployed source; do not use this archived input as evidence of a current match.

Editing local Solidity, circuit or deployment files does not change live contracts. Keep those changes explicit and review their relationship to the deployed addresses before proposing a release.
