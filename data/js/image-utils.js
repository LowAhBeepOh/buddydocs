// Image helpers shared by idb.js, images.js and gallery.html.
// Keep this file free of IndexedDB code so idb.js can import it without a cycle.

export const IMAGE_REF_PREFIX = 'idb:';

const THUMB_MAX_SIDE = 360;
const THUMB_QUALITY = 0.8;
const STORAGE_MAX_WIDTH = 1200;
const STORAGE_QUALITY = 0.8;

// Sharper rendition shown once a card has been on screen for a while. Cards are about 320px wide, so 640px is 2x for high-DPI screens.
const HI_PREVIEW_MAX_SIDE = 640;

export function makeImageRef(id) {
  return IMAGE_REF_PREFIX + id;
}

export function isImageRef(src) {
  return typeof src === 'string' && src.startsWith(IMAGE_REF_PREFIX);
}

export function imageIdFromRef(src) {
  return src.slice(IMAGE_REF_PREFIX.length);
}

export function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const mime = dataUrl.match(/^data:([^;,]*)/)?.[1] || 'application/octet-stream';
  const payload = dataUrl.slice(comma + 1);
  if (!/;base64$/i.test(header)) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Content hash used as the image id, so identical images are stored once
export async function sha256Hex(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function extForMime(type) {
  if (!type) return 'png';
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/svg+xml') return 'svg';
  return type.split('/')[1]?.split('+')[0] || 'png';
}

// Scales an image to fit maxSide and encodes it as JPEG. Returns { blob, width, height } with the source size, or null if it can't be decoded.
export async function resizeToJpeg(blob, maxSide, quality) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const out = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  return out ? { blob: out, width, height } : null;
}

// Returns { blob, width, height } for a small JPEG preview, or null if the image can't be decoded
export function makeThumbnail(blob) {
  return resizeToJpeg(blob, THUMB_MAX_SIDE, THUMB_QUALITY);
}

// Higher-resolution preview of the full image, used for cards that stay on screen
export function makeHiPreview(blob) {
  return resizeToJpeg(blob, HI_PREVIEW_MAX_SIDE, THUMB_QUALITY);
}

// GIFs are kept as-is so animation survives. Other images are resized to a JPEG.
export async function encodeForStorage(file) {
  if (file.type === 'image/gif') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, STORAGE_MAX_WIDTH / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', STORAGE_QUALITY));
}
