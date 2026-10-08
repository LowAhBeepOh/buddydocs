import { getSetting } from './idb.js';
import { initSyncService, onSync } from './syncService.js';

// Background sync only runs for users connected to Google Drive
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const enabled = await getSetting('googleDriveEnabled', false);
    if (enabled !== true) return;
    await initSyncService();
    console.log('Sync service initialized');
  } catch (error) {
    console.error('Failed to initialize sync service:', error);
  }
});

// Export for other modules that might need to interact with the sync service
export { onSync };
