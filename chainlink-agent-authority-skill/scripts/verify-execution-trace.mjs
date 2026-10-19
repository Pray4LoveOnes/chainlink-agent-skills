#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const RECEIPT_DOMAIN = "chainlink-agent-authority/receipt/v1\0";
export const STATE_DOMAIN = "chainlink-agent-authority/state/v1\0";

const TERMINAL = new Set(["DENIED", "EXPIRED", "REVOKED", "SETTLED", "FAILED"]);
const ALLOWED = new Map([
  ["PROPOSED", new Set(["AUTHORIZED", "DENIED", "EXPIRED", "REVOKED"])],
  ["AUTHORIZED", new Set(["RESERVED", "DENIED", "EXPIRED", "REVOKED"])],
  ["RESERVED", new Set(["SUBMITTED", "DENIED", "EXPIRED", "REVOKED"])],
  ["SUBMITTED", new Set(["CONFIRMED", "UNKNOWN", "FAILED"])],
  ["UNKNOWN", new Set(["CONFIRMED", "FAILED"])],
  ["CONFIRMED", new Set(["SETTLED", "FAILED"])],
]);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(domain, value) {
  return createHash("sha256").update(domain).update(canonical(value)).digest("hex");
}

export function receiptDigest(record) {
  const payload = { ...record };
  delete payload.receiptDigest;
  return digest(RECEIPT_DOMAIN, payload);
}

export function stateDigest(state) {
  return digest(STATE_DOMAIN, state);
}

function requireString(value, path, errors) {
  if (typeof value !== "string" || value.length === 0) errors.push(`${path} must be a non-empty string`);
}

function authorityErrors(trace, errors) {
  const auth = trace.authority;
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) {
    errors.push("authority must be an object");
    return;
  }
  for (const field of ["authorizationId", "principal", "trustedPrincipal", "subject", "audience", "tenantId", "projectId", "network", "chainId", "action", "destination", "scope", "intentId", "intentDigest", "nonce"]) {
    requireString(auth[field], `authority.${field}`, errors);
  }
  if (auth.tenantId !== trace.tenantId) errors.push("authority tenant does not match trace tenant");
  if (auth.principal !== auth.trustedPrincipal) errors.push("authority signer is not the configured trusted principal");
  if (auth.signatureValid !== true) errors.push("authority signature is not valid");
  if (auth.outboundAuthorizationValid !== true) errors.push("outbound authorization is missing or invalid");
  if (auth.policyAuthorized !== true) errors.push("business policy did not authorize the intent");
  if (auth.status !== "active") errors.push(`authority is ${String(auth.status || "missing")}, not active`);
  if (!Number.isSafeInteger(auth.notBefore) || !Number.isSafeInteger(auth.expiresAt) || auth.notBefore >= auth.expiresAt) {
    errors.push("authority time bounds must be ordered integer epoch seconds");
  }
  if (!Number.isSafeInteger(auth.nonceUseCount) || auth.nonceUseCount !== 1) errors.push("authority nonce or signed intent must be consumed exactly once");
}

function evidenceErrors(trace, finalState, errors) {
  const evidence = trace.evidence;
  const consequential = ["CONFIRMED", "SETTLED"].includes(finalState) || trace.fulfillmentCreated === true;
  if (!consequential) return;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push("consequential outcome requires execution evidence");
    return;
  }
  if (evidence.locallyVerified !== true) errors.push("execution evidence was not locally verified");
  if (evidence.executionObserved !== true) errors.push("execution was not authoritatively observed");
  if (evidence.finality !== "finalized") errors.push("required finality is missing");
  if (evidence.intentDigest !== trace.authority?.intentDigest) errors.push("execution evidence does not bind the authorized intent");
  if (evidence.tenantId !== trace.tenantId) errors.push("execution evidence crosses the tenant boundary");
}

