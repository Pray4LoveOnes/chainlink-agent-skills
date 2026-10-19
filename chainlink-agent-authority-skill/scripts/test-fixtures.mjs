import { receiptDigest, stateDigest } from "./verify-execution-trace.mjs";

export function buildTrace(states = ["PROPOSED", "AUTHORIZED", "RESERVED", "SUBMITTED", "CONFIRMED", "SETTLED"]) {
  const authority = {
    authorizationId: "auth-1", principal: "principal-a", trustedPrincipal: "principal-a", subject: "agent-a",
    audience: "settlement-service", tenantId: "tenant-a", projectId: "project-a", network: "test-network",
    chainId: "test-chain-1", action: "transfer", destination: "recipient-a", scope: "asset-a:10",
    intentId: "intent-1", intentDigest: "sha256:intent-1", nonce: "nonce-1", nonceUseCount: 1,
    notBefore: 100, expiresAt: 200, status: "active", signatureValid: true, outboundAuthorizationValid: true, policyAuthorized: true,
  };
  let previousReceiptDigest = null;
  let previousStateDigest = stateDigest({ tenantId: authority.tenantId, state: "GENESIS", sequence: 0 });
  const records = states.map((state, index) => {
    const record = {
      tenantId: authority.tenantId, projectId: authority.projectId, network: authority.network, chainId: authority.chainId,
      action: authority.action, destination: authority.destination, scope: authority.scope, intentId: authority.intentId,
      intentDigest: authority.intentDigest, nonce: authority.nonce, sequence: index + 1,
      transitionId: `transition-${index + 1}`, state, at: 110 + index, previousReceiptDigest, previousStateDigest,
    };
    record.stateDigest = stateDigest({ tenantId: authority.tenantId, state, sequence: record.sequence, intentDigest: record.intentDigest });
    record.receiptDigest = receiptDigest(record);
    previousReceiptDigest = record.receiptDigest;
    previousStateDigest = record.stateDigest;
    return record;
  });
  return {
    schema: "chainlink-agent-authority-trace/1", tenantId: "tenant-a", authority, records,
    evidence: { tenantId: "tenant-a", intentDigest: authority.intentDigest, locallyVerified: true, executionObserved: true, finality: "finalized" },
    fulfillmentCreated: states.at(-1) === "SETTLED",
  };
}

export function rehash(trace) {
  let priorReceipt = null;
  let priorState = stateDigest({ tenantId: trace.tenantId, state: "GENESIS", sequence: 0 });
  trace.records.forEach((record) => {
    record.previousReceiptDigest = priorReceipt;
    record.previousStateDigest = priorState;
    record.stateDigest = stateDigest({ tenantId: trace.tenantId, state: record.state, sequence: record.sequence, intentDigest: record.intentDigest });
    record.receiptDigest = receiptDigest(record);
    priorReceipt = record.receiptDigest;
    priorState = record.stateDigest;
  });
}
