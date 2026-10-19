import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';

function canonicalIntent(i) {
  return JSON.stringify(i, Object.keys(i).sort());
}
function run() {
  let accepted = 0, rejected = 0, duplicateSettlementAttempts = 0;
  const seen = new Set();
  for (let n = workerData.start; n < workerData.end; n++) {
    const intent = { tenant: `tenant-${n % 8}`, chain: 'simulated:1', action: 'settle', destination: `dest-${n % 32}`, amount: String((n % 10) + 1), nonce: `nonce-${n}`, scope: 'one', shard: n % 128 };
    const id = createHash('sha256').update(`intent/v1\n${canonicalIntent(intent)}`).digest('hex');
    const denied = n % 37 === 0; // wrong scope/amount class, intentionally deterministic
    const duplicate = n % 41 === 0;
    if (denied) { rejected++; continue; }
    if (duplicate || seen.has(id)) { duplicateSettlementAttempts++; continue; }
    seen.add(id); accepted++;
  }
  parentPort.postMessage({ accepted, rejected, duplicateSettlementAttempts });
}
run();
