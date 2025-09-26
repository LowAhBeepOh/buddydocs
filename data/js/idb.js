// Simple IndexedDB wrapper for Buddy Docs
// Stores: settings, documents

const DB_NAME = 'buddy-docs-db';
const DB_VERSION = 5;

export const STORES = {
  settings: 'settings',
  documents: 'documents'
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.documents)) {
        const store = db.createObjectStore(STORES.documents, { keyPath: 'id' });
        store.createIndex('by_dueDate', 'dueDate');
        store.createIndex('by_updatedAt', 'updatedAt');
        store.createIndex('by_title', 'title');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
export async function saveDocument(doc) {
  const now = Date.now();
  doc.updatedAt = now;
  if (!doc.id) doc.id = crypto.randomUUID();
  const store = await tx(STORES.documents, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put(doc);
    r.onsuccess = () => resolve(doc);
    r.onerror = () => reject(r.error);
  });
}

export async function getDocument(id) {
  const store = await tx(STORES.documents, 'readonly');
  return new Promise((resolve, reject) => {
    const r = store.get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

export async function deleteDocument(id) {
  const store = await tx(STORES.documents, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

export async function listDocuments({ search = '', includeArchived = false, onlyArchived = false } = {}) {
  const store = await tx(STORES.documents, 'readonly');
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => {
      let items = r.result.sort((a,b)=>b.updatedAt - a.updatedAt);

      // Archived filtering
      if (onlyArchived) {
        items = items.filter(d => !!d.archived);
      } else if (!includeArchived) {
        items = items.filter(d => !d.archived);
      }

      const term = search.trim().toLowerCase();
      if (term) items = items.filter(d => (d.title||'').toLowerCase().includes(term));
      resolve(items);
    };
    r.onerror = () => reject(r.error);
  });
}

export async function listDeadlinesForMonth(year, month) {
  const all = await listDocuments();
  const mm = month + 1;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return all.filter(d => d.dueDate && new Date(d.dueDate) >= start && new Date(d.dueDate) <= end)
            .sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate));
}
