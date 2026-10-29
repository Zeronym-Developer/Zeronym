---
title: Glossary
description: Plain definitions of the terms used in these docs.
---

## Anonymity set

The group of people your activity could belong to. A busy pool with many users gives a bigger set.

## Commitment

A public record that a note exists, which does not reveal the note's contents.

## Host chain

The blockchain Zeronym runs on. Zeronym runs on Robinhood Chain.

## Indexer

A service that helps the app find commitments, encrypted notes and spent status faster than reading the chain directly.

## Note

An encrypted record that says how much of a token belongs to whoever holds a certain key. Your shielded balance is a set of notes.

## Nullifier

A unique tag published when a note is spent. The pool rejects a tag it has already seen, which prevents double spending.

## Payment request

A message that asks someone to pay a token and amount to your shielded address. It is not proof of payment.

## Receipt

A record of one transaction that you can share to prove a payment, with a stated scope.

## Relayer

A service that submits your transaction and pays the gas, so your wallet does not appear as the sender.

## Shield

To deposit a supported token into the pool, turning it into a note.

## Shielded pool

The contract that holds every deposited token and tracks notes through commitments and nullifiers.

## Spending key

The key that authorizes spending your notes. Never share it.

## Vault

A label and set of records on your device for organizing shielded assets. It does not add cryptographic privacy.

## Viewing key

A key that lets someone read your records in its scope without being able to move funds.

## Withdraw

To move tokens from the pool to an ordinary address. Withdrawals are public.

## Zero-knowledge proof

A proof that something is true, such as "this spend is valid", that reveals nothing beyond that fact.
