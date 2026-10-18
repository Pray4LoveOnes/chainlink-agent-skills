---
name: chainlink-agent-authority-skill
description: "Designs bounded authority, proof-of-execution receipts, deterministic replay, and settlement reconciliation for AI agents that use Chainlink. Use for agent permissions, signed intents, authorization replay, execution evidence, unknown settlement outcomes, or matching authorized, attempted, and executed actions. This is application-layer guidance, not a Chainlink product or a replacement for CRE, CRE Connect, CCIP, ACE, or protocol-specific payment verification."
license: MIT
compatibility: Designed for AI agents that implement https://agentskills.io/specification, including Claude Code, Cursor Composer, and Codex-style workflows.
allowed-tools: Read WebFetch Write Edit Bash(node:*)
metadata:
  purpose: Application-layer bounded authority and verifiable execution patterns for Chainlink-powered agents
  version: "0.0.1"
---

# Chainlink Agent Authority Skill

## Scope

Design the application boundary between a principal's authorization, an agent's proposed action, external execution, and settlement. Treat this skill as a community engineering pattern, not a Chainlink product or native protocol feature.

Use the relevant Chainlink product skill for product mechanics. This skill supplies the surrounding authorization, evidence, replay, and reconciliation controls. Never claim a DON proof, transaction receipt, valid signature, or successful simulation independently proves business authorization, ownership, entitlement, or legal settlement.

## Routing and prerequisites

| User request | Route |
| --- | --- |
| Bound an AI agent's authority or compare authorized, attempted, and executed actions | This skill |
| Design portable execution receipts, deterministic replay, or unknown-outcome reconciliation | This skill |
| Author, simulate, deploy, or operate a CRE workflow | `chainlink-cre-skill` |
| Configure CRE Connect watchers, verify DON/OCR events, or construct CRE Connect operations | `chainlink-cre-connect-skill` |
| Implement generic ERC-4337, OAuth, payment-provider, or x402 mechanics without this authority boundary | The relevant protocol guidance, not this skill |

Before runnable integration code, require the application's policy contract and the current official or provisioned contract for every Chainlink or payment adapter involved. Proceed directly with schemas, state machines, validation rules, and application-owned code when those private implementation details are unnecessary.

Application-owned controls include trusted-principal configuration, tenant/project scope, business policy, canonical intent construction, nonce reservation, approval, durable state, receipt production, fulfillment, and reconciliation. Chainlink-owned controls retain only the semantics documented for the selected product, such as DON/OCR event verification, CRE execution, CCIP messaging, or Smart Account operation handling. Never redefine one layer as the other.

## Progressive disclosure

1. Read [references/bounded-authority.md](references/bounded-authority.md) for authority envelopes, policy evaluation, revocation, and least privilege.
2. Read [references/execution-receipts.md](references/execution-receipts.md) for evidence schemas, hash chaining, observation claims, and verifier boundaries.
3. Read [references/deterministic-replay.md](references/deterministic-replay.md) for ordered state transitions, duplicate delivery, crash recovery, and replay qualification.
4. Read [references/settlement-reconciliation.md](references/settlement-reconciliation.md) for payment intents, timeouts, unknown outcomes, and protocol adapters.
5. Do not load unrelated references speculatively.

## Required decision path

For any consequential action, keep these records distinct and link them by digest:

```text
principal authorization -> policy decision -> agent attempt
                        -> external observation -> state transition -> outcome
```

1. Canonicalize and hash the proposed action before approval.
2. Validate the authority envelope's principal, subject, audience, tenant, environment, network, resource, action, limits, nonce, issued-at, not-before, expiry, and revocation state.
3. Verify the signature against an independently configured trusted principal. A signer named only inside the artifact is not a trust root.
4. Evaluate current application policy after cryptographic verification. A valid signature proves an artifact was signed; it does not itself grant settlement permission.
5. Reserve the authorization nonce or intent ID durably before execution. Reject replays and conflicting payloads.
6. Record exactly what the agent attempted. Do not broaden or repair authorization silently.
7. Verify external evidence with the appropriate Chainlink or protocol-specific verifier, then compare the executed action with the authorized and attempted actions.
8. Apply a deterministic state transition and append a receipt. Preserve an unknown outcome when execution cannot be established.
9. Reconcile unknown outcomes by querying authoritative evidence before retrying. Never convert uncertainty into failure or success merely to make progress.

## Hard invariants

- Default deny. Missing, expired, not-yet-valid, revoked, wrong-tenant, wrong-network, over-limit, or mismatched authorization cannot execute.
- Bind authorization to one canonical intent and bounded context. Do not accept wildcard targets, unlimited value, unlimited duration, or caller-selected trust roots for consequential actions.
- Keep inbound DON/OCR proof verification distinct from outbound EIP-712 authorization. Neither artifact substitutes for the other or for application policy.
- Separate authentication, cryptographic validity, policy authorization, execution, observation, finality, and settlement. Passing one gate never implies the others.
- Enforce durable idempotency at the business-operation boundary. Transport retries and duplicate callbacks must not duplicate effects.
- Do not promise generic exactly-once execution across databases, chains, payment rails, or external services. Use idempotency keys, durable state, reconciliation, and compensating procedures.
- An ambiguous timeout is `UNKNOWN`, not `FAILED`. Retry only after authoritative reconciliation establishes that another execution cannot occur, or reuse the protocol's safe idempotency mechanism.
- Receipts are evidence containers. State precisely which fields were locally derived, cryptographically verified, externally observed, or merely asserted.
- A receipt chain detects changes relative to its trusted anchor; it does not make untrusted inputs true.
- Keep tenant state, nonces, policies, receipts, and reconciliation jobs isolated. Never select authority or evidence across tenants.
- Never request or expose private keys, seed phrases, API secrets, bearer tokens, raw signing material, or proprietary Agent City internals.
- Never imply this pattern is native DON, Smart Account, CCIP, ACE, x402, Ed25519, or post-quantum support unless current authoritative product documentation establishes that fact.
- Require explicit user approval of the final bounded payload immediately before any real irreversible submission; design and test work alone never authorizes execution.

## Deliverables

When asked for a design, provide the trust boundaries, authority schema, state machine, persistence constraints, evidence sources, retry rules, and negative tests. When asked for code, use application-owned interfaces unless the user supplies a published or provisioned product contract. Label pseudocode and adapters clearly; do not invent Chainlink APIs.

For deterministic trace checks, use the bundled verifier:

```text
node scripts/verify-execution-trace.mjs <trace.json>
node --test scripts/verify-execution-trace.test.mjs
```

The verifier validates the portable application-layer trace format only. It does not verify Chainlink proofs, chain consensus, payment settlement, or signatures.
