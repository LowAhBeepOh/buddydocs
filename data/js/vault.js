// Buddy Docs vault: encryption at rest for protected content, plus a secrets store.
//
// Model (envelope encryption):
//   password --PBKDF2--> KEK --wraps--> DEK --encrypts--> images and secrets
// The random data key (DEK) lives only in memory while the vault is unlocked, so a
// password change re-wraps one small blob rather than re-encrypting everything.
//
// The crypto itself lives in vault-crypto.js so it stays unit-testable.

import {
  getSetting,
  setSetting,
  getImageRecord,
  putImageRecord,
  putSecretRecord,
  getSecretRecord,
  deleteSecretRecord,
  listSecretRecords,
  listImageRecords
} from './idb.js';
import { makeThumbnail } from './image-utils.js';
import {
  deriveKek,
  generateDekBytes,
  importDek,
  encryptBytes,
  decryptBytes,
  encryptBlob,
  decryptBlob,
  wrapDek,
  unwrapDek,
  bytesToBase64,
  base64ToBytes,
  randomBytes,
  DEFAULT_ITERATIONS,
  SALT_BYTES
} from './vault-crypto.js';

const KEYS = {
  enabled: 'vaultEnabled',
  salt: 'vaultSalt',
  iterations: 'vaultIterations',
  wrappedDek: 'vaultDekWrapped',
  autoLockMinutes: 'vaultAutoLockMinutes',
  lockOnHide: 'vaultLockOnHide'
};

const DEFAULT_AUTO_LOCK_MINUTES = 15;

// Session state. Cleared by lockVault().
let sessionDek = null;
let sessionKey = null;
let cachedEnabled = null;
let autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;
let lockOnHide = false;
let autoLockTimer = null;
let lastActivityAt = 0;
let activityBound = false;
let visibilityBound = false;

const listeners = new Set();

const imageAad = (id) => 'buddydocs:image:' + id;
const imageThumbAad = (id) => 'buddydocs:image-thumb:' + id;
const secretAad = (key) => 'buddydocs:secret:' + key;

export function onVaultChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function emit(reason) {
  for (const callback of listeners) {
    try {
      callback(reason);
    } catch (err) {
      console.warn('Vault listener failed', err);
    }
  }
}

export function isVaultUnlocked() {
  return !!sessionKey;
}

export async function isVaultEnabled() {
  if (cachedEnabled === null) cachedEnabled = !!(await getSetting(KEYS.enabled, false));
  return cachedEnabled;
}

export async function getVaultStatus() {
  return {
    enabled: await isVaultEnabled(),
    unlocked: isVaultUnlocked(),
    autoLockMinutes,
    lockOnHide
  };
}

async function applySession(dekBytes) {
  sessionDek = dekBytes;
  sessionKey = await importDek(dekBytes);
  startAutoLock();
  emit('unlocked');
}

function clearSession() {
  sessionDek = null;
  sessionKey = null;
  stopAutoLock();
}

// ---- auto-lock -----------------------------------------------------------

function stopAutoLock() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

function startAutoLock() {
  stopAutoLock();
  const minutes = Number(autoLockMinutes) || 0;
  if (minutes <= 0 || !sessionKey) return;
  autoLockTimer = setTimeout(() => lockVault('timeout'), minutes * 60 * 1000);
  bindActivity();
}

function noteActivity() {
  if (!sessionKey) return;
  const now = Date.now();
  if (now - lastActivityAt < 5000) return; // don't restart the timer on every mouse move
  lastActivityAt = now;
  startAutoLock();
}

function bindActivity() {
  if (activityBound) return;
  activityBound = true;
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, noteActivity, { passive: true });
  });
}

function bindVisibility() {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (lockOnHide && document.visibilityState === 'hidden' && sessionKey) {
      lockVault('hidden');
    }
  });
}

// ---- lifecycle -----------------------------------------------------------

