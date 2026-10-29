---
title: Token framework
description: The Zeronym token contract, what the token is designed to do, and what it never does.
---

The Zeronym token (Znym) is live on Robinhood Chain at `0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67`. The shielded pool does not need it: shielding, sending and withdrawing never require the token.

| Detail | Value |
| --- | --- |
| Contract | `0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67` ([explorer](https://robinhoodchain.blockscout.com/token/0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67)) |
| Chain | Robinhood Chain, chain ID 4663 |
| Standard | ERC-20, 18 decimals |
| Supply | 1,000,000,000 Znym, minted once at deploy to its Pons launch bonding curve. There is no mint function |
| Controls | No owner, and no pause or blocklist function. Holders can burn their own tokens |
| Source | Verified: [Sourcify exact match](https://sourcify.dev/server/v2/contract/4663/0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67) and [Blockscout](https://robinhoodchain.blockscout.com/address/0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67?tab=contract). It is the Pons launchpad's standard `PonsV2LauncherToken` |

## Candidate functions

These are ideas, not active features. Each one needs published rules before it can be described as live.

| Function | Status |
| --- | --- |
| Voting on parameters that governance is allowed to change | Candidate |
| Access to advanced treasury tools | Candidate |
| Discounts on service fees | Candidate |

Voting rights, who qualifies, discount limits and any lock-up periods must be spelled out before a function goes live.

## What the token never does

- **It never gates your own funds.** Spending or withdrawing your assets never requires buying or holding the token.
- **It is not a claim on the pool.** Holding the token does not give you ownership of anyone's deposits.
- **It does not pay you.** No dividends, revenue share or yield.
- **It promises nothing about price.**
- **Governance cannot touch user funds.** Token votes cannot grant access to keys, seize balances or create value from nothing.

## Not decided yet

The supply is fixed by the contract above. How the candidate functions work, and any allocations for them, will be published before any of them goes live.

> **The only official Zeronym token is `0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67`.** A "Zeronym" token at any other address is not from Zeronym. Check it against the [Network and contracts](/docs/contracts/) page.
