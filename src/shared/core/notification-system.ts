/**
 * User notification system for privacy-related events and system feedback
 * Provides cross-platform notification capabilities with privacy-safe messaging
 */

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  PRIVACY = 'privacy'
}

export enum NotificationPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

export interface NotificationOptions {
  id?: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  persistent?: boolean;
  actionable?: boolean;
  actions?: NotificationAction[];
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

export interface NotificationAction {
  id: string;
  title: string;
  icon?: string;
  primary?: boolean;
}

export interface NotificationEvent {
  notificationId: string;
  action: 'shown' | 'clicked' | 'dismissed' | 'action_clicked';
  actionId?: string;
  timestamp: Date;
}

export interface NotificationProvider {
  show(notification: NotificationOptions): Promise<string>;
  update(id: string, updates: Partial<NotificationOptions>): Promise<boolean>;
  dismiss(id: string): Promise<boolean>;
  dismissAll(): Promise<void>;
  getActive(): Promise<NotificationOptions[]>;
  onEvent(callback: (event: NotificationEvent) => void): void;
}

/**
 * Privacy-focused notification templates for common scenarios
 */
export class PrivacyNotificationTemplates {
  /**
   * Cohort assignment notification
   */
  static cohortAssigned(cohortName: string, count: number): NotificationOptions {
    return {
      title: 'Interest Cohorts Updated',
      message: `You've been assigned to ${count} new interest cohort${count > 1 ? 's' : ''}, including "${cohortName}".`,
      type: NotificationType.INFO,
      priority: NotificationPriority.LOW,
      persistent: false,
      metadata: { category: 'cohort_assignment' }
    };
  }

  /**
   * Privacy settings changed notification
   */
  static privacySettingsChanged(setting: string): NotificationOptions {
    return {
      title: 'Privacy Settings Updated',
      message: `Your ${setting} preference has been updated successfully.`,
      type: NotificationType.SUCCESS,
      priority: NotificationPriority.NORMAL,
      persistent: false,
      metadata: { category: 'privacy_settings' }
    };
  }

  /**
   * Data deletion notification
   */
  static dataDeleted(dataType: string): NotificationOptions {
    return {
      title: 'Data Deleted',
      message: `Your ${dataType} has been permanently deleted as requested.`,
      type: NotificationType.SUCCESS,
      priority: NotificationPriority.HIGH,
      persistent: true,
      metadata: { category: 'data_deletion' }
    };
  }

  /**
   * Consent withdrawn notification
   */
  static consentWithdrawn(): NotificationOptions {
    return {
      title: 'Consent Withdrawn',
      message: 'Your consent has been withdrawn. All data processing has been stopped and data will be deleted.',
      type: NotificationType.PRIVACY,
      priority: NotificationPriority.CRITICAL,
      persistent: true,
      actions: [
        { id: 'view_details', title: 'View Details', primary: true },
        { id: 'dismiss', title: 'Dismiss' }
      ],
      metadata: { category: 'consent_withdrawal' }
    };
  }

  /**
   * Security issue detected notification
   */
  static securityIssue(issue: string): NotificationOptions {
    return {
      title: 'Security Alert',
      message: `A security issue was detected: ${issue}. Your data remains protected.`,
      type: NotificationType.WARNING,
      priority: NotificationPriority.HIGH,
      persistent: true,
      actions: [
        { id: 'learn_more', title: 'Learn More', primary: true },
        { id: 'dismiss', title: 'Dismiss' }
      ],
      metadata: { category: 'security_alert' }
    };
  }

  /**
   * System error notification
   */
  static systemError(component: string, recoveryAction?: string): NotificationOptions {
    const message = recoveryAction 
      ? `An issue occurred with ${component}. ${recoveryAction}`
      : `An issue occurred with ${component}. The system is attempting to recover.`;

    return {
      title: 'System Notice',
      message,
      type: NotificationType.WARNING,
      priority: NotificationPriority.NORMAL,
      persistent: false,
      metadata: { category: 'system_error', component }
    };
  }

  /**
   * Data export ready notification
   */
  static dataExportReady(format: string): NotificationOptions {
    return {
      title: 'Data Export Ready',
      message: `Your data export in ${format} format is ready for download.`,
      type: NotificationType.SUCCESS,
      priority: NotificationPriority.NORMAL,
      persistent: true,
      actions: [
        { id: 'download', title: 'Download', primary: true },
        { id: 'dismiss', title: 'Later' }
      ],
      metadata: { category: 'data_export' }
    };
  }

