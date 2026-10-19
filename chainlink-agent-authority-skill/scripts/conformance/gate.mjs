import { canonical, checkSignature, digest, exactKeys } from './codec.mjs';

export const intentFields = ['version', 'id', 'tenant', 'project', 'chain', 'action', 'destination', 'amount', 'asset', 'scope', 'agent', 'audience', 'nonce', 'issuedAt', 'expiresAt'];
export function authorize(bundle, trust, now) {
  try {
    canonical(bundle);
    const i = bundle.intent, a = bundle.authorization, o = bundle.observation;
    const p = trust.policy;
    if (trust.format !== 'agent-authority-trust/v1' || !exactKeys(i, intentFields) || i.version !== 1) throw Error('SCHEMA');
    for (const k of intentFields.filter(k => !['version', 'issuedAt', 'expiresAt'].includes(k))) {
      if (typeof i[k] !== 'string' || !i[k] || i[k].length > 256) throw Error('SCHEMA');
    }
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(i.issuedAt) || !Number.isSafeInteger(i.expiresAt) ||
        i.issuedAt > now || now >= i.expiresAt || i.issuedAt >= i.expiresAt) throw Error('EXPIRED');
    if (!Array.isArray(trust.revokedNonces) || trust.revokedNonces.includes(i.nonce)) throw Error('REVOKED');
    for (const field of ['tenant', 'project', 'chain', 'action', 'destination', 'asset', 'scope', 'agent', 'audience']) {
      if (i[field] !== p[field]) throw Error(`SCOPE_${field}`);
    }
    if (p.allowed !== true || !/^[1-9][0-9]*$/.test(i.amount) || !/^[1-9][0-9]*$/.test(p.maxAmount) || BigInt(i.amount) > BigInt(p.maxAmount)) throw Error('POLICY');
    const id = digest('intent/v1', i), pd = digest('policy/v1', p);
    if (!checkSignature(a, trust.keys.authority) || a.body.kind !== 'authority/v1' || a.body.intentDigest !== id ||
        a.body.policyDigest !== pd || a.body.nonce !== i.nonce || a.body.issuedAt !== i.issuedAt || a.body.expiresAt !== i.expiresAt) throw Error('AUTHORITY');
    if (!checkSignature(o, trust.keys.observer) || o.body.kind !== 'observation/v1' || o.body.intentDigest !== id) throw Error('OBSERVATION');
    for (const k of ['tenant', 'chain', 'action', 'destination', 'amount', 'asset']) if (o.body[k] !== i[k]) throw Error('EVIDENCE_SCOPE');
    if (o.body.finality !== 'finalized' || o.body.classification !== 'simulated' ||
        typeof o.body.executionId !== 'string' || !o.body.executionId.startsWith('simulated-event:') ||
        !Number.isSafeInteger(o.body.observedAt) || o.body.observedAt < i.issuedAt || o.body.observedAt > now) throw Error('EVIDENCE');
    return { allowed: true, intentDigest: id, policyDigest: pd };
  } catch (e) { return { allowed: false, reason: e.message }; }
}
