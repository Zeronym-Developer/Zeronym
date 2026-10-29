---
title: Check it yourself
description: How to confirm the pool's admin powers, tell shields, private transfers and withdrawals apart, and re-check every proof, using only the public chain.
---

You don't have to take this site's word for anything on this page. Every check below reads Robinhood Chain directly, needs no wallet, and sends no transaction.

## Run every check at once

[`verify-mainnet.mjs`](/verify/verify-mainnet.mjs) is a single read-only script. It checks the admin powers, lists every pool transaction with its kind, and sends each proof back to the deployed verifier. In an empty folder, with Node.js 20 or newer:

```sh
npm init -y && npm i viem
curl -O https://zeronym.lat/verify/verify-mainnet.mjs
node verify-mainnet.mjs
```

It uses Robinhood Chain's public RPC. Set `RPC_URL` to use your own, and add `--json` for machine-readable output. The script is short: read it before you run it.

## Admin powers

The pool's source is verified on Sourcify with an [exact match](https://sourcify.dev/server/v2/contract/4663/0x84C21F20959F0D00892007f2A7cFe46d19077877), so the code you read there is the code on the chain. It is also verified on the [Blockscout explorer](https://robinhoodchain.blockscout.com/address/0x84c21f20959f0d00892007f2a7cfe46d19077877?tab=contract). The admin can call only two functions:

| Function | What it does |
| --- | --- |
| `setToken(token, supported)` | Turns deposits of a token on or off |
| `setAdmin(admin)` | Hands the admin role to another address |

Nothing else in the pool checks for the admin. Here is how to confirm the rest:

| Claim | How to check |
| --- | --- |
| The admin is the 2-of-3 Safe | Call `admin()` on the pool. It returns `0xFB4ff79d6BD9563b9f9c85Ce0Aa16271eA904Ae3`. On that address, `getThreshold()` returns 2 and `getOwners()` returns 3 owners |
| It can't block withdrawals | `transact` checks token support only when `extAmount` is positive (a deposit). Private transfers and withdrawals never read it |
| It can't move funds | No admin function transfers tokens. Tokens leave the pool only inside `transact`, to the recipient and relayer fixed by a valid proof |
| It can't change the verifier | `verifier` is `immutable`: set once at deploy, with no setter |
| It can't cap deposits | The pool has no deposit limit and no setting for one |
| It can't upgrade the pool | The pool is not a proxy: the EIP-1967 implementation, admin and beacon slots are empty, and its code has no `DELEGATECALL` or `SELFDESTRUCT` |

## What each pool transaction looks like

