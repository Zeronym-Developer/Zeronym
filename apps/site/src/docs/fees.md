---
title: Fees
description: What Zeronym charges today, and what it never earns money from.
---

These are the fees on Robinhood Chain mainnet today. The relayer publishes its live fee at `/api/relay`.

## What costs money today

| Fee | Amount | Who receives it |
| --- | --- | --- |
| Protocol fee | None | |
| Relayer fee | 0.50 USDG per private send or withdrawal it submits | The Zeronym relayer, which pays the gas for you |
| Network cost | Gas on Robinhood Chain, about 0.00001 to 0.00005 ETH per action | The network. Paid by your wallet when you shield, or when you submit a private action yourself |
| Pay with ETH, receive as ETH | No Zeronym fee. The Uniswap pool fee (0.01% or 0.05%) is part of the price shown | Uniswap liquidity providers |

Shielding never pays a relayer fee: your wallet sends the deposit itself.

If Zeronym adds a fee later, for example for shared treasuries when they arrive, the rate and its recipient will be on this page and on the [Network and contracts](/docs/contracts/) page before it applies.

## How fees are shown

- Every action shows its fees before you sign.
- What you sign includes a maximum fee. Nobody can charge more than that.
- Exchange fees and price impact on swaps are shown separately from Zeronym's own fees.

## What Zeronym never does

- **Deposits do not earn yield.** Shielding is not a savings account.
- **Your deposits are not lent out** or used as operating money without your explicit permission.
- **Your data is not for sale.** Private records, viewing keys and transaction history are not a revenue product.
