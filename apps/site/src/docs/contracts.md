---
title: Network and contracts
description: The host chain, network settings and contract addresses, with their current status.
---

Zeronym runs on Robinhood Chain. This page is the official list of Zeronym network settings, contract addresses and published records. If an address you see elsewhere does not match this page, do not use it.

## Network

| Setting | Value |
| --- | --- |
| Host chain | Robinhood Chain |
| Chain ID | 4663 |
| Explorer | robinhoodchain.blockscout.com |

Zeronym is not affiliated with or endorsed by Robinhood.

## Mainnet contracts

Only deposit what you can afford to lose.

| Contract | Address | Status | Source |
| --- | --- | --- | --- |
| Shielded pool | `0x84c21f20959f0d00892007f2a7cfe46d19077877` | Mainnet. Accepts USDG | [Sourcify: exact match](https://sourcify.dev/server/v2/contract/4663/0x84C21F20959F0D00892007f2A7cFe46d19077877), [Blockscout: verified](https://robinhoodchain.blockscout.com/address/0x84c21f20959f0d00892007f2a7cfe46d19077877?tab=contract) |
| Verifier | `0xa1cb0bf67c66749bd6075ead69fb1ede77757101` | Mainnet. Multi-party setup: 4 contributors and a public beacon | [Sourcify: exact match](https://sourcify.dev/server/v2/contract/4663/0xa1cB0Bf67c66749Bd6075EAd69fB1EdE77757101), [Blockscout: verified](https://robinhoodchain.blockscout.com/address/0xa1cb0bf67c66749bd6075ead69fb1ede77757101?tab=contract) |
| Hasher (Poseidon) | `0xc94243f257b9ac32a458d73fad37f46fcd0202e1` | Mainnet. Used by the pool's Merkle tree | Generated Poseidon bytecode (circomlibjs), no Solidity source |
| ETH exit | `0xcf05a3b5e418dd0afe3ffb075f7b64c27019bb63` | Mainnet. Lets a withdrawal arrive as ETH: swaps the withdrawn USDG on Uniswap in the same transaction. Fixed to the pool above, no owner or admin, holds nothing between transactions | [Sourcify: exact match](https://sourcify.dev/server/v2/contract/4663/0xCf05a3b5e418DD0afE3ffb075f7B64c27019Bb63), [Blockscout: verified](https://robinhoodchain.blockscout.com/address/0xcf05a3b5e418dd0afe3ffb075f7b64c27019bb63?tab=contract) |
| Pool admin (Safe multisig, 2 of 3) | `0xFB4ff79d6BD9563b9f9c85Ce0Aa16271eA904Ae3` | Mainnet. Safe v1.5.0: `getThreshold()` returns 2, `getOwners()` returns 3 owners | [Explorer](https://robinhoodchain.blockscout.com/address/0xFB4ff79d6BD9563b9f9c85Ce0Aa16271eA904Ae3) |
| Zeronym token (Znym) | `0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67` | Mainnet. ERC-20 on Robinhood Chain, 18 decimals, fixed supply of 1,000,000,000 Znym minted once at deploy to its Pons launch bonding curve. The contract has no mint, pause or blocklist function and no owner. Holders can burn their own tokens. The pool doesn’t need it | [Explorer](https://robinhoodchain.blockscout.com/token/0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67), [Sourcify: exact match](https://sourcify.dev/server/v2/contract/4663/0x157ba872a92c2f147c3ea73dabf56daa9ef8fc67), Blockscout: verified |

## Pool activity you can check

Every kind of pool transaction has already run on mainnet: shields, private transfers and withdrawals. Each one passed the deployed verifier, and each proof still returns `true` from the pool's `verifyProof` view function, while a copy with one public input changed returns `false`. Five early examples are below. The full list, read live from the chain, is on [Check it yourself](/docs/verify/#pool-transactions-so-far).

| Transaction | Kind | What the chain shows | Proof |
| --- | --- | --- | --- |
| [0xf9644362…](https://robinhoodchain.blockscout.com/tx/0xf9644362b7f3898100358833451e3feb2c1cdbc2528714219512cee8485c425f) | Shield | 10 USDG from the sender's wallet into the pool | Accepted. A changed copy is rejected |
| [0x565247b1…](https://robinhoodchain.blockscout.com/tx/0x565247b1a48cbbd9c2bd5a5c6fb131f3bbd7d114a586a0d0c4ef768f2d8850f9) | Shield | 1 USDG from the sender's wallet into the pool | Accepted. A changed copy is rejected |
| [0x2ffa4b90…](https://robinhoodchain.blockscout.com/tx/0x2ffa4b903d2bd35a5e0879a6a5165d7a1e550dc3a92ed70a33d2f91500b3837e) | Private transfer, through the relayer | `extAmount` 0. Only the 0.50 USDG relayer fee leaves the pool. No sender, recipient or amount | Accepted. A changed copy is rejected |
| [0xabe3ea39…](https://robinhoodchain.blockscout.com/tx/0xabe3ea3943849f7deb36fed6c154d87e58002bf015048d5bd0fbf551623bd476) | Withdrawal received as ETH | 1 USDG out, swapped to 0.000428 ETH for the recipient, plus the 0.50 USDG relayer fee | Accepted. A changed copy is rejected |
| [0x48c43ded…](https://robinhoodchain.blockscout.com/tx/0x48c43ded34023d18d83b8eeaa552345471ff1199c9adc71b704c79aa78aafe65) | Withdrawal received as ETH | 5 USDG out, swapped to 0.00214 ETH for the recipient, plus the 0.50 USDG relayer fee | Accepted. A changed copy is rejected |

Two more pool transactions are the admin turning on USDG and handing the admin role to the Safe. To re-check all of this yourself with one read-only script, see [Check it yourself](/docs/verify/).

## Tokens the mainnet pool accepts

These tokens are not Zeronym contracts. The pool only lists them.

| Token | Address | Status |
| --- | --- | --- |
| USDG, issued by Paxos | `0x5fc5360d0400a0fd4f2af552add042d716f1d168` | Mainnet |

A token available on Robinhood Chain is not supported by Zeronym unless it is listed here.

> **Always check an address before you use it.** If an address is not on this page, it is not Zeronym.

## Other records

| Record | Status |
| --- | --- |
| Admin powers | The pool's admin is the Safe above. In the pool's verified source, only two functions check for the admin: `setToken(token, supported)` turns deposits of a token on or off, and `setAdmin(admin)` hands the role to another address. It can't block withdrawals or private transfers, move funds, cap deposits, change the verifier (it is `immutable`) or upgrade the pool (not a proxy, no `DELEGATECALL` or `SELFDESTRUCT`). [How to check this](/docs/verify/#admin-powers) |
| Setup ceremony | Phase 1: PSE perpetual powers of tau. Phase 2: 4 contributions, then the hash of Robinhood Chain block 98,488,820 as a public beacon, announced before the block existed |
| Fees | No protocol fee. A private send or withdrawal sent through the Zeronym relayer pays it 0.50 USDG. Withdrawing from your own wallet pays only network gas |
| Relayer, indexer and prover | One Zeronym relayer, which sees your IP address and the transaction it submits. Proofs are built in your browser. No indexer: the app reads the chain directly |
| Source verification | Pool, verifier and ETH exit are verified in two places: on Sourcify with an exact creation and runtime match, and on the Robinhood Chain Blockscout explorer. Links are in the Source column above. To check with a script, Sourcify's API returns `"match": "exact_match"` and Blockscout's `/api/v2/smart-contracts/<address>` returns `"is_verified": true`. The hasher is generated Poseidon bytecode with no Solidity source |
| Key backup and recovery | Your recovery phrase is the only backup. Nobody, including Zeronym, can recover it |
