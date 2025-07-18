/**
 * Browser extension notification provider
 * Implements cross-browser notification capabilities using browser APIs
 */

import { 
  NotificationProvider, 
  NotificationOptions, 
  NotificationEvent, 
  NotificationType,
  NotificationPriority 
} from '../shared/core/notification-system';
import { getBrowserAPI, BrowserDetection } from './browser-compatibility';

/**
 * Browser extension notification provider using native browser notifications
 */
export class BrowserNotificationProvider implements NotificationProvider {
  private browserAPI: any;
  private eventCallback?: (event: NotificationEvent) => void;
  private activeNotifications = new Map<string, NotificationOptions>();

  constructor() {
    this.browserAPI = getBrowserAPI();
    if (!this.browserAPI) {
      throw new Error('Browser API not available');
    }
    this.setupEventListeners();
  }

  /**
   * Show a notification using browser notification API
   */
  async show(notification: NotificationOptions): Promise<string> {
    if (!this.browserAPI.notifications) {
      // Fallback to console for browsers without notification support
      console.log(`[${notification.type.toUpperCase()}] ${notification.title}: ${notification.message}`);
      return notification.id || 'console-notification';
    }

    try {
      const notificationId = notification.id || `notification-${Date.now()}`;
      
      const browserNotification = {
        type: 'basic' as const,
        iconUrl: this.getIconForType(notification.type),
        title: notification.title,
        message: notification.message,
        priority: this.mapPriorityToBrowser(notification.priority),
        buttons: notification.actions?.map(action => ({
          title: action.title,
          iconUrl: action.icon
        })) || undefined
      };

      await this.browserAPI.notifications.create(notificationId, browserNotification);
      this.activeNotifications.set(notificationId, notification);
      
      // Emit shown event
      this.emitEvent({
        notificationId,
        action: 'shown',
        timestamp: new Date()
      });

      return notificationId;
    } catch (error) {
      console.error('Failed to create browser notification:', error);
      throw error;
    }
  }

  /**
   * Update an existing notification
   */
  async update(id: string, updates: Partial<NotificationOptions>): Promise<boolean> {
    if (!this.browserAPI.notifications) {
      return false;
    }

    const existing = this.activeNotifications.get(id);
    if (!existing) {
      return false;
    }

    try {
      const updated = { ...existing, ...updates };
      
      const browserUpdates: any = {};
      if (updates.title) browserUpdates.title = updates.title;
      if (updates.message) browserUpdates.message = updates.message;
      if (updates.type) browserUpdates.iconUrl = this.getIconForType(updates.type);
      if (updates.priority !== undefined) {
        browserUpdates.priority = this.mapPriorityToBrowser(updates.priority);
      }

      // Browser notifications don't support direct updates, so we clear and recreate
      await this.browserAPI.notifications.clear(id);
      await this.show({ ...updated, id });
      
      return true;
    } catch (error) {
      console.error('Failed to update browser notification:', error);
      return false;
    }
  }

  /**
   * Dismiss a specific notification
   */
  async dismiss(id: string): Promise<boolean> {
    if (!this.browserAPI.notifications) {
      return true; // Console notifications are auto-dismissed
    }

    try {
      const success = await this.browserAPI.notifications.clear(id);
      if (success) {
        this.activeNotifications.delete(id);
        this.emitEvent({
          notificationId: id,
          action: 'dismissed',
          timestamp: new Date()
        });
      }
      return success;
    } catch (error) {
      console.error('Failed to dismiss browser notification:', error);
      return false;
    }
  }

  /**
   * Dismiss all notifications
   */
  async dismissAll(): Promise<void> {
    if (!this.browserAPI.notifications) {
      return;
    }

    try {
      const notifications = await this.browserAPI.notifications.getAll();
      const dismissPromises = Object.keys(notifications).map(id => this.dismiss(id));
      await Promise.all(dismissPromises);
    } catch (error) {
      console.error('Failed to dismiss all browser notifications:', error);
      throw error;
    }
  }

  /**
   * Get all active notifications
   */
  async getActive(): Promise<NotificationOptions[]> {
    if (!this.browserAPI.notifications) {
      return [];
    }

    try {
      const browserNotifications = await this.browserAPI.notifications.getAll();
      const activeIds = Object.keys(browserNotifications);
      
      return activeIds
        .map(id => this.activeNotifications.get(id))
        .filter((notification): notification is NotificationOptions => notification !== undefined);
    } catch (error) {
      console.error('Failed to get active browser notifications:', error);
      return [];
    }
  }

