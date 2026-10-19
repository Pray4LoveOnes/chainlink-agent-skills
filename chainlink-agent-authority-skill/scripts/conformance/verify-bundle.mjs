#!/usr/bin/env node
// Independent offline verifier: imports codec primitives, never the producer or gate.
// Trust configuration is an operator input, not an authority asserted by the bundle.
import { readFileSync, statSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { canonical, digest, checkSignature } from './codec.mjs';

const HEX = /^[0-9a-f]{64}$/;
const ZERO = '0'.repeat(64);
const INTENT_FIELDS = 'version id tenant project chain action destination amount asset scope agent audience nonce issuedAt expiresAt';
const POLICY_FIELDS = 'version tenant project chain action destination asset scope agent audience maxAmount allowed';
const SCOPES = 'tenant project chain action destination asset scope agent audience'.split(' ');
const NEXT = {
  NEW: ['RESERVED'],
  RESERVED: ['SUBMITTED', 'DENIED'],
  SUBMITTED: ['UNKNOWN', 'SETTLED'],
  UNKNOWN: ['SETTLED'],
  SETTLED: ['FULFILLED'],
  FULFILLED: [],
  DENIED: [],
};

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function fields(value, expected, label) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  requireThat(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, `${label}: non-JSON object`);
  requireThat(Object.keys(value).sort().join(' ') === expected.split(' ').sort().join(' '), `${label}: unexpected or missing fields`);
}

function word(value, label) {
  requireThat(typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(value), `${label}: invalid string`);
}

function integer(value, label) {
  requireThat(Number.isSafeInteger(value) && value >= 0, `${label}: invalid timestamp or sequence`);
}

function amount(value, label) {
  requireThat(typeof value === 'string' && /^[1-9][0-9]{0,77}$/.test(value), `${label}: expected positive canonical decimal string`);
  return BigInt(value);
}

function hash(value, label) {
  requireThat(typeof value === 'string' && HEX.test(value), `${label}: invalid digest`);
}

function envelope(value, role, label) {
  fields(value, 'body keyId signature', label);
  fields(role, 'id publicKey', `${label} trust`);
  word(role.id, `${label} trust id`);
  requireThat(typeof role.publicKey === 'string' && role.publicKey.length <= 8192, `${label}: invalid public key`);
  requireThat(value.keyId === role.id, `${label}: untrusted signer identity`);
  // Ed25519 signatures are 64 bytes with canonical padded base64 representation.
  requireThat(typeof value.signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(value.signature), `${label}: malformed signature`);
  requireThat(Buffer.from(value.signature, 'base64').toString('base64') === value.signature, `${label}: noncanonical signature`);
  requireThat(checkSignature(value, role) === true, `${label}: signature verification failed`);
}

/**
 * Verify recorded simulation evidence under externally supplied CURRENT trust.
 * This result never authorizes live fulfillment, proves blockchain finality, or
 * proves that a signer told the truth. Persisted replay protection is the gate's
 * responsibility; an offline verifier is intentionally read-only and replayable.
 */
