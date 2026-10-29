# Architecture

Zeronym's shared pool holds USDG on Robinhood Chain. The app represents private balances as encrypted notes. Spending a note publishes its nullifier and a zero-knowledge proof, rather than revealing which commitment belongs to the sender.

## Components

| Component | Source | Responsibility |
| --- | --- | --- |
| Pool | `contracts/pool/contracts/ZeronymPool.sol` | Deposits, withdrawals, nullifier tracking and new commitments |
| Merkle tree | `contracts/pool/contracts/MerkleTreeWithHistory.sol` | A 20-level tree with a history of accepted roots |
| Verifier | `contracts/pool/contracts/Verifier.sol` | Groth16 proof verification |
| Circuit | `contracts/pool/circuits` | Two-input, two-output note conservation and spend constraints |
| Client library | `contracts/pool/lib/core.mjs` | Keys, addresses, notes, encryption, Merkle paths and proof inputs |
| Browser app | `apps/site/src/app` | Recovery, note discovery, transaction review and local proving |
| Relayer | `apps/site/worker/relayer.js` | Transaction submission and network gas payment |
| ETH exit | `contracts/pool/contracts/ZeronymEthExit.sol` | Atomic USDG withdrawal and ETH delivery through Uniswap |
| Public verification | `apps/site/public/verify/verify-mainnet.mjs` | Independent read-only checks against mainnet |

## Notes and private payments

Each note includes an asset, amount, owner information and randomness. Its Poseidon commitment is inserted into the pool's tree. X25519 and AES-GCM protect the encrypted note data published with the commitment.

The app reads `NewCommitment` and `NewNullifier` events directly from the chain. It decrypts notes it can view and reconstructs its own Merkle tree. No hosted indexer is required.

A payment spends up to two input notes and creates two output notes. The proof establishes the spend and value-conservation constraints. Public inputs bind the accepted root, nullifiers, output commitments, public amount and the hash of external transaction data. The pool checks that external data against the proof before moving tokens.

The recipient recognizes a payment by decrypting the new encrypted output. Private vaults organize notes in the app; their names are local metadata, not separate onchain pool contracts.

## Deposit and withdrawal boundaries

Deposits bring tokens into the pool and expose the funding address, asset, amount and timing. Withdrawals expose the destination, asset, amount and timing. Transfers inside the pool do not publish the private sender, recipient or transfer amount. Relayer fees paid out of the pool remain public.

The relayer can submit a prepared transaction and pay its gas, but cannot rewrite the proof-bound transaction data. Users can submit directly when needed; doing so exposes the submitting public wallet. RPC and relayer services can still observe network metadata.

## Receiving ETH

The ETH exit contract is separate from the pool. An order defines the token, recipient, minimum ETH output, deadline, fee tier and nonce. These values determine a forwarder address used as the withdrawal recipient.

The normal flow withdraws USDG, swaps through Uniswap and pays ETH in one transaction. An unsatisfied minimum reverts the transaction. If a proof reaches the pool separately, the order can be settled through the helper; after its deadline, settlement returns the token to the designated recipient. See [`contracts/pool/README.md`](../contracts/pool/README.md) and the ETH exit tests for details.

## Admin and setup

The pool's verifier is immutable and the pool is not upgradeable. The admin is the recorded 2-of-3 Safe. It can enable or disable deposits for an asset and transfer its role. It cannot block withdrawals, move deposited funds or replace the verifier.

The circuit uses Groth16 on BN254, with two inputs, two outputs and a 20-level Poseidon tree. The mainnet setup record identifies the PSE perpetual powers of tau, four phase 2 contributions and the public beacon derived from Robinhood Chain block 98,488,820.

The deployment record pins the browser WASM and proving-key SHA-256 hashes. The files in `apps/site/public/zk` are the shipped prover assets; CI checks them against those hashes.

## Application and services

Astro builds the website and documentation. Preact renders the `/app/` interface, and a browser worker handles proof generation. Recovery material and spending keys are held on the user's device.

The Cloudflare Worker serves the relayer, pool statistics and waitlist API. D1 stores waitlist data; it is not the source of private balances. The chain's commitment and nullifier events remain the source of truth.

Payment links place requested amounts and notes after `#`, so the browser does not send them in an HTTP request. Anyone given the full link can read those link details.

For the per-action privacy model, see [What stays private](https://zeronym.lat/docs/privacy/). For mainnet addresses and byte-level records, see [`contracts/pool/deployments/mainnet.json`](../contracts/pool/deployments/mainnet.json).
