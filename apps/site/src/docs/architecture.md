---
title: Architecture
description: The contracts and services that make up a Zeronym deployment, and how they fit together.
---

A Zeronym deployment is a set of contracts on the host chain, an app on your device, and a few optional services. This page explains each part and how a transaction moves through them.

## The parts

| Part | Where it runs | What it does |
| --- | --- | --- |
| Pool contract (`ZeronymPool`) | Robinhood Chain | Holds deposited tokens, stores commitments and nullifiers, and releases withdrawals |
| Verifier contract (`Groth16Verifier`) | Robinhood Chain | Checks zero-knowledge proofs for the pool |
| Hasher (Poseidon) | Robinhood Chain | Hashes the pool's Merkle tree |
| App | Your device | Holds your keys, finds your notes, builds proofs in the browser |
| Relayer | Zeronym service | Submits private actions and pays the gas, for a 0.50 USDG fee |

There is no indexer. The app reads the pool's events straight from the chain and checks its copy of the Merkle tree against the contract's root before every action. The pool only accepts standard tokens, so no token adapters are needed.

## A private transfer, step by step

1. Your app picks the notes to spend and builds the new notes for the recipient and your change.
2. Your app creates a proof on your device. The proof is bound to this action, this deployment, the outputs, the fee limit and an expiry.
3. A relayer submits the transaction. It can delay or refuse it, but it cannot change it.
4. The pool asks the verifier to check the proof, rejects any nullifier it has seen before, and stores the new commitments.
5. The recipient's app sees the new encrypted note on the chain, decrypts it and can spend it.

## Design rules

- **The chain is the source of truth.** The app rebuilds everything from chain data and checks it against the contract.
- **There is always another way out.** There is no indexer to go down. If the relayer is down, you can submit a withdrawal from your own wallet.
- **Dependencies are published.** Every service a deployment relies on is listed in the [Network and contracts](/docs/contracts/) page.
- **Visible reserves are not proof of solvency.** Because balances are hidden, accounting must reconcile the pool's holdings with valid shielded claims through the verification model.

## The mainnet implementation

| Item | Detail |
| --- | --- |
| Proof system | Groth16 on the BN254 curve, verified on chain by `Groth16Verifier` |
| Circuit | `transaction(20, 2, 2)`: 2 input notes, 2 output notes, a Merkle tree 20 levels deep (about 1 million notes) |
| Hashing | Poseidon, for note commitments, nullifiers and the Merkle tree |
| Note encryption | X25519 key exchange and AES-GCM. Only the recipient's viewing key can open a note |
| Root history | The pool accepts proofs against any of its last 100 Merkle roots |
| Trusted setup | Phase 1: PSE perpetual powers of tau. Phase 2: 4 contributors, then a public beacon from Robinhood Chain block 98,488,820 |
| Compiler | Solidity 0.8.24, optimizer on (200 runs), EVM version Shanghai |
| Source verification | Pool, verifier and ETH exit verified on Sourcify with an exact match and on Blockscout. The hasher is generated Poseidon bytecode (circomlibjs) |

### Contract interface

- `transact(proof, extData)`: the only way funds move. One call can deposit (`extAmount` above zero), withdraw (below zero) or move value privately (zero). `extData` holds the recipient, the relayer and its fee, the token and the two encrypted notes. Its hash is bound into the proof, so a relayer can't change any of it.
- `getLastRoot()`, `isKnownRoot(root)` and `isSpent(nullifier)`: read the pool's state.
- `setToken(token, supported)` and `setAdmin(admin)`: admin only, held by a 2-of-3 Safe. They can turn deposits of a token on or off and hand over the admin role. They can't block withdrawals, move funds or change the verifier.

### Events

- `NewCommitment(commitment, index, encryptedOutput)`: one for each new note.
- `NewNullifier(nullifier)`: one for each spent note.
- `TokenSupport(token, supported)` and `AdminChanged(admin)`: admin changes.

Every address is on the [Network and contracts](/docs/contracts/) page.
