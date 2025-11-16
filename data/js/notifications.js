/**
 * Notifications Module
 * Handles browser notifications, reminders, and notification preferences
 */

import { getSetting, setSetting, listDocuments } from './idb.js';

class NotificationManager {
  constructor() {
    this.notificationCheckInterval = null;
    this.shownNotifications = new Set(); // Track shown notifications to avoid duplicates
    this.initialized = false;
  }

  /**
   * Initialize the notification system (passive initialization - no permission prompt)
   */
  async initialize() {
    if (this.initialized) return;
    
    // Load notification settings
    const notificationsEnabled = await getSetting('notificationsEnabled', false);
    
    // Only start checking if notifications are already enabled
    if (notificationsEnabled && Notification.permission === 'granted') {
      const reminderTimes = await getSetting('reminderTimes', this.getDefaultReminderTimes());
      this.startReminderCheck(reminderTimes);
    }

    this.initialized = true;
  }

  /**
   * Get default smart reminder times based on document characteristics
   */
  getDefaultReminderTimes() {
    return {
      veryUrgent: 15,    // 15 minutes before
      urgent: 60,        // 1 hour before
      soonish: 240,      // 4 hours before
      upcoming: 1440     // 1 day before
    };
  }

  /**
   * Determine which reminder time to use based on time until due
   */
  getReminderTimeForDocument(timeUntilDue) {
    // timeUntilDue in milliseconds
    const hoursUntilDue = timeUntilDue / (1000 * 60 * 60);
    
    if (hoursUntilDue <= 0.25) return null; // Already due or past
    if (hoursUntilDue <= 1) return 15 * 60 * 1000; // Very urgent: 15 min before
    if (hoursUntilDue <= 4) return 60 * 60 * 1000; // Urgent: 1 hour before
    if (hoursUntilDue <= 24) return 240 * 60 * 1000; // Soonish: 4 hours before
    return 1440 * 60 * 1000; // Upcoming: 1 day before
  }

  /**
   * Start periodic reminder checks with smart reminder times
   */
  startReminderCheck(reminderTimes = null) {
    if (this.notificationCheckInterval) {
      clearInterval(this.notificationCheckInterval);
    }

    const times = reminderTimes || this.getDefaultReminderTimes();

    // Check every minute
    this.notificationCheckInterval = setInterval(async () => {
      await this.checkAndNotify(times);
    }, 60000); // 60 seconds

    // Also check immediately on start
    this.checkAndNotify(times);
  }

  /**
   * Stop reminder checks
   */
  stopReminderCheck() {
    if (this.notificationCheckInterval) {
      clearInterval(this.notificationCheckInterval);
      this.notificationCheckInterval = null;
    }
  }

  /**
   * Check for documents that need reminders using smart reminder times
   */
  async checkAndNotify(reminderTimes = null) {
    try {
      const notificationsEnabled = await getSetting('notificationsEnabled', false);
      if (!notificationsEnabled || Notification.permission !== 'granted') {
        return;
      }

      const docs = await listDocuments();
      const now = new Date();
      const times = reminderTimes || this.getDefaultReminderTimes();

      for (const doc of docs) {
        if (!doc.dueDate || doc.completed) continue;

        const dueDate = new Date(doc.dueDate);
        const timeUntilDue = dueDate - now;
        const notificationId = `${doc.id}-${doc.dueDate}`;

        // Check if already notified
        if (this.shownNotifications.has(notificationId)) continue;

        // Get the appropriate reminder time for this document
        const reminderWindowMs = this.getReminderTimeForDocument(timeUntilDue);
        
        // Check if due date is within the smart reminder window
        if (reminderWindowMs && timeUntilDue <= reminderWindowMs && timeUntilDue > 0) {
          await this.sendNotification(doc, dueDate, now);
          this.shownNotifications.add(notificationId);
        }

        // Check if overdue
        if (timeUntilDue < 0 && !this.shownNotifications.has(`${notificationId}-overdue`)) {
          await this.sendOverdueNotification(doc, dueDate, now);
          this.shownNotifications.add(`${notificationId}-overdue`);
        }
      }
    } catch (error) {
      console.error('Error checking notifications:', error);
    }
  }

