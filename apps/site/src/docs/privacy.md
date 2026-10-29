---
title: What stays private
description: What anyone can see, what stays hidden, and what can still give you away.
---

Zeronym keeps your activity inside the pool private from people watching the chain: transfers inside it show no sender, recipient or amount. Deposits and withdrawals stay public. This page shows the line between the two.

## Public on the chain

| Action | Anyone can see |
| --- | --- |
| Shield | Your funding address, the token, the amount and the time |
| Send inside the pool | That a transaction happened, when, and proof-related data. If the relayer submits it, its fee (0.50 USDG) is paid out of the pool in public. Not the sender, recipient or amount |
| Move between vaults | That a transaction happened, and when |
| Share a record | Nothing on the chain |
| Withdraw | The destination address, the token, the amount and the time |

## Who else can see what

| Who | What they can see |
| --- | --- |
| The person you pay | The payment you sent them |
| A relayer | When you submitted, and your connection details such as your IP address |
| Your RPC provider | Your connection and the requests your app makes |
| Someone you share a record with | Everything in the scope you shared |
| An outside exchange in a swap | What its route needs to execute the trade |

Encrypting notes does not hide your IP address or all network data. Use a network setup you trust.

## What weakens privacy

Your choices matter. These make activity easier to link:

- **Unique amounts.** 1,337.42 USDG is easy to follow. 1,000 USDG is not.
- **Close timing.** A withdrawal right after a deposit is easy to match.
- **Rare tokens.** If few people shield a token, its pool hides less.
- **Pool activity.** Privacy grows with the pool: every new deposit and transfer adds to the crowd you blend into.
- **Repeated counterparties.** Paying the same public address again and again creates a pattern.

## What no app can protect

A compromised device, a fake app or a leaked spending key can defeat every protection on this page. Keep your device updated, use the official app only, and never share your keys. See [Keys and recovery](/docs/keys/).

> **Zeronym hides what happens inside the pool, not its edges.** Each privacy claim is documented per action above, so you can see exactly what stays private.
