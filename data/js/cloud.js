// Import required functions from idb.js
import { getSetting, setSetting, listDocuments, saveDocument, deleteDocument, saveFolder, tx, STORES } from './idb.js';
import { initSyncService, onSync, updateSyncCountdown } from './syncService.js';

// Google Drive API Configuration
const GOOGLE_CLIENT_ID = '843640373447-4v9vbpn0nhtallnmkrua34msqgm25j9d.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
const SYNC_INTERVAL = 8 * 60 * 1000; // 8 minutes in milliseconds
const TOKEN_REFRESH_BUFFER = 90 * 60 * 1000; // 90 minutes before token expires
const STORAGE_LIMIT = 1 * 1024 * 1024 * 1024; // 1GB in bytes

// Global variables
let tokenClient = null;
let gapiInited = false;
let gisInited = false;
let lastSyncToken = null;

// Refresh token if needed
async function refreshTokenIfNeeded() {
  try {
    const savedToken = localStorage.getItem('googleAuthToken');
    if (!savedToken) return false;
    
    const token = JSON.parse(savedToken);
    const now = Date.now() / 1000;
    
    // If token expires in less than 5 minutes or is already expired
    if (token.expires_at && (now + 300) >= token.expires_at) {
      console.log('Refreshing access token...');
      tokenClient.requestAccessToken({ prompt: 'none' });
      return true;
    }
    
    // Schedule next refresh
    const timeUntilRefresh = (token.expires_at * 1000) - Date.now() - TOKEN_REFRESH_BUFFER;
    if (timeUntilRefresh > 0) {
      setTimeout(() => refreshTokenIfNeeded(), timeUntilRefresh);
    }
    
    return true;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return false;
  }
}

// Initialize Google API client
async function initGoogleAuth() {
  try {
    // Load the Google API client library
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        gapi.load('client', {
          callback: resolve,
          onerror: reject,
          timeout: 5000,
          ontimeout: () => reject(new Error('Timeout loading Google API client'))
        });
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });

    // Initialize the Google API client with OAuth2
    await gapi.client.init({
      apiKey: '', // API key is optional if you're using OAuth 2.0
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', 'https://www.googleapis.com/discovery/v1/apis/oauth2/v2/rest']
    });
    
    // Load the OAuth2 library
    await gapi.client.load('oauth2', 'v2');
    gapiInited = true;

    // Load the Google Identity Services library
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    // Initialize the Google Identity Services client
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      prompt: 'consent', // Request consent for offline access
      include_granted_scopes: true, // Request incremental auth
      callback: async (tokenResponse) => {
        if (!tokenResponse) {
          console.log('No token response received');
          return;
        }
        
        if (tokenResponse.error) {
          console.error('Token error:', tokenResponse.error);
          if (tokenResponse.error !== 'popup_closed_by_user') {
            showToast('Failed to sign in to Google', 'error');
          }
          return;
        }
        
        try {
          // Calculate expiration time (extended session duration)
          const expiresIn = tokenResponse.expires_in || (7 * 24 * 60 * 60); // Default to 7 days if not provided
          const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
          
          // Store the token with expiration
          const tokenToStore = {
            ...tokenResponse,
            expires_at: expiresAt
          };
          
          localStorage.setItem('googleAuthToken', JSON.stringify(tokenToStore));
          
          // Set the token for API calls
          gapi.client.setToken(tokenResponse);
          
          // Update UI and start sync
          await updateCloudStatus();
          startAutoSync();
        } catch (e) {
          console.error('Error processing token:', e);
          localStorage.removeItem('googleAuthToken');
        }
      },
      error_callback: (error) => {
        console.error('Google Auth error:', error);
        if (error.result && error.result.error === 'popup_closed_by_user') {
          // User closed the popup, don't show error
          return;
        }
        localStorage.removeItem('googleAuthToken');
        if (error.error !== 'popup_closed_by_user') {
          showToast('Failed to sign in to Google', 'error');
        }
      }
    });
    
    // Check for existing valid token on page load
    try {
      const savedToken = localStorage.getItem('googleAuthToken');
      if (savedToken) {
        const token = JSON.parse(savedToken);
        const now = Date.now() / 1000;
        const isTokenValid = token.expires_at && (now < token.expires_at);
        
        if (isTokenValid) {
          // Set the token
          gapi.client.setToken(token);
          
          // Update UI immediately with stored token
          await updateCloudStatus();
          
          // Set up token refresh before it expires
          const timeUntilExpiry = (token.expires_at * 1000) - Date.now();
          if (timeUntilExpiry > 0) {
            const refreshTime = Math.max(timeUntilExpiry - TOKEN_REFRESH_BUFFER, 10000); // At least 10 seconds
            setTimeout(() => refreshTokenIfNeeded(), refreshTime);
          }
          
          return true;
        } else {
          // Token expired, remove it
          localStorage.removeItem('googleAuthToken');
        }
      }
    } catch (e) {
      console.error('Error checking saved token:', e);
      localStorage.removeItem('googleAuthToken');
    }
    
    gisInited = true;
    return true;
  } catch (error) {
    console.error('Error initializing Google Auth:', error);
    showToast('Failed to initialize Google Drive', 'error');
    return false;
  }
}

