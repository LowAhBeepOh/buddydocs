// Import required functions from idb.js
import { getSetting, setSetting, listDocuments, saveDocument, deleteDocument } from './idb.js';

// Google Drive API Configuration
const GOOGLE_CLIENT_ID = '843640373447-4v9vbpn0nhtallnmkrua34msqgm25j9d.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes
const STORAGE_LIMIT = 1 * 1024 * 1024 * 1024; // 1GB in bytes

// Global variables
let tokenClient = null;
let syncInterval = null;
let gapiInited = false;
let gisInited = false;

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
      prompt: '', // Will be set per-request
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
          // Calculate expiration time (default to 1 hour if not provided)
          const expiresIn = tokenResponse.expires_in || 3600;
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
        const isTokenValid = token.expires_at && (Date.now() / 1000 < token.expires_at);
        
        if (isTokenValid) {
          // Set the token
          gapi.client.setToken(token);
          
          // Update UI immediately with stored token
          await updateCloudStatus();
          
          // Try to refresh the token in the background
          tokenClient.requestAccessToken({ prompt: 'none' });
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
  const syncNowBtn = document.getElementById('syncNow');
  
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
    
    // Get all local documents
    const documents = await listDocuments();
    
    // Upload each document
    for (const doc of documents) {
      await saveToGoogleDrive(folderId, doc);
    }
    
    // Update last sync time
    const now = new Date().toISOString();
    await setSetting('lastSyncTime', now);
    updateLastSyncTime();
    
    showToast('Sync completed successfully', 'success');
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

// Save document to Google Drive
async function saveToGoogleDrive(folderId, doc) {
  const fileName = `${doc.title || 'Untitled'}.buddydoc`;
  const fileContent = JSON.stringify(doc);
  
  try {
    const fileMetadata = {
      name: fileName,
      mimeType: 'application/json',
      parents: [folderId],
      properties: {
        app: 'BuddyDocs',
        docId: doc.id,
        updatedAt: doc.updatedAt || new Date().toISOString()
      }
    };
    
    // Check if file already exists
    const response = await gapi.client.drive.files.list({
      q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, modifiedTime, properties)'
    });
    
    const media = {
      mimeType: 'application/json',
      body: fileContent
    };
    
    if (response.result.files.length > 0) {
      // Update existing file
      const file = response.result.files[0];
      const remoteUpdatedAt = new Date(file.modifiedTime).getTime();
      const localUpdatedAt = new Date(doc.updatedAt || 0).getTime();
      
      // Skip if remote version is newer
      if (remoteUpdatedAt > localUpdatedAt) {
        return file.id;
      }
      
      // Update the file
      await gapi.client.drive.files.update({
        fileId: file.id,
        resource: fileMetadata,
        media: media
      });
      
      return file.id;
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
