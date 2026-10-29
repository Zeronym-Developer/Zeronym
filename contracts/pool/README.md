# Zeronym shielded pool

One pool contract holds the shielded notes. Each transaction spends up to two notes and creates two, proved with Groth16 in the user's browser. The design follows Tornado Nova, with an asset field added to every note. On mainnet the pool supports USDG.

| Part | File |
| --- | --- |
| Circuit, 2 inputs and 2 outputs, 20-level Poseidon tree | `circuits/transaction.circom`, `circuits/merkle.circom` |
| Pool, Merkle tree with root history, verifier | `contracts/ZeronymPool.sol`, `contracts/MerkleTreeWithHistory.sol`, `contracts/Verifier.sol` |
| Receive as ETH helper | `contracts/ZeronymEthExit.sol` |
| Test token for local tests | `contracts/TestDollar.sol` |
| Client library (keys, `zn1` addresses, note encryption, proof inputs) | `lib/core.mjs` (types in `lib/core.d.mts`) |
| End-to-end tests on a local chain with real proofs | `test/pool.test.mjs`, `test/eth-exit.test.mjs` |
| Setup ceremony tool | `scripts/ceremony.mjs` |
| Deploy scripts | `scripts/deploy-mainnet.mjs`, `scripts/deploy-eth-exit.mjs`, `scripts/deploy-testnet.mjs` |
| Deployed addresses and circuit file hashes | `deployments/mainnet.json`, `deployments/testnet.json` |
| Standard JSON inputs for source verification | `verification/` |

## Mainnet

| | |
| --- | --- |
| Pool | `0x84c21f20959f0d00892007f2a7cfe46d19077877` |
| Verifier | `0xa1cb0bf67c66749bd6075ead69fb1ede77757101` |
| ETH exit | `0xcf05a3b5e418dd0afe3ffb075f7b64c27019bb63` |
| Admin | 2-of-3 Safe `0xFB4ff79d6BD9563b9f9c85Ce0Aa16271eA904Ae3` |
| Setup | Phase 1: PSE perpetual powers of tau (`ppot_0080_15.ptau`). Phase 2: 4 contributions, then the hash of Robinhood Chain block 98,488,820 as a public beacon |

## Admin powers

The admin can call only `setToken(token, supported)`, which turns deposits of a token on or off, and `setAdmin(admin)`. The verifier is `immutable`. The pool is not a proxy and has no `DELEGATECALL` or `SELFDESTRUCT`. Private transfers and withdrawals never check token support or the admin, so the admin can't block withdrawals, move funds, cap deposits or charge fees.

## Receive as ETH (`contracts/ZeronymEthExit.sol`)

A helper next to the pool, not part of it. A withdrawal's proof fixes `extData.recipient`, so the recipient is a forwarder address derived (CREATE2, EIP-1167 clone) from the whole order: token, ETH recipient, minimum ETH out, deadline, Uniswap fee tier and a random nonce. `withdraw()` runs `pool.transact`, swaps everything the forwarder received for ETH on Uniswap (SwapRouter02) and sends it on, all in one transaction. Below the minimum it reverts and no note is spent. If the proof reaches the pool some other way, anyone can call `settle(order)`: before the deadline it swaps for at least the minimum, after it the recipient gets the token. No owner, no admin, and it holds nothing between transactions.

## Commands

```sh
npm ci
npm run compile          # solc + Poseidon hasher bytecode -> build/contracts.json
npm test                 # end-to-end tests, every transaction is proved for real
npm run test:eth-exit    # ETH exit tests on a local fork (needs the network)
```

The tests and deploy scripts need the circuit build in `build/` (`transaction.r1cs`, `transaction_js/`, `tx_final.zkey`). It isn't committed because of its size. It comes from circom 2.2.2 with `--O2`. The browser copies of the wasm and proving key are in `apps/site/public/zk`, and their SHA-256 hashes are in `deployments/mainnet.json`. Check a proving key against the circuit and the powers of tau file with:

```sh
npx snarkjs zkey verify build/transaction.r1cs ptau/ppot_0080_15.ptau build/tx_final.zkey
```

Deploy keys are never stored in this repository. The scripts ask for the key when they run, or read it from a file outside the repository (`DEPLOYER_KEY_FILE`).
