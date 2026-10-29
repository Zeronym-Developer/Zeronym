---
title: Risks
description: What can go wrong, and what Zeronym's design does not protect you from.
---

Privacy software carries real risks. Read this page before you use any Zeronym deployment, and do not deposit more than you can afford to lose.

## Software risk

Contracts and circuits can have bugs. A bug in the verifier or the pool could let someone take funds or block withdrawals.

## Admin and upgrade risk

The mainnet pool can't be upgraded: it is not a proxy, and its verifier is fixed at deploy. Its admin, a 2-of-3 Safe, can only turn deposits of a token on or off and hand the admin role on. It can't block withdrawals or move funds. See [Security model](/docs/security-model/#admin-powers) for the full list and how to check it.

## Token risk

Shielding a token does not change the token. If its issuer can freeze, block or reclaim it, that still applies inside the pool. A shielded token is only worth what the original token is worth.

## Privacy risk

Deposits and withdrawals are public, and timing and amounts can link them. Privacy grows as more transactions go through the pool. See [What stays private](/docs/privacy/).

## Key risk

If you lose your recovery material, you may lose access to your funds. If someone else gets your spending key, they can spend your notes.

## Service risk

The relayer or this app can go offline or refuse to process your transaction. You can still withdraw by submitting from your own wallet, which costs only gas but shows that wallet as the sender. If the relayer is offline, the app does this for you.

## Legal and compliance risk

Rules on privacy tools differ by country, and some services may refuse funds that passed through a shielded pool. You are responsible for following the laws that apply to you.

## Scam risk

Scammers copy privacy and token projects. Zeronym will never message you first or ask for your keys. Check every address against the [Network and contracts](/docs/contracts/) page.

> **Zeronym does not promise yield or token price appreciation.** Nothing in these docs is financial advice.
