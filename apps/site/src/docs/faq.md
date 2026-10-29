---
title: FAQ
description: Short answers to common questions.
---

## Is Zeronym live?

Yes. The shielded pool, the app and the relayer are live on Robinhood Chain mainnet for USDG. The Zeronym token (Znym) is live at 0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67. Shared treasuries and swaps inside the pool are coming soon. See [Project status](/docs/project-status/).

## How busy is the pool?

It is new, and its privacy grows with every transaction. You can count its transactions yourself on the explorer, or list them all with the script on [Check it yourself](/docs/verify/). See [Project status](/docs/project-status/#pool-activity-so-far).

## How can I check that private transfers really happen?

Every pool transaction is on the chain, and anyone can re-run its proof against the deployed verifier. [Check it yourself](/docs/verify/) shows what a shield, a private transfer and a withdrawal look like on the explorer, and gives a read-only script that checks them all.

## What does Zeronym hide?

Who paid whom and how much, for every transfer inside the pool. The chain only sees encrypted notes and spent-note markers. Deposits into the pool and withdrawals out of it are public, like any token transfer. Privacy grows with the pool: every new deposit and transfer widens the crowd (the anonymity set) your notes blend into. See [What stays private](/docs/privacy/).

## Do I need a new wallet?

No. Zeronym works with the wallet you already use. You will set up Zeronym keys for your shielded balance, and you must back them up.

## Which tokens can I shield?

USDG only, for now. You can pay with ETH: the app swaps it for an exact amount of USDG on Uniswap, then deposits it (see [Shield](/docs/shield/)). The [Network and contracts](/docs/contracts/) page lists every supported token. Being on Robinhood Chain does not make a token supported.

## Will deposits earn yield?

No. Deposits do not earn yield, and they are not lent out or used as operating money without your explicit permission.

## Do I need the Zeronym token to use the protocol?

No. Spending and withdrawing your own assets will never require the token. See [Token framework](/docs/token/).

## What is the token address?

The only official Zeronym token (Znym) is `0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67` on Robinhood Chain. Any other address is not Zeronym. It is also listed on the [Network and contracts](/docs/contracts/) page.

## Who holds my keys?

You do. Your spending key, viewing keys and notes stay on your device. Nobody can recover them for you if you lose your backup.

## Can I prove a payment to someone?

Yes. You can share a receipt for one transaction without showing the rest of your history. See [Share a record](/docs/disclose/).

## What if the Zeronym app goes away?

Your funds stay in the pool contract, not in the app. The app reads everything straight from the chain, so your recovery phrase rebuilds your history in any copy of it. If the relayer is offline, the app sends a withdrawal from your own wallet instead. A standalone fallback tool is not published yet. See [Keys and recovery](/docs/keys/).

## How do I report a security issue?

Email support@zeronym.lat. The policy is on the [Security](/security/) page and in [/.well-known/security.txt](/.well-known/security.txt).