Every pool action is one call to `transact`. Its `extAmount` and the token movements in its receipt tell you which kind it is. Open the pool on the [explorer](https://robinhoodchain.blockscout.com/address/0x84c21f20959f0d00892007f2a7cfe46d19077877) and compare.

| Kind | `extAmount` | USDG movements | Pool events |
| --- | --- | --- | --- |
| Shield | Positive: the deposit | The deposit, from the sender's wallet into the pool | 2 `NewCommitment`, 2 `NewNullifier` |
| Private transfer | 0 | None, or only the relayer fee (0.50 USDG) from the pool to the relayer | 2 `NewCommitment`, 2 `NewNullifier` |
| Withdrawal | Negative: the amount out | The amount, from the pool to the recipient, plus the relayer fee if it was relayed | 2 `NewCommitment`, 2 `NewNullifier` |
| Withdrawal received as ETH | Negative: the amount out | The amount, from the pool to a one-off forwarder, then through the [ETH exit](https://robinhoodchain.blockscout.com/address/0xcf05a3b5e418dd0afe3ffb075f7b64c27019bb63) to Uniswap; ETH to the recipient. Plus the relayer fee | 2 `NewCommitment`, 2 `NewNullifier`, and a `Settled` event from the ETH exit with the ETH sent |

A withdrawal received as ETH is sent to the ETH exit contract, not the pool, and the exit contract calls `transact`. Decode it as `withdraw(args, extData, order)`: the first two are the pool call, and `order` holds the ETH recipient and the least ETH it accepted.

### Pool events

If you read the pool's logs directly, `topic0` tells you the event. Each is the keccak-256 hash of the event's signature in the verified source.

| `topic0` | Event | When |
| --- | --- | --- |
| `0xf3843edd…411afd` | `NewCommitment(bytes32 commitment, uint256 index, bytes encryptedOutput)` | 2 per pool transaction: the new notes. `encryptedOutput` is the note encrypted to its owner, and only their key can read it |
| `0x5e58f77b…f297ce` | `NewNullifier(bytes32 nullifier)` | 2 per pool transaction: the notes spent |
| `0x9acd2543…e2b15e` | `TokenSupport(address indexed token, bool supported)` | Admin turns deposits of a token on or off |
| `0x7ce7ec0b…188f5c` | `AdminChanged(address admin)` | Admin role handed on |

For example, 10 `NewCommitment` and 10 `NewNullifier` events mean 5 pool transactions. The events look the same for a shield, a private transfer and a withdrawal; the kind comes from `extAmount` and the token movements, as in the table above.

The pool has no stored relayer. Each transaction names its relayer and fee in `extData`, and the proof binds them, so nobody can swap them. The Zeronym relayer is `0xc38e587856452610f41bbb57be25a14d2eb2959a`, as `/api/relay` reports. You can also skip it and submit from your own wallet.

In a private transfer, nothing on the chain names the sender, the recipient or the amount. The new notes are encrypted, and the spent notes appear only as nullifiers, which can't be traced back to the notes they spend. The one exception is who submits it: through the relayer, the sender on the chain is the relayer; from your own wallet, it is your wallet.

## Re-check a proof

A pool transaction can only succeed if the verifier accepts its proof: `transact` reverts with "Invalid transaction proof" otherwise. You can also ask the verifier again at any time:

1. Decode the transaction's input as `transact(_args, _extData)` using the pool's verified ABI (or, for a withdrawal received as ETH, as `withdraw(args, extData, order)` using the ETH exit's verified ABI).
2. Call `verifyProof(_args, _extData.token)` on the pool with `eth_call`. It forwards the proof and its eight public inputs to the verifier and returns `true`.
3. Change any public input, for example add 1 to `publicAmount`, and call it again. It returns `false`.

`verifyProof` checks only the proof, so it still answers for notes that are already spent. The script does steps 1 to 3 for every pool transaction.

## Pool transactions so far

<div id="pool-txs" class="pool-txs">
<p>As of block 100,858,601 (29 October 2026). On zeronym.lat this list is read live from the chain each time the page loads. The same data as JSON: <a href="/api/pool">/api/pool</a>.</p>
<ul><li>User transactions: 20 (7 shields, 7 private transfers, 6 withdrawals). Admin transactions: 2.</li><li>USDG shielded in total: 24.709844 USDG. Withdrawn in total: 11 USDG. Relayer fees: 6.5 USDG. In the pool now: 7.209844 USDG.</li><li>Notes created: 40 (NewCommitment events). Notes spent: 40 (NewNullifier events).</li></ul>
<table><thead><tr><th>Transaction</th><th>Kind</th><th>Public amount</th><th>Proof</th></tr></thead><tbody>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x166f6d1b58bf368dbbe0ccbab5f846d2c9715a63b5a3c43147d60de4cfd8d46d" target="_blank" rel="noopener">0x166f6d1b…</a></td><td>Private transfer, through the relayer</td><td>None. Only the 0.5 USDG relayer fee leaves the pool; sender, recipient and amount stay encrypted</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xdadfb670bc5b6f77cfc7e67f4e408aed95b37bd2e37870fd617346ee5ab7932c" target="_blank" rel="noopener">0xdadfb670…</a></td><td>Shield, from the sender’s wallet</td><td>5 USDG in</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xa6067d8a8c4130e5fae0084fba9346d8a9c09bd86782f5f85106918bd3ba7d6f" target="_blank" rel="noopener">0xa6067d8a…</a></td><td>Private transfer, through the relayer</td><td>None. Only the 0.5 USDG relayer fee leaves the pool; sender, recipient and amount stay encrypted</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xdba2e70d98d06f6fc61837cb6afe87949583a2bca35a1206171a914027626e63" target="_blank" rel="noopener">0xdba2e70d…</a></td><td>Withdrawal, through the relayer</td><td>1 USDG out, plus 0.5 USDG relayer fee</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x89e4402ac8d66d4fdd2808fbf16ef40b7d40efe8f34baec761e2ecd1d9ee72fc" target="_blank" rel="noopener">0x89e4402a…</a></td><td>Private transfer, through the relayer</td><td>None. Only the 0.5 USDG relayer fee leaves the pool; sender, recipient and amount stay encrypted</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xe2cd490dc519fee11281d442f3ceb85450841f6adf66ad9aba58dbc06b45d53f" target="_blank" rel="noopener">0xe2cd490d…</a></td><td>Shield, from the sender’s wallet</td><td>3 USDG in</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x595fcd7876c89619a7fbfcd4b026c7bd9363aec5cd02e9f09a6f1d025660d531" target="_blank" rel="noopener">0x595fcd78…</a></td><td>Withdrawal, through the relayer</td><td>1 USDG out, plus 0.5 USDG relayer fee</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x9103c45954ac53855d03c76eb90d30c9435ddd6fbdf9654839012c1929cc2782" target="_blank" rel="noopener">0x9103c459…</a></td><td>Private transfer, through the relayer</td><td>None. Only the 0.5 USDG relayer fee leaves the pool; sender, recipient and amount stay encrypted</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x22cf8f4e12e4971de1370a3582fa343b7b1c1c917bb5f96435e85cef87c4882c" target="_blank" rel="noopener">0x22cf8f4e…</a></td><td>Shield, from the sender’s wallet</td><td>1 USDG in</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x2de3f89c15e3665500d7a1c5d7c1791a960c1b1962b59885800d244bdb02f7eb" target="_blank" rel="noopener">0x2de3f89c…</a></td><td>Withdrawal, through the relayer</td><td>1 USDG out, plus 0.5 USDG relayer fee</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x0a5812ebcf928e4fbb2bd994a12f3f418b7b52f7910bd1226300125486130cd8" target="_blank" rel="noopener">0x0a5812eb…</a></td><td>Private transfer, through the relayer</td><td>None. Only the 0.5 USDG relayer fee leaves the pool; sender, recipient and amount stay encrypted</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xee8e9e47cb94b1aeaae6134c41ee588bb6c85a7b895274dd720141c90e0c8df9" target="_blank" rel="noopener">0xee8e9e47…</a></td><td>Shield, from the sender’s wallet</td><td>3 USDG in</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xaf09c2aee1d00b8b2898b37b9a401d391da40168170d5daa724b5a7e299ae6a1" target="_blank" rel="noopener">0xaf09c2ae…</a></td><td>Withdrawal, through the relayer</td><td>2 USDG out, plus 0.5 USDG relayer fee</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xb0f0e65a17467056b64d7b83cff867e114be9fc66818a8b3a0de215edeeb90d2" target="_blank" rel="noopener">0xb0f0e65a…</a></td><td>Private transfer, through the relayer</td><td>None. Only the 0.5 USDG relayer fee leaves the pool; sender, recipient and amount stay encrypted</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x0c88f5359f3c71d31bb003052ec217f25b6b8ef0a12d0d8816d6bbed49b2a76a" target="_blank" rel="noopener">0x0c88f535…</a></td><td>Shield, from the sender’s wallet</td><td>1.709844 USDG in</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x2ffa4b903d2bd35a5e0879a6a5165d7a1e550dc3a92ed70a33d2f91500b3837e" target="_blank" rel="noopener">0x2ffa4b90…</a></td><td>Private transfer, through the relayer</td><td>None. Only the 0.5 USDG relayer fee leaves the pool; sender, recipient and amount stay encrypted</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x48c43ded34023d18d83b8eeaa552345471ff1199c9adc71b704c79aa78aafe65" target="_blank" rel="noopener">0x48c43ded…</a></td><td>Withdrawal, through the relayer</td><td>5 USDG out, plus 0.5 USDG relayer fee</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xabe3ea3943849f7deb36fed6c154d87e58002bf015048d5bd0fbf551623bd476" target="_blank" rel="noopener">0xabe3ea39…</a></td><td>Withdrawal, through the relayer</td><td>1 USDG out, plus 0.5 USDG relayer fee</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x565247b1a48cbbd9c2bd5a5c6fb131f3bbd7d114a586a0d0c4ef768f2d8850f9" target="_blank" rel="noopener">0x565247b1…</a></td><td>Shield, from the sender’s wallet</td><td>1 USDG in</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xf9644362b7f3898100358833451e3feb2c1cdbc2528714219512cee8485c425f" target="_blank" rel="noopener">0xf9644362…</a></td><td>Shield, from the sender’s wallet</td><td>10 USDG in</td><td>Accepted by the verifier</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0xec843b7f69d8bdb03e9a437fa28c07a1a124721102d3d80c8e688ab06ad47732" target="_blank" rel="noopener">0xec843b7f…</a></td><td>Admin: hand the admin role to the Safe</td><td>None</td><td>No proof needed</td></tr>
<tr><td><a href="https://robinhoodchain.blockscout.com/tx/0x51c11aa534688686f347bd2bb37c45fe366081751d27db28e7defa8a695f1081" target="_blank" rel="noopener">0x51c11aa5…</a></td><td>Admin: turn on USDG deposits</td><td>None</td><td>No proof needed</td></tr>
</tbody></table>
</div>

The kind of each transaction is judged from its public token movements: USDG into the pool is a shield, USDG out to anyone but the relayer is a withdrawal, and anything else is a private transfer. The script above checks each one in more depth and re-runs every proof.
