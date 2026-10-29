---
title: Send and receive
description: Pay another shielded account, or ask to be paid with a payment request.
---

Inside the pool, you can pay another Zeronym account without the chain showing who paid whom or how much.

## Send privately

1. Enter the recipient's shielded address and the amount.
2. Your device builds two new notes: one for the recipient, and one for your change.
3. Your device creates a proof that the payment is valid.
4. The payment is submitted, usually through a relayer, so your wallet does not appear as the sender.

After the payment is confirmed, the recipient's app finds the new note and they can spend it with their own keys.

> **Sending to an ordinary wallet address is a withdrawal, not a private transfer.** The destination, token and amount become public. See [Withdraw](/docs/withdraw/).

## Receive with a payment request

A payment request tells someone what to pay you: the token, the amount and your shielded address. A request can have an expiry date and a private reference that only you see.

A payment request is only a request. It is not proof that you were paid. Check the payment in your app.

## What others can see

| Who | What they can see |
| --- | --- |
| Anyone watching the chain | That a pool transaction happened, when, and proof-related data |
| The recipient | The amount, the token and any memo you include |
| The relayer | When the transaction was submitted, and your connection details |
| Anyone who sees a posted payment link | The requested token and amount, and your shielded address |

Share payment links privately. Posting one in public can reveal who you are working with and how much you asked for.
