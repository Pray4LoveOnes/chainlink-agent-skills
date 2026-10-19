import { createHash, sign as cryptoSign, verify as cryptoVerify, createPublicKey } from 'node:crypto';

// Application-specific canonical JSON, NOT a Chainlink wire encoding or RFC 8785.
// Strings must be NFC, well-formed Unicode; numbers are safe integers; plain objects only.
export function canonical(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (!value.isWellFormed() || value.normalize('NFC') !== value) throw new Error('noncanonical string');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error('noncanonical number');
    return String(value);
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error('sparse/extended array');
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${canonical(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  throw new Error('unsupported canonical value');
}
export function digest(domain, value) {
  if (!/^[a-z-]+\/v1$/.test(domain)) throw new Error('invalid digest domain');
  return createHash('sha256').update(`${domain}\n${canonical(value)}`).digest('hex');
}
export function sign(body, keyId, privateKey) {
  return { body, keyId, signature: cryptoSign(null, Buffer.from(digest(body.kind, body), 'hex'), privateKey).toString('base64') };
}
export function checkSignature(envelope, role) {
  try {
    if (!role || envelope.keyId !== role.id || typeof envelope.signature !== 'string') return false;
    const signature = Buffer.from(envelope.signature, 'base64');
    const key = createPublicKey(role.publicKey);
    return key.asymmetricKeyType === 'ed25519' && signature.length === 64 &&
      signature.toString('base64') === envelope.signature &&
      cryptoVerify(null, Buffer.from(digest(envelope.body.kind, envelope.body), 'hex'), key, signature);
  } catch { return false; }
}
export function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}
