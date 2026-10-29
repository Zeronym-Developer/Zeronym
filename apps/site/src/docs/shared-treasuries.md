---
title: Shared treasuries
description: "Coming soon: shielded vaults that teams and communities spend from together."
status: candidate
---

Shared treasuries are coming soon. They are in progress. They extend vaults with spending rules for groups, and need their own contracts and security review before they go live.

## What it is meant to do

A shared vault would have a **policy** that sets:

- Who can approve spending.
- How many approvals each payment needs.
- Which actions are allowed, with spending limits.
- How long an approval stays valid.

Each approval covers one exact action: the token, the amount, the destination, the maximum fee and the deployment. An approval for one payment cannot be reused for another.

## Rules that cannot be bypassed

- A relayer cannot replace a missing approval.
- Changing the policy needs the approvals the current policy requires. It cannot quietly skip them.

## What stays private, and from whom

> **Treasury privacy depends on how approvals work.** A public multisig wallet shows its signers and every approval, even if the assets later move into the pool.

Hiding who approved a payment needs a dedicated design, and Zeronym does not assume one exists yet.

Members with viewing access will know more than outsiders. Privacy from the public is not secrecy from every member of the treasury.