  /**
   * Set up event listener callback
   */
  onEvent(callback: (event: NotificationEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Setup browser notification event listeners
   */
  private setupEventListeners(): void {
    if (!this.browserAPI.notifications) {
      return;
    }

    // Notification clicked
    if (this.browserAPI.notifications.onClicked) {
      this.browserAPI.notifications.onClicked.addListener((notificationId: string) => {
        this.emitEvent({
          notificationId,
          action: 'clicked',
          timestamp: new Date()
        });
      });
    }

    // Notification closed
    if (this.browserAPI.notifications.onClosed) {
      this.browserAPI.notifications.onClosed.addListener((notificationId: string, byUser: boolean) => {
        this.activeNotifications.delete(notificationId);
        this.emitEvent({
          notificationId,
          action: 'dismissed',
          timestamp: new Date()
        });
      });
    }

    // Notification button clicked
    if (this.browserAPI.notifications.onButtonClicked) {
      this.browserAPI.notifications.onButtonClicked.addListener((notificationId: string, buttonIndex: number) => {
        const notification = this.activeNotifications.get(notificationId);
        const action = notification?.actions?.[buttonIndex];
        
        this.emitEvent({
          notificationId,
          action: 'action_clicked',
          actionId: action?.id,
          timestamp: new Date()
        });
      });
    }
  }

  /**
   * Emit notification event to callback
   */
  private emitEvent(event: NotificationEvent): void {
    if (this.eventCallback) {
      try {
        this.eventCallback(event);
      } catch (error) {
        console.error('Error in notification event callback:', error);
      }
    }
  }

  /**
   * Get appropriate icon for notification type
   */
  private getIconForType(type: NotificationType): string {
    const iconBase = '/icons/notification-';
    
    switch (type) {
      case NotificationType.SUCCESS:
        return `${iconBase}success.png`;
      case NotificationType.WARNING:
        return `${iconBase}warning.png`;
      case NotificationType.ERROR:
        return `${iconBase}error.png`;
      case NotificationType.PRIVACY:
        return `${iconBase}privacy.png`;
      case NotificationType.INFO:
      default:
        return `${iconBase}info.png`;
    }
  }

  /**
   * Map notification priority to browser priority
   */
  private mapPriorityToBrowser(priority: NotificationPriority): number {
    switch (priority) {
      case NotificationPriority.LOW: return -1;
      case NotificationPriority.NORMAL: return 0;
      case NotificationPriority.HIGH: return 1;
      case NotificationPriority.CRITICAL: return 2;
      default: return 0;
    }
  }
}

/**
 * In-page notification provider for content scripts and popup
 */
export class InPageNotificationProvider implements NotificationProvider {
  private container: HTMLElement;
  private activeNotifications = new Map<string, { element: HTMLElement; options: NotificationOptions }>();
  private eventCallback?: (event: NotificationEvent) => void;

  constructor(containerId = 'privacy-notifications') {
    this.container = this.createContainer(containerId);
  }

  /**
   * Show an in-page notification
   */
  async show(notification: NotificationOptions): Promise<string> {
    const notificationId = notification.id || `notification-${Date.now()}`;
    
    const element = this.createNotificationElement(notification);
    this.container.appendChild(element);
    
    this.activeNotifications.set(notificationId, { element, options: notification });
    
    // Animate in
    requestAnimationFrame(() => {
      element.classList.add('show');
    });

    // Emit shown event
    this.emitEvent({
      notificationId,
      action: 'shown',
      timestamp: new Date()
    });

    // Auto-dismiss if not persistent
    if (!notification.persistent && notification.expiresAt) {
      const delay = notification.expiresAt.getTime() - Date.now();
      if (delay > 0) {
        setTimeout(() => this.dismiss(notificationId), delay);
      }
    }

    return notificationId;
  }

  /**
   * Update an existing notification
   */
  async update(id: string, updates: Partial<NotificationOptions>): Promise<boolean> {
    const existing = this.activeNotifications.get(id);
    if (!existing) {
      return false;
    }

    const updated = { ...existing.options, ...updates };
    
    // Update the element
    if (updates.title) {
      const titleElement = existing.element.querySelector('.notification-title');
      if (titleElement) titleElement.textContent = updates.title;
    }
    
    if (updates.message) {
      const messageElement = existing.element.querySelector('.notification-message');
      if (messageElement) messageElement.textContent = updates.message;
    }
    
    if (updates.type) {
      existing.element.className = existing.element.className.replace(/notification-\w+/, `notification-${updates.type}`);
    }

    this.activeNotifications.set(id, { element: existing.element, options: updated });
    return true;
  }

  /**
   * Dismiss a specific notification
   */
  async dismiss(id: string): Promise<boolean> {
    const existing = this.activeNotifications.get(id);
    if (!existing) {
      return false;
    }

    // Animate out
    existing.element.classList.add('hide');
    
    setTimeout(() => {
      if (existing.element.parentNode) {
        existing.element.parentNode.removeChild(existing.element);
      }
    }, 300);

    this.activeNotifications.delete(id);
    
    this.emitEvent({
      notificationId: id,
      action: 'dismissed',
      timestamp: new Date()
    });

    return true;
  }

  /**
   * Dismiss all notifications
   */
  async dismissAll(): Promise<void> {
    const ids = Array.from(this.activeNotifications.keys());
    await Promise.all(ids.map(id => this.dismiss(id)));
  }

  /**
   * Get all active notifications
   */
  async getActive(): Promise<NotificationOptions[]> {
    return Array.from(this.activeNotifications.values()).map(item => item.options);
  }

  /**
   * Set up event listener callback
   */
  onEvent(callback: (event: NotificationEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Create notification container
   */
  private createContainer(containerId: string): HTMLElement {
    let container = document.getElementById(containerId);
    
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.className = 'privacy-notification-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    
    return container;
  }

  /**
   * Create notification element
   */
  private createNotificationElement(notification: NotificationOptions): HTMLElement {
    const element = document.createElement('div');
    element.className = `privacy-notification notification-${notification.type}`;
    element.style.cssText = `
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      margin-bottom: 12px;
      padding: 16px;
      pointer-events: auto;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      border-left: 4px solid ${this.getColorForType(notification.type)};
    `;

    element.innerHTML = `
      <div class="notification-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <h4 class="notification-title" style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">${notification.title}</h4>
        <button class="notification-close" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #666; padding: 0; margin-left: 12px;">&times;</button>
      </div>
      <p class="notification-message" style="margin: 0; font-size: 13px; color: #666; line-height: 1.4;">${notification.message}</p>
      ${notification.actions ? this.createActionsHTML(notification.actions) : ''}
    `;

    // Add event listeners
    const closeButton = element.querySelector('.notification-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        this.dismiss(notification.id!);
      });
    }

    // Add action button listeners
    if (notification.actions) {
      notification.actions.forEach((action, index) => {
        const button = element.querySelector(`[data-action-id="${action.id}"]`);
        if (button) {
          button.addEventListener('click', () => {
            this.emitEvent({
              notificationId: notification.id!,
              action: 'action_clicked',
              actionId: action.id,
              timestamp: new Date()
            });
          });
        }
      });
    }

    // Click handler for main notification
    element.addEventListener('click', (e) => {
      if (e.target === element || e.target === element.querySelector('.notification-message')) {
        this.emitEvent({
          notificationId: notification.id!,
          action: 'clicked',
          timestamp: new Date()
        });
      }
    });

    return element;
  }

  /**
   * Create actions HTML
   */
  private createActionsHTML(actions: any[]): string {
    return `
      <div class="notification-actions" style="margin-top: 12px; display: flex; gap: 8px;">
        ${actions.map(action => `
          <button 
            data-action-id="${action.id}"
            style="
              background: ${action.primary ? '#007AFF' : 'transparent'};
              color: ${action.primary ? 'white' : '#007AFF'};
              border: 1px solid #007AFF;
              border-radius: 4px;
              padding: 6px 12px;
              font-size: 12px;
              cursor: pointer;
              font-weight: 500;
            "
          >${action.title}</button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Get color for notification type
   */
  private getColorForType(type: NotificationType): string {
    switch (type) {
      case NotificationType.SUCCESS: return '#34C759';
      case NotificationType.WARNING: return '#FF9500';
      case NotificationType.ERROR: return '#FF3B30';
      case NotificationType.PRIVACY: return '#5856D6';
      case NotificationType.INFO:
      default: return '#007AFF';
    }
  }

  /**
   * Emit notification event to callback
   */
  private emitEvent(event: NotificationEvent): void {
    if (this.eventCallback) {
      try {
        this.eventCallback(event);
      } catch (error) {
        console.error('Error in notification event callback:', error);
      }
    }
  }
}