  /**
   * Cohort expiration warning
   */
  static cohortExpiring(cohortNames: string[], daysUntilExpiry: number): NotificationOptions {
    const cohortList = cohortNames.length > 3 
      ? `${cohortNames.slice(0, 3).join(', ')} and ${cohortNames.length - 3} others`
      : cohortNames.join(', ');

    return {
      title: 'Cohorts Expiring Soon',
      message: `${cohortList} will expire in ${daysUntilExpiry} day${daysUntilExpiry > 1 ? 's' : ''}.`,
      type: NotificationType.INFO,
      priority: NotificationPriority.LOW,
      persistent: false,
      metadata: { category: 'cohort_expiration' }
    };
  }
}

/**
 * Main notification system that manages all user notifications
 */
export class NotificationSystem {
  private provider: NotificationProvider;
  private activeNotifications = new Map<string, NotificationOptions>();
  private eventListeners: ((event: NotificationEvent) => void)[] = [];
  private notificationHistory: NotificationEvent[] = [];
  private readonly MAX_HISTORY = 100;

  constructor(provider: NotificationProvider) {
    this.provider = provider;
    this.setupEventHandling();
  }

  /**
   * Show a notification to the user
   */
  async show(notification: NotificationOptions): Promise<string> {
    // Generate ID if not provided
    if (!notification.id) {
      notification.id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Set expiration if not provided
    if (!notification.expiresAt && !notification.persistent) {
      const expirationMinutes = this.getDefaultExpiration(notification.priority);
      notification.expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);
    }

    try {
      const id = await this.provider.show(notification);
      this.activeNotifications.set(id, notification);
      
      // Schedule auto-dismissal if expiration is set
      if (notification.expiresAt) {
        this.scheduleAutoDismissal(id, notification.expiresAt);
      }

      return id;
    } catch (error) {
      console.error('Failed to show notification:', error);
      throw error;
    }
  }

  /**
   * Update an existing notification
   */
  async update(id: string, updates: Partial<NotificationOptions>): Promise<boolean> {
    const existing = this.activeNotifications.get(id);
    if (!existing) {
      return false;
    }

    try {
      const success = await this.provider.update(id, updates);
      if (success) {
        const updated = { ...existing, ...updates };
        this.activeNotifications.set(id, updated);
      }
      return success;
    } catch (error) {
      console.error('Failed to update notification:', error);
      return false;
    }
  }

  /**
   * Dismiss a specific notification
   */
  async dismiss(id: string): Promise<boolean> {
    try {
      const success = await this.provider.dismiss(id);
      if (success) {
        this.activeNotifications.delete(id);
      }
      return success;
    } catch (error) {
      console.error('Failed to dismiss notification:', error);
      return false;
    }
  }

  /**
   * Dismiss all notifications
   */
  async dismissAll(): Promise<void> {
    try {
      await this.provider.dismissAll();
      this.activeNotifications.clear();
    } catch (error) {
      console.error('Failed to dismiss all notifications:', error);
      throw error;
    }
  }

  /**
   * Get all active notifications
   */
  async getActive(): Promise<NotificationOptions[]> {
    try {
      return await this.provider.getActive();
    } catch (error) {
      console.error('Failed to get active notifications:', error);
      return [];
    }
  }

  /**
   * Get notification history
   */
  getHistory(limit?: number): NotificationEvent[] {
    const history = [...this.notificationHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Add event listener for notification events
   */
  addEventListener(callback: (event: NotificationEvent) => void): void {
    this.eventListeners.push(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: (event: NotificationEvent) => void): void {
    const index = this.eventListeners.indexOf(callback);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Setup event handling from the provider
   */
  private setupEventHandling(): void {
    this.provider.onEvent((event) => {
      // Add to history
      this.notificationHistory.unshift(event);
      if (this.notificationHistory.length > this.MAX_HISTORY) {
        this.notificationHistory = this.notificationHistory.slice(0, this.MAX_HISTORY);
      }

      // Clean up active notifications on dismiss
      if (event.action === 'dismissed') {
        this.activeNotifications.delete(event.notificationId);
      }

      // Notify listeners
      this.eventListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in notification event listener:', error);
        }
      });
    });
  }

  /**
   * Get default expiration time based on priority
   */
  private getDefaultExpiration(priority: NotificationPriority): number {
    switch (priority) {
      case NotificationPriority.LOW: return 5; // 5 minutes
      case NotificationPriority.NORMAL: return 15; // 15 minutes
      case NotificationPriority.HIGH: return 60; // 1 hour
      case NotificationPriority.CRITICAL: return 0; // No auto-dismissal
      default: return 15;
    }
  }

  /**
   * Schedule automatic dismissal of a notification
   */
  private scheduleAutoDismissal(id: string, expiresAt: Date): void {
    const delay = expiresAt.getTime() - Date.now();
    if (delay > 0) {
      setTimeout(async () => {
        if (this.activeNotifications.has(id)) {
          await this.dismiss(id);
        }
      }, delay);
    }
  }
}
