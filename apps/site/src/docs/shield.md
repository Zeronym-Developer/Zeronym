---
title: Shield
description: Move a supported token from your wallet into the shielded pool.
---

Shielding is how assets enter Zeronym. You deposit a supported token from your wallet into the pool, and it becomes an encrypted note that only your keys can read.

## How a deposit is designed to work

1. Pick a supported token and an amount.
2. Review the pool contract address and the fees.
3. If the token needs an allowance, approve it first. This is a separate transaction.
4. Sign the deposit with your wallet.
5. Wait for the deposit to be credited. The app shows **Submitted**, **Confirming**, **Credited** or **Failed**.

You can only spend a deposit once it shows **Credited**. A submitted transaction is never shown as spendable value.

## Pay with ETH

You don't need to hold USDG first. On the Shield page, choose **Pay with ETH** and type the amount of USDG you want in the pool, for example 50.

1. The app gets a live price from Uniswap on Robinhood Chain and shows about how much ETH that costs, plus a cap a little above it (0.5%).
2. Your wallet swaps just enough ETH for exactly that amount of USDG. Any ETH the swap doesn't use comes back in the same transaction. If the price moves past the cap, the swap is refused and nothing is spent.
3. Then the deposit runs as usual: approve, then deposit.

Your wallet asks you to confirm up to three times. Keep a little extra ETH for network fees; all three steps together cost about 0.00005 ETH.

The swap gives you an exact, round amount, so your deposit looks like everyone else's. The swap is public too: anyone can see that your wallet swapped ETH for USDG just before the deposit.

If the swap goes through but the deposit doesn't, the USDG stays in your wallet. Shield it again and pay with USDG.

## What others can see

| Visible to anyone | Stays private |
| --- | --- |
| The address you deposit from | The note your deposit creates |
| The token and the amount | Who controls that note afterwards |
| The time of the deposit | What you do with it inside the pool |

> **A deposit is public.** It links your wallet to the pool. What you do after that is designed to stay private, but the deposit itself does not.

## Supported tokens

Only tokens listed for a deployment can be shielded. A token being available on Robinhood Chain does not mean Zeronym supports it.

Some tokens behave in ways that break simple accounting, such as tokens that change balances on their own, charge a fee on every transfer, or let their issuer freeze accounts. Each one must be handled explicitly or excluded.

Shielding a token does not remove its issuer's powers. If the issuer can freeze or block the token, that still applies.

## Tips for better privacy

- Deposit common amounts. A round amount many people use is harder to match than an unusual one.
- Do not withdraw the same amount soon after depositing it. See [What stays private](/docs/privacy/).
