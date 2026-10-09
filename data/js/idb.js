// Simple IndexedDB wrapper for Buddy Docs
// Stores: settings, documents, calendar_notes, folders, images (internal, not in STORES)

import { isImageRef, imageIdFromRef, makeImageRef, dataUrlToBlob, blobToDataUrl, sha256Hex, makeThumbnail } from './image-utils.js';

// Only bump DB_VERSION when adding a store or index
const DB_NAME = 'buddy-docs-db';
const DB_VERSION = 9;
const IMAGES_STORE = 'images';
const IMAGE_GC_STARTUP_MS = 30 * 1000;
const IMAGE_GC_DELAY_MS = 5 * 60 * 1000;
const IMAGE_GC_GRACE_MS = 10 * 60 * 1000;
let imageSweepTimer = null;

export const STORES = {
  settings: 'settings',
  documents: 'documents',
  calendar_notes: 'calendar_notes',
  folders: 'folders',
  secrets: 'secrets'
};

// One connection is shared by all calls. It is dropped if another tab upgrades the database.
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 8 && !db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
      }
      // Encrypted credentials (API keys and similar). Kept out of cloud sync on purpose.
      if (e.oldVersion < 9 && !db.objectStoreNames.contains(STORES.secrets)) {
        db.createObjectStore(STORES.secrets, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.documents)) {
        const store = db.createObjectStore(STORES.documents, { keyPath: 'id' });
        store.createIndex('by_dueDate', 'dueDate');
        store.createIndex('by_updatedAt', 'updatedAt');
        store.createIndex('by_title', 'title');
      }
      if (e.oldVersion < 6 && !db.objectStoreNames.contains(STORES.calendar_notes)) {
        const store = db.createObjectStore(STORES.calendar_notes, { keyPath: 'id' });
        store.createIndex('by_date', 'date');
      }
      if (e.oldVersion < 7) {
        if (!db.objectStoreNames.contains(STORES.folders)) {
          const store = db.createObjectStore(STORES.folders, { keyPath: 'id' });
          store.createIndex('by_parentId', 'parentId');
          store.createIndex('by_updatedAt', 'updatedAt');
        } else {
          // Update existing store if needed
          const store = req.transaction.objectStore(STORES.folders);
          try {
            store.createIndex('by_updatedAt', 'updatedAt');
          } catch (e) {
            // Index might already exist
            console.log('Index already exists or could not be created:', e);
          }
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      scheduleImageSweep(IMAGE_GC_STARTUP_MS);
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

// Runs one request in its own transaction and resolves with its result once the transaction commits
function run(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const req = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function tx(storeName, mode = 'readonly') {
  const db = await openDB();
  const t = db.transaction(storeName, mode);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    resolve(t.objectStore(storeName));
  });
}

// Settings API
export async function getSetting(key, fallback = null) {
  const store = await tx(STORES.settings, 'readonly');
  return new Promise((resolve, reject) => {
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result?.value ?? fallback);
    r.onerror = () => reject(r.error);
  });
}