export async function initVault() {
  cachedEnabled = !!(await getSetting(KEYS.enabled, false));
  autoLockMinutes = Number(await getSetting(KEYS.autoLockMinutes, DEFAULT_AUTO_LOCK_MINUTES));
  if (!Number.isFinite(autoLockMinutes)) autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;
  lockOnHide = !!(await getSetting(KEYS.lockOnHide, false));
  if (lockOnHide) bindVisibility();
  return cachedEnabled;
}

export async function setVaultPreferences({ autoLockMinutes: minutes, lockOnHide: hide } = {}) {
  if (minutes !== undefined) {
    const value = Math.max(0, Number(minutes) || 0);
    autoLockMinutes = value;
    await setSetting(KEYS.autoLockMinutes, value);
    if (sessionKey) startAutoLock();
  }
  if (hide !== undefined) {
    lockOnHide = !!hide;
    await setSetting(KEYS.lockOnHide, lockOnHide);
    if (lockOnHide) bindVisibility();
  }
}

export async function enableVault(passphrase) {
  if (!passphrase) throw new Error('A password is required to enable encryption');
  if (await isVaultEnabled()) return false;

  const salt = randomBytes(SALT_BYTES);
  const iterations = DEFAULT_ITERATIONS;
  const kek = await deriveKek(passphrase, salt, iterations);
  const dekBytes = generateDekBytes();
  const wrapped = await wrapDek(kek, dekBytes);

  await Promise.all([
    setSetting(KEYS.salt, bytesToBase64(salt)),
    setSetting(KEYS.iterations, iterations),
    setSetting(KEYS.wrappedDek, bytesToBase64(wrapped)),
    setSetting(KEYS.enabled, true),
    setSetting(KEYS.autoLockMinutes, autoLockMinutes)
  ]);
  cachedEnabled = true;
  await applySession(dekBytes);
  return true;
}

export async function unlockVault(passphrase) {
  if (!(await isVaultEnabled())) return false;
  const saltBase64 = await getSetting(KEYS.salt, null);
  const wrappedBase64 = await getSetting(KEYS.wrappedDek, null);
  if (!saltBase64 || !wrappedBase64) return false;
  try {
    const iterations = Number(await getSetting(KEYS.iterations, DEFAULT_ITERATIONS)) || DEFAULT_ITERATIONS;
    const kek = await deriveKek(passphrase, base64ToBytes(saltBase64), iterations);
    const dekBytes = await unwrapDek(kek, base64ToBytes(wrappedBase64));
    await applySession(dekBytes);
    await migratePlaintextSecrets();
    return true;
  } catch {
    return false; // AES-GCM auth failure means the password was wrong
  }
}

export function lockVault(reason = 'manual') {
  if (!sessionKey) return;
  clearSession();
  emit('locked', { reason });
}

// Re-wraps the existing data key under a new password. Nothing else is re-encrypted.
export async function rewrapVault(newPassphrase) {
  if (!sessionDek) throw new Error('Unlock the vault first');
  if (!newPassphrase) throw new Error('A password is required');
  const salt = randomBytes(SALT_BYTES);
  const iterations = DEFAULT_ITERATIONS;
  const kek = await deriveKek(newPassphrase, salt, iterations);
  const wrapped = await wrapDek(kek, sessionDek);
  await Promise.all([
    setSetting(KEYS.salt, bytesToBase64(salt)),
    setSetting(KEYS.iterations, iterations),
    setSetting(KEYS.wrappedDek, bytesToBase64(wrapped))
  ]);
}

export async function changeVaultPassphrase(oldPassphrase, newPassphrase) {
  if (!(await isVaultEnabled())) return false;
  if (!isVaultUnlocked()) {
    const ok = await unlockVault(oldPassphrase);
    if (!ok) throw new Error('Current password is incorrect');
  }
  await rewrapVault(newPassphrase);
  return true;
}

// ---- protected images ----------------------------------------------------

export function isEncryptedImageRecord(record) {
  return !!(record && record.enc);
}

