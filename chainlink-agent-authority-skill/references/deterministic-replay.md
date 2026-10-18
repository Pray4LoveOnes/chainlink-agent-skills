# Deterministic Replay and Recovery

Read this file for event ordering, state-machine replay, duplicate delivery, crash recovery, and deterministic qualification.

## Transition model

Represent each business operation as an explicit state machine rather than callback-driven side effects:

```text
PROPOSED -> AUTHORIZED -> RESERVED -> SUBMITTED
SUBMITTED -> CONFIRMED -> SETTLED
SUBMITTED -> UNKNOWN -> CONFIRMED | FAILED
PROPOSED | AUTHORIZED -> DENIED | EXPIRED | REVOKED
```

Adapt states to the protocol, but keep `UNKNOWN` whenever the external outcome is ambiguous. Terminal states must not transition without a separately authorized correction procedure.

Each transition should bind the prior state, input/event digest, deterministic decision, next state, policy version, and monotonic sequence. The reducer must not read wall-clock time, randomness, unordered collections, mutable remote data, or process-local counters implicitly. Provide time and external observations as explicit, recorded inputs.

## Delivery algorithm

Within one database transaction where possible:

1. Insert the input's immutable deduplication key.
2. Load the operation and expected sequence with a lock or compare-and-set version.
3. Reject stale or impossible transitions; park future/out-of-order inputs for reconciliation.
4. Apply the pure transition function.
5. Persist the new state, receipt, and an outbox entry atomically.
6. Acknowledge transport delivery only after commit.

Dispatch the outbox with its stable idempotency key. Mark delivery separately from business execution. A crash before commit permits safe redelivery; a crash after commit reuses the stored result; a crash during an external call produces `UNKNOWN` unless the adapter provides an authoritative idempotency result.

## Replay qualification

Start from a trusted snapshot or genesis state and replay the ordered inputs. Verify:

- sequences are contiguous and unique;
- each `previousReceiptDigest` matches;
- the same canonical input produces the same decision and state root;
- duplicate inputs do not add transitions or side effects;
- reordered inputs are rejected or parked consistently;
- a crash at each persistence boundary converges to the same final state;
- tenant partitions and trust configuration never cross;
- tampering changes the computed digest or fails a transition invariant.

Record the reducer version and canonicalization version. If logic changes, replay under the historical version or perform an explicit, auditable migration; do not silently reinterpret old evidence.

## State roots

A state root can summarize ordered application state for comparison. Define leaf selection, ordering, serialization, hash algorithm, and domain separators. A matching root proves equivalence under those rules and trusted inputs; it does not prove the inputs were true or the external effects occurred.

Deterministic replay is not independent blockchain finality. Finality must come from the selected chain or Chainlink product's documented evidence and confidence model, then enter replay as an explicit verified observation.

## Bundled verifier boundary

`scripts/verify-execution-trace.mjs` checks sequence continuity, receipt linkage, allowed transitions, digest consistency, authorization timing, replayed intent IDs, and unknown-outcome retry rules for a small portable trace schema. It intentionally does not perform cryptographic signature recovery or call Chainlink/product APIs.