export function verifyBundle(bundle, trust, now) {
  try {
    integer(now, 'verification time');
    // Canonicalization rejects unsupported JavaScript values before hashing.
    canonical(bundle);
    canonical(trust);
    fields(bundle, 'format intent authorization observation settlement receipt', 'bundle');
    fields(trust, 'format policy keys revokedNonces', 'trust');
    requireThat(bundle.format === 'agent-authority-bundle/v1', 'unsupported bundle format');
    requireThat(trust.format === 'agent-authority-trust/v1', 'unsupported trust format');
    fields(trust.keys, 'authority observer settlement receipt', 'trust keys');
    for (const [name, role] of Object.entries(trust.keys)) {
      fields(role, 'id publicKey', `${name} trust`);
      word(role.id, `${name} trust id`);
      requireThat(typeof role.publicKey === 'string' && role.publicKey.length <= 8192 && createPublicKey(role.publicKey).asymmetricKeyType === 'ed25519', `${name}: invalid trusted public key`);
    }
    fields(trust.policy, POLICY_FIELDS, 'policy');
    requireThat(trust.policy.version === '1' && trust.policy.allowed === true, 'policy does not authorize execution');
    for (const key of SCOPES) word(trust.policy[key], `policy ${key}`);
    const maxAmount = amount(trust.policy.maxAmount, 'policy maximum');
    requireThat(Array.isArray(trust.revokedNonces) && trust.revokedNonces.length <= 100000, 'invalid revocation list');
    for (const nonce of trust.revokedNonces) word(nonce, 'revoked nonce');
    requireThat(new Set(trust.revokedNonces).size === trust.revokedNonces.length, 'duplicate revocation entries');

    const intent = bundle.intent;
    fields(intent, INTENT_FIELDS, 'intent');
    requireThat(intent.version === 1, 'unsupported intent version');
    for (const key of [...SCOPES, 'id', 'nonce']) word(intent[key], `intent ${key}`);
    for (const key of SCOPES) requireThat(intent[key] === trust.policy[key], `policy ${key} mismatch`);
    requireThat(amount(intent.amount, 'intent amount') <= maxAmount, 'policy amount exceeded');
    integer(intent.issuedAt, 'intent issuedAt');
    integer(intent.expiresAt, 'intent expiresAt');
    requireThat(intent.issuedAt <= now && now < intent.expiresAt, 'authority not yet valid or expired');
    requireThat(!trust.revokedNonces.includes(intent.nonce), 'authority revoked');
    const intentDigest = digest('intent/v1', intent);
    const policyDigest = digest('policy/v1', trust.policy);

    envelope(bundle.authorization, trust.keys.authority, 'authorization');
    const authorization = bundle.authorization.body;
    fields(authorization, 'kind intentDigest policyDigest nonce issuedAt expiresAt', 'authorization body');
    requireThat(authorization.kind === 'authority/v1', 'wrong authorization domain');
    requireThat(authorization.intentDigest === intentDigest && authorization.policyDigest === policyDigest, 'authorization digest binding mismatch');
    requireThat(authorization.nonce === intent.nonce, 'authorization nonce mismatch');
    requireThat(authorization.issuedAt === intent.issuedAt && authorization.expiresAt === intent.expiresAt, 'authorization time binding mismatch');

    envelope(bundle.observation, trust.keys.observer, 'observation');
    const observation = bundle.observation.body;
    fields(observation, 'kind intentDigest tenant chain action destination amount asset executionId finality classification observedAt', 'observation body');
    requireThat(observation.kind === 'observation/v1', 'wrong observation domain');
    requireThat(observation.intentDigest === intentDigest, 'observation intent mismatch');
    for (const key of ['tenant', 'chain', 'action', 'destination', 'amount', 'asset']) {
      requireThat(observation[key] === intent[key], `observation ${key} mismatch`);
    }
    requireThat(observation.classification === 'simulated', 'unsupported live evidence: requires independent chain verifier');
    requireThat(observation.finality === 'finalized', 'missing simulated finality');
    word(observation.executionId, 'observed execution identity');
    integer(observation.observedAt, 'observation timestamp');
    requireThat(intent.issuedAt <= observation.observedAt && observation.observedAt <= now, 'observation outside verification interval');

    envelope(bundle.receipt, trust.keys.receipt, 'receipt');
    const receipt = bundle.receipt.body;
    fields(receipt, 'kind intentDigest authorityDigest observationDigest settlementDigest policyDigest tenant chain outcome transitions finalStateDigest', 'receipt body');
    requireThat(receipt.kind === 'receipt/v1', 'wrong receipt domain');
    requireThat(receipt.intentDigest === intentDigest && receipt.policyDigest === policyDigest, 'receipt intent or policy digest mismatch');
    requireThat(receipt.authorityDigest === digest('authority-envelope/v1', bundle.authorization), 'receipt authority digest mismatch');
    requireThat(receipt.observationDigest === digest('observation-envelope/v1', bundle.observation), 'receipt observation digest mismatch');
    requireThat(receipt.tenant === intent.tenant && receipt.chain === intent.chain, 'receipt scope mismatch');
    requireThat(Array.isArray(receipt.transitions) && receipt.transitions.length > 0 && receipt.transitions.length <= 6, 'invalid transition count');

    let settlement = null;
    if (bundle.settlement !== null) {
      envelope(bundle.settlement, trust.keys.settlement, 'settlement');
      settlement = bundle.settlement.body;
      fields(settlement, 'kind intentDigest tenant chain idempotencyKey executionId status classification observedAt', 'settlement body');
      requireThat(settlement.kind === 'settlement/v1', 'wrong settlement domain');
      requireThat(settlement.intentDigest === intentDigest && settlement.idempotencyKey === intentDigest, 'settlement intent or idempotency binding mismatch');
      requireThat(settlement.tenant === intent.tenant && settlement.chain === intent.chain, 'settlement scope mismatch');
      requireThat(settlement.executionId === `mock-provider:${intent.id}`, 'settlement execution identity mismatch');
      requireThat(settlement.status === 'SETTLED' && settlement.classification === 'simulated', 'unconfirmed or unsupported settlement evidence');
      integer(settlement.observedAt, 'settlement observation timestamp');
      requireThat(observation.observedAt <= settlement.observedAt && settlement.observedAt <= now, 'settlement observation chronology mismatch');
      requireThat(receipt.settlementDigest === digest('settlement-envelope/v1', bundle.settlement), 'receipt settlement digest mismatch');
    } else {
      requireThat(receipt.settlementDigest === null, 'receipt asserts missing settlement evidence');
    }

    let status = 'NEW';
    let previousDigest = ZERO;
    let previousAt = intent.issuedAt;
    let submittedAt = null;
    let finalStateDigest;
    for (const [index, transition] of receipt.transitions.entries()) {
      fields(transition, 'seq previousDigest from to at state stateDigest', 'transition');
      requireThat(transition.seq === index + 1, 'transition sequence mismatch');
      hash(transition.previousDigest, 'previous transition digest');
      requireThat(transition.previousDigest === previousDigest, 'transition hash chain mismatch');
      requireThat(transition.from === status && NEXT[status]?.includes(transition.to), 'illegal state transition');
      integer(transition.at, 'transition timestamp');
      requireThat(previousAt <= transition.at && transition.at <= now, 'transition chronology mismatch');
      if (transition.to === 'SUBMITTED') {
        submittedAt = transition.at;
        requireThat(observation.observedAt <= submittedAt, 'submission precedes triggering evidence');
      }
      fields(transition.state, 'intentDigest status executionId fulfilled', 'transition state');
      const state = transition.state;
      requireThat(state.intentDigest === intentDigest && state.status === transition.to, 'state binding mismatch');
      requireThat(typeof state.fulfilled === 'boolean' && state.fulfilled === (transition.to === 'FULFILLED'), 'forbidden fulfillment state');
      if (['SETTLED', 'FULFILLED'].includes(transition.to)) {
        requireThat(settlement !== null && state.executionId === settlement.executionId, 'settlement lacks bound observed execution');
        requireThat(submittedAt !== null && submittedAt <= settlement.observedAt, 'settlement observation precedes submission');
        requireThat(settlement.observedAt <= transition.at, 'settlement precedes observed execution');
      } else {
        requireThat(state.executionId === null, 'unconfirmed execution identity asserted');
      }
      hash(transition.stateDigest, 'state digest');
      requireThat(transition.stateDigest === digest('state/v1', state), 'state digest mismatch');
      status = transition.to;
      previousAt = transition.at;
      previousDigest = digest('transition/v1', transition);
      finalStateDigest = transition.stateDigest;
    }
    requireThat(receipt.outcome === status, 'receipt outcome mismatch');
    requireThat((settlement !== null) === ['SETTLED', 'FULFILLED'].includes(status), 'settlement evidence does not match terminal outcome');
    hash(receipt.finalStateDigest, 'final state digest');
    requireThat(receipt.finalStateDigest === finalStateDigest, 'final state root mismatch');
    return {
      valid: true,
      errors: [],
      outcome: status,
      simulationFulfilled: status === 'FULFILLED',
      irreversibleFulfillmentAllowed: false,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'verification failed'],
      outcome: null,
      simulationFulfilled: false,
      irreversibleFulfillmentAllowed: false,
    };
  }
}