// Decrypts just the small preview. Falls back to the full image when no preview was stored.
export async function decryptImageThumb(record) {
  if (!sessionKey || !record) return null;
  if (!record.encThumb) return decryptBlob(sessionKey, record.blob, imageAad(record.id), record.mime);
  return decryptBlob(sessionKey, record.encThumb, imageThumbAad(record.id), 'image/jpeg');
}

// Decrypts the full-size image. Returns null while the vault is locked.
export async function decryptImageFull(record) {
  if (!sessionKey || !record) return null;
  return decryptBlob(sessionKey, record.blob, imageAad(record.id), record.mime);
}

// Encrypts a stored image so its bytes are unreadable on disk. Removes the plaintext thumbnail.
export async function protectImage(id) {
  if (!sessionKey) throw new Error('Unlock the vault first');
  const record = await getImageRecord(id);
  if (!record || record.enc) return false;
  const mime = record.mime || record.blob?.type || 'application/octet-stream';
  const sealed = await encryptBlob(sessionKey, record.blob, imageAad(id));
  const encThumb = record.thumb ? await encryptBlob(sessionKey, record.thumb, imageThumbAad(id)) : null;
  await putImageRecord({
    ...record,
    blob: sealed,
    thumb: null,
    encThumb,
    enc: true,
    mime
  });
  return true;
}

// Restores a protected image to a plaintext record, regenerating the thumbnail if needed.
export async function unprotectImage(id) {
  if (!sessionKey) throw new Error('Unlock the vault first');
  const record = await getImageRecord(id);
  if (!record || !record.enc) return false;
  const blob = await decryptBlob(sessionKey, record.blob, imageAad(id), record.mime);
  let thumb = null;
  if (record.encThumb) {
    thumb = await decryptBlob(sessionKey, record.encThumb, imageThumbAad(id), 'image/jpeg');
  } else {
    thumb = (await makeThumbnail(blob))?.blob || null;
  }
  const { encThumb, ...rest } = record;
  await putImageRecord({ ...rest, blob, thumb, enc: false, encThumb: null });
  return true;
}

// Restores every protected image to plaintext, used when encryption is turned off.
export async function unprotectAllImages() {
  const records = await listImageRecords();
  let changed = 0;
  for (const record of records) {
    if (!record.enc) continue;
    try {
      if (await unprotectImage(record.id)) changed++;
    } catch (err) {
      console.warn('Failed to unprotect image', record.id, err);
    }
  }
  return changed;
}

// Moves stored secrets back to plaintext settings and clears all vault state.
export async function disableVault() {
  if (!sessionKey) throw new Error('Unlock the vault first');
  await unprotectAllImages();

  for (const record of await listSecretRecords()) {
    const value = await getSecret(record.key);
    if (value != null && record.key === 'aiApiKey') await setSetting('aiApiKey', value);
    await deleteSecretRecord(record.key);
  }

  clearSession();
  cachedEnabled = false;
  await Promise.all([
    setSetting(KEYS.enabled, false),
    setSetting(KEYS.salt, ''),
    setSetting(KEYS.wrappedDek, ''),
    setSetting(KEYS.iterations, 0)
  ]);
  emit('disabled');
  return true;
}

// ---- secrets -------------------------------------------------------------

export async function setSecret(key, value) {
  if (!sessionKey) throw new Error('Unlock the vault first');
  const sealed = await encryptBytes(sessionKey, new TextEncoder().encode(String(value)), secretAad(key));
  await putSecretRecord({ key, data: bytesToBase64(sealed), updatedAt: Date.now() });
  return true;
}

