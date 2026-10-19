import assert from "node:assert/strict";
import test from "node:test";

import { verifyTrace } from "./verify-execution-trace.mjs";
import { buildTrace, rehash } from "./test-fixtures.mjs";

function deny(trace, pattern) {
  const result = verifyTrace(trace);
  assert.equal(result.valid, false);
  assert.equal(result.fulfillmentAllowed, false);
  assert.match(result.errors.join("\n"), pattern);
}

test("allows fulfillment only for an ordered, authorized, evidenced, finalized settlement", () => {
  const result = verifyTrace(buildTrace());
  assert.equal(result.valid, true);
  assert.equal(result.fulfillmentAllowed, true);
});

test("unauthorized action fails closed without fulfillment", () => {
  deny(buildTrace(["PROPOSED", "SUBMITTED"]), /invalid transition PROPOSED -> SUBMITTED/);
});

test("expired or revoked authority fails closed", () => {
  const expired = buildTrace(); expired.authority.expiresAt = 112; rehash(expired); deny(expired, /outside its validity interval/);
  const revoked = buildTrace(); revoked.authority.status = "revoked"; deny(revoked, /not active/);
});

test("replayed nonce, intent, or transition fails closed", () => {
  const nonce = buildTrace(); nonce.authority.nonceUseCount = 2; deny(nonce, /consumed exactly once/);
  const transition = buildTrace(); transition.records[2].transitionId = transition.records[1].transitionId; rehash(transition); deny(transition, /replays a prior transition/);
});

test("verified inbound evidence without business authorization cannot fulfill", () => {
  const trace = buildTrace(); trace.authority.outboundAuthorizationValid = false; deny(trace, /outbound authorization is missing or invalid/);
});

test("valid outbound authorization without business policy cannot fulfill", () => {
  const trace = buildTrace(); trace.authority.policyAuthorized = false; deny(trace, /business policy did not authorize/);
});

test("ambiguous timeout remains UNKNOWN and cannot create fulfillment or blind retry", () => {
  const unknown = buildTrace(["PROPOSED", "AUTHORIZED", "RESERVED", "SUBMITTED", "UNKNOWN"]);
  unknown.fulfillmentCreated = true; deny(unknown, /fulfillment was created/);
  const retry = buildTrace(["PROPOSED", "AUTHORIZED", "RESERVED", "SUBMITTED", "UNKNOWN", "SUBMITTED"]);
  deny(retry, /retries while a prior outcome is UNKNOWN/);
});

test("wrong tenant, chain, action, destination, or scope fails closed", () => {
  for (const field of ["tenantId", "chainId", "action", "destination", "scope"]) {
    const trace = buildTrace(); trace.records[3][field] = `wrong-${field}`; rehash(trace); deny(trace, /does not match bounded authority/);
  }
});

test("tampered receipt or mismatched state root fails closed", () => {
  const receipt = buildTrace(); receipt.records[3].at = 150; deny(receipt, /receiptDigest mismatch/);
  const root = buildTrace(); root.records[4].stateDigest = "tampered"; deny(root, /stateDigest mismatch/);
});

test("duplicate and out-of-order deliveries fail closed", () => {
  const duplicate = buildTrace(); duplicate.records[2].sequence = 2; rehash(duplicate); deny(duplicate, /sequence must be contiguous/);
  const reordered = buildTrace(["PROPOSED", "AUTHORIZED", "SUBMITTED", "RESERVED"]); deny(reordered, /invalid transition/);
});

test("claim-payload signer cannot replace configured trusted principal", () => {
  const trace = buildTrace(); trace.authority.principal = "payload-injected-signer"; deny(trace, /not the configured trusted principal/);
});

test("missing finality or execution evidence cannot fulfill", () => {
  const finality = buildTrace(); finality.evidence.finality = "safe"; deny(finality, /required finality is missing/);
  const execution = buildTrace(); execution.evidence.executionObserved = false; deny(execution, /execution was not authoritatively observed/);
});

test("receipt intent mismatch and cross-tenant evidence fail closed", () => {
  const intent = buildTrace(); intent.evidence.intentDigest = "sha256:other"; deny(intent, /does not bind the authorized intent/);
  const tenant = buildTrace(); tenant.evidence.tenantId = "tenant-b"; deny(tenant, /crosses the tenant boundary/);
});
