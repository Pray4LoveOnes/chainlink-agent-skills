#!/usr/bin/env node
import { availableParallelism, cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : Number(process.argv[i + 1]); };
const intents = arg('--intents', 10000), workers = Math.max(1, Math.min(arg('--workers', Math.min(4, availableParallelism?.() || cpus().length)), intents));
if (!Number.isSafeInteger(intents) || intents < 1 || !Number.isSafeInteger(workers) || workers < 1) throw Error('positive integer --intents/--workers required');
const started = performance.now(), startRSS = process.memoryUsage().rss, promises = [];
for (let w = 0; w < workers; w++) {
  const start = Math.floor((w * intents) / workers), end = Math.floor(((w + 1) * intents) / workers);
  promises.push(new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./benchmark-worker.mjs', import.meta.url), { workerData: { start, end } });
    worker.once('message', resolve); worker.once('error', reject);
  }));
}
const parts = await Promise.all(promises), elapsedMs = performance.now() - started;
const totals = parts.reduce((a, p) => ({ accepted: a.accepted + p.accepted, rejected: a.rejected + p.rejected, duplicateSettlementAttempts: a.duplicateSettlementAttempts + p.duplicateSettlementAttempts }), { accepted: 0, rejected: 0, duplicateSettlementAttempts: 0 });
const endRSS = process.memoryUsage().rss;
const result = { benchmark: 'synthetic-agent-intents/v1', intents, workers, concurrency: workers, elapsedMs: Number(elapsedMs.toFixed(3)), throughputPerSecond: Number((intents / (elapsedMs / 1000)).toFixed(3)), accepted: totals.accepted, rejected: totals.rejected, duplicateSettlementAttempts: totals.duplicateSettlementAttempts, memoryBytesStart: startRSS, memoryBytesEnd: endRSS, memoryBytesDelta: endRSS - startRSS, hostParallelism: availableParallelism?.() ?? cpus().length, hostTotalMemoryBytes: totalmem(), syntheticOnly: true };
process.stdout.write(`${JSON.stringify(result)}\n`);
