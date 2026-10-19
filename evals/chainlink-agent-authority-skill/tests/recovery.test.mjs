/** Durable recovery tests use real SQLite state and child-process termination. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture, buildBundle, sealBundle } from '../../../chainlink-agent-authority-skill/scripts/conformance/fixture.mjs';
import { digest, sign } from '../../../chainlink-agent-authority-skill/scripts/conformance/codec.mjs';
import { Store, SimulatedProvider } from '../../../chainlink-agent-authority-skill/scripts/conformance/store.mjs';
import { observeSettlement, scenario } from '../../../chainlink-agent-authority-skill/scripts/conformance/scenario.mjs';
import { verifyBundle } from '../../../chainlink-agent-authority-skill/scripts/conformance/verify-bundle.mjs';

/** setup creates isolated application/provider databases for one test. */
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'authority-test-'));
  const f = makeFixture(), s = new Store(join(dir, 'app.sqlite')), p = new SimulatedProvider(join(dir, 'provider.sqlite'));
  t.after(() => { s.close(); p.close(); });
  return { f, s, p, dir };
}
for (const [label, mutate] of [
  ['untrusted signer injection', f => { f.bundle.authorization.keyId = 'claim-signer'; }],
  ['wrong configured public key', f => { f.trust.keys.authority.publicKey = f.trust.keys.observer.publicKey; }],
  ['revoked authority', f => { f.trust.revokedNonces.push(f.bundle.intent.nonce); }],
  ['expired authority', f => { f.now = f.bundle.intent.expiresAt; }],
  ['missing outbound authorization', f => { f.bundle.authorization = null; }],
  ['missing finality', f => { f.bundle.observation.body.finality = 'safe'; f.bundle.observation = sign(f.bundle.observation.body, f.trust.keys.observer.id, f.keys.observer); }],
  ['missing inbound execution identity', f => { f.bundle.observation.body.executionId = ''; f.bundle.observation = sign(f.bundle.observation.body, f.trust.keys.observer.id, f.keys.observer); }],
  ['policy denies action', f => { f.trust.policy.allowed = false; }],
]) test(`${label} cannot reserve or fulfill`, t => {
  const { f, s, p } = setup(t); mutate(f);
  assert.equal(s.reserve(f.bundle, f.trust, f.now).allowed, false);
  assert.equal(s.fulfillmentCount(), 0); assert.equal(p.counts().effects, 0);
});
for (const field of ['tenant', 'project', 'chain', 'action', 'destination', 'scope', 'agent', 'audience', 'asset']) {
  test(`cryptographically valid wrong ${field} denied`, t => {
    const { f, s, p } = setup(t);
    f.bundle = buildBundle(f, { ...f.bundle.intent, [field]: 'wrong' });
    assert.equal(s.reserve(f.bundle, f.trust, f.now).allowed, false);
    assert.equal(s.fulfillmentCount(), 0); assert.equal(p.counts().effects, 0);
  });
}
test('reused nonce / business intent cannot create another reservation', t => {
  const { f, s } = setup(t); assert.ok(s.reserve(f.bundle, f.trust, f.now).allowed);
  const replay = buildBundle(f, { ...f.bundle.intent, id: 'different', amount: '2' });
  assert.equal(s.reserve(replay, f.trust, f.now).reason, 'REPLAY');
  assert.equal(s.reserve(f.bundle, f.trust, f.now).reason, 'DUPLICATE');
  assert.equal(s.fulfillmentCount(), 0);
});
for (const boundary of ['before-dispatch', 'after-submit', 'before-fulfillment']) test(`revocation race ${boundary}`, t => {
  const { f, s, p } = setup(t); const { id } = s.reserve(f.bundle, f.trust, f.now);
  if (boundary === 'before-dispatch') s.revoke(f.bundle.intent.tenant, f.bundle.intent.nonce);
  s.dispatch(id, f.trust, f.now, p, { afterSubmit: () => {
    if (boundary === 'after-submit') s.revoke(f.bundle.intent.tenant, f.bundle.intent.nonce);
  } });
  s.reconcile(id, f.trust, f.now, observeSettlement(p, id, f));
  s.revoke(f.bundle.intent.tenant, f.bundle.intent.nonce);
  assert.equal(s.fulfill(id, f.trust, f.now), false);
  assert.equal(s.fulfillmentCount(), 0);
  assert.equal(p.counts().effects, boundary === 'before-fulfillment' ? 1 : 0);
});
test('policy changes between reservation and dispatch deny execution', t => {
  const { f, s, p } = setup(t); const { id } = s.reserve(f.bundle, f.trust, f.now);
  f.trust.policy.version = '2';
  assert.equal(s.dispatch(id, f.trust, f.now, p).sent, false);
  assert.equal(p.counts().effects, 0); assert.equal(s.fulfillmentCount(), 0);
});
test('out-of-order and duplicate delivery cannot fulfill early or twice', t => {
  const { f, s, p } = setup(t); const { id } = s.reserve(f.bundle, f.trust, f.now);
  assert.equal(s.fulfill(id, f.trust, f.now), false);
  assert.equal(s.reconcile(id, f.trust, f.now, f.bundle.settlement), false);
  s.dispatch(id, f.trust, f.now, p);
  const evidence = observeSettlement(p, id, f);
  assert.ok(s.reconcile(id, f.trust, f.now, evidence));
  assert.equal(s.reconcile(id, f.trust, f.now, evidence), false);
  assert.ok(s.fulfill(id, f.trust, f.now));
  assert.equal(s.fulfill(id, f.trust, f.now), false);
  assert.equal(s.reserve(f.bundle, f.trust, f.now).reason, 'DUPLICATE');
  assert.equal(s.dispatch(id, f.trust, f.now, p).sent, false);
  assert.deepEqual(p.counts(), { attempts: 1, effects: 1, duplicateAttempts: 0 });
  assert.equal(s.fulfillmentCount(), 1);
});
test('unknown result never resubmitted or fulfilled', t => {
  const { f, s, p } = setup(t); const { id } = s.reserve(f.bundle, f.trust, f.now);
  s.dispatch(id, f.trust, f.now, p, { mode: 'unknown' });
  for (let n = 0; n < 3; n++) {
    assert.equal(s.reconcile(id, f.trust, f.now, null), false);
    assert.equal(s.dispatch(id, f.trust, f.now, p).sent, false);
    assert.equal(s.fulfill(id, f.trust, f.now), false);
  }
  assert.equal(s.get(id).status, 'UNKNOWN'); assert.equal(s.fulfillmentCount(), 0);
});
test('forged or cross-tenant settlement evidence cannot reconcile', t => {
  const { f, s, p } = setup(t); const { id } = s.reserve(f.bundle, f.trust, f.now);
  s.dispatch(id, f.trust, f.now, p);
  const evidence = observeSettlement(p, id, f);
  evidence.body.tenant = 'other-tenant';
  const signed = sign(evidence.body, f.trust.keys.settlement.id, f.keys.settlement);
  assert.equal(s.reconcile(id, f.trust, f.now, signed), false);
  assert.equal(s.fulfill(id, f.trust, f.now), false); assert.equal(s.fulfillmentCount(), 0);
});
for (const boundary of ['reserved', 'submitted', 'effect']) test(`actual process crash after ${boundary}, reopen and reconcile`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'authority-crash-')), f = makeFixture();
  const appPath = join(dir, 'app.sqlite'), providerPath = join(dir, 'provider.sqlite');
  const script = fileURLToPath(new URL('../../../chainlink-agent-authority-skill/scripts/conformance/crash-worker.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script], { input: JSON.stringify({ appPath, providerPath, bundle: f.bundle, trust: f.trust, now: f.now, boundary }), encoding: 'utf8' });
  assert.equal(child.status, 99, child.stderr);
  const s = new Store(appPath), p = new SimulatedProvider(providerPath), id = digest('intent/v1', f.bundle.intent);
  try {
    if (boundary === 'reserved') s.dispatch(id, f.trust, f.now, p);
    s.reconcile(id, f.trust, f.now, observeSettlement(p, id, f));
    const completed = s.fulfill(id, f.trust, f.now);
    assert.equal(completed, boundary !== 'submitted');
    assert.equal(s.fulfillmentCount(), boundary === 'submitted' ? 0 : 1);
    assert.equal(s.dispatch(id, f.trust, f.now, p).sent, false);
    assert.equal(p.counts().duplicateAttempts, 0);
    assert.equal(p.counts().effects, boundary === 'submitted' ? 0 : 1);
    const row = s.get(id), bundle = sealBundle(f, row.bundle, row.transitions);
    assert.equal(verifyBundle(bundle, f.trust, f.now).valid, true);
  } finally { s.close(); p.close(); }
});
test('offline e2e timeout reconciles to independently verifiable portable receipt', () => {
  const result = scenario(mkdtempSync(join(tmpdir(), 'authority-e2e-')));
  assert.deepEqual(result.metrics, { status: 'FULFILLED', simulatedFulfillments: 1, effects: 1, attempts: 1, duplicateAttempts: 0 });
  assert.equal(verifyBundle(result.bundle, result.trust, result.now).valid, true);
});
