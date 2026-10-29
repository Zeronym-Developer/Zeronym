---
title: Key ideas
description: Pools, notes, proofs and nullifiers, explained without the maths.
---

Zeronym is built on a few ideas from zero-knowledge cryptography. You do not need to understand the maths to use it, but these ideas explain what the protocol can and cannot hide.

## The shielded pool

The pool is a smart contract that holds every supported token deposited into Zeronym. On the public chain, observers can see the pool's total holdings. They cannot see how those holdings are divided between people.

Privacy comes from sharing the pool. The more people and the more activity a pool has, the harder it is to tell one person's actions from another's.

## Notes

Inside the pool, your balance is not a number next to your address. It is a set of **notes**. A note says "this much of this token belongs to whoever holds this key", and it is encrypted so only you can read it.

When you spend, your old notes are used up and new ones are created: one for the person you pay, and one for your change.

## Commitments

The chain stores a **commitment** for each note. A commitment proves a note exists without showing what is inside it. Think of a sealed envelope with a serial number: everyone can see the envelope, nobody can read the letter.

## Zero-knowledge proofs

To spend a note, your device creates a **zero-knowledge proof**. The proof convinces the pool contract of three things without revealing the details:

- The notes you are spending exist and belong to you.
- You have not spent them before.
- The value going out equals the value coming in, plus any fees.

The contract checks the proof. If it is valid, the spend goes through. The contract never learns who you are, who you paid or how much.

## Nullifiers

When a note is spent, the proof also publishes a **nullifier**: a unique tag for that note that cannot be traced back to it. The contract keeps a list of nullifiers and rejects any tag it has seen before. That is how the pool stops anyone spending the same note twice.

## One rule for every token

For each token, every valid action must balance:

**Notes in + public deposits = notes out + public withdrawals + fees**

The protocol must never create value from nothing or swap one token for another without saying so.

> **How the mainnet pool does it.** Groth16 proofs, Poseidon hashing and a 20-level Merkle tree. The [Architecture](/docs/architecture/) page has the full details.