export async function getSecret(key) {
  const record = await getSecretRecord(key);
  if (!record || !sessionKey) return null;
  try {
    const plain = await decryptBytes(sessionKey, base64ToBytes(record.data), secretAad(key));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function deleteSecret(key) {
  return deleteSecretRecord(key);
}

export async function hasSecret(key) {
  return !!(await getSecretRecord(key));
}

export async function listSecrets() {
  return (await listSecretRecords()).map(record => record.key);
}

// Creates or refreshes the legacy scrypt hash used by the pre-vault lock checks.
// Also used by onboarding so a freshly chosen password is never stored in plaintext.
export async function setLegacySecretHash(secret) {
  let saltBase64 = await getSetting('secretSalt', null);
  if (!saltBase64) {
    saltBase64 = bytesToBase64(randomBytes(16));
    await setSetting('secretSalt', saltBase64);
  }
  let mod = null;
  try {
    mod = await import('https://cdn.jsdelivr.net/npm/scrypt-js@3.0.1/+esm');
  } catch {
    return false;
  }
  if (!mod?.scrypt) return false;
  const out = await mod.scrypt(new TextEncoder().encode(secret), base64ToBytes(saltBase64), 2048, 8, 1, 32);
  const hash = Array.from(out).map(b => b.toString(16).padStart(2, '0')).join('');
  await setSetting('secretHash', hash);
  await setSetting('secretSet', true);
  return true;
}

// Moves any plaintext API key into the vault once it is unlocked.
export async function migratePlaintextSecrets() {
  if (!sessionKey) return;
  const plaintext = await getSetting('aiApiKey', '');
  if (plaintext) {
    await setSecret('aiApiKey', plaintext);
    await setSetting('aiApiKey', '');
  }
}

// Reads the AI key from the vault when present, otherwise the legacy plaintext setting.
export async function getAiApiKey() {
  const fromVault = await getSecret('aiApiKey');
  if (fromVault) return fromVault;
  return await getSetting('aiApiKey', '');
}

export async function setAiApiKey(value) {
  if (!value) {
    if (await isVaultEnabled()) await deleteSecret('aiApiKey');
    await setSetting('aiApiKey', '');
    return;
  }
  if (await isVaultEnabled()) {
    if (!sessionKey) throw new Error('Unlock encryption to store the API key securely');
    await setSecret('aiApiKey', value);
    await setSetting('aiApiKey', ''); // never keep a plaintext copy once vaulted
  } else {
    await setSetting('aiApiKey', value);
  }
}

// ---- gate ----------------------------------------------------------------

// Shared replacement for the per-page requireAuth helpers. Falls back to the legacy
// scrypt/SHA-256 hash check when encryption has never been enabled.
export async function requireSecret(reason = 'Enter password') {
  if (isVaultUnlocked()) return true;

  if (await isVaultEnabled()) {
    const usePin = await getSetting('usePin', false);
    const input = prompt(usePin ? 'Enter PIN' : reason);
    if (input == null) return false;
    return await unlockVault(input);
  }

  const secretSet = await getSetting('secretSet', false);
  if (!secretSet) return true;
  const usePin = await getSetting('usePin', false);
  const input = prompt(usePin ? 'Enter PIN' : 'Enter password');
  if (input == null) return false;
  return await verifyLegacySecret(input);
}

let scryptModule = null;

async function verifyLegacySecret(input) {
  try {
    const saltStr = await getSetting('secretSalt', '');
    const stored = await getSetting('secretHash', '');
    if (!stored) return true;

    if (saltStr && saltStr.length > 0) {
      if (!scryptModule) scryptModule = await import('https://cdn.jsdelivr.net/npm/scrypt-js@3.0.1/+esm');
      const { scrypt } = scryptModule;
      const passwordBytes = new TextEncoder().encode(input);
      const saltBytes = base64ToBytes(saltStr);
      for (const N of [2048, 4096, 16384]) {
        const out = await scrypt(passwordBytes, saltBytes, N, 8, 1, 32);
        const hashHex = Array.from(out).map(b => b.toString(16).padStart(2, '0')).join('');
        if (hashHex === stored) return true;
      }
      return false;
    }

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const hashHex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex === stored;
  } catch {
    return false;
  }
}
