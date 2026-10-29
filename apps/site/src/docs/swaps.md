---
title: Swaps
description: "Coming soon: exchange supported tokens inside your shielded balance."
status: candidate
---

Swapping inside the pool is coming soon. It is in progress and needs its own contracts, privacy description and security review before it goes live. You can already pay with ETH when you shield (see [Shield](/docs/shield/)) and receive ETH when you withdraw (see [Withdraw](/docs/withdraw/)).

## What it is meant to do

Swap one supported token for another, with your shielded balance updated correctly before and after the trade.

Before you confirm, a quote would show:

- The tokens going in and coming out.
- The estimated output and the minimum you will accept.
- Slippage tolerance, fees and when the quote expires.

The trade only goes through if it meets those limits.

## What a swap reveals

Swaps use outside exchanges, and outside exchanges are public. Even if your wallet is not the sender, observers can see:

- Which tokens were traded, and how much.
- When the trade happened.
- Which contracts were called.

Each supported route must state exactly what it makes public.

## Limits

> **Funds do not stay private just because they came from Zeronym.** If you put them into a lending protocol, a liquidity pool or another app, that app's privacy rules apply.

Zeronym does not promise hidden liquidity positions, fully private trades or protection from front-running and other ordering tricks.

If a route cannot update your shielded balance in the same transaction as the trade, it must explain who holds the funds in between and how you recover them if something fails. A pending swap is never shown as complete.
