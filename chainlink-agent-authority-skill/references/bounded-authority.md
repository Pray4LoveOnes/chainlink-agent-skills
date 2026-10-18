# Bounded Agent Authority

Read this file when designing authorization envelopes, action policies, delegation, revocation, or approval gates.

## Authority model

Authority should answer: who authorized which agent to perform which exact class of action, against which resource, in which environment, within what limits, and during what interval?

A portable envelope can contain:

| Field | Required meaning |
| --- | --- |
| `version` | Schema and canonicalization version. |
| `authorizationId` | Stable application identifier and replay key. |
| `principal` | Independently trusted authorizing identity. |
| `subject` | Agent or service receiving authority. |
| `audience` | Intended verifier or service. |
| `tenantId` | Isolation boundary. |
| `environment` | Development, test, or production boundary. |
| `networkScope` | Explicit chain, payment rail, or external system. |
| `action` | Enumerated operation, not free-form executable text. |
| `resource` | Exact contract, account, order, tool, or endpoint scope. |
| `constraints` | Amount, asset, recipient, call, rate, or cumulative limits. |
| `intentDigest` | Digest of the canonical proposed action when single-use. |
| `nonce` | Unique replay-control value. |
| `issuedAt`, `notBefore`, `expiresAt` | Signed temporal bounds. |
| `policyVersion` | Policy context expected by the principal. |

The signature and signing scheme are transport fields around the canonical envelope. The application must obtain trusted principal keys from configuration or an authenticated trust registry, never solely from the submitted envelope.

Domain-separate the signed commitment by application, environment, tenant, schema version, and artifact purpose. A digest authorized for an inbound claim, read operation, test environment, or another tenant must not be reusable as outbound execution authority.

## Evaluation order

Fail closed in this order:

1. Parse a supported version with strict types and bounded sizes.
2. Resolve tenant and audience before selecting trust configuration.
3. Compare principal, subject, environment, network, action, and resource to expected values.
4. Validate `issuedAt`, `notBefore`, and `expiresAt` with an explicit clock-skew policy.
5. Check revocation, suspension, cumulative limits, and policy version.
6. Recompute the canonical intent digest and require an exact match.
7. Verify the signature with the independently trusted principal key.
8. Atomically reserve the authorization ID and nonce for this digest.
9. Apply current application policy and any human-approval requirement.

Cryptographic verification may occur earlier for denial-of-service reasons, but no state-changing authorization decision should rely on unvalidated scope fields.

## Replay and concurrency

Persist a record keyed by `(tenantId, principal, authorizationId, nonce)` with the canonical intent digest and state. A duplicate with the same digest returns the existing result; a duplicate with another digest is a conflict and security event. Use a unique constraint or equivalent compare-and-set operation rather than an in-memory check.

Single-use authorization should move through `AVAILABLE -> RESERVED -> CONSUMED`, with `REVOKED` terminal. Do not return `RESERVED` to `AVAILABLE` merely because the caller timed out; first reconcile whether execution occurred.

## Delegation and revocation

Delegation must never broaden the parent's action, resource, time, network, or value bounds. Bind child authority to the parent digest and preserve the chain for audit. Reject cycles, unknown parents, expired parents, and depth beyond the application's explicit policy.

Revocation prevents future authorization decisions; it does not undo an action already executed. Record the effective time and distinguish decisions made before and after it. Emergency stops should be application-owned policy controls and should not depend on receiving another external event.

## Chainlink boundary

CRE Connect EIP-712 authorization, DON/OCR event verification, CCIP transaction evidence, ACE policy results, and CRE workflow reports each have their own documented semantics. Use their product skill and current official documentation. This application envelope can bind to their artifacts by digest but cannot replace or reinterpret their native verification.

In particular, DON/OCR signatures authenticate an inbound report under its configured verification rules. EIP-712 authorizes the exact outbound typed data under its signer and domain rules. Keep their trust configuration, verification results, replay controls, and receipts separate.
