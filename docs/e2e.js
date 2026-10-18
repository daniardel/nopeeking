// End-to-end encryption shared by the phone page (browser) and the NoPeeking server (Node 20+).
// ECDH P-256 -> HKDF-SHA256 -> AES-256-GCM, using only the standard WebCrypto API.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64u(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(str) {
  const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function randomTopic() {
  return `pc-${toB64u(globalThis.crypto.getRandomValues(new Uint8Array(24)))}`;
}

export async function generateKeyPair() {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const publicKeyRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  return { privateKey: pair.privateKey, publicKeyRaw };
}

export async function deriveKey(privateKey, peerPublicRaw, topic) {
  const peer = await subtle.importKey('raw', peerPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(topic), info: enc.encode('nopeeking v1') },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Binds a message to one link and one direction, so it can't be replayed elsewhere. */
export function aadFor({ topic, name, kind, site }, purpose) {
  return enc.encode(`nopeeking v1|${purpose}|${topic}|${name}|${kind}|${site ?? ''}`);
}

export async function seal(key, obj, aad) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64u(iv), ct: toB64u(ct) };
}

export async function unseal(key, { iv, ct }, aad) {
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: aad }, key, fromB64u(ct));
  return JSON.parse(dec.decode(plain));
}
