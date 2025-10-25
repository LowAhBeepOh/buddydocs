// Import required functions from idb.js
import { getSetting, setSetting, listDocuments, saveDocument, deleteDocument } from './idb.js';

// Google Drive API Configuration
const GOOGLE_CLIENT_ID = '843640373447-4v9vbpn0nhtallnmkrua34msqgm25j9d.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes
const STORAGE_LIMIT = 1 * 1024 * 1024 * 1024; // 1GB in bytes

let googleUser = null;
let googleAuth = null;
let syncInterval = null;

// Initialize Google API client
async function initGoogleAuth() {
  try {
    // Load the Google API client library
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    // Initialize the Google API client
    await new Promise((resolve, reject) => {
      gapi.load('client:auth2', {
        callback: resolve,
        onerror: reject,
        timeout: 10000, // 10 seconds
        ontimeout: () => reject(new Error('Timeout loading Google API client'))
      });
    });

    // Initialize the client with the API key and client ID
    await gapi.client.init({
      apiKey: '', // Not required for OAuth 2.0
      clientId: GOOGLE_CLIENT_ID,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
      scope: GOOGLE_SCOPES
    });

    // Get the auth instance and current user
    googleAuth = gapi.auth2.getAuthInstance();
    googleUser = googleAuth.currentUser.get();

    // Listen for sign-in state changes
    googleAuth.isSignedIn.listen(updateSigninStatus);
    
    // Handle initial sign-in state
    updateSigninStatus(googleAuth.isSignedIn.get());
    
    return true;
  } catch (error) {
    console.error('Error initializing Google Auth:', error);
    showToast('Failed to initialize Google Drive. Please check your internet connection and try again.', 'error');
    return false;
  }
}

// Update UI based on sign-in status
function updateSigninStatus(isSignedIn) {
  if (isSignedIn) {
    googleUser = googleAuth.currentUser.get();
    updateCloudStatus();
    if (document.getElementById('autoSync')?.checked) {
      startAutoSync();
    }
  } else {
    updateCloudStatus();
  }
}

