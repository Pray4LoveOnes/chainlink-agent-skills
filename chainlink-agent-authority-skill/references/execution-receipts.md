# Execution Receipts and Portable Evidence

Read this file when designing audit receipts, evidence chains, or comparisons between authorized, attempted, and executed actions.

## Receipt purpose

A receipt makes the decision trail portable and tamper-evident. It should permit an independent verifier to determine what was claimed, which checks were performed, and which evidence supports the outcome without overstating certainty.

Recommended fields:

```text
receiptVersion, receiptId, tenantId, sequence, recordedAt
previousReceiptDigest
authorizationDigest, intentDigest, attemptDigest
evidence[] { kind, digest, verifier, verificationResult, observedAt, finality }
policy { version, decision, reasonCodes[] }
transition { from, to, transitionId }
outcome { status, externalReference?, detailsDigest? }
producer { service, build, environment }
receiptDigest, attestation?
```

Use canonical serialization and a named hash algorithm. Domain-separate every digest, for example `agent-authority/receipt/v1`, so the same bytes cannot be substituted across artifact types. Hash sensitive details and retain their disclosure-controlled source separately when full contents should not travel with the receipt.

## Evidence classes

Label evidence by how the verifier can establish it:

- `asserted`: supplied by a caller but not independently established;
- `locally-derived`: recomputed from local canonical data;
- `signature-verified`: signature checked against an identified trust root;
- `chain-observed`: read from a specified chain source with stated block/finality context;
- `product-proof-verified`: checked using the product's documented verifier and configuration;
- `externally-confirmed`: returned by an authoritative external system under an authenticated contract.

Do not collapse these into one `verified: true` flag. Preserve verifier version, trust configuration identifier, and failure reason without embedding secrets.

## Three-way comparison

Before recording success, compare:

1. `authorized`: canonical intent committed by the principal;
2. `attempted`: exact request the agent handed to the execution adapter;
3. `executed`: action established by authoritative external evidence.

Require semantic equality for all authorization-critical fields: tenant, environment, network, account, target, action selector, asset, amount, recipient, call order, and applicable deadline. Normalize only through the versioned canonicalization rules used before signing. A mismatch is not repairable by a successful execution receipt.

## Receipt chain

Within a tenant and stream, assign a monotonic sequence and bind each receipt to the previous receipt digest. Reject gaps, duplicate sequence numbers, a wrong previous digest, or conflicting receipts with the same ID. Anchor checkpoints in a separately controlled store when tamper detection must survive compromise of the primary receipt database.

This detects modification relative to the trusted anchor. It does not prove that the producer observed reality correctly, that the principal owned an asset, or that a legal obligation was satisfied.

## Privacy and portability

Minimize personal, confidential, and credential material. Prefer opaque tenant-local identifiers and digests. Define retention and disclosure policy separately from integrity. Tenant A must not be able to select Tenant B's receipts, authorization, trust roots, or reconciliation records even when identifiers collide.

## Chainlink evidence

Record the product artifact and its actual verification result without relabeling it. Examples include a locally verified CRE Connect event, a finalized EVM transaction receipt, or a CCIP status established through documented sources. A Chainlink-derived observation can satisfy an evidence gate; application policy still decides whether the business action was authorized.