// Handle Google sign-in
async function handleGoogleSignIn() {
  const signInBtn = document.getElementById('connectGoogleDrive');
  
  try {
    if (signInBtn) {
      signInBtn.disabled = true;
      signInBtn.textContent = 'Signing in...';
    }
    
    if (!tokenClient) {
      const isInitialized = await initGoogleAuth();
      if (!isInitialized) {
        throw new Error('Failed to initialize Google Auth');
      }
    }
    
    // First try silent token refresh
    tokenClient.requestAccessToken({ prompt: 'none' });
    
    // Set a timeout to show the popup if silent refresh doesn't work
    const checkAuth = setInterval(async () => {
      if (gapi.client.getToken()) {
        clearInterval(checkAuth);
        if (signInBtn) {
          signInBtn.disabled = false;
          signInBtn.textContent = 'Connect Google Drive';
        }
      } else if (localStorage.getItem('googleAuthToken')) {
        // If we have a token but gapi doesn't know about it, try to set it
        try {
          const token = JSON.parse(localStorage.getItem('googleAuthToken'));
          if (token && token.access_token) {
            gapi.client.setToken(token);
            await updateCloudStatus();
            startAutoSync();
            clearInterval(checkAuth);
            if (signInBtn) {
              signInBtn.disabled = false;
              signInBtn.textContent = 'Connect Google Drive';
            }
          }
        } catch (e) {
          console.error('Error setting token from localStorage:', e);
        }
      }
    }, 500);
    
    // If we don't have a token after 1 second, show the popup
    setTimeout(() => {
      if (!gapi.client.getToken() && !localStorage.getItem('googleAuthToken')) {
        console.log('Silent refresh failed, showing sign-in popup');
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      }
    }, 1000);
    
  } catch (error) {
    console.error('Google sign-in error:', error);
    
    // Don't show error if user cancelled the sign-in
    if (error.error !== 'popup_closed_by_user') {
      showToast('Failed to sign in to Google. Please try again.', 'error');
    }
    
    // Make sure to update the UI state
    await updateCloudStatus();
    
    if (signInBtn) {
      signInBtn.disabled = false;
      signInBtn.textContent = 'Connect Google Drive';
    }
  }
}

// Handle Google sign-out
async function handleGoogleSignOut() {
  const signOutBtn = document.getElementById('disconnectGoogleDrive');
  const originalText = signOutBtn?.textContent;
  
  try {
    if (signOutBtn) {
      signOutBtn.disabled = true;
      signOutBtn.textContent = 'Signing out...';
    }
    
    // Revoke the token and clear stored data
    const token = gapi.client.getToken();
    if (token) {
      try {
        await google.accounts.oauth2.revoke(token.access_token);
      } catch (e) {
        console.warn('Error revoking token:', e);
      }
      gapi.client.setToken(null);
    }
    // Clear stored token
    localStorage.removeItem('googleAuthToken');
    
    // Update settings
    await Promise.all([
      setSetting('googleDriveEnabled', false),
      setSetting('googleDriveEmail', '')
    ]);
    
    // Stop any running syncs
    stopAutoSync();
    
    // Update UI
    updateCloudStatus();
    
    showToast('Successfully signed out from Google Drive', 'success');
  } catch (error) {
    console.error('Google sign-out error:', error);
    showToast('Failed to sign out from Google Drive. Please try again.', 'error');
  } finally {
    if (signOutBtn) {
      signOutBtn.disabled = false;
      signOutBtn.textContent = originalText;
    }
  }
}

// Start auto-sync interval
async function startAutoSync() {
  // Initialize the sync service
  await initSyncService();
  
  // Register our sync handler
  onSync(syncToGoogleDrive);
  
  // Set up change detection polling
  setupChangeDetection();
  
  console.log('Auto-sync started');
}

// Handle page unload
function handleBeforeUnload() {
  // Force a sync if it's been a while since the last one
  const lastSync = localStorage.getItem('lastSyncTime');
  if (lastSync) {
    const timeSinceLastSync = Date.now() - new Date(lastSync).getTime();
    if (timeSinceLastSync >= SYNC_INTERVAL / 2) { // If it's been more than half the interval
      // Use sendBeacon for reliable sync on page unload
      const syncData = new FormData();
      syncData.append('lastSyncTime', new Date().toISOString());
      navigator.sendBeacon('/sync', syncData);
    }
  }
}

// Set up change detection polling
async function setupChangeDetection() {
  try {
    // Get the initial sync token if we don't have one
    if (!lastSyncToken) {
      const response = await gapi.client.drive.changes.getStartPageToken();
      lastSyncToken = response.result.startPageToken;
    }
    
    // Start polling for changes every 2 minutes
    setInterval(checkForChanges, 2 * 60 * 1000);
  } catch (error) {
    console.error('Error setting up change detection:', error);
    // Retry after a delay
    setTimeout(setupChangeDetection, 60000);
  }
}

// Check for remote changes
async function checkForChanges() {
  if (!lastSyncToken) return;
  
  try {
    const response = await gapi.client.drive.changes.list({
      pageToken: lastSyncToken,
      spaces: 'drive',
      fields: 'newStartPageToken, changes(file(id, name, modifiedTime, trashed))',
      includeItemsFromAllDrives: false,
      supportsAllDrives: false
    });
    
    // Update the sync token for the next request
    lastSyncToken = response.result.newStartPageToken;
    
    // If there are changes, trigger a sync
    if (response.result.changes && response.result.changes.length > 0) {
      console.log('Detected remote changes, syncing...');
      syncToGoogleDrive();
    }
  } catch (error) {
    console.error('Error checking for changes:', error);
    // If the token is invalid, get a new one
    if (error.status === 404) {
      const response = await gapi.client.drive.changes.getStartPageToken();
      lastSyncToken = response.result.startPageToken;
    }
  }
}

// Stop auto-sync interval
function stopAutoSync() {
  // The sync service handles its own cleanup
  console.log('Auto-sync stopped');
}

