import { DatabaseSync } from 'node:sqlite';
import { canonical, checkSignature, digest } from './codec.mjs';
import { authorize } from './gate.mjs';
import { transition } from './fixture.mjs';

// Local simulation only: there is intentionally no network adapter or asset API.
export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=10000;
      CREATE TABLE IF NOT EXISTS intents (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, nonce TEXT NOT NULL,
        business_id TEXT NOT NULL, bundle TEXT NOT NULL, transitions TEXT NOT NULL, status TEXT NOT NULL,
        UNIQUE(tenant,nonce), UNIQUE(tenant,business_id));
      CREATE TABLE IF NOT EXISTS revoked (tenant TEXT, nonce TEXT, PRIMARY KEY(tenant,nonce));
      CREATE TABLE IF NOT EXISTS fulfillments (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY, decision TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  audit(decision) { this.db.prepare('INSERT INTO audit(decision) VALUES (?)').run(decision); }
  get(id) {
    const row = this.db.prepare('SELECT * FROM intents WHERE id=?').get(id);
    return row && { ...row, bundle: JSON.parse(row.bundle), transitions: JSON.parse(row.transitions) };
  }
  revoke(tenant, nonce) { this.db.prepare('INSERT OR IGNORE INTO revoked VALUES (?,?)').run(tenant, nonce); }
  currentTrust(trust, intent) {
    const revoked = this.db.prepare('SELECT nonce FROM revoked WHERE tenant=?').all(intent.tenant).map(r => r.nonce);
    return { ...trust, revokedNonces: [...trust.revokedNonces, ...revoked] };
  }
  reserve(bundle, trust, now) {
    return this.transaction(() => {
      const gate = authorize(bundle, this.currentTrust(trust, bundle.intent), now);
      if (!gate.allowed) { this.audit(gate.reason); return gate; }
      const id = gate.intentDigest;
      const existing = this.get(id);
      if (existing) { this.audit('DUPLICATE'); return { allowed: false, reason: 'DUPLICATE', id }; }
      const i = bundle.intent;
      if (this.db.prepare('SELECT id FROM intents WHERE tenant=? AND (nonce=? OR business_id=?)').get(i.tenant, i.nonce, i.id)) {
        this.audit('REPLAY'); return { allowed: false, reason: 'REPLAY' };
      }
      const transitions = [transition(id, [], 'RESERVED', now)];
      // Ignore any caller-provided receipt/settlement. These are constructed from durable execution.
      const clean = { ...bundle, settlement: null, receipt: null };
      this.db.prepare('INSERT INTO intents VALUES (?,?,?,?,?,?,?)').run(id, i.tenant, i.nonce, i.id, canonical(clean), canonical(transitions), 'RESERVED');
      return { allowed: true, id };
    });
  }
  move(row, to, now, executionId = null) {
    const last = row.transitions.at(-1);
    if (now < last.at) throw Error('CLOCK_REGRESSION');
    row.transitions.push(transition(row.id, row.transitions, to, now, executionId));
    row.status = to;
    this.db.prepare('UPDATE intents SET status=?, transitions=?, bundle=? WHERE id=?').run(to, canonical(row.transitions), canonical(row.bundle), row.id);
  }
  dispatch(id, trust, now, provider, { afterSubmit, afterEffect, mode = 'success' } = {}) {
    if (!this.prepareDispatch(id, trust, now)) return { sent: false, reason: 'RECONCILE_OR_TERMINAL' };
    // Durable SUBMITTED survives death before call or acknowledgment: recovery must reconcile.
    afterSubmit?.();
    return this.transaction(() => {
      const row = this.get(id);
      if (!row || row.status !== 'SUBMITTED') return { sent: false, reason: 'RECONCILE_OR_TERMINAL' };
      const gate = authorize(row.bundle, this.currentTrust(trust, row.bundle.intent), now);
      if (!gate.allowed) { this.move(row, 'UNKNOWN', now); return { sent: false, reason: gate.reason }; }
      // Write lock serializes local revoke/dispatch. Remote deployments require their own
      // fencing/capability protocol; this example does not assert distributed atomicity.
      const result = provider.execute(id, row.bundle.intent, mode);
      afterEffect?.();
      this.move(row, 'UNKNOWN', now);
      return { sent: true, result };
    });
  }
  prepareDispatch(id, trust, now) {
    return this.transaction(() => {
      const row = this.get(id);
      if (!row || row.status !== 'RESERVED') return false;
      const gate = authorize(row.bundle, this.currentTrust(trust, row.bundle.intent), now);
      if (!gate.allowed) { this.move(row, 'DENIED', now); return false; }
      this.move(row, 'SUBMITTED', now); return true;
    });
  }
  reconcile(id, trust, now, evidence) {
    return this.transaction(() => {
      const row = this.get(id);
      if (!row || !['SUBMITTED', 'UNKNOWN'].includes(row.status)) return false;
      if (row.status === 'SUBMITTED') this.move(row, 'UNKNOWN', now);
      if (!evidence) return false;
      const b = evidence.body, i = row.bundle.intent;
      if (!checkSignature(evidence, trust.keys.settlement) || b.kind !== 'settlement/v1' || b.intentDigest !== id ||
          b.idempotencyKey !== id || b.tenant !== i.tenant || b.chain !== i.chain || b.status !== 'SETTLED' ||
          b.classification !== 'simulated' || b.executionId !== `mock-provider:${i.id}` ||
          !Number.isSafeInteger(b.observedAt) || b.observedAt > now || b.observedAt < row.transitions[0].at) return false;
      row.bundle.settlement = evidence;
      this.move(row, 'SETTLED', now, b.executionId);
      return true;
    });
  }
  fulfill(id, trust, now) {
    return this.transaction(() => {
      const row = this.get(id);
      if (!row || row.status !== 'SETTLED') return false;
      const gate = authorize(row.bundle, this.currentTrust(trust, row.bundle.intent), now);
      if (!gate.allowed) { this.audit(`FULFILL_DENIED:${gate.reason}`); return false; }
      // Only a synthetic local inventory marker. Atomic with terminal state, never a shipment.
      this.db.prepare('INSERT INTO fulfillments VALUES (?)').run(id);
      this.move(row, 'FULFILLED', now, row.bundle.settlement.body.executionId);
      return true;
    });
  }
  fulfillmentCount() { return this.db.prepare('SELECT count(*) AS n FROM fulfillments').get().n; }
}

export class SimulatedProvider {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=10000;
      CREATE TABLE IF NOT EXISTS executions (id TEXT PRIMARY KEY, intent TEXT NOT NULL, execution_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (id TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  execute(id, intent, mode = 'success') {
    if (mode === 'unknown') return null;
    this.db.prepare('INSERT INTO attempts VALUES (?)').run(id);
    const existing = this.lookup(id);
    if (existing && existing.intent !== canonical(intent)) throw Error('IDEMPOTENCY_CONFLICT');
    this.db.prepare('INSERT OR IGNORE INTO executions VALUES (?,?,?)').run(id, canonical(intent), `mock-provider:${intent.id}`);
    return mode === 'timeout-after-effect' ? null : this.lookup(id);
  }
  lookup(id) { return this.db.prepare('SELECT * FROM executions WHERE id=?').get(id) ?? null; }
  counts() {
    const effects = this.db.prepare('SELECT count(*) AS n FROM executions').get().n;
    const attempts = this.db.prepare('SELECT count(*) AS n FROM attempts').get().n;
    return { effects, attempts, duplicateAttempts: attempts - effects };
  }
}
