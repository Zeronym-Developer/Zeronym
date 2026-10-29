## 1. Overview

Zeronym is a privacy-focused asset management protocol for Web3. It brings supported tokens into a shielded environment where users can organize balances, transfer assets and coordinate treasury spending without publishing every internal movement on a public ledger.

The protocol combines shielded asset pools, user-controlled spending authorization, separate vaults and selective transaction disclosure. Its purpose is to make privacy useful for everyday on-chain asset management, from an individual separating trading capital from long-term holdings to a community managing contributor payments.

Zeronym is designed for existing crypto assets. Users do not need to convert their entire portfolio into a dedicated privacy currency to access supported functions.

Its core principle is simple: a transaction should prove that spending is valid without revealing more financial information than the action requires.

## 2. The Problem

Public blockchains make financial activity independently verifiable, but they also expose information beyond the immediate transaction. A single address can reveal holdings, counterparties, trading patterns and treasury decisions.

For individual users, this creates persistent portfolio visibility. For communities, it can expose contributor relationships and internal allocations. For active traders, it can broadcast movements of capital before a strategy is complete.

Creating additional public wallets does not by itself solve this problem. Transfers, funding relationships and repeated behavior can connect otherwise separate addresses.

Zeronym addresses this exposure through a shared shielded environment and asset management tools that operate within it. The objective is confidentiality for supported financial activity while preserving verifiable accounting.

## 3. Protocol Scope

Zeronym’s core design covers:

- Shielding supported assets.
- Holding confidential balances.
- Organizing assets into separate vaults.
- Sending private transfers between compatible recipients.
- Receiving assets through payment requests.
- Withdrawing to external addresses.
- Sharing selected payment records.

Additional modules cover supported token swaps and shared treasury authorization. These modules require their own deployed contracts, privacy descriptions and security review before being presented as active services.

Each deployment publishes its host chain, supported asset addresses, contract versions, fee rules and operational dependencies. A token available on a host chain is not automatically supported by Zeronym.

Privacy does not automatically extend across chains, bridges or external applications. Each integration has its own boundary and trust assumptions.

## 4. Shielded Asset Accounting

A deposit locks a supported asset in a pool contract. The shielded system represents the user’s corresponding claim through cryptographic commitments rather than a publicly readable account balance.

The design uses encrypted notes to describe ownership and value. A commitment records a note’s existence without publishing its private contents. Authorized recipients use their viewing material to discover and interpret notes belonging to them.

When spending, the user generates a zero-knowledge proof showing that the input notes are valid, that they control the required spending authority, and that the transaction conserves value under the asset’s accounting rules.

A nullifier marks an input as spent without directly revealing its original commitment. Contracts reject repeated nullifiers to prevent double spending.

Proofs must also bind the action to its intended deployment, asset, outputs, recipient where applicable, fees and expiry. A valid proof for one action must not authorize a different action or be reusable on another deployment.

For each supported asset, valid transactions satisfy:

Input value + public deposits = output value + public withdrawals + charged fees.

The protocol must not create unbacked claims or silently substitute one asset for another.

This is the required accounting model. The final proof system, circuits, verifier contracts and any setup assumptions must be published with each implementation.

## 5. User Control and Keys

Users retain spending authority over their shielded assets. A connected wallet can authorize onboarding and actions, but connecting a wallet alone does not establish a secure privacy account.

Spending keys, viewing keys and backup material have different purposes. Spending authority must remain under the user’s control. Viewing material permits access to records without necessarily granting permission to move funds.

The client must explain how privacy keys are generated, stored, recovered and connected to the user’s wallet. Recovery must not depend on assuming that every wallet will reproduce an identical signature.

Under the intended client-side model, private notes and proof witnesses are processed on the user’s device. Infrastructure providers receive only the material necessary for their defined roles. Any implementation using remote proving or server-held viewing keys must disclose the additional visibility that creates.

Loss of necessary recovery material may prevent access to shielded funds. Privacy does not remove the need for secure backups or device protection.

## 6. Private Vaults

Vaults let users organize shielded assets by purpose.

A user can maintain separate vaults for active trading, long-term holdings, community operations or contributor rewards. Each vault has its own local records and, where supported, authorization policy.

Vaults are logical asset management compartments. They do not automatically create independent anonymity sets, legal entities or additional cryptographic privacy.

