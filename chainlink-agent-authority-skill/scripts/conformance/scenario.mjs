import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, digest, sign } from './codec.mjs';
import { makeFixture, sealBundle } from './fixture.mjs';
import { Store, SimulatedProvider } from './store.mjs';

// Separate simulated observer reads committed downstream evidence, never a caller's success flag.
export function observeSettlement(provider, id, f) {
  const result = provider.lookup(id);
  if (!result) return null;
  const intent = JSON.parse(result.intent);
  if (digest('intent/v1', intent) !== id || result.execution_id !== `mock-provider:${intent.id}`) throw Error('CORRUPT_PROVIDER');
  return sign({ kind: 'settlement/v1', intentDigest: id, tenant: intent.tenant, chain: intent.chain,
    idempotencyKey: id, executionId: result.execution_id, status: 'SETTLED', classification: 'simulated', observedAt: f.now },
  f.trust.keys.settlement.id, f.keys.settlement);
}
export function scenario(directory, mode = 'timeout-after-effect') {
  const f = makeFixture();
  const store = new Store(join(directory, 'application.sqlite'));
  const provider = new SimulatedProvider(join(directory, 'provider.sqlite'));
  try {
    const reservation = store.reserve(f.bundle, f.trust, f.now);
    if (!reservation.allowed) throw Error('reservation failed');
    store.dispatch(reservation.id, f.trust, f.now, provider, { mode });
    store.reconcile(reservation.id, f.trust, f.now, observeSettlement(provider, reservation.id, f));
    store.fulfill(reservation.id, f.trust, f.now);
    const row = store.get(reservation.id);
    const bundle = sealBundle(f, row.bundle, row.transitions);
    return { bundle, trust: f.trust, now: f.now, metrics: { status: row.status,
      simulatedFulfillments: store.fulfillmentCount(), ...provider.counts() } };
  } finally { store.close(); provider.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'authority-conformance-'));
  mkdirSync(out, { recursive: true });
  const result = scenario(out, process.argv[3] ?? 'timeout-after-effect');
  // Exclusive creation protects previous outputs. Trust is a DEMO trust root, not certification.
  for (const [name, value] of [['bundle.json', result.bundle], ['trust.json', result.trust]]) {
    writeFileSync(join(out, name), `${canonical(value)}\n`, { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ directory: out, now: result.now, ...result.metrics, liveActions: 0 }));
}
