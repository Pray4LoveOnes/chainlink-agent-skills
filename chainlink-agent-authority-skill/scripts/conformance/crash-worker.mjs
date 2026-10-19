/**
 * Child-process crash harness. Each boundary exits abruptly so recovery tests
 * prove that durable state, not process memory, controls the next decision.
 */
import { readFileSync } from 'node:fs';
import { Store, SimulatedProvider } from './store.mjs';

// Test harness: public input on stdin; process death intentionally skips cleanup.
const { appPath, providerPath, bundle, trust, now, boundary } = JSON.parse(readFileSync(0, 'utf8'));
const store = new Store(appPath);
const provider = new SimulatedProvider(providerPath);
const r = store.reserve(bundle, trust, now);
if (boundary === 'reserved') process.exit(99);
store.dispatch(r.id, trust, now, provider, {
  afterSubmit: () => { if (boundary === 'submitted') process.exit(99); },
  afterEffect: () => { if (boundary === 'effect') process.exit(99); },
});
process.exit(0);