Moving value between vaults requires the same valid accounting and authorization as any other shielded movement. A change in a dashboard label is not an on-chain transfer.

Personal vault labels and notes remain encrypted or local to the user unless explicitly shared. They must not be published as plaintext transaction metadata.

## 7. Transaction Lifecycle

### Shield

The user selects a supported asset and amount, reviews the contract and fees, and authorizes the deposit. Tokens requiring an allowance need a separate approval.

Credit follows the deployment’s confirmation and validation rules. The interface distinguishes submitted, confirming, credited and failed states. A submitted transaction is never displayed as spendable value before settlement.

Deposits remain public on the host chain, including the funding address, asset and amount.

### Transfer

The sender specifies compatible recipient information and an amount. The client constructs recipient notes and any change notes, generates a proof and submits the authorized action.

After confirmation, the recipient can discover the encrypted output and spend it using their own authority. Sending to an ordinary public address is a withdrawal, not a private internal transfer.

### Receive

A payment request communicates an asset, amount and compatible destination. Requests can include an expiry and a locally stored reference.

A payment link is a request, not proof of settlement. Publishing it can reveal recipient relationships or requested amounts, so confidential request details should be shared privately.

### Withdraw

A withdrawal releases a supported asset from the pool to an external address after the contract verifies the proof and marks the inputs spent.

The destination, asset, amount and settlement time become public. The interface explains these consequences before confirmation.

Delayed or grouped submission may reduce some timing correlations but cannot guarantee that deposits and withdrawals are unlinkable.

## 8. Swaps and External DeFi

The swap module is intended to exchange supported assets while maintaining correct shielded accounting before and after execution.

Every supported route must specify what becomes public. An external exchange can reveal traded assets, amounts, timing and contract interactions even when the original user’s wallet is not the transaction sender.

A quote must show input and output assets, estimated output, minimum received, slippage tolerance, fees and expiry. Successful execution requires the transaction to satisfy those signed limits.

If a route cannot execute atomically with the shielded accounting update, its intermediate custody and recovery rules must be disclosed. A pending swap must not be described as complete.

Depositing into an external lending protocol, liquidity pool or other DeFi application does not inherit privacy merely because the funds originated in Zeronym.

Zeronym does not promise hidden public liquidity positions, guaranteed trade confidentiality or protection from all forms of transaction ordering and value extraction.

## 9. Shared Treasuries

The shared treasury module extends vaults with defined spending policies.

A policy can specify authorized signers, approval thresholds, supported actions, spending limits and validity periods. Approvals must bind the exact action, including asset, value, destination or output commitments, maximum fees and deployment.

A relayer cannot replace missing treasury approvals. Policy changes require the authority specified by the current policy and cannot silently bypass existing controls.

Treasury privacy depends on implementation. A public multisignature wallet can reveal signers and approval activity even if assets later enter a shielded pool. Hiding approvers requires a dedicated authorization design and must not be assumed.

Participants with viewing access may know more than outside observers. Confidentiality from the public does not imply secrecy from every treasury member.

## 10. Selective Disclosure

Users should be able to share records relevant to a specific transaction without exposing their entire financial history.

A transaction receipt can provide a reference, settlement status, disclosed payment details and recipient-verifiable evidence. Stronger claims, such as independently proving a concealed amount to a third party, require an explicit disclosure proof or appropriately scoped viewing material.

A dashboard screenshot alone is not cryptographic proof of payment.

Disclosure access must state its scope. Sharing a reusable viewing key can reveal more history than sharing a single receipt and may reveal future activity.

Once another party receives readable information, Zeronym cannot make them forget it. Revoking an application permission prevents future access through that permission; it does not erase copies already obtained.

## 11. Privacy Boundaries

Zeronym’s privacy objective is to reduce public linkage between ownership and supported activity inside its shielded system.

It does not promise absolute anonymity or universal protection from analysis.

Deposits and withdrawals remain public. Unique amounts, close timing, rare assets, low pool activity and repeated counterparties can weaken practical privacy.

Host-chain observers can see pool interactions, transaction timing, proof-related public data and other metadata exposed by the implementation.

Relayers and RPC providers can observe connection information and submission timing. Encryption of note contents does not automatically hide IP addresses or all network metadata.

An external swap provider sees the information required by its route. A recipient knows the payment information they receive. A party granted viewing access can inspect the scope disclosed to them.

