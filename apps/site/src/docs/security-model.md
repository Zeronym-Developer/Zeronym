---
title: Security model
description: What has to be secure, who can change the system, and how to report a problem.
---

Zeronym's safety depends on more than one contract. This page lists what must be secure, exactly what the admin can and can't do, and how to report a problem.

## What has to be secure

- The pool contract, which holds the tokens.
- The proof circuit and the verifier contract, which decide whether a spend is valid.
- Key management in the app.
- The relayer, which submits transactions for you if you choose it.
- The app itself.

## What every proof must enforce

- You own the notes you spend.
- Value is conserved for each token.
- The token is the one you think it is.
- No note is spent twice.
- The proof is for this exact action and this deployment. It cannot be replayed elsewhere.

## Admin powers

The mainnet pool's admin is a 2-of-3 Safe multisig, `0xFB4ff79d6BD9563b9f9c85Ce0Aa16271eA904Ae3`. Read it with `admin()` on the pool. The pool has no `owner()` function. In the pool's [verified source](https://sourcify.dev/server/v2/contract/4663/0x84C21F20959F0D00892007f2A7cFe46d19077877), the admin can call only two functions:

| Function | What it does |
| --- | --- |
| `setToken(token, supported)` | Turns deposits of a token on or off |
| `setAdmin(admin)` | Hands the admin role to another address |

The admin can't:

- **Replace the verifier.** `verifier` is `immutable`: set once at deploy, with no setter.
- **Change withdrawal rules or block withdrawals.** Private transfers and withdrawals never check token support or the admin.
- **Move funds.** No admin function transfers tokens.
- **Cap deposits or charge fees.** The pool has no setting for either.
- **Upgrade the pool.** It is not a proxy, and its code has no `DELEGATECALL` or `SELFDESTRUCT`.

The only emergency control is turning off new deposits of a token. It never stops anyone from moving or withdrawing what is already in the pool. [Check all of this yourself](/docs/verify/#admin-powers).

## Relayer

A relayer can't change your outputs, raise the fee above what your proof fixes, or spend without your authorization. It can delay or refuse to submit your transaction. If it does, you can submit the same withdrawal from your own wallet and pay only gas.

There is no indexer. The app reads the pool's events straight from the chain and checks its copy of the Merkle tree against the contract's root before every action.

## Reporting a problem

To report a vulnerability, see the [Security](/security/) page.