function readCanonicalFile(path) {
  const stat = statSync(path);
  requireThat(stat.isFile() && stat.size <= 1024 * 1024, 'input must be a regular file of at most 1 MiB');
  const raw = readFileSync(path, 'utf8');
  requireThat(Buffer.byteLength(raw, 'utf8') <= 1024 * 1024, 'input exceeds 1 MiB limit');
  const parsed = JSON.parse(raw);
  // Reject duplicate object keys, whitespace variations, alternate number/string
  // encodings and other ambiguous wire encodings before checking any signature.
  requireThat(raw.trim() === canonical(parsed), 'input must use canonical JSON encoding');
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireThat(process.argv.length === 5 && /^(0|[1-9][0-9]*)$/.test(process.argv[4]), 'Usage: node verify-bundle.mjs BUNDLE.json TRUST.json NOW_UNIX_SECONDS');
    const result = verifyBundle(readCanonicalFile(process.argv[2]), readCanonicalFile(process.argv[3]), Number(process.argv[4]));
    process.stdout.write(`${canonical(result)}\n`);
    process.exitCode = result.valid ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${canonical({ valid: false, errors: [error.message], outcome: null, simulationFulfilled: false, irreversibleFulfillmentAllowed: false })}\n`);
    process.exitCode = 1;
  }
}
