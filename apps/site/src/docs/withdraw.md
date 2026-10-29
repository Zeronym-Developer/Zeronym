---
title: Withdraw
description: Move assets out of the pool to any address, and what becomes public when you do.
---

Withdrawing releases assets from the pool to an ordinary address. You can withdraw to your own wallet, an exchange or anyone else.

## How a withdrawal is designed to work

1. Enter the destination address, the token and the amount.
2. Review what will become public. The app shows this before you confirm.
3. Your device creates a proof, and the pool contract checks it and marks your notes as spent.
4. The pool sends the tokens to the destination.

## Receive as ETH

The person you're paying doesn't need to want USDG. On the Withdraw page, choose **Receive as ETH**, then type the USDG amount to withdraw, for example 10.

1. The app gets a live price from Uniswap on Robinhood Chain and shows about how much ETH that buys, plus a minimum a little below it (0.5%).
2. The relayer submits one transaction to the Zeronym ETH exit contract. It runs your withdrawal, swaps exactly that USDG for ETH on Uniswap, and sends the ETH to the destination.
3. If the swap would give less than the minimum, the whole transaction is refused: no note is spent and you can try again.

It's a good way to start a new wallet: the ETH that arrives pays its first network fees, and nothing had to be sent to it from another wallet first.

The amount leaving the pool is still the round USDG amount you typed, so the withdrawal looks like the others. The swap is public: anyone can see that this withdrawal went through the ETH exit contract and how much ETH arrived.

The exit contract has no owner and holds nothing between transactions. Your proof fixes the destination, the minimum and a 15 minute deadline, so neither the relayer nor anyone else can change them. If the proof ever reached the pool without the swap, anyone can finish it: before the deadline it swaps for at least the minimum, after it the destination gets the USDG instead.

## What becomes public

| Visible to anyone | Stays private |
| --- | --- |
| The destination address | Which notes paid for the withdrawal |
| The token and the amount | Who owned those notes |
| The time it settled | Your other balances and history |

> **Withdrawals can be linked to deposits.** If you deposit 1,337 USDG and withdraw 1,337 USDG an hour later, the match is easy to spot, even though the pool hides the path in between.

## Make withdrawals harder to link

- **Use a fresh address.** Do not withdraw to the address you deposited from, or to one tied to it.
- **Wait.** A withdrawal soon after a deposit is easier to match.
- **Use common amounts.** Round amounts that many people use blend in.
- **Split it up.** Several smaller withdrawals at different times are harder to match than one.
- **Do not fund the new address from your main wallet.** That link is public.

Delayed or grouped submission can reduce some timing links. It cannot guarantee that a withdrawal will never be linked to a deposit.
