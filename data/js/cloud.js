// Import required functions from idb.js
import { getSetting, setSetting, listDocuments, saveDocument, deleteDocument } from './idb.js';
import { initSyncService, onSync, updateSyncCountdown } from './syncService.js';

// Google Drive API Configuration
const GOOGLE_CLIENT_ID = '843640373447-4v9vbpn0nhtallnmkrua34msqgm25j9d.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
const SYNC_INTERVAL = 8 * 60 * 1000; // 8 minutes in milliseconds
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes before token expires
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes
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
  
  // Update last sync time
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
      // Try to sign in if not already signed in
      await handleGoogleSignIn();
      if (!gapi.client?.getToken()) {
        throw new Error('Please sign in to Google Drive to sync');
      }
    }
    
    // Get or create app folder
    const folderId = await getOrCreateAppFolder();
    
    // Get all local documents (including archived ones for complete sync)
    const documents = await listDocuments({ includeArchived: true });
    
    // First, get all existing files in the folder to track what needs to be deleted
    let allFiles = [];
    let pageToken = '';
    
    do {
      const params = {
        q: `'${folderId}' in parents and trashed=false and mimeType='application/json'`,
        fields: 'nextPageToken, files(id, name, properties, modifiedTime, appProperties)',
        pageSize: 100
      };
      
      if (pageToken) {
        params.pageToken = pageToken;
      }
      
      const response = await gapi.client.drive.files.list(params);
      if (response.result.files && response.result.files.length > 0) {
        allFiles = allFiles.concat(response.result.files);
      }
      
      pageToken = response.result.nextPageToken || '';
    } while (pageToken);
    
    const existingFiles = { result: { files: allFiles } };
    
    const filesToKeep = new Set();
    
    // Upload or update each document
    for (const doc of documents) {
      if (!doc.id) continue; // Skip invalid documents
      
      try {
        const fileId = await saveToGoogleDrive(folderId, doc);
        if (fileId) {
          filesToKeep.add(fileId);
        }
      } catch (error) {
        console.error(`Error syncing document ${doc.id}:`, error);
        // Continue with other documents even if one fails
      }
    }
    
    // Instead of deleting files that exist in Drive but not locally,
    // we'll just log them for information purposes
    const filesOnlyInDrive = existingFiles.result.files.filter(driveFile => !filesToKeep.has(driveFile.id));
    if (filesOnlyInDrive.length > 0) {
      console.log(`Found ${filesOnlyInDrive.length} files in Google Drive that don't exist locally. These will be preserved.`);
    }
    
    // Update UI
    updateLastSyncTime();
    updateStorageUsage();
    updateSyncCountdown();
    
    // Update the sync token after successful sync
    try {
      const response = await gapi.client.drive.changes.getStartPageToken();
      lastSyncToken = response.result.startPageToken;
    } catch (error) {
      console.error('Error updating sync token:', error);
    }
    
    showToast('Sync completed successfully', 'success');
    
    // Trigger UI update to show any new changes
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
  
  // Create a clean document object with only the necessary data
  const docToSave = {
    id: doc.id,
    title: doc.title || 'Untitled Document',
    content: doc.content || '',
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || new Date().toISOString(),
    tags: doc.tags || [],
    archived: doc.archived || false,
    starred: doc.starred || false,
    color: doc.color || '',
    dueDate: doc.dueDate || null,
  };
  
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
