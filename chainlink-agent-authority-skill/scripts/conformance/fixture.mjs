/**
 * Builds synthetic signed artifacts for offline tests. The generated private
 * keys are ephemeral process memory and are never serialized to a fixture file.
 */
import { generateKeyPairSync } from 'node:crypto';
import { digest, sign } from './codec.mjs';

// Synthetic identities only. Private keys remain in process memory, never exported.
/** makeFixture returns a complete, valid synthetic trust/bundle pair. */
export function makeFixture() {
  const keys = {};
  const roles = {};
  for (const role of ['authority', 'observer', 'settlement', 'receipt']) {
    const pair = generateKeyPairSync('ed25519');
    keys[role] = pair.privateKey;
    roles[role] = { id: `demo-${role}`, publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
  }
  const now = 1800000000;
  const policy = { version: '1', tenant: 'synthetic-tenant', project: 'sandbox', chain: 'simulated:1',
    action: 'release-inventory', destination: 'warehouse-demo', asset: 'demo-unit', scope: 'fulfill:one',
    agent: 'synthetic-agent', audience: 'offline-conformance', maxAmount: '100', allowed: true };
  const intent = { version: 1, id: 'intent-1', tenant: policy.tenant, project: policy.project, chain: policy.chain,
    action: policy.action, destination: policy.destination, amount: '1', asset: policy.asset, scope: policy.scope,
    agent: policy.agent, audience: policy.audience, nonce: 'nonce-1', issuedAt: now - 10, expiresAt: now + 3600 };
  const trust = { format: 'agent-authority-trust/v1', policy, keys: roles, revokedNonces: [] };
  const f = { keys, trust, now };
  f.bundle = buildBundle(f, intent);
  return f;
}
/** buildBundle signs inbound observation evidence and an application receipt. */
export function buildBundle(f, intent, transitions = null) {
  const intentDigest = digest('intent/v1', intent);
  const policyDigest = digest('policy/v1', f.trust.policy);
  const authorization = sign({ kind: 'authority/v1', intentDigest, policyDigest, nonce: intent.nonce,
    issuedAt: intent.issuedAt, expiresAt: intent.expiresAt }, f.trust.keys.authority.id, f.keys.authority);
  const observation = sign({ kind: 'observation/v1', intentDigest, tenant: intent.tenant, chain: intent.chain,
    action: intent.action, destination: intent.destination, amount: intent.amount, asset: intent.asset,
    executionId: `simulated-event:${intent.id}`, finality: 'finalized', classification: 'simulated', observedAt: f.now },
  f.trust.keys.observer.id, f.keys.observer);
  const bundle = { format: 'agent-authority-bundle/v1', intent, authorization, observation, settlement: null, receipt: null };
  if (!transitions) {
    transitions = [];
    for (const status of ['RESERVED', 'SUBMITTED', 'UNKNOWN', 'SETTLED', 'FULFILLED']) {
      transitions.push(transition(intentDigest, transitions, status, f.now, ['SETTLED', 'FULFILLED'].includes(status) ? `mock-provider:${intent.id}` : null));
    }
  }
  if (['SETTLED', 'FULFILLED'].includes(transitions.at(-1).to)) bundle.settlement = settlementEvidence(f, intent);
  return sealBundle(f, bundle, transitions);
}
/** settlementEvidence represents a simulated provider lookup, not chain truth. */
export function settlementEvidence(f, intent) {
  return sign({ kind: 'settlement/v1', intentDigest: digest('intent/v1', intent), tenant: intent.tenant,
    chain: intent.chain, idempotencyKey: digest('intent/v1', intent), executionId: `mock-provider:${intent.id}`,
    status: 'SETTLED', classification: 'simulated', observedAt: f.now }, f.trust.keys.settlement.id, f.keys.settlement);
}
/** transition appends one deterministic state-machine transition. */
export function transition(intentDigest, prior, to, at, executionId = null) {
  const previous = prior.at(-1);
  const state = { intentDigest, status: to, executionId, fulfilled: to === 'FULFILLED' };
  return { seq: prior.length + 1, previousDigest: previous ? digest('transition/v1', previous) : '0'.repeat(64),
    from: previous?.to ?? 'NEW', to, at, state, stateDigest: digest('state/v1', state) };
}
/** sealBundle signs the portable receipt after the transition chain is complete. */
export function sealBundle(f, bundle, transitions) {
  const last = transitions.at(-1);
  bundle.receipt = sign({ kind: 'receipt/v1', intentDigest: digest('intent/v1', bundle.intent),
    authorityDigest: digest('authority-envelope/v1', bundle.authorization),
    observationDigest: digest('observation-envelope/v1', bundle.observation),
    settlementDigest: bundle.settlement ? digest('settlement-envelope/v1', bundle.settlement) : null,
    policyDigest: digest('policy/v1', f.trust.policy), tenant: bundle.intent.tenant, chain: bundle.intent.chain,
    outcome: last.to, transitions, finalStateDigest: last.stateDigest }, f.trust.keys.receipt.id, f.keys.receipt);
  return bundle;
}