export async function setSetting(key, value) {
  const store = await tx(STORES.settings, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put({ key, value });
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

// Documents API
// Gallery images are stored once in the images store. A document keeps only 'idb:<id>' references,
// so documents stay small and the UI loads just the thumbnails it shows.

function imageIdsIn(doc) {
  const ids = [];
  if (!doc || !Array.isArray(doc.content)) return ids;
  for (const entry of doc.content) {
    const src = typeof entry === 'string' ? entry : entry?.src;
    if (isImageRef(src)) ids.push(imageIdFromRef(src));
  }
  return ids;
}

export async function ingestBlob(blob) {
  const id = await sha256Hex(blob);
  const exists = await run(IMAGES_STORE, 'readonly', s => s.getKey(id));
  if (exists === undefined) {
    const thumb = await makeThumbnail(blob);
    await run(IMAGES_STORE, 'readwrite', s => s.put({
      id,
      blob,
      thumb: thumb?.blob ?? null,
      width: thumb?.width ?? 0,
      height: thumb?.height ?? 0,
      type: blob.type,
      size: blob.size,
      createdAt: Date.now()
    }));
  }
  return makeImageRef(id);
}

// Replaces inline data URLs with image references and normalises gallery entries
async function deflateDocument(doc) {
  if (doc.type !== 'gallery' || !Array.isArray(doc.content)) return doc;
  delete doc.thumbnailSrc;
  const content = [];
  for (const entry of doc.content) {
    const item = typeof entry === 'string' ? { src: entry } : { ...entry };
    if (typeof item.src === 'string' && item.src.startsWith('data:')) {
      item.src = await ingestBlob(dataUrlToBlob(item.src));
    }
    content.push(item);
  }
  doc.content = content;
  return doc;
}

// Turns references back into data URLs. Used for sync and export, which need self-contained documents.
export async function inflateDocument(doc) {
  if (!doc || doc.type !== 'gallery' || !Array.isArray(doc.content)) return doc;
  const out = { ...doc, content: [] };
  delete out.thumbnailSrc;
  for (const entry of doc.content) {
    const item = typeof entry === 'string' ? { src: entry } : { ...entry };
    if (isImageRef(item.src)) {
      const rec = await getImageRecord(imageIdFromRef(item.src));
      if (!rec) {
        console.warn('Gallery image missing from storage, skipping', item.src);
        continue;
      }
      item.src = await blobToDataUrl(rec.blob);
    }
    out.content.push(item);
  }
  return out;
}

export async function getImageRecord(id) {
  return (await run(IMAGES_STORE, 'readonly', s => s.get(id))) || null;
}

export async function listImageRecords() {
  return (await run(IMAGES_STORE, 'readonly', s => s.getAll())) || [];
}

// Overwrites an existing image record. Used when an image is locked (encrypted) or unlocked.
export function putImageRecord(record) {
  return run(IMAGES_STORE, 'readwrite', s => s.put(record));
}

// Secrets store: values are stored already encrypted; this layer never sees plaintext.
export async function putSecretRecord(record) {
  return run(STORES.secrets, 'readwrite', s => s.put(record));
}

export async function getSecretRecord(key) {
  return (await run(STORES.secrets, 'readonly', s => s.get(key))) || null;
}

export async function deleteSecretRecord(key) {
  await run(STORES.secrets, 'readwrite', s => s.delete(key));
  return true;
}

export async function listSecretRecords() {
  return (await run(STORES.secrets, 'readonly', s => s.getAll())) || [];
}

export function clearImages() {
  return run(IMAGES_STORE, 'readwrite', s => s.clear());
}

// Total bytes of stored gallery images, used by the storage usage meter
export async function getImageStorageBytes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let total = 0;
    const t = db.transaction(IMAGES_STORE, 'readonly');
    const req = t.objectStore(IMAGES_STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      total += cursor.value.size || 0;
      cursor.continue();
    };
    t.oncomplete = () => resolve(total);
    t.onerror = () => reject(t.error);
  });
}

export async function saveDocument(doc) {
  doc.updatedAt = Date.now();
  return putDocumentRaw(doc);
}

// Writes the document as given, keeping its updatedAt. Used by settings import.
export async function putDocumentRaw(doc) {
  if (!doc.id) doc.id = crypto.randomUUID();
  const previous = await run(STORES.documents, 'readonly', s => s.get(doc.id));
  await deflateDocument(doc);
  await run(STORES.documents, 'readwrite', s => s.put(doc));
  const kept = new Set(imageIdsIn(doc));
  if (imageIdsIn(previous).some(id => !kept.has(id))) scheduleImageSweep(IMAGE_GC_DELAY_MS);
  return doc;
}

export async function getDocument(id, { inflate = false } = {}) {
  const doc = await run(STORES.documents, 'readonly', s => s.get(id));
  if (!doc) return null;
  return inflate ? inflateDocument(doc) : doc;
}

export async function deleteDocument(id) {
  const existing = await run(STORES.documents, 'readonly', s => s.get(id));
  await run(STORES.documents, 'readwrite', s => s.delete(id));
  if (imageIdsIn(existing).length) scheduleImageSweep(IMAGE_GC_DELAY_MS);
  return true;
}

function scheduleImageSweep(delay) {
  clearTimeout(imageSweepTimer);
  imageSweepTimer = setTimeout(() => {
    imageSweepTimer = null;
    sweepOrphanImages().catch(err => console.warn('Gallery image cleanup failed', err));
  }, delay);
}

function collectReferencedImageIds() {
  return openDB().then(db => new Promise((resolve, reject) => {
    const ids = new Set();
    const t = db.transaction(STORES.documents, 'readonly');
    const req = t.objectStore(STORES.documents).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      imageIdsIn(cursor.value).forEach(id => ids.add(id));
      cursor.continue();
    };
    t.oncomplete = () => resolve(ids);
    t.onerror = () => reject(t.error);
  }));
}