A compromised device, malicious interface or leaked spending key can defeat application-level protections.

Privacy claims must be documented per action and tested against a stated threat model.

## 12. Relayers and Service Availability

Relayers submit authorized transactions and can pay host-chain gas in exchange for a quoted fee. This reduces the need for users to fund a separate public transaction-sending address for every supported action.

A relayer must not be able to change outputs, increase fees beyond signed limits or spend without valid user authorization. A relayer may still delay or refuse submission.

Indexers help clients discover commitments, encrypted notes and spent status. Their responses must be checked against authoritative chain data rather than treated as sufficient evidence of ownership or settlement.

The design requires documented recovery of note history and an alternative submission route if the main interface, indexer or relayer becomes unavailable. Alternative submission can expose additional metadata and must explain that tradeoff.

Noncustodial spending authority and operational independence are separate properties. Published deployment documentation must identify dependencies that could interrupt access.

## 13. Fees and Economic Model

Zeronym’s economic model is payment for protocol execution and asset management services.

Potential charges include action fees, relayer service fees, network costs, swap integration fees and shared treasury service plans.

Each action must display its applicable fees before authorization. Signed transactions include enforceable fee limits. External exchange fees and price impact must be distinguished from Zeronym revenue.

Actual rates and destinations are deployment parameters. No percentage is established by this document.

Fees fund services and protocol maintenance. Depositing assets does not automatically generate yield, and user principal must not be used as operating capital or lent without explicit authorization.

Private records, viewing keys and personal transaction histories are not a revenue product.

## 14. Zeronym Token Framework

The Zeronym token is intended to support defined participation and service benefits around the protocol. Candidate functions include governance over permitted parameters, access to advanced treasury tools and service fee discounts.

Each function requires published implementation rules before it can be described as active. Voting rights, qualification checks, discount limits and any time locks must be explicit.

Basic spending authorization and withdrawal of already-held assets must not depend on purchasing the token or maintaining a secondary market price.

A token balance does not establish ownership of pooled user assets. The token does not automatically confer dividends, revenue rights, yield or guaranteed appreciation.

This whitepaper does not establish supply, allocations, emissions, transfer taxes, a contract address or a token distribution event. Those terms require a separate published specification and verified deployment records.

Governance authority must be bounded. Token voting must not grant access to private keys, arbitrary seizure of user balances or permission to create unbacked asset claims.

## 15. Security and Protocol Controls

The security boundary includes pool contracts, proof circuits, verifier contracts, key management, token adapters, relayers and client software.

Proof verification must enforce ownership, value conservation, asset identity, nullifier uniqueness and the intended action. Spending approvals must resist replay across deployments and action types.

Each asset integration must account for its transfer behavior. Rebasing tokens, transfer-tax tokens, callback-enabled tokens and issuer-controlled assets require explicit treatment or exclusion.

External issuers can impose restrictions on supported tokens. Shielding a token does not remove its issuer’s powers or guarantee redemption value.

Administrative privileges must be publicly documented. An administrator able to replace a verifier or change withdrawal logic can materially affect custody even without possessing user keys.

Changes affecting custody, verification, fees or withdrawals require visible governance rules and a review period appropriate to their impact. Emergency controls must specify who can act, which actions can be paused and how affected users recover access.

A security review must cover contracts, circuits and operational assumptions.

## 16. Transparency and Verification

A production deployment must publish:

- Host chain and supported asset addresses.
- Pool, verifier and integration contract addresses.
- Source versions and proof-system documentation.
- Administrative powers, upgrade rules and emergency controls.
- Fee schedules and fee recipients.
- Relayer, indexer and any remote-prover dependencies.
- Key backup, recovery and alternative withdrawal procedures.
- Active features and known limitations.

Activity statistics must distinguish real settled transactions from test data and avoid double counting internal movements as new deposits.

Accounting must reconcile contract-held assets with valid outstanding shielded claims through the implemented verification model. Visible contract reserves alone do not prove solvency when liabilities are hidden.

## 17. Closing Statement

Zeronym gives Web3 users a framework for managing supported assets with greater control over financial visibility.

Its identity rests on shielded asset accounting, practical vault organization, verifiable authorization and deliberate disclosure.

The standard is not a promise that every action disappears. It is a protocol that clearly defines what is private, preserves valid ownership and accounting, and gives users the tools to manage assets without unnecessarily exposing their wider financial activity.