// Handle Google sign-in
async function handleGoogleSignIn() {
  const signInBtn = document.getElementById('connectGoogleDrive');
  const originalText = signInBtn?.textContent;
  
  try {
    if (signInBtn) {
      signInBtn.disabled = true;
      signInBtn.textContent = 'Signing in...';
    }
    
    // Initialize Google Auth if not already done
    if (!googleAuth) {
      const isInitialized = await initGoogleAuth();
      if (!isInitialized) {
        throw new Error('Failed to initialize Google Auth');
      }
    }
    
    // Sign in with Google
    const googleUser = await googleAuth.signIn({
      prompt: 'select_account'
    });
    
    const profile = googleUser.getBasicProfile();
    await Promise.all([
      setSetting('googleDriveEnabled', true),
      setSetting('googleDriveEmail', profile.getEmail())
    ]);
    
    // Update UI and start sync if needed
    updateCloudStatus();
    
    // Initial sync
    const autoSyncEnabled = await getSetting('autoSyncEnabled', true);
    if (autoSyncEnabled) {
      await syncToGoogleDrive();
      startAutoSync();
    }
    
    showToast('Successfully signed in to Google Drive', 'success');
  } catch (error) {
    console.error('Google sign-in error:', error);
    
    // Don't show error if user cancelled the sign-in
    if (error.error !== 'popup_closed_by_user') {
      showToast('Failed to sign in to Google Drive. Please try again.', 'error');
    }
    
    // Make sure to update the UI state
    updateCloudStatus();
  } finally {
    if (signInBtn) {
      signInBtn.disabled = false;
      signInBtn.textContent = originalText;
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
    
    // Sign out from Google
    if (googleAuth) {
      await googleAuth.signOut();
    }
    
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
function startAutoSync() {
  stopAutoSync(); // Clear any existing interval
  syncInterval = setInterval(syncToGoogleDrive, SYNC_INTERVAL);
}

// Stop auto-sync interval
function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// Sync documents to Google Drive
async function syncToGoogleDrive() {
  if (!googleUser || !googleUser.isSignedIn()) {
    await handleGoogleSignIn();
    if (!googleUser || !googleUser.isSignedIn()) return;
  }

  try {
    const docs = await listDocuments();
    const folderId = await getOrCreateAppFolder();
    let totalSize = 0;
    
    for (const doc of docs) {
      const docSize = new Blob([JSON.stringify(doc)]).size;
      if (docSize > MAX_FILE_SIZE) {
        console.warn(`Document '${doc.title || 'Untitled'}' exceeds maximum file size and will not be synced`);
        continue;
      }
      
      if (totalSize + docSize > STORAGE_LIMIT) {
        console.warn('Storage limit reached. Some documents were not synced.');
        showToast('Storage limit reached. Some documents were not synced.', 'warning');
        break;
      }
      
      await saveToGoogleDrive(folderId, doc);
      totalSize += docSize;
    }
    
    // Update last sync time
    await setSetting('lastSyncTime', new Date().toISOString());
    updateLastSyncTime();
    
    return true;
  } catch (error) {
    console.error('Sync error:', error);
    showToast('Error syncing to Google Drive', 'error');
    return false;
  }
}

// Helper function to get or create app folder
async function getOrCreateAppFolder() {
  try {
    const response = await gapi.client.drive.files.list({
      q: "name='Buddy Docs Webapp' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id)'
    });
    
    if (response.result.files.length > 0) {
      return response.result.files[0].id;
    }
    
    const fileMetadata = {
      name: 'Buddy Docs Webapp',
      mimeType: 'application/vnd.google-apps.folder'
    };
    
    const folder = await gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: 'id'
    });
    
    return folder.result.id;
  } catch (error) {
    console.error('Error getting/creating folder:', error);
    throw error;
  }
}

// Save document to Google Drive
async function saveToGoogleDrive(folderId, doc) {
  const fileName = `${doc.title || 'Untitled'}.buddydoc`;
  const fileContent = JSON.stringify(doc);
  
  const fileMetadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json'
  };
  
  const media = {
    mimeType: 'application/json',
    body: fileContent
  };
  
  try {
    // Check if file already exists
    const response = await gapi.client.drive.files.list({
      q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, modifiedTime)'
    });
    
    if (response.result.files.length > 0) {
      // Update existing file if local version is newer
      const remoteFile = response.result.files[0];
      const localModified = new Date(doc.updatedAt || doc.createdAt);
      const remoteModified = new Date(remoteFile.modifiedTime);
      
      if (localModified > remoteModified) {
        await gapi.client.drive.files.update({
          fileId: remoteFile.id,
          resource: fileMetadata,
          media: media
        });
      }
      return remoteFile.id;
    } else {
      // Create new file
      const file = await gapi.client.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, modifiedTime'
      });
      return file.result.id;
    }
  } catch (error) {
    console.error('Error saving to Google Drive:', error);
    throw error;
  }
}

async function updateCloudStatus() {
  const statusElement = document.getElementById('cloudStatus');
  const connectBtn = document.getElementById('connectGoogleDrive');
  const disconnectBtn = document.getElementById('disconnectGoogleDrive');
  const syncNowBtn = document.getElementById('syncNow');
  const autoSyncCheckbox = document.getElementById('autoSync');
  const syncOptions = document.querySelector('.sync-options');
  const storageInfo = document.querySelector('.storage-info');
  
  if (!statusElement) return;
  
  const isSignedIn = googleAuth && googleAuth.isSignedIn.get();
  
  if (isSignedIn) {
    try {
      const profile = googleUser.getBasicProfile();
      const email = profile.getEmail();
      
      // Update status and UI
      statusElement.textContent = `Connected as ${email}`;
      statusElement.style.color = 'var(--success)';
      
      // Toggle UI elements
      if (connectBtn) connectBtn.style.display = 'none';
      if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
      if (syncNowBtn) syncNowBtn.disabled = false;
      if (autoSyncCheckbox) autoSyncCheckbox.disabled = false;
      if (syncOptions) syncOptions.style.display = 'block';
      if (storageInfo) storageInfo.style.display = 'block';
      
      // Update settings
      await setSetting('googleDriveEnabled', true);
      await setSetting('googleDriveEmail', email);
      
      // Update last sync time and storage usage
      updateLastSyncTime();
      updateStorageUsage();
      
    } catch (error) {
      console.error('Error updating cloud status:', error);
      statusElement.textContent = 'Error connecting to Google Drive';
      statusElement.style.color = 'var(--error)';
      
      if (connectBtn) {
        connectBtn.style.display = 'inline-block';
        connectBtn.disabled = false;
        connectBtn.textContent = 'Retry Connection';
      }
      if (disconnectBtn) disconnectBtn.style.display = 'none';
      if (syncNowBtn) syncNowBtn.disabled = true;
      if (autoSyncCheckbox) autoSyncCheckbox.disabled = true;
      if (syncOptions) syncOptions.style.display = 'none';
      if (storageInfo) storageInfo.style.display = 'none';
    }
  } else {
    // Not signed in state
    statusElement.textContent = 'Not connected to Google Drive';
    statusElement.style.color = 'var(--text-muted)';
    
    // Toggle UI elements
    if (connectBtn) {
      connectBtn.style.display = 'inline-block';
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect Google Drive';
    }
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (syncNowBtn) syncNowBtn.disabled = true;
    if (autoSyncCheckbox) autoSyncCheckbox.disabled = true;
    if (syncOptions) syncOptions.style.display = 'none';
    if (storageInfo) storageInfo.style.display = 'none';
    
    // Update settings
    await setSetting('googleDriveEnabled', false);
  }
  
  // Update the sync button text based on state
  if (syncNowBtn) {
    const isSyncing = syncNowBtn.textContent === 'Syncing...';
    syncNowBtn.textContent = isSyncing ? 'Syncing...' : 'Sync Now';
    syncNowBtn.disabled = isSyncing;
  }
}