// Deletes images no document references. Recent images are skipped, since they may be about to be saved.
async function sweepOrphanImages() {
  const referenced = await collectReferencedImageIds();
  const cutoff = Date.now() - IMAGE_GC_GRACE_MS;
  const db = await openDB();
  const orphans = await new Promise((resolve, reject) => {
    const found = [];
    const t = db.transaction(IMAGES_STORE, 'readonly');
    const req = t.objectStore(IMAGES_STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const { id, createdAt } = cursor.value;
      if (!referenced.has(id) && createdAt < cutoff) found.push(id);
      cursor.continue();
    };
    t.oncomplete = () => resolve(found);
    t.onerror = () => reject(t.error);
  });
  if (!orphans.length) return;
  await run(IMAGES_STORE, 'readwrite', s => {
    orphans.forEach(id => s.delete(id));
  });
}

export async function listDocuments({ search = '', includeArchived = false, onlyArchived = false, inflate = false } = {}) {
  let items = await run(STORES.documents, 'readonly', s => s.getAll());
  items.sort((a,b)=>b.updatedAt - a.updatedAt);

  // Archived filtering
  if (onlyArchived) {
    items = items.filter(d => !!d.archived);
  } else if (!includeArchived) {
    items = items.filter(d => !d.archived);
  }

  const term = search.trim().toLowerCase();
  if (term) items = items.filter(d => (d.title||'').toLowerCase().includes(term));

  if (inflate) {
    // One document at a time so only one inflated gallery is in memory at once
    const inflated = [];
    for (const d of items) inflated.push(await inflateDocument(d));
    items = inflated;
  }
  return items;
}

export function listDocumentIds() {
  return run(STORES.documents, 'readonly', s => s.getAllKeys()).then(keys => keys || []);
}

export async function listDeadlinesForMonth(year, month) {
  const all = await listDocuments();
  const mm = month + 1;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return all.filter(d => d.dueDate && new Date(d.dueDate) >= start && new Date(d.dueDate) <= end)
            .sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate));
}

// Calendar Notes API
export async function saveNote(note) {
  if (!note.id) note.id = crypto.randomUUID();
  const store = await tx(STORES.calendar_notes, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put(note);
    r.onsuccess = () => resolve(note);
    r.onerror = () => reject(r.error);
  });
}

export async function getNotesForMonth(year, month) {
  const store = await tx(STORES.calendar_notes, 'readonly');
  const start = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
  const end = `${year}-${(month + 1).toString().padStart(2, '0')}-31`;
  const range = IDBKeyRange.bound(start, end);
  
  return new Promise((resolve, reject) => {
    const r = store.index('by_date').getAll(range);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function deleteNote(id) {
  const store = await tx(STORES.calendar_notes, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

// Folders API
export async function saveFolder(folder) {
  const now = Date.now();
  folder.updatedAt = now;
  if (!folder.id) folder.id = crypto.randomUUID();
  if (!folder.name) folder.name = 'Untitled Folder';
  if (!folder.color) folder.color = 'blue';
  if (!folder.emoji) folder.emoji = '📁';
  if (!folder.parentId) folder.parentId = null; // null means root level
  if (!folder.thumbnailType) folder.thumbnailType = 'emoji'; // Default to emoji
  
  const store = await tx(STORES.folders, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put(folder);
    r.onsuccess = () => resolve(folder);
    r.onerror = () => reject(r.error);
  });
}

export async function getFolder(id) {
  const store = await tx(STORES.folders, 'readonly');
  return new Promise((resolve, reject) => {
    const r = store.get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

export async function deleteFolder(id) {
  // Delete the folder and all its contents (subfolders and documents)
  const subfolders = await listFolders({ parentId: id });
  for (const subfolder of subfolders) {
    await deleteFolder(subfolder.id); // Recursive delete
  }
  
  // Delete all documents in this folder
  const docs = await listDocuments();
  const docsInFolder = docs.filter(d => d.folderId === id);
  for (const doc of docsInFolder) {
    await deleteDocument(doc.id);
  }
  
  // Delete the folder itself
  const store = await tx(STORES.folders, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

export async function listFolders({ parentId = null } = {}) {
  const store = await tx(STORES.folders, 'readonly');
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => {
      let items = r.result.sort((a, b) => b.updatedAt - a.updatedAt);
      // Filter by parentId
      items = items.filter(f => f.parentId === parentId);
      resolve(items);
    };
    r.onerror = () => reject(r.error);
  });
}
