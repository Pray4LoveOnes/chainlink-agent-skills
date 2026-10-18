# Settlement and Reconciliation Controls

Read this file for payments, fulfillment, external settlement, timeouts, retries, and protocol adapters including x402-style payment flows.

## Separate the records

Keep these application records distinct:

- payment or settlement intent;
- principal authorization and policy decision;
- submission attempt;
- transport response;
- authoritative execution evidence;
- finality or completion evidence;
- business-ledger settlement;
- fulfillment outcome.

A successful HTTP response is not necessarily settlement. A valid payment proof is not necessarily business authorization. A finalized transfer is not necessarily correct if asset, amount, recipient, network, or intent binding differs.

## Adapter contract

Hide protocol details behind an explicit adapter that supports:

```text
prepare(canonicalIntent) -> bounded request
submit(request, idempotencyKey) -> submitted | rejected | unknown
lookup(idempotencyKey, externalReference?) -> authoritative status
verify(evidence, canonicalIntent) -> structured verification result
```

Document the authoritative lookup source and idempotency semantics for each adapter. Do not infer x402, Chainlink, chain, exchange, bank, or payment-provider APIs from another protocol. Obtain current documentation before runnable integration code.

## Timeout rule

When submission may have reached the external system but no definitive response returned:

1. Persist the attempt as `UNKNOWN` with the stable idempotency key and request digest.
2. Do not release the nonce, spend limit, inventory, or authorization reservation.
3. Query the authoritative status endpoint or chain evidence.
4. If confirmed, verify exact intent binding and advance once.
5. If authoritatively absent and the protocol guarantees the original cannot later execute, a policy may permit a new attempt.
6. Otherwise escalate for manual reconciliation; never blind-retry with a fresh key.

## Fulfillment gate

Irreversible fulfillment requires all applicable gates:

- authorization valid and unrevoked at the decision point;
- current application policy allows the action;
- canonical executed fields match the authorized intent;
- product/protocol evidence passes its documented verifier;
- required chain or payment finality is reached;
- durable idempotency claim is owned by this operation;
- settlement and fulfillment state can be committed atomically or through a durable outbox;
- ambiguous prior attempts are reconciled.
- the user or authorized approver explicitly confirmed the final bounded payload through the approved custody workflow.

Architecture, test fixtures, signed-intent examples, and agent-generated plans do not constitute approval to move real assets. Never submit a real transaction, payment, operation, or fulfillment action from this skill without that explicit confirmation.

Compensation is a new authorized action, not deletion of history. Record reversals and refunds as linked operations.

## Sovereign and proprietary boundaries

Exchange only explicitly approved, independently verifiable artifacts with protected runtimes. External events and telemetry may be inputs to a policy decision but must not gain implicit control of a proprietary bridge, validator, financial router, or sovereign execution path. Do not include private AgentChain runtime, orchestration, kernel, validator, routing, or bridge implementation in examples.
