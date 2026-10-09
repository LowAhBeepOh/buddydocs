import { getImageRecord, getDocument, putDocumentRaw, listDocumentIds, getSetting, setSetting } from './idb.js';
import { isImageRef, imageIdFromRef, dataUrlToBlob, makeHiPreview } from './image-utils.js';
import { isEncryptedImageRecord, decryptImageThumb, decryptImageFull, onVaultChange } from './vault.js';

const CACHE_LIMITS = { thumb: 300, hi: 120, full: 2 };
const MIGRATION_KEY = 'galleryImagesMigrated';
const SEEN_UPGRADE_MS = 1200;

// Object URLs per image id, kept in least-recently-used order
const caches = { thumb: new Map(), hi: new Map(), full: new Map() };
const inflight = new Map();

function touch(variant, id) {
  const cache = caches[variant];
  const url = cache.get(id);
  cache.delete(id);
  cache.set(id, url);
  return url;
}

function remember(variant, id, url) {
  const cache = caches[variant];
  cache.set(id, url);
  while (cache.size > CACHE_LIMITS[variant]) {
    const [oldId, oldUrl] = cache.entries().next().value;
    cache.delete(oldId);
    URL.revokeObjectURL(oldUrl);
  }
}

// Returns a URL the browser can display. Non-reference sources (legacy data URLs) pass through unchanged.
export async function resolveImageUrl(src, variant = 'thumb') {
  if (!isImageRef(src)) return src;
  const id = imageIdFromRef(src);
  if (caches[variant].has(id)) return touch(variant, id);
  const key = variant + ':' + id;
  if (inflight.has(key)) return inflight.get(key);
  const pending = (async () => {
    const rec = await getImageRecord(id);
    if (!rec) return null;
    let blob;
    if (isEncryptedImageRecord(rec)) {
      // Protected images are unreadable until the vault is unlocked.
      if (variant === 'full') {
        blob = await decryptImageFull(rec);
      } else {
        // Encrypted records ship a pre-encrypted thumbnail, so thumbnails stay cheap.
        blob = await decryptImageThumb(rec);
      }
      if (!blob) return null;
    } else if (variant === 'thumb') {
      blob = rec.thumb || rec.blob;
    } else if (variant === 'hi') {
      const hi = await makeHiPreview(rec.blob);
      blob = hi?.blob || rec.thumb || rec.blob;
    } else {
      blob = rec.blob;
    }
    const url = URL.createObjectURL(blob);
    remember(variant, id, url);
    return url;
  })().finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

// Sets an <img> to a gallery source. A newer call (or cancelImageLoad) makes older pending loads drop their result.
const pendingLoads = new WeakMap();

// Thumbnails that stay on screen get a sharper rendition after SEEN_UPGRADE_MS
const watched = new WeakMap(); // img -> { src, token, timer }
const seenObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
  for (const entry of entries) {
    const img = entry.target;
    const w = watched.get(img);
    if (!w) {
      seenObserver.unobserve(img);
      continue;
    }
    if (!img.isConnected) {
      unwatch(img);
      continue;
    }
    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
      if (!w.timer) w.timer = setTimeout(() => upgradeImage(img), SEEN_UPGRADE_MS);
    } else if (w.timer) {
      clearTimeout(w.timer);
      w.timer = null;
    }
  }
}, { threshold: 0.5 });

function watchForUpgrade(img, src, token) {
  unwatch(img);
  watched.set(img, { src, token, timer: null });
  seenObserver?.observe(img);
}

function unwatch(img) {
  const w = watched.get(img);
  if (w?.timer) clearTimeout(w.timer);
  watched.delete(img);
  seenObserver?.unobserve(img);
}

async function upgradeImage(img) {
  const w = watched.get(img);
  if (!w) return;
  unwatch(img);
  const url = await resolveImageUrl(w.src, 'hi');
  if (!url || pendingLoads.get(img) !== w.token) return;
  img.src = url;
}

export async function setImageSrc(img, src, variant = 'thumb') {
  img.dataset.ref = src;
  const token = {};
  pendingLoads.set(img, token);
  unwatch(img);
  const url = await resolveImageUrl(src, variant);
  if (pendingLoads.get(img) !== token) return;
  if (url) {
    img.src = url;
    if (variant === 'thumb' && isImageRef(src)) watchForUpgrade(img, src, token);
  } else {
    img.removeAttribute('src');
  }
}

export function cancelImageLoad(img) {
  pendingLoads.delete(img);
  unwatch(img);
}

// Full-size blob for downloads and archives
export async function getImageBlob(src) {
  if (isImageRef(src)) {
    const rec = await getImageRecord(imageIdFromRef(src));
    if (!rec) return null;
    if (isEncryptedImageRecord(rec)) return await decryptImageFull(rec);
    return rec.blob;
  }
  return src.startsWith('data:') ? dataUrlToBlob(src) : null;
}

// Frees full-size object URLs, e.g. when the lightbox closes
export function clearImageCache(variant) {
  const cache = caches[variant];
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}

// Locking the vault must drop every decrypted object URL and any in-flight decryption.
onVaultChange((reason) => {
  if (reason !== 'locked') return;
  clearImageCache('thumb');
  clearImageCache('hi');
  clearImageCache('full');
  inflight.clear();
});

// Picks the image to show on a card. Pinned first, then a random visible entry. Spoilers and locked entries are never shown.
export function pickGalleryPreview(doc) {
  const entries = (Array.isArray(doc.content) ? doc.content : [])
    .map(e => typeof e === 'string' ? { src: e } : e)
    .filter(e => e?.src && !e.spoiler && !e.locked);
  if (!entries.length) return null;
  const pinned = entries.find(e => e.pinned);
  if (pinned) return pinned.src;
  return entries[Math.floor(Math.random() * entries.length)].src;
}

function needsMigration(doc) {
  if (doc.thumbnailSrc) return true;
  return (Array.isArray(doc.content) ? doc.content : []).some(e => {
    const src = typeof e === 'string' ? e : e?.src;
    return typeof src === 'string' && src.startsWith('data:');
  });
}

// One-time move of inline data URLs into the images store. Handles one document at a time to keep memory low.
export async function migrateLegacyGalleries() {
  if (await getSetting(MIGRATION_KEY, false)) return;
  const ids = await listDocumentIds();
  for (const id of ids) {
    const doc = await getDocument(id);
    if (doc?.type === 'gallery' && needsMigration(doc)) {
      await putDocumentRaw(doc);
    }
  }
  await setSetting(MIGRATION_KEY, true);
}
