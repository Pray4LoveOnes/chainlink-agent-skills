# Conformance package threat model

## Assets and trust anchors

Protect the principal's bounded intent, tenant isolation, authorization nonce, approved destination and amount, durable settlement identity, observation provenance, and audit history. Deployment-selected policy and public keys are trust anchors; a claimant-supplied key, receipt, `signatureValid` flag, or policy digest is not.

This package demonstrates application controls. Its offline observer and settlement provider are explicitly simulated, its signatures are application-owned, and its SQLite state digests are not blockchain state roots. A valid signed statement authenticates the statement's signer, not the underlying world. Historical bundle verification must never be interpreted as new authorization to execute.

## Adversary and required controls

| Boundary / attack | Required invariant | Residual assumption |
| --- | --- | --- |
| Agent broadens principal permission | Exact canonical intent, domain, subject, destination, amount, tenant and chain binding | Principal understands and approves the bounded intent |
| Claim injects its own trusted signer | Verifier obtains keys and key roles from separate deployment policy | Operator distributes authentic trust configuration |
| Authorization expiry or revocation races dispatch | Recheck current policy at the durable dispatch boundary; serialize revocation and reservation | An already committed external action cannot be retroactively undone |
| Duplicate or cross-tenant delivery | Stable scoped business/idempotency key and unique durable reservation | Downstream provider honors the same key and binds it to the exact payload |
| Crash between send and acknowledgement | Recover recorded intent; reconcile by the original key; retain `UNKNOWN` until authoritative evidence exists | Downstream lookup is authoritative; local storage is not silently rolled back |
| Signed observation lacks finality or execution identity | Require both independently verified execution evidence and adequate finality before simulated fulfillment | A real observer must verify the relevant chain/protocol evidence |
| Receipt altered, reordered, truncated, or substituted | Canonical digests, role-constrained signatures, transition order, state digest and trusted policy scope | A wholly replaced valid history requires an external checkpoint/audit anchor to detect |
| Trust store compromised | Fail closed on malformed/wrong-role keys; operational key rotation and revocation | Full operator/key compromise is outside this local model |
| Runtime compromised after verification | Restrict access to durable state and dispatch credentials; isolate verifier from executor | Tests are not a hardened production host or a formal proof |

The independently configured policy must be protected from bundle writers. Test fixtures may generate ephemeral signing keys in memory; they must never be used as production principals. A fixture observer signs synthetic evidence only, and must not be described as a DON or chain verifier.

## Explicit non-goals

- No real token movement, legal entitlement determination, chain-consensus proof, x402 implementation, ERC-4337 account, or automatic custody approval.
- No generic exactly-once guarantee spanning independent services. Idempotency and reconciliation reduce repeated effects under the stated provider assumptions.
- No claim that SQLite durability survives disk corruption, malicious rollback, filesystem compromise, or loss of all replicas. Production requires backup, independent checkpoints, monitoring, and recovery procedures.
- No promise that revocation can cancel a transaction already accepted externally. Reconciliation must preserve and report that outcome without inventing a new fulfillment authorization.
- No connection into the native-only Sovereign Bridge. No Chainlink event, external adapter, telemetry, remote asset, or actor is permitted to enter its trusted execution path. Only sanitized standalone engineering patterns appear here.

## Interpreting test evidence

Negative cases must assert durable fulfillment and provider effects remain absent where forbidden, not merely print a denial label. Crash tests require a separate process and persisted state. Stress results describe only synthetic intents on the recorded machine, worker count, storage mode, and runtime; they are not Agent City engine or Chainlink throughput claims. Authentication, SDK compilation, live proof verification, and model-backed evaluation statuses must be reported independently from local deterministic tests.