export function verifyTrace(trace) {
  const errors = [];
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) return { valid: false, fulfillmentAllowed: false, errors: ["trace must be an object"] };
  if (trace.schema !== "chainlink-agent-authority-trace/1") errors.push("unsupported trace schema");
  requireString(trace.tenantId, "tenantId", errors);
  authorityErrors(trace, errors);
  if (!Array.isArray(trace.records) || trace.records.length === 0) errors.push("records must be a non-empty array");
  if (!Array.isArray(trace.records)) return { valid: false, fulfillmentAllowed: false, errors };

  const auth = trace.authority ?? {};
  let previousDigest = null;
  let previousState = null;
  let previousStateDigest = stateDigest({ tenantId: trace.tenantId, state: "GENESIS", sequence: 0 });
  let unknownPending = false;
  const seenSequences = new Set();
  const seenTransitionIds = new Set();

  for (const [index, record] of trace.records.entries()) {
    const path = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    for (const field of ["tenantId", "projectId", "network", "chainId", "action", "destination", "scope", "intentId", "intentDigest", "nonce", "transitionId", "state"]) {
      requireString(record[field], `${path}.${field}`, errors);
    }
    for (const field of ["tenantId", "projectId", "network", "chainId", "action", "destination", "scope", "intentId", "intentDigest", "nonce"]) {
      if (record[field] !== auth[field]) errors.push(`${path}.${field} does not match bounded authority`);
    }
    if (!Number.isSafeInteger(record.sequence) || record.sequence !== index + 1) errors.push(`${path}.sequence must be contiguous from 1`);
    if (seenSequences.has(record.sequence)) errors.push(`${path}.sequence is duplicated`);
    seenSequences.add(record.sequence);
    if (seenTransitionIds.has(record.transitionId)) errors.push(`${path}.transitionId replays a prior transition`);
    seenTransitionIds.add(record.transitionId);
    if (!Number.isSafeInteger(record.at)) errors.push(`${path}.at must be integer epoch seconds`);
    if (Number.isSafeInteger(record.at) && (record.at < auth.notBefore || record.at >= auth.expiresAt) && ["AUTHORIZED", "RESERVED", "SUBMITTED"].includes(record.state)) {
      errors.push(`${path} performs an authority-dependent transition outside its validity interval`);
    }
    if ((record.previousReceiptDigest ?? null) !== previousDigest) errors.push(`${path}.previousReceiptDigest does not match the prior receipt`);
    if (record.previousStateDigest !== previousStateDigest) errors.push(`${path}.previousStateDigest does not match replayed state`);
    const expectedStateDigest = stateDigest({ tenantId: trace.tenantId, state: record.state, sequence: record.sequence, intentDigest: record.intentDigest });
    if (record.stateDigest !== expectedStateDigest) errors.push(`${path}.stateDigest mismatch`);
    if (record.receiptDigest !== receiptDigest(record)) errors.push(`${path}.receiptDigest mismatch`);

    if (index === 0) {
      if (record.state !== "PROPOSED") errors.push(`${path}.state must start at PROPOSED`);
    } else if (TERMINAL.has(previousState)) {
      errors.push(`${path} follows terminal state ${previousState}`);
    } else if (!ALLOWED.get(previousState)?.has(record.state)) {
      errors.push(`${path} has invalid transition ${previousState} -> ${record.state}`);
    }
    if (unknownPending && record.state === "SUBMITTED") errors.push(`${path} retries while a prior outcome is UNKNOWN`);

    unknownPending = record.state === "UNKNOWN";
    previousState = record.state;
    previousDigest = record.receiptDigest;
    previousStateDigest = record.stateDigest;
  }

  evidenceErrors(trace, previousState, errors);
  const gatesPass = errors.length === 0 && previousState === "SETTLED";
  if (trace.fulfillmentCreated === true && !gatesPass) errors.push("fulfillment was created before every authority, execution, and finality gate passed");
  const fulfillmentAllowed = errors.length === 0 && gatesPass;
  return { valid: errors.length === 0, fulfillmentAllowed, errors, finalState: previousState, finalReceiptDigest: previousDigest, finalStateDigest: previousStateDigest };
}

async function main() {
  const [file] = process.argv.slice(2);
  if (!file) throw new Error("usage: node scripts/verify-execution-trace.mjs <trace.json>");
  const result = verifyTrace(JSON.parse(await readFile(file, "utf8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
