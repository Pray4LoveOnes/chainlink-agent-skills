import assert from "node:assert/strict";
import test from "node:test";

import { verifyTrace } from "./verify-execution-trace.mjs";
import { buildTrace, rehash } from "./test-fixtures.mjs";

// deny keeps every negative case explicit: invalid input must be rejected and
// must never produce the compatibility fulfillmentAllowed flag.
function deny(trace, pattern) {
  const result = verifyTrace(trace);
  assert.equal(result.valid, false);
  assert.equal(result.fulfillmentAllowed, false);
  assert.match(result.errors.join("\n"), pattern);
}

// The positive case proves only a complete structural trace, not a live action.
test("allows fulfillment only for an ordered, authorized, evidenced, finalized settlement", () => {
  const result = verifyTrace(buildTrace());
  assert.equal(result.valid, true);
  assert.equal(result.fulfillmentAllowed, true);
});

// A state transition cannot skip the application authorization gate.
test("unauthorized action fails closed without fulfillment", () => {
  deny(buildTrace(["PROPOSED", "SUBMITTED"]), /invalid transition PROPOSED -> SUBMITTED/);
});

// Time expiry and revocation are independent controls and both must fail closed.
test("expired or revoked authority fails closed", () => {
  const expired = buildTrace(); expired.authority.expiresAt = 112; rehash(expired); deny(expired, /outside its validity interval/);
  const revoked = buildTrace(); revoked.authority.status = "revoked"; deny(revoked, /not active/);
});

// A nonce and a transition identifier are replay controls, not advisory metadata.
test("replayed nonce, intent, or transition fails closed", () => {
  const nonce = buildTrace(); nonce.authority.nonceUseCount = 2; deny(nonce, /consumed exactly once/);
  const transition = buildTrace(); transition.records[2].transitionId = transition.records[1].transitionId; rehash(transition); deny(transition, /replays a prior transition/);
});

// An inbound observation cannot become outbound business authorization by itself.
test("verified inbound evidence without business authorization cannot fulfill", () => {
  const trace = buildTrace(); trace.authority.outboundAuthorizationValid = false; deny(trace, /outbound authorization is missing or invalid/);
});

// Even a valid outbound artifact still requires current application policy.
test("valid outbound authorization without business policy cannot fulfill", () => {
  const trace = buildTrace(); trace.authority.policyAuthorized = false; deny(trace, /business policy did not authorize/);
});

// UNKNOWN is durable uncertainty: no blind retry and no fulfillment shortcut.
test("ambiguous timeout remains UNKNOWN and cannot create fulfillment or blind retry", () => {
  const unknown = buildTrace(["PROPOSED", "AUTHORIZED", "RESERVED", "SUBMITTED", "UNKNOWN"]);
  unknown.fulfillmentCreated = true; deny(unknown, /fulfillment was created/);
  const retry = buildTrace(["PROPOSED", "AUTHORIZED", "RESERVED", "SUBMITTED", "UNKNOWN", "SUBMITTED"]);
  deny(retry, /retries while a prior outcome is UNKNOWN/);
});

// Scope fields are bound to the authority and cannot be changed per delivery.
test("wrong tenant, chain, action, destination, or scope fails closed", () => {
  for (const field of ["tenantId", "chainId", "action", "destination", "scope"]) {
    const trace = buildTrace(); trace.records[3][field] = `wrong-${field}`; rehash(trace); deny(trace, /does not match bounded authority/);
  }
});

// Rewriting a receipt or state root must be detectable from its digest links.
test("tampered receipt or mismatched state root fails closed", () => {
  const receipt = buildTrace(); receipt.records[3].at = 150; deny(receipt, /receiptDigest mismatch/);
  const root = buildTrace(); root.records[4].stateDigest = "tampered"; deny(root, /stateDigest mismatch/);
});

// Duplicate and reordered deliveries must not create an alternate valid history.
test("duplicate and out-of-order deliveries fail closed", () => {
  const duplicate = buildTrace(); duplicate.records[2].sequence = 2; rehash(duplicate); deny(duplicate, /sequence must be contiguous/);
  const reordered = buildTrace(["PROPOSED", "AUTHORIZED", "SUBMITTED", "RESERVED"]); deny(reordered, /invalid transition/);
});

// A signer named inside a claim is not an independently configured trust root.
test("claim-payload signer cannot replace configured trusted principal", () => {
  const trace = buildTrace(); trace.authority.principal = "payload-injected-signer"; deny(trace, /not the configured trusted principal/);
});

// Proof verification and finality are separate gates for consequential actions.
test("missing finality or execution evidence cannot fulfill", () => {
  const finality = buildTrace(); finality.evidence.finality = "safe"; deny(finality, /required finality is missing/);
  const execution = buildTrace(); execution.evidence.executionObserved = false; deny(execution, /execution was not authoritatively observed/);
});

// Evidence must bind both the authorized intent and the isolated tenant.
test("receipt intent mismatch and cross-tenant evidence fail closed", () => {
  const intent = buildTrace(); intent.evidence.intentDigest = "sha256:other"; deny(intent, /does not bind the authorized intent/);
  const tenant = buildTrace(); tenant.evidence.tenantId = "tenant-b"; deny(tenant, /crosses the tenant boundary/);
});
