// Pure WebCrypto primitives for the Buddy Docs vault.
//
// Envelope encryption: a random 256-bit data key (DEK) encrypts the actual data,
// and the DEK itself is wrapped by a key (KEK) derived from the user's password.
// That lets a password change re-wrap one small blob instead of re-encrypting
// every protected image.
//
// This file deliberately has no DOM or IndexedDB access so it can be unit-tested
// in Node (see tests/vault-crypto.test.mjs).

export const MAGIC = new Uint8Array([0x42, 0x44, 0x56, 0x31]); // "BDV1"
export const IV_BYTES = 12; // 96-bit nonce, the AES-GCM standard
export const DEK_BYTES = 32; // 256-bit key
export const SALT_BYTES = 16;
export const DEFAULT_ITERATIONS = 310000;

const AES_GCM = { name: 'AES-GCM' };
const AES_GCM_DERIVED = { name: 'AES-GCM', length: 256 };
const WRAP_AAD = 'buddydocs:vault:dek:v1';

function subtle() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('Web Crypto is unavailable in this context');
  return c.subtle;
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Expected a byte array');
}

export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

// Stretches the user's password into an AES-GCM key. Same password + salt + iterations always give the same key.
export async function deriveKek(passphrase, saltBytes, iterations = DEFAULT_ITERATIONS) {
  const salt = toBytes(saltBytes);
  const baseKey = await subtle().importKey('raw', new TextEncoder().encode(String(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    AES_GCM_DERIVED,
    false,
    ['encrypt', 'decrypt']
  );
}

export function generateDekBytes() {
  return randomBytes(DEK_BYTES);
}

export async function importDek(dekBytes) {
  const bytes = toBytes(dekBytes);
  if (bytes.length !== DEK_BYTES) throw new Error('Data key must be 32 bytes');
  return subtle().importKey('raw', bytes, AES_GCM, false, ['encrypt', 'decrypt']);
}

// Returns iv || ciphertext(+tag)
export async function encryptBytes(key, bytes, aad = '') {
  const iv = randomBytes(IV_BYTES);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = new TextEncoder().encode(aad);
  const ciphertext = new Uint8Array(await subtle().encrypt(params, key, toBytes(bytes)));
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}

export async function decryptBytes(key, envelope, aad = '') {
  const env = toBytes(envelope);
  if (env.length <= IV_BYTES) throw new Error('Ciphertext is too short');
  const iv = env.subarray(0, IV_BYTES);
  const ciphertext = env.subarray(IV_BYTES);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = new TextEncoder().encode(aad);
  return new Uint8Array(await subtle().decrypt(params, key, ciphertext));
}

export async function wrapDek(kek, dekBytes) {
  return encryptBytes(kek, dekBytes, WRAP_AAD);
}

export async function unwrapDek(kek, wrapped) {
  return decryptBytes(kek, wrapped, WRAP_AAD);
}

export function hasMagic(bytes) {
  const b = toBytes(bytes);
  if (b.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) {
    if (b[i] !== MAGIC[i]) return false;
  }
  return true;
}

// Sealed blobs carry a small magic header so we can tell ciphertext from a raw file.
export async function encryptBlob(key, blob, aad = '') {
  const plain = new Uint8Array(await blob.arrayBuffer());
  const sealed = await encryptBytes(key, plain, aad);
  const out = new Uint8Array(MAGIC.length + sealed.length);
  out.set(MAGIC, 0);
  out.set(sealed, MAGIC.length);
  return new Blob([out], { type: 'application/octet-stream' });
}

export async function decryptBlob(key, blob, aad = '', mime = 'application/octet-stream') {
  const all = new Uint8Array(await blob.arrayBuffer());
  if (!hasMagic(all)) throw new Error('Not a vault blob');
  const plain = await decryptBytes(key, all.subarray(MAGIC.length), aad);
  return new Blob([plain], { type: mime || 'application/octet-stream' });
}

export function bytesToBase64(input) {
  const bytes = toBytes(input);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
