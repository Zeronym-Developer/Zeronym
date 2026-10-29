# Contributing

For a bug, open an issue with the affected page or command, what you expected, what happened and steps to reproduce it. Remove wallet recovery material, private keys, private receipts and authenticated RPC URLs before sharing logs.

Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Pull requests

Keep a change focused. Explain the behavior it changes and the checks you ran. Use a short, concrete commit message, such as `Fix receipt amount formatting` or `Check prover hashes before the site build`.

Use Node.js 24 and follow [Getting started](docs/GETTING_STARTED.md). Run the checks that cover your change. The six workflows under `.github/workflows` show the commands used in CI.

Contract source, circuits, deployment records and verification inputs require explicit review. Do not make incidental formatting changes or regenerate these files as part of an unrelated app change. A proposed protocol change should explain its effect on proofs, existing notes and deployed contracts.

Keep Cloudflare account and D1 IDs as placeholders in the published configuration. Do not commit `.env`, `.dev.vars`, keys, recovery phrases, access tokens or RPC credentials.

## Source rights

A project-wide source license has not been selected. Publishing this repository does not represent it as MIT, Apache-2.0 or another general license. Third-party dependencies and incorporated source retain their own license terms and notices.