// Sync documents to Google Drive
async function syncToGoogleDrive(forceFullSync = false) {
  const syncNowBtn = document.getElementById('syncNow');
  let lastSync = await getSetting('lastSyncTime', 0);
  const now = Date.now();

  // Skip if we synced recently (unless forced)
  if (!forceFullSync && lastSync && (now - new Date(lastSync).getTime()) < 10000) {
    console.log('Skipping sync - too soon since last sync');
    return;
  }

  // Update last sync time (pre-emptive, matches previous behavior)
  lastSync = now;
  await setSetting('lastSyncTime', lastSync);

  try {
    if (syncNowBtn) {
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = 'Syncing...';
    }

    // Ensure we're signed in
    const token = gapi.client?.getToken();
    if (!token) {
      await handleGoogleSignIn();
      if (!gapi.client?.getToken()) {
        throw new Error('Please sign in to Google Drive to sync');
      }
    }

    // Get or create BuddyDocs app folder (unchanged)
    const folderId = await getOrCreateAppFolder();

    // Helper: find documents.json in BuddyDocs folder
    async function getDocumentsJsonFile() {
      const resp = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and trashed=false and name='documents.json' and mimeType='application/json'`,
        fields: 'files(id, name, modifiedTime)',
        pageSize: 1
      });
      if (resp.result.files && resp.result.files.length > 0) {
        const f = resp.result.files[0];
        return { id: f.id, modifiedTime: f.modifiedTime };
      }
      return { id: null, modifiedTime: null };
    }

    // Helper: download JSON file body
    async function downloadDocumentsJson(fileId) {
      if (!fileId) return null;
      const accessToken = gapi.client.getToken().access_token;
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
      if (!res.ok) throw new Error('Failed to download documents.json');
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn('documents.json parse error, using empty set', e);
        return null;
      }
    }

    // Helper: upload (create or patch) documents.json with multipart
    async function uploadDocumentsJson(jsonString, existingFileId) {
      const accessToken = gapi.client.getToken().access_token;
      const metadata = existingFileId
        ? {
            name: 'documents.json',
            mimeType: 'application/json',
            appProperties: { version: '1.0', type: 'bundle' }
          }
        : {
            name: 'documents.json',
            mimeType: 'application/json',
            parents: [folderId],
            appProperties: { version: '1.0', type: 'bundle' }
          };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([jsonString], { type: 'application/json' }));
      const url = existingFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,webViewLink`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
      const method = existingFileId ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: new Headers({ Authorization: 'Bearer ' + accessToken }),
        body: form
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload documents.json failed:', errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      const fileData = await response.json();
      return fileData.id;
    }

    // Helper: normalize and timestamp handling
    const toTime = (t) => {
      if (!t) return 0;
      if (typeof t === 'number') return t;
      const d = new Date(t).getTime();
      return Number.isFinite(d) ? d : 0;
    };
    const normalizeDoc = (doc) => {
      // Preserve common fields
      const base = {
        id: doc.id,
        type: doc.type || 'document',
        title: doc.title || 'Untitled Document',
        createdAt: doc.createdAt || new Date().toISOString(),
        updatedAt: doc.updatedAt || new Date().toISOString(),
        tags: Array.isArray(doc.tags) ? doc.tags : [],
        archived: !!doc.archived,
        starred: !!doc.starred,
        color: doc.color || '',
        dueDate: doc.dueDate || null,
        locked: !!doc.locked,
        completed: !!doc.completed,
        folderId: typeof doc.folderId === 'string' ? doc.folderId : null
      };

      // Preserve per-document settings and viewport (used by boards and others)
      if (doc.settings && typeof doc.settings === 'object') {
        base.settings = doc.settings;
      }
      if (doc.viewport && typeof doc.viewport === 'object') {
        base.viewport = {
          scrollLeft: Number(doc.viewport.scrollLeft) || 0,
          scrollTop: Number(doc.viewport.scrollTop) || 0
        };
      }

      // Preserve type-specific fields
      if (base.type === 'presentation') {
        base.slides = Array.isArray(doc.slides) ? doc.slides : [];
        base.currentSlideIndex = typeof doc.currentSlideIndex === 'number' ? doc.currentSlideIndex : 0;
      } else if (base.type === 'gallery') {
        base.content = Array.isArray(doc.content) ? doc.content : [];
        base.thumbnailSrc = doc.thumbnailSrc || '';
      } else if (base.type === 'math') {
        base.data = Array.isArray(doc.data) ? doc.data : [];
      } else {
        // Standard document, essay, etc.
        base.pages = Array.isArray(doc.pages) ? doc.pages : [];
        base.content = typeof doc.content === 'string'
          ? doc.content
          : (Array.isArray(base.pages) && base.pages.length > 0 && base.pages[0]?.content ? base.pages[0].content : '');
      }

      // Preserve version history snapshots for cross-device Activity stats and restores
      if (Array.isArray(doc.versions)) {
        base.versions = doc.versions;
      }

      return base;
    };

    function mergeByUpdatedAt(localDocs, remoteDocs) {
      const map = new Map();
      for (const r of (remoteDocs || [])) {
        if (!r || !r.id) continue;
        map.set(r.id, normalizeDoc(r));
      }
      for (const l of (localDocs || [])) {
        if (!l || !l.id) continue;
        const cur = map.get(l.id);
        if (!cur) {
          map.set(l.id, normalizeDoc(l));
        } else {
          const lt = toTime(l.updatedAt);
          const rt = toTime(cur.updatedAt);
          map.set(l.id, lt >= rt ? normalizeDoc(l) : cur);
        }
      }
      return Array.from(map.values());
    }

    async function updateLocalFromRemote(mergedDocs, localDocs, tombstoneIds = []) {
      const localMap = new Map((localDocs || []).map(d => [d.id, d]));
      const ops = [];
      for (const doc of mergedDocs) {
        // Skip if this doc was explicitly deleted locally (tombstoned)
        if (Array.isArray(tombstoneIds) && tombstoneIds.includes(doc.id)) continue;
        const l = localMap.get(doc.id);
        if (!l || toTime(l.updatedAt) < toTime(doc.updatedAt)) {
          ops.push(saveDocument(doc));
        }
      }
      if (ops.length) await Promise.allSettled(ops);
    }

    // 1) Load local docs
    const localDocs = await listDocuments({ includeArchived: true });

    // 2) Load remote documents.json (if exists)
    const { id: documentsJsonId, modifiedTime: remoteModTimeA } = await getDocumentsJsonFile();
    let remoteBundle = await downloadDocumentsJson(documentsJsonId);
    let remoteDocs = Array.isArray(remoteBundle?.documents) ? remoteBundle.documents : [];

    // 3) Merge
    const mergedDocs = mergeByUpdatedAt(localDocs, remoteDocs);

    // 4) Update local from remote newer versions
    const locallyDeletedDocIds = await getSetting('locallyDeletedDocIds', []);
    await updateLocalFromRemote(mergedDocs, localDocs, Array.isArray(locallyDeletedDocIds) ? locallyDeletedDocIds : []);

    // 5) Double-check concurrency: if remote changed since we read it, re-fetch and re-merge
    if (documentsJsonId) {
      try {
        const latestMeta = await gapi.client.drive.files.get({ fileId: documentsJsonId, fields: 'id, modifiedTime' });
        const remoteModTimeB = latestMeta.result.modifiedTime;
        if (remoteModTimeA && remoteModTimeB && remoteModTimeA !== remoteModTimeB) {
          const latestBundle = await downloadDocumentsJson(documentsJsonId);
          const latestDocs = Array.isArray(latestBundle?.documents) ? latestBundle.documents : [];
          const remerged = mergeByUpdatedAt(mergedDocs, latestDocs);
          // Also update local after remerge to avoid losing concurrent updates
          await updateLocalFromRemote(remerged, mergedDocs, Array.isArray(locallyDeletedDocIds) ? locallyDeletedDocIds : []);
          // Replace mergedDocs
          mergedDocs.splice(0, mergedDocs.length, ...remerged);
        }
      } catch (e) {
        console.warn('Concurrency check failed, proceeding with current merge', e);
      }
    }

    // 6) Upload merged bundle to documents.json
    const cloudExcludedDocIds = await getSetting('cloudExcludedDocIds', []);
    const filteredDocs = Array.isArray(cloudExcludedDocIds) && cloudExcludedDocIds.length
      ? mergedDocs.filter(d => !cloudExcludedDocIds.includes(d.id))
      : mergedDocs;
    const bundle = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      documents: filteredDocs
    };
    const jsonString = JSON.stringify(bundle, null, 2);
    const finalFileId = await uploadDocumentsJson(jsonString, documentsJsonId);

    // ===== Folders Sync (folders.json) =====
    // Helper: find folders.json in BuddyDocs folder
    async function getFoldersJsonFile() {
      const resp = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and trashed=false and name='folders.json' and mimeType='application/json'`,
        fields: 'files(id, name, modifiedTime)',
        pageSize: 1
      });
      if (resp.result.files && resp.result.files.length > 0) {
        const f = resp.result.files[0];
        return { id: f.id, modifiedTime: f.modifiedTime };
      }
      return { id: null, modifiedTime: null };
    }

    async function downloadFoldersJson(fileId) {
      if (!fileId) return null;
      const accessToken = gapi.client.getToken().access_token;
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
      if (!res.ok) throw new Error('Failed to download folders.json');
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn('folders.json parse error, using empty set', e);
        return null;
      }
    }

    async function uploadFoldersJson(jsonString, existingFileId) {
      const accessToken = gapi.client.getToken().access_token;
      const metadata = existingFileId
        ? { name: 'folders.json', mimeType: 'application/json', appProperties: { version: '1.0', type: 'bundle' } }
        : { name: 'folders.json', mimeType: 'application/json', parents: [folderId], appProperties: { version: '1.0', type: 'bundle' } };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([jsonString], { type: 'application/json' }));
      const url = existingFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,webViewLink`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
      const method = existingFileId ? 'PATCH' : 'POST';
      const response = await fetch(url, { method, headers: new Headers({ Authorization: 'Bearer ' + accessToken }), body: form });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload folders.json failed:', errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      const fileData = await response.json();
      return fileData.id;
    }

    const normalizeFolder = (f) => ({
      id: f.id,
      name: f.name || 'Untitled Folder',
      color: f.color || 'blue',
      emoji: f.emoji || '📁',
      parentId: typeof f.parentId === 'string' ? f.parentId : null,
      updatedAt: f.updatedAt || Date.now(),
      // Preserve thumbnail settings
      thumbnailType: f.thumbnailType === 'image' ? 'image' : 'emoji',
      thumbnailImage: f.thumbnailType === 'image' && typeof f.thumbnailImage === 'string' ? f.thumbnailImage : null
    });

    function mergeFoldersByUpdatedAt(localFolders, remoteFolders) {
      const map = new Map();
      for (const r of (remoteFolders || [])) {
        if (!r || !r.id) continue;
        map.set(r.id, normalizeFolder(r));
      }
      for (const l of (localFolders || [])) {
        if (!l || !l.id) continue;
        const cur = map.get(l.id);
        if (!cur) {
          map.set(l.id, normalizeFolder(l));
        } else {
          const lt = toTime(l.updatedAt);
          const rt = toTime(cur.updatedAt);
          map.set(l.id, lt >= rt ? normalizeFolder(l) : cur);
        }
      }
      return Array.from(map.values());
    }

    async function listAllLocalFolders() {
      const store = await tx(STORES.folders, 'readonly');
      const all = await new Promise((resolve) => {
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => resolve([]);
      });
      return all;
    }

    async function updateLocalFoldersFromRemote(mergedFolders, localFolders) {
      const localMap = new Map((localFolders || []).map(f => [f.id, f]));
      const ops = [];
      for (const f of mergedFolders) {
        const l = localMap.get(f.id);
        if (!l || toTime(l.updatedAt) < toTime(f.updatedAt)) {
          ops.push(saveFolder(f));
        }
      }
      if (ops.length) await Promise.allSettled(ops);
    }

    const { id: foldersJsonId, modifiedTime: remoteFoldersModA } = await getFoldersJsonFile();
    let remoteFoldersBundle = await downloadFoldersJson(foldersJsonId);
    let remoteFolders = Array.isArray(remoteFoldersBundle?.folders) ? remoteFoldersBundle.folders : [];

    const localFolders = await listAllLocalFolders();
    const mergedFolders = mergeFoldersByUpdatedAt(localFolders, remoteFolders);
    await updateLocalFoldersFromRemote(mergedFolders, localFolders);

    // Concurrency re-check for folders
    if (foldersJsonId) {
      try {
        const latestMeta = await gapi.client.drive.files.get({ fileId: foldersJsonId, fields: 'id, modifiedTime' });
        const remoteFoldersModB = latestMeta.result.modifiedTime;
        if (remoteFoldersModA && remoteFoldersModB && remoteFoldersModA !== remoteFoldersModB) {
          const latestBundle = await downloadFoldersJson(foldersJsonId);
          const latestFolders = Array.isArray(latestBundle?.folders) ? latestBundle.folders : [];
          const remerged = mergeFoldersByUpdatedAt(mergedFolders, latestFolders);
          await updateLocalFoldersFromRemote(remerged, mergedFolders);
          mergedFolders.splice(0, mergedFolders.length, ...remerged);
        }
      } catch (e) {
        console.warn('Folders concurrency check failed, proceeding with current merge', e);
      }
    }

    const foldersBundle = { version: 1, lastUpdated: new Date().toISOString(), folders: mergedFolders };
    const foldersJsonString = JSON.stringify(foldersBundle, null, 2);
    await uploadFoldersJson(foldersJsonString, foldersJsonId);

    // ===== Settings Sync (settings.json) =====
    async function getSettingsJsonFile() {
      const resp = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and trashed=false and name='settings.json' and mimeType='application/json'`,
        fields: 'files(id, name, modifiedTime)',
        pageSize: 1
      });
      if (resp.result.files && resp.result.files.length > 0) {
        const f = resp.result.files[0];
        return { id: f.id, modifiedTime: f.modifiedTime };
      }
      return { id: null, modifiedTime: null };
    }

    async function downloadSettingsJson(fileId) {
      if (!fileId) return null;
      const accessToken = gapi.client.getToken().access_token;
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
      if (!res.ok) throw new Error('Failed to download settings.json');
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn('settings.json parse error, using empty set', e);
        return null;
      }
    }

    async function uploadSettingsJson(jsonString, existingFileId) {
      const accessToken = gapi.client.getToken().access_token;
      const metadata = existingFileId
        ? { name: 'settings.json', mimeType: 'application/json', appProperties: { version: '1.0', type: 'bundle' } }
        : { name: 'settings.json', mimeType: 'application/json', parents: [folderId], appProperties: { version: '1.0', type: 'bundle' } };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([jsonString], { type: 'application/json' }));
      const url = existingFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,webViewLink`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
      const method = existingFileId ? 'PATCH' : 'POST';
      const response = await fetch(url, { method, headers: new Headers({ Authorization: 'Bearer ' + accessToken }), body: form });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload settings.json failed:', errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      const fileData = await response.json();
      return fileData.id;
    }

    // Read all local settings
    const settingsStore = await tx(STORES.settings, 'readonly');
    const localSettingsArr = await new Promise((resolve) => {
      const r = settingsStore.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([]);
    });
    const localSettings = new Map(localSettingsArr.map(s => [s.key, s.value]));

    const { id: settingsJsonId, modifiedTime: remoteSettingsModA } = await getSettingsJsonFile();
    let remoteSettingsBundle = await downloadSettingsJson(settingsJsonId);
    let remoteSettingsMap = new Map(Object.entries(remoteSettingsBundle?.settings || {}));

    // Determine which side wins based on lastUpdated timestamps
    const localLastUpdated = localSettings.get('settingsLastUpdated') || null;
    const remoteLastUpdated = remoteSettingsBundle?.lastUpdated || null;

    let mergedSettings;
    function addMissing(fromMap, toMap) {
      for (const [k, v] of fromMap.entries()) {
        if (!toMap.has(k)) toMap.set(k, v);
      }
    }

    if (remoteLastUpdated && localLastUpdated) {
      if (new Date(remoteLastUpdated) > new Date(localLastUpdated)) {
        // Remote newer -> take remote, add local-only keys
        mergedSettings = new Map(remoteSettingsMap);
        addMissing(localSettings, mergedSettings);
      } else {
        // Local newer -> take local, add remote-only keys
        mergedSettings = new Map(localSettings);
        addMissing(remoteSettingsMap, mergedSettings);
      }
    } else if (remoteLastUpdated && !localLastUpdated) {
      // Only remote has timestamp
      mergedSettings = new Map(remoteSettingsMap);
      addMissing(localSettings, mergedSettings);
    } else {
      // Fallback: prefer local
      mergedSettings = new Map(localSettings);
      addMissing(remoteSettingsMap, mergedSettings);
    }

    // Apply merged settings locally
    for (const [k, v] of mergedSettings.entries()) {
      try { await setSetting(k, v); } catch (e) { console.warn('Failed to set setting', k, e); }
    }

    // Concurrency check for settings
    if (settingsJsonId) {
      try {
        const latestMeta = await gapi.client.drive.files.get({ fileId: settingsJsonId, fields: 'id, modifiedTime' });
        const remoteSettingsModB = latestMeta.result.modifiedTime;
        if (remoteSettingsModA && remoteSettingsModB && remoteSettingsModA !== remoteSettingsModB) {
          const latestBundle = await downloadSettingsJson(settingsJsonId);
          const latestMap = new Map(Object.entries(latestBundle?.settings || {}));
          const latestLastUpdated = latestBundle?.lastUpdated || null;
          if (latestLastUpdated && localLastUpdated && new Date(latestLastUpdated) > new Date(localLastUpdated)) {
            // Remote changed since start and is newer -> re-merge favoring remote
            mergedSettings = new Map(latestMap);
            addMissing(localSettings, mergedSettings);
            for (const [k, v] of mergedSettings.entries()) {
              try { await setSetting(k, v); } catch (e) {}
            }
            // Update local lastUpdated to reflect remote takeover
            try { await setSetting('settingsLastUpdated', latestLastUpdated); } catch (_) {}
          }
        }
      } catch (e) {
        console.warn('Settings concurrency check failed', e);
      }
    }

    // Persist merged settings to Drive, bumping lastUpdated now
    const nowIsoForSettings = new Date().toISOString();
    try { await setSetting('settingsLastUpdated', nowIsoForSettings); } catch (_) {}
    const settingsBundle = { version: 1, lastUpdated: nowIsoForSettings, settings: Object.fromEntries(mergedSettings) };
    const settingsJsonString = JSON.stringify(settingsBundle, null, 2);
    await uploadSettingsJson(settingsJsonString, settingsJsonId);

    // UI updates
    updateLastSyncTime();
    updateStorageUsage();
    updateSyncCountdown();

    try {
      const response = await gapi.client.drive.changes.getStartPageToken();
      lastSyncToken = response.result.startPageToken;
    } catch (error) {
      console.error('Error updating sync token:', error);
    }

    showToast('Sync completed successfully', 'success');

    if (typeof loadDocuments === 'function') {
      loadDocuments();
    }
  } catch (error) {
    console.error('Sync error:', error);
    showToast('Sync failed: ' + (error.message || 'Unknown error'), 'error');
  } finally {
    if (syncNowBtn) {
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = 'Sync Now';
    }
  }
}