  /**
   * Send a reminder notification
   */
  async sendNotification(doc, dueDate, now) {
    const timeUntilDue = dueDate - now;
    const hoursLeft = Math.floor(timeUntilDue / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeUntilDue % (1000 * 60 * 60)) / (1000 * 60));

    let timeText = '';
    if (hoursLeft > 0) {
      timeText = `${hoursLeft}h ${minutesLeft}m`;
    } else {
      timeText = `${minutesLeft}m`;
    }

    const title = `Reminder: ${doc.title || 'Untitled'}`;
    const options = {
      body: `Due in ${timeText}`,
      icon: 'data/assets/docslogo.svg',
      badge: 'data/assets/docslogo.svg',
      tag: `reminder-${doc.id}`,
      requireInteraction: false,
      data: { docId: doc.id }
    };

    try {
      const notification = new Notification(title, options);
      notification.addEventListener('click', () => {
        window.open(`editor.html?id=${doc.id}`, '_blank');
        notification.close();
      });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Send an overdue notification
   */
  async sendOverdueNotification(doc, dueDate, now) {
    const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
    const title = `Overdue: ${doc.title || 'Untitled'}`;
    const body = daysOverdue === 0 ? 'Due today!' : `${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`;

    const options = {
      body: body,
      icon: 'data/assets/docslogo.svg',
      badge: 'data/assets/docslogo.svg',
      tag: `overdue-${doc.id}`,
      requireInteraction: true,
      data: { docId: doc.id }
    };

    try {
      const notification = new Notification(title, options);
      notification.addEventListener('click', () => {
        window.open(`editor.html?id=${doc.id}`, '_blank');
        notification.close();
      });
    } catch (error) {
      console.error('Error sending overdue notification:', error);
    }
  }

  /**
   * Send a manual notification (for testing or user-triggered)
   */
  async sendManualNotification(title, body, docId = null) {
    if (Notification.permission !== 'granted') {
      console.warn('Notification permission not granted');
      return;
    }

    const options = {
      icon: 'data/assets/docslogo.svg',
      badge: 'data/assets/docslogo.svg',
      body: body
    };

    if (docId) {
      options.data = { docId };
    }

    try {
      const notification = new Notification(title, options);
      if (docId) {
        notification.addEventListener('click', () => {
          window.open(`editor.html?id=${docId}`, '_blank');
          notification.close();
        });
      }
    } catch (error) {
      console.error('Error sending manual notification:', error);
    }
  }

  /**
   * Enable notifications - requests permission from browser
   */
  async enableNotifications() {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported in this browser');
      return false;
    }

    // Request permission only when user explicitly enables
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission denied');
        return false;
      }
    }

    if (Notification.permission === 'granted') {
      await setSetting('notificationsEnabled', true);
      const reminderTimes = this.getDefaultReminderTimes();
      this.startReminderCheck(reminderTimes);
      return true;
    }
    return false;
  }

  /**
   * Disable notifications
   */
  async disableNotifications() {
    await setSetting('notificationsEnabled', false);
    this.stopReminderCheck();
  }

  /**
   * Use smart/automatic reminder times (default)
   */
  async useSmartReminderTimes() {
    const reminderTimes = this.getDefaultReminderTimes();
    await setSetting('reminderTimes', reminderTimes);
    await setSetting('useSmartReminders', true);
    const notificationsEnabled = await getSetting('notificationsEnabled', false);
    if (notificationsEnabled && Notification.permission === 'granted') {
      this.startReminderCheck(reminderTimes);
    }
  }

  /**
   * Set custom reminder time (in minutes before due date)
   */
  async setCustomReminderTime(minutes) {
    const validMinutes = Math.max(1, Math.min(1440, minutes)); // 1 min to 24 hours
    await setSetting('reminderTime', validMinutes);
    await setSetting('useSmartReminders', false);
    const notificationsEnabled = await getSetting('notificationsEnabled', false);
    if (notificationsEnabled && Notification.permission === 'granted') {
      this.startReminderCheck(validMinutes);
    }
  }

  /**
   * Check if notifications are supported
   */
  static isSupported() {
    return 'Notification' in window;
  }

  /**
   * Check if notifications are enabled
   */
  static isEnabled() {
    return 'Notification' in window && Notification.permission === 'granted';
  }
}

// Create singleton instance
const notificationManager = new NotificationManager();

export { notificationManager, NotificationManager };