// Update last sync time display
async function updateLastSyncTime() {
  const lastSyncTime = await getSetting('lastSyncTime');
  const lastSyncElement = document.getElementById('lastSyncTime');
  
  if (lastSyncTime) {
    const date = new Date(lastSyncTime);
    lastSyncElement.textContent = date.toLocaleString();
  } else {
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
  
  setTimeout(() => {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  }, 100);
}

// Initialize cloud tab
export async function initCloudTab() {
  try {
    // Initialize Google Auth
    const isInitialized = await initGoogleAuth();
    
    if (!isInitialized) {
      // Show error state in UI
      const statusElement = document.getElementById('cloudStatus');
      if (statusElement) {
        statusElement.textContent = 'Failed to initialize Google Drive';
        statusElement.style.color = 'var(--error)';
      }
      return;
    }

    // Check if user is already signed in
    const isSignedIn = googleAuth && googleAuth.isSignedIn.get();
    
    if (isSignedIn) {
      // User is already signed in
      googleUser = googleAuth.currentUser.get();
      await setSetting('googleDriveEnabled', true);
      
      // Update UI
      updateCloudStatus();
      
      // Start auto-sync if enabled
      const autoSyncEnabled = await getSetting('autoSyncEnabled', true);
      if (autoSyncEnabled) {
        startAutoSync();
      }
    } else {
      // User is not signed in, update UI
      updateCloudStatus();
    }
  } catch (error) {
    console.error('Error initializing cloud tab:', error);
    showToast('Failed to initialize Google Drive. Please refresh the page and try again.', 'error');
  }
  
  // Add event listeners
  const connectBtn = document.getElementById('connectGoogleDrive');
  const disconnectBtn = document.getElementById('disconnectGoogleDrive');
  const syncNowBtn = document.getElementById('syncNow');
  const autoSyncCheckbox = document.getElementById('autoSync');
  
  if (connectBtn) {
    connectBtn.addEventListener('click', handleGoogleSignIn);
  }
  
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', handleGoogleSignOut);
  }
  
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', async () => {
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = 'Syncing...';
      
      try {
        await syncToGoogleDrive();
        showToast('Sync completed successfully', 'success');
      } catch (error) {
        console.error('Sync failed:', error);
        showToast('Sync failed. Please try again.', 'error');
      } finally {
        syncNowBtn.disabled = false;
        syncNowBtn.textContent = 'Sync Now';
      }
    });
  }
  
  // Auto-sync toggle
  if (autoSyncCheckbox) {
    autoSyncCheckbox.checked = await getSetting('autoSyncEnabled', true);
    autoSyncCheckbox.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      await setSetting('autoSyncEnabled', isChecked);
      
      if (isChecked) {
        try {
          await syncToGoogleDrive();
          startAutoSync();
        } catch (error) {
          console.error('Auto-sync failed to start:', error);
          showToast('Failed to start auto-sync', 'error');
          e.target.checked = false;
        }
      } else {
        stopAutoSync();
      }
    });
  }
}
