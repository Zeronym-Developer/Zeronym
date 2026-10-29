# Zeronym

A shielded pool for USDG on Robinhood Chain. Shield USDG into the pool, pay anyone privately inside it, and withdraw to any address. On the chain, a private payment shows up as a pool transaction: the sender, the recipient and the amount are encrypted.

Live at **[zeronym.lat](https://zeronym.lat)** · Docs at **[zeronym.lat/docs](https://zeronym.lat/docs/)** · X **[@zeronym_app](https://x.com/zeronym_app)**

## What you can do

- **Shield.** Move USDG from your wallet into the pool. You can also pay with ETH: the app swaps it for USDG on Uniswap and shields it in one flow.
- **Send privately.** Pay any shielded address (`zn1…`). The amount and an optional note are encrypted for the recipient.
- **Withdraw.** Move USDG back to any public address, or receive it as ETH.
- **Payment links.** Share a link that anyone can pay, or ask for a set amount. The amount and note sit after the `#` in the link, so they never reach a server and never show in link previews.
- **Private vaults.** Split your shielded balance into compartments such as Savings or Trading. Vault names stay on your device.
- **Receipts and viewing keys.** Prove one payment to someone without showing the rest of your history.
- **Relayer.** An optional relayer submits private transactions and pays the gas, so your wallet doesn't appear on them. Fee: 0.50 USDG per private send, move or withdrawal. There is no protocol fee.

Proofs are made in your browser with Groth16. Your keys come from a recovery phrase and never leave your device. There is no indexer: the app reads the pool's events straight from the chain.

## Mainnet contracts (Robinhood Chain, chain ID 4663)

| Contract | Address |
| --- | --- |
| Shielded pool | [`0x84c21f20959f0d00892007f2a7cfe46d19077877`](https://robinhoodchain.blockscout.com/address/0x84c21f20959f0d00892007f2a7cfe46d19077877) |
| Verifier | [`0xa1cb0bf67c66749bd6075ead69fb1ede77757101`](https://robinhoodchain.blockscout.com/address/0xa1cb0bf67c66749bd6075ead69fb1ede77757101) |
| Poseidon hasher | [`0xc94243f257b9ac32a458d73fad37f46fcd0202e1`](https://robinhoodchain.blockscout.com/address/0xc94243f257b9ac32a458d73fad37f46fcd0202e1) |
| ETH exit (receive as ETH) | [`0xcf05a3b5e418dd0afe3ffb075f7b64c27019bb63`](https://robinhoodchain.blockscout.com/address/0xcf05a3b5e418dd0afe3ffb075f7b64c27019bb63) |
| Admin (2-of-3 Safe) | `0xFB4ff79d6BD9563b9f9c85Ce0Aa16271eA904Ae3` |
| USDG (Paxos) | `0x5fc5360d0400a0fd4f2af552add042d716f1d168` |
| Znym token | [`0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67`](https://robinhoodchain.blockscout.com/token/0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67) |

The pool, verifier and ETH exit are verified on [Sourcify](https://sourcify.dev/server/v2/contract/4663/0x84C21F20959F0D00892007f2A7cFe46d19077877) (exact match) and Blockscout. The pool is not upgradeable. The admin can only turn deposits of a token on or off and hand over the admin role. It can't block withdrawals, move funds, change the verifier or charge fees. The Znym token is the Pons launchpad's standard token contract. The pool doesn't need it.

The proving key comes from a multi-party setup: the PSE perpetual powers of tau for phase 1, then 4 phase 2 contributions and the hash of Robinhood Chain block 98,488,820 as a public beacon.

## Check it yourself

`apps/site/public/verify/verify-mainnet.mjs` checks the live pool without trusting the website. It is read-only and needs no key. It checks the admin powers (not a proxy, fixed verifier, admin is the listed Safe), lists every pool transaction with its kind, and sends every proof back to the deployed verifier. See [zeronym.lat/docs/verify](https://zeronym.lat/docs/verify/).

## Repository layout

| Folder | What it is |
| --- | --- |
| `contracts/pool/contracts` | Solidity: `ZeronymPool.sol`, `MerkleTreeWithHistory.sol`, `Verifier.sol`, `ZeronymEthExit.sol` |
| `contracts/pool/circuits` | Circom circuit: 2 inputs, 2 outputs, 20-level Poseidon Merkle tree |
| `contracts/pool/lib` | Client library: keys, `zn1` addresses, note encryption, proof inputs |
| `contracts/pool/test` | End-to-end tests with real proofs |
| `contracts/pool/deployments` | Deployed addresses and circuit file hashes |
| `contracts/pool/verification` | Standard JSON inputs used for source verification |
| `apps/site` | Website, docs and app (Astro + Preact), plus a Cloudflare Worker for the relayer and live pool stats |
| `apps/site/public/zk` | The circuit's wasm and proving key used by the browser, named by hash |

## Build the site

Needs Node.js 20 or newer.

```sh
cd apps/site
npm ci
ZERONYM_NETWORK=mainnet SITE_URL=https://zeronym.lat npm run build
```

The built site is in `apps/site/dist`. The Worker (`apps/site/worker`) serves `/api/relay`, `/api/pool` and the live parts of the docs. To run it on your own Cloudflare account, fill in `account_id` and `database_id` in `apps/site/wrangler.jsonc`, then set the secrets with `npx wrangler secret put RELAYER_KEY` and `npx wrangler secret put RPC_URL`. Secrets are never stored in this repository.

## Security

Report a vulnerability through the [Security](https://zeronym.lat/security/) page. Read the [security model](https://zeronym.lat/docs/security-model/) and [what stays private](https://zeronym.lat/docs/privacy/) before using the pool with meaningful amounts. Privacy grows as more people use the pool.
