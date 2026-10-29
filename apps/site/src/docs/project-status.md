---
title: Project status
description: What exists today, what does not, and how to check it yourself.
---

Zeronym is live on Robinhood Chain mainnet: the shielded pool, the app and the relayer. This page lists what is live and what is coming soon, so you can tell a real Zeronym release from an imitation.

## What exists today

| Item | Status |
| --- | --- |
| Protocol design and these docs | Published, version 1.0 |
| Shielded pool contract | Mainnet. USDG only |
| Verifier contract | Mainnet. Multi-party setup with 4 contributors and a public beacon |
| App | Live: shield (with USDG or ETH), private send, private vaults, receipts, withdraw. Has a demo mode |
| Contract source | Pool, verifier and ETH exit verified on Sourcify (exact match) and Blockscout |
| Zeronym relayer | Live. Sees your IP address and the transaction it submits |
| Pool admin | A 2-of-3 Safe multisig. It can pause deposits of a token. It can't block withdrawals, move funds or upgrade the pool. [Check it yourself](/docs/verify/#admin-powers) |
| Zeronym token (Znym) | Mainnet at `0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67`. Fixed supply, no mint. The pool doesn't need it |
| Shared treasuries, swaps inside the pool | Coming soon. In progress, each with its own contracts and review before it goes live |

Anyone offering yield, a "Zeronym token" or a "Zeronym pool" at an address not on the [Network and contracts](/docs/contracts/) page is not Zeronym.

## Pool activity so far

You can count every pool transaction yourself on the [explorer](https://robinhoodchain.blockscout.com/address/0x84c21f20959f0d00892007f2a7cfe46d19077877), or with the script on [Check it yourself](/docs/verify/), which also re-checks every proof against the deployed verifier.

Privacy grows as more people use the pool: with more deposits and withdrawals, amounts and timing are harder to match. See [What stays private](/docs/privacy/).

## How each part goes live

Each part is either **coming soon** (described, not live yet) or **mainnet** (running on Robinhood Chain with real funds). The [Network and contracts](/docs/contracts/) page shows which.

A feature is only active when its record says so. A blog post, a screenshot or a social media post is not an official record.

## How to check a claim

- Compare any contract address with the [Network and contracts](/docs/contracts/) page. If it is not there, do not use it.
- Check the pool, its admin powers and every proof yourself, without trusting this site: see [Check it yourself](/docs/verify/).
- Read the [Security](/security/) page for the official channels. An account that is not listed there is not Zeronym.
