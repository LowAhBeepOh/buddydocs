import { initSyncService, onSync } from './syncService.js';

// Initialize sync service when the page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initSyncService();
    console.log('Sync service initialized');
  } catch (error) {
    console.error('Failed to initialize sync service:', error);
  }
});

// Export for other modules that might need to interact with the sync service
export { onSync };
