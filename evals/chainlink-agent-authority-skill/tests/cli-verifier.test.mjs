import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../../../chainlink-agent-authority-skill/scripts/conformance/fixture.mjs';
import { canonical } from '../../../chainlink-agent-authority-skill/scripts/conformance/codec.mjs';

const cli = fileURLToPath(new URL('../../../chainlink-agent-authority-skill/scripts/conformance/verify-bundle.mjs', import.meta.url));
function run(bundle, trust, rawBundle = null) {
  const d = mkdtempSync(join(tmpdir(), 'authority-cli-'));
  writeFileSync(join(d, 'bundle.json'), rawBundle ?? `${canonical(bundle)}\n`);
  writeFileSync(join(d, 'trust.json'), `${canonical(trust)}\n`);
  return spawnSync(process.execPath, [cli, join(d, 'bundle.json'), join(d, 'trust.json'), '1800000000'], { encoding: 'utf8' });
}
test('independent CLI accepts a valid bundle but never grants live fulfillment', () => {
  const f = makeFixture(), result = run(f.bundle, f.trust);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true); assert.equal(parsed.irreversibleFulfillmentAllowed, false);
});
test('independent CLI rejects tampered signatures and noncanonical wire input', () => {
  const f = makeFixture(); f.bundle.intent.amount = '2';
  const tampered = run(f.bundle, f.trust);
  assert.notEqual(tampered.status, 0); assert.equal(JSON.parse(tampered.stdout).valid, false);
  const g = makeFixture(); const noncanonical = canonical(g.bundle).replace('{', '{ ');
  const noncanonicalResult = run(g.bundle, g.trust, noncanonical);
  assert.notEqual(noncanonicalResult.status, 0); assert.equal(JSON.parse(noncanonicalResult.stdout).valid, false);
});
