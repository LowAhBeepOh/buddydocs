import { getSetting, setSetting } from './idb.js';

// Configuration
const SYNC_INTERVAL = 8 * 60 * 1000; // 8 minutes in milliseconds
const SYNC_DEBOUNCE = 1000; // 1 second debounce for rapid changes

// State
let syncTimer = null;
let lastSyncTime = 0;
let pendingSync = false;
let syncInProgress = false;
let syncCallbacks = new Set();

// Track time until next sync
let timeUntilNextSync = SYNC_INTERVAL;
let syncCountdownInterval = null;

// Initialize the sync service
export async function initSyncService() {
  // Load last sync time
  lastSyncTime = await getSetting('lastSyncTime', 0);
  
  // Start the sync countdown
  updateSyncCountdown();
  
  // Start the sync interval
  startSyncInterval();
  
  // Set up beforeunload handler
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  console.log('Sync service initialized');
}

// Add a callback to be called when sync completes
export function onSync(callback) {
  if (typeof callback === 'function') {
    syncCallbacks.add(callback);
    return () => syncCallbacks.delete(callback);
  }
}

// Trigger a sync (with debounce)
export function triggerSync(force = false) {
  if (syncInProgress && !force) {
    pendingSync = true;
    return;
  }
  
  const now = Date.now();
  const timeSinceLastSync = now - lastSyncTime;
  
  // If we synced recently and not forced, schedule for later
  if (!force && timeSinceLastSync < SYNC_DEBOUNCE) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => triggerSync(), SYNC_DEBOUNCE - timeSinceLastSync);
    return;
  }
  
  // Start sync
  performSync();
}

// Perform the actual sync
async function performSync() {
  if (syncInProgress) {
    pendingSync = true;
    return;
  }
  
  syncInProgress = true;
  
  try {
    console.log('Starting sync...');
    
    // Call all registered sync callbacks
    const results = [];
    for (const callback of syncCallbacks) {
      try {
        const result = await Promise.resolve(callback());
        results.push(result);
      } catch (error) {
        console.error('Error in sync callback:', error);
      }
    }
    
    // Update last sync time
    lastSyncTime = Date.now();
    await setSetting('lastSyncTime', lastSyncTime);
    
    // Update the UI
    updateSyncUI();
    
    console.log('Sync completed successfully');
    return results;
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  } finally {
    syncInProgress = false;
    
    // If another sync was requested while this one was running, run it
    if (pendingSync) {
      pendingSync = false;
      setTimeout(() => triggerSync(), SYNC_DEBOUNCE);
    }
  }
}

// Start the sync interval
function startSyncInterval() {
  if (syncCountdownInterval) clearInterval(syncCountdownInterval);
  
  syncCountdownInterval = setInterval(() => {
    timeUntilNextSync -= 1000;
    updateSyncUI();
    
    if (timeUntilNextSync <= 0) {
      triggerSync();
      timeUntilNextSync = SYNC_INTERVAL;
    }
  }, 1000);
}

// Update the sync UI (time until next sync)
function updateSyncUI() {
  const syncStatus = document.getElementById('syncStatus');
  if (!syncStatus) return;
  
  const minutes = Math.floor(timeUntilNextSync / 60000);
  const seconds = Math.floor((timeUntilNextSync % 60000) / 1000);
  
  syncStatus.textContent = `Next sync in ${minutes}:${seconds.toString().padStart(2, '0')}`;
  syncStatus.title = `Last sync: ${new Date(lastSyncTime).toLocaleTimeString()}`;
}

// Handle page unload
function handleBeforeUnload() {
  if (syncInProgress) {
    // If sync is in progress, try to wait a bit for it to complete
    const startTime = Date.now();
    const maxWaitTime = 2000; // 2 seconds max wait
    
    // This is a synchronous wait, so it will block the page unload
    while (syncInProgress && (Date.now() - startTime) < maxWaitTime) {
      // Busy wait (not ideal, but necessary for unload)
    }
  }
}

// Update the sync countdown
export function updateSyncCountdown() {
  const now = Date.now();
  const timeSinceLastSync = now - lastSyncTime;
  timeUntilNextSync = Math.max(0, SYNC_INTERVAL - timeSinceLastSync);
  
  // If it's been too long since last sync, trigger one now
  if (timeSinceLastSync > SYNC_INTERVAL * 1.5) {
    timeUntilNextSync = 0;
  }
  
  updateSyncUI();
}

// Export for debugging
window.syncService = {
  triggerSync,
  getLastSyncTime: () => lastSyncTime,
  getTimeUntilNextSync: () => timeUntilNextSync,
  forceSync: () => triggerSync(true)
};