// Helper function to get or create app folder
async function getOrCreateAppFolder() {
  try {
    // Try to find existing folder
    const response = await gapi.client.drive.files.list({
      q: "name='BuddyDocs' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)'
    });
    
    if (response.result.files.length > 0) {
      return response.result.files[0].id;
    }
    
    // Create new folder if not found
    const folder = await gapi.client.drive.files.create({
      resource: {
        name: 'BuddyDocs',
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id'
    });
    
    return folder.result.id;
  } catch (error) {
    console.error('Error getting/creating app folder:', error);
    throw error;
  }
}

// Helper function to upload file with proper multipart handling
async function uploadFileToDrive(fileContent, fileName, folderId, docId) {
  const accessToken = gapi.client.getToken().access_token;
  const now = new Date().toISOString();
  
  // 1. Define the file metadata
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [folderId],
    properties: {
      app: 'BuddyDocs',
      docId: docId,
      updatedAt: now,
      archived: 'false',
      starred: 'false'
    },
    appProperties: {
      version: '1.0',
      type: 'buddydoc',
      created: now
    }
  };

  // 2. Check if file exists
  let existingFileId = null;
  try {
    const response = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed=false and appProperties has { key='docId' and value='${docId}' }`,
      fields: 'files(id, name)',
      pageSize: 1
    });
    
    if (response.result.files && response.result.files.length > 0) {
      existingFileId = response.result.files[0].id;
    }
  } catch (e) {
    console.warn('Error checking for existing file:', e);
  }

  // 3. Create the FormData for the multipart upload
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileContent], { type: 'application/json' }));

  // 4. Determine the endpoint and method
  const url = existingFileId 
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
  const method = existingFileId ? 'PATCH' : 'POST';

  // 5. Send the request
  const response = await fetch(url, {
    method: method,
    headers: new Headers({
      'Authorization': 'Bearer ' + accessToken
    }),
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Upload failed:', errorText);
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }

  const fileData = await response.json();
  return fileData.id;
}

// Save document to Google Drive
async function saveToGoogleDrive(folderId, doc) {
  if (!doc || !doc.id) {
    console.error('Invalid document:', doc);
    return null;
  }
  
  // Create a clean document object that preserves type-specific fields
  const docToSave = (() => {
    const base = {
      id: doc.id,
      type: doc.type || 'document',
      title: doc.title || 'Untitled Document',
      createdAt: doc.createdAt || new Date().toISOString(),
      updatedAt: doc.updatedAt || new Date().toISOString(),
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      archived: !!doc.archived,
      starred: !!doc.starred,
      color: doc.color || '',
      dueDate: doc.dueDate || null,
      locked: !!doc.locked,
      completed: !!doc.completed,
      folderId: typeof doc.folderId === 'string' ? doc.folderId : null
    };

    // Preserve per-document settings and viewport (used by boards and others)
    if (doc.settings && typeof doc.settings === 'object') {
      base.settings = doc.settings;
    }
    if (doc.viewport && typeof doc.viewport === 'object') {
      base.viewport = {
        scrollLeft: Number(doc.viewport.scrollLeft) || 0,
        scrollTop: Number(doc.viewport.scrollTop) || 0
      };
    }

    if (base.type === 'presentation') {
      base.slides = Array.isArray(doc.slides) ? doc.slides : [];
      base.currentSlideIndex = typeof doc.currentSlideIndex === 'number' ? doc.currentSlideIndex : 0;
    } else if (base.type === 'gallery') {
      base.content = Array.isArray(doc.content) ? doc.content : [];
      base.thumbnailSrc = doc.thumbnailSrc || '';
    } else if (base.type === 'math') {
      base.data = Array.isArray(doc.data) ? doc.data : [];
    } else {
      base.pages = Array.isArray(doc.pages) ? doc.pages : [];
      base.content = typeof doc.content === 'string'
        ? doc.content
        : (Array.isArray(base.pages) && base.pages.length > 0 && base.pages[0]?.content ? base.pages[0].content : '');
    }

    // Include version history if present
    if (Array.isArray(doc.versions)) {
      base.versions = doc.versions;
    }

    return base;
  })();
  
  const fileName = `${docToSave.title}.buddydoc`;
  const fileContent = JSON.stringify(docToSave, null, 2);
  
  try {
    // Use the new upload function
    const fileId = await uploadFileToDrive(fileContent, fileName, folderId, docToSave.id);
    console.log('File saved to Google Drive:', fileId);
    return fileId;
  } catch (error) {
    console.error('Error saving to Google Drive:', error);
    throw error;
  }
}

// Update cloud status UI
async function updateCloudStatus() {
  const statusElement = document.getElementById('cloudStatus');
  const connectBtn = document.getElementById('connectGoogleDrive');
  const disconnectBtn = document.getElementById('disconnectGoogleDrive');
  const syncNowBtn = document.getElementById('syncNow');
  const autoSyncCheckbox = document.getElementById('autoSync');
  
  if (!statusElement) return;
  
  const token = gapi.client?.getToken();
  const isSignedIn = !!token;
  
  if (isSignedIn) {
    try {
      // Get user info using the token
      const token = gapi.client.getToken();
      let email = 'user@example.com'; // Default fallback
      
      try {
        // Try to get email from the token if available
        const tokenInfo = await gapi.client.oauth2.tokeninfo({
          access_token: token.access_token
        });
        email = tokenInfo.result.email || email;
      } catch (tokenError) {
        console.warn('Could not get user email from token:', tokenError);
        // Fall back to stored email if available
        email = await getSetting('googleDriveEmail', email);
      }
      
      // Update status and UI
      statusElement.textContent = `Connected as ${email}`;
      statusElement.className = 'status-text connected';
      
      // Store the email for future use
      await setSetting('googleDriveEmail', email);
      await setSetting('googleDriveEnabled', true);
      
      // Toggle UI elements
      if (connectBtn) connectBtn.style.display = 'none';
      if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
      if (syncNowBtn) syncNowBtn.disabled = false;
      if (autoSyncCheckbox) autoSyncCheckbox.disabled = false;
      
      // Update last sync time and storage usage
      updateLastSyncTime();
      updateStorageUsage();
      
    } catch (error) {
      console.error('Error getting user info:', error);
      statusElement.textContent = 'Connected (error getting user info)';
      statusElement.className = 'status-text error';
    }
  } else {
    // Not signed in state
    statusElement.textContent = 'Not connected to Google Drive';
    statusElement.className = 'status-text';
    
    // Update settings
    await setSetting('googleDriveEnabled', false);
    
    // Toggle UI elements
    if (connectBtn) {
      connectBtn.style.display = 'inline-block';
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect Google Drive';
    }
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (syncNowBtn) syncNowBtn.disabled = true;
    if (autoSyncCheckbox) autoSyncCheckbox.disabled = true;
  }
  
  // Update the sync button text based on state
  if (syncNowBtn) {
    syncNowBtn.textContent = 'Sync Now';
    syncNowBtn.disabled = false;
  }
}

// Update last sync time display
async function updateLastSyncTime() {
  const lastSyncTime = await getSetting('lastSyncTime');
  const lastSyncElement = document.getElementById('lastSyncTime');
  
  if (lastSyncTime && lastSyncElement) {
    const date = new Date(lastSyncTime);
    lastSyncElement.textContent = date.toLocaleString();
  } else if (lastSyncElement) {
    lastSyncElement.textContent = 'Never';
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Remove any existing toasts
  const existingToasts = document.querySelectorAll('.toast');
  if (existingToasts.length > 3) {
    existingToasts[0].remove();
  }
  
  // Show the toast
  setTimeout(() => {
    toast.classList.add('show');
    
    // Hide and remove the toast after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }, 100);
}

// Calculate total size of all synced documents
async function calculateAppStorageUsage() {
  const documents = await listDocuments();
  return documents.reduce((total, doc) => {
    // Estimate size by converting to JSON string
    return total + (JSON.stringify(doc).length || 0);
  }, 0);
}

// Update storage usage display for BuddyDocs
async function updateStorageUsage() {
  const storageUsedElement = document.getElementById('storageUsed');
  const storageTotalElement = document.getElementById('storageTotal');
  const storageBar = document.querySelector('.storage-bar .storage-used');
  
  if (!storageUsedElement || !storageTotalElement || !storageBar) {
    return;
  }
  
  try {
    // Calculate app's storage usage
    const appUsage = await calculateAppStorageUsage();
    const appLimit = STORAGE_LIMIT; // 1GB limit for BuddyDocs
    const usagePercent = Math.min(Math.round((appUsage / appLimit) * 100), 100);
    
    // Update UI
    storageUsedElement.textContent = formatFileSize(appUsage);
    storageTotalElement.textContent = formatFileSize(appLimit);
    storageBar.style.width = `${usagePercent}%`;
    
    // Update storage bar color based on usage
    storageBar.className = 'storage-used';
    if (usagePercent > 90) {
      storageBar.classList.add('danger');
    } else if (usagePercent > 70) {
      storageBar.classList.add('warning');
    }
    
  } catch (error) {
    console.error('Error updating storage usage:', error);
  }
}

// Initialize cloud tab
export async function initCloudTab() {
  try {
    // Add event listeners first so they're available immediately
    document.getElementById('connectGoogleDrive')?.addEventListener('click', handleGoogleSignIn);
    document.getElementById('disconnectGoogleDrive')?.addEventListener('click', handleGoogleSignOut);
    document.getElementById('syncNow')?.addEventListener('click', syncToGoogleDrive);
    
    // Show loading state
    const statusElement = document.getElementById('cloudStatus');
    if (statusElement) {
      statusElement.textContent = 'Initializing...';
      statusElement.className = 'status-text';
    }
    
    // Initialize Google Auth
    const isInitialized = await initGoogleAuth();
    
    if (!isInitialized) {
      // Show error state in UI
      if (statusElement) {
        statusElement.textContent = 'Failed to initialize Google Drive';
        statusElement.className = 'status-text error';
      }
      return;
    }
    
    // Check if we have a valid token in localStorage
    const savedToken = localStorage.getItem('googleAuthToken');
    if (savedToken) {
      try {
        const token = JSON.parse(savedToken);
        if (token.expires_at && (Date.now() / 1000 < (token.expires_at - 300))) {
          gapi.client.setToken(token);
          // Don't await this to make the UI more responsive
          updateCloudStatus().then(() => {
            // Start auto-sync in the background
            if (gapi.client.getToken()) {
              syncToGoogleDrive().catch(console.error);
              startAutoSync();
            }
          });
          return;
        }
      } catch (e) {
        console.error('Error initializing with saved token:', e);
        localStorage.removeItem('googleAuthToken');
      }
    }
    
    // If we get here, either no token or it's invalid
    await updateCloudStatus();
    
  } catch (error) {
    console.error('Error initializing cloud tab:', error);
    showToast('Failed to initialize cloud features', 'error');
    
    const statusElement = document.getElementById('cloudStatus');
    if (statusElement) {
      statusElement.textContent = 'Initialization failed';
      statusElement.className = 'status-text error';
    }
  }
}

// Exported helper to check cloud connectivity
export function isCloudConnected() {
  try {
    // Prefer gapi token if available
    const hasGapiToken = !!(gapi.client?.getToken());
    if (hasGapiToken) return true;
    // Fallbacks: stored token or setting
    try {
      const stored = localStorage.getItem('googleAuthToken');
      if (stored) {
        const token = JSON.parse(stored);
        const now = Date.now() / 1000;
        if (token?.expires_at && now < token.expires_at) return true;
      }
    } catch {}
    return false;
  } catch {
    return false;
  }
}

// Remove a single document from the remote documents.json bundle
export async function removeDocumentFromCloud(docId) {
  if (!docId) return;
  let token = null;
  try { token = gapi.client?.getToken(); } catch {}
  // If gapi isn't initialized yet, try to initialize quickly
  if (!token) {
    try {
      await initGoogleAuth();
      token = gapi.client?.getToken();
      if (!token) {
        const saved = localStorage.getItem('googleAuthToken');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.access_token) {
            gapi.client.setToken(parsed);
            token = parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to init Google Auth for cloud removal', e);
    }
  }
  if (!token) throw new Error('Not connected to Google Drive');

  // Ensure app folder exists
  const folderId = await getOrCreateAppFolder();

  // Find documents.json in the app folder
  const listResp = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false and name='documents.json' and mimeType='application/json'`,
    fields: 'files(id, name, modifiedTime)',
    pageSize: 1
  });
  const fileEntry = (listResp.result.files && listResp.result.files[0]) ? listResp.result.files[0] : null;
  if (!fileEntry) {
    // Nothing to remove yet; create an empty bundle without the doc
    const emptyBundle = { version: 1, lastUpdated: new Date().toISOString(), documents: [] };
    const jsonString = JSON.stringify(emptyBundle, null, 2);
    const accessToken = gapi.client.getToken().access_token;
    const metadata = {
      name: 'documents.json',
      mimeType: 'application/json',
      parents: [folderId],
      appProperties: { version: '1.0', type: 'bundle' }
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonString], { type: 'application/json' }));
    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
    const response = await fetch(uploadUrl, { method: 'POST', headers: new Headers({ Authorization: 'Bearer ' + accessToken }), body: form });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create documents.json: ${errorText}`);
    }
    return;
  }

  // Download the current bundle
  const accessToken = gapi.client.getToken().access_token;
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileEntry.id}?alt=media`;
  const res = await fetch(downloadUrl, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!res.ok) throw new Error('Failed to download documents.json');
  const text = await res.text();
  let bundle = null;
  try { bundle = JSON.parse(text); } catch { bundle = null; }
  const docs = Array.isArray(bundle?.documents) ? bundle.documents : [];

  // Filter out the requested docId
  const updatedDocs = docs.filter(d => d && d.id !== docId);
  const newBundle = { version: 1, lastUpdated: new Date().toISOString(), documents: updatedDocs };
  const payload = JSON.stringify(newBundle, null, 2);

  // Upload back (PATCH)
  const metadata = {
    name: 'documents.json',
    mimeType: 'application/json',
    appProperties: { version: '1.0', type: 'bundle' }
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([payload], { type: 'application/json' }));
  const patchUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileEntry.id}?uploadType=multipart&fields=id,name,webViewLink`;
  const uploadResp = await fetch(patchUrl, { method: 'PATCH', headers: new Headers({ Authorization: 'Bearer ' + accessToken }), body: form });
  if (!uploadResp.ok) {
    const errorText = await uploadResp.text();
    throw new Error(`Failed to update documents.json: ${errorText}`);
  }
}

// Initialize cloud on index page: load Google APIs, set token from storage if present, update UI and start auto-sync
export async function initCloudOnIndex() {
  try {
    const initialized = await initGoogleAuth();
    if (!initialized) return false;
    // If we have a saved token and gapi has none, set it
    const hasToken = !!(gapi.client?.getToken());
    if (!hasToken) {
      const saved = localStorage.getItem('googleAuthToken');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed?.access_token) gapi.client.setToken(parsed);
        } catch {}
      }
    }
    await updateCloudStatus();
    startAutoSync();
    return true;
  } catch (e) {
    console.error('initCloudOnIndex failed:', e);
    return false;
  }
}
