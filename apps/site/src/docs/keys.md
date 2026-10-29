---
title: Keys and recovery
description: Spending keys, viewing keys, backups, and what happens if you lose them.
---

In Zeronym, you hold the keys to your shielded assets. Nobody else can spend them, and nobody else can recover them for you.

## Your keys

| Key | What it does | Share it? |
| --- | --- | --- |
| Spending key | Authorizes spending your notes | Never |
| Viewing key | Lets someone read records in its scope, without moving funds | Only with someone you trust, for a clear reason |
| Recovery material | Restores your keys on a new device | Never. Store it offline |

Your normal wallet can be used to set up your Zeronym account and to sign actions. Connecting a wallet alone does not create a secure privacy account.

## Where your data lives

Your notes and the private inputs to your proofs stay on your device. Service providers only receive what their job needs.

If an implementation uses remote proving or keeps viewing keys on a server, it must tell you, because that server could see more of your activity.

## Recovery

The app must explain how your keys are created, stored and recovered. Recovery must not depend on your wallet producing exactly the same signature every time, because not every wallet does.

> **If you lose your recovery material, you may lose access to your shielded funds.** Privacy does not remove the need for backups.

## If the app or a service goes down

There is no indexer: the app rebuilds your note history straight from the chain, so your recovery phrase works in any copy of the app. If the relayer is offline, the app submits your withdrawal from your own wallet instead. That route shows your wallet as the sender, and the app says so before you confirm. A standalone fallback tool is not published yet.
