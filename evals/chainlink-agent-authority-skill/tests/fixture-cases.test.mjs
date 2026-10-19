/** Fixture catalog tests cover the original structural trace verifier contract. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTrace, rehash } from "../../../chainlink-agent-authority-skill/scripts/test-fixtures.mjs";
import { verifyTrace } from "../../../chainlink-agent-authority-skill/scripts/verify-execution-trace.mjs";

const fixtureUrl = new URL("../fixtures/authority-cases.json", import.meta.url);
const fixtures = JSON.parse(await readFile(fixtureUrl, "utf8"));

/** mutate applies one named negative fixture without changing production code. */
function mutate(name) {
  let trace = buildTrace();
  switch (name) {
    case "skip-authorization": trace = buildTrace(["PROPOSED", "SUBMITTED"]); break;
    case "expire-before-submit": trace.authority.expiresAt = 112; rehash(trace); break;
    case "revoke": trace.authority.status = "revoked"; break;
    case "reuse-nonce": trace.authority.nonceUseCount = 2; break;
    case "remove-outbound-authorization": trace.authority.outboundAuthorizationValid = false; break;
    case "deny-policy": trace.authority.policyAuthorized = false; break;
    case "unknown-with-fulfillment": trace = buildTrace(["PROPOSED", "AUTHORIZED", "RESERVED", "SUBMITTED", "UNKNOWN"]); trace.fulfillmentCreated = true; break;
    case "wrong-tenant": trace.records[3].tenantId = "tenant-b"; rehash(trace); break;
    case "wrong-chain": trace.records[3].chainId = "chain-b"; rehash(trace); break;
    case "wrong-action": trace.records[3].action = "withdraw"; rehash(trace); break;
    case "wrong-destination": trace.records[3].destination = "recipient-b"; rehash(trace); break;
    case "wrong-scope": trace.records[3].scope = "asset-a:unlimited"; rehash(trace); break;
    case "tamper-receipt": trace.records[3].at = 150; break;
    case "tamper-state": trace.records[4].stateDigest = "tampered"; break;
    case "duplicate-sequence": trace.records[2].sequence = 2; rehash(trace); break;
    case "out-of-order": trace = buildTrace(["PROPOSED", "AUTHORIZED", "SUBMITTED", "RESERVED"]); break;
    case "inject-signer": trace.authority.principal = "payload-signer"; break;
    case "remove-finality": trace.evidence.finality = "safe"; break;
    case "remove-execution": trace.evidence.executionObserved = false; break;
    default: throw new Error(`unknown fixture mutation ${name}`);
  }
  return trace;
}

test("fixture catalog is versioned and covers every required fail-closed class", () => {
  assert.equal(fixtures.schema, "chainlink-agent-authority-fixtures/1");
  assert.equal(fixtures.cases.length, 19);
});

for (const fixture of fixtures.cases) {
  test(`${fixture.id} fails closed and cannot create fulfillment`, () => {
    const result = verifyTrace(mutate(fixture.mutation));
    assert.equal(result.valid, false);
    assert.equal(result.fulfillmentAllowed, fixture.fulfillment);
    assert.match(result.errors.join("\n"), new RegExp(fixture.expected));
  });
}
