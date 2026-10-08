// Simple IndexedDB wrapper for Buddy Docs
// Stores: settings, documents

// NEVER CHANGE DB_NAME OR DB_VERSION
const DB_NAME = 'buddy-docs-db';
const DB_VERSION = 7;

export const STORES = {
  settings: 'settings',
  documents: 'documents',
  calendar_notes: 'calendar_notes',
  folders: 'folders'
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
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
