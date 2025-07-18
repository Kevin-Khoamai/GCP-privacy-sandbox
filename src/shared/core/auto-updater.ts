/**
 * Automatic Update System for Privacy Cohort Tracker
 * Handles version checking, update notifications, and seamless updates
 */
export class AutoUpdater {
  private static instance: AutoUpdater;
  private updateCheckInterval: number = 24 * 60 * 60 * 1000; // 24 hours
  private updateCheckTimer: NodeJS.Timeout | null = null;
  private currentVersion: string;
  private updateEndpoint: string = 'https://api.privacy-cohort-tracker.com/updates';
  
  private constructor() {
    this.currentVersion = this.getCurrentVersion();
  }

  public static getInstance(): AutoUpdater {
    if (!AutoUpdater.instance) {
      AutoUpdater.instance = new AutoUpdater();
    }
    return AutoUpdater.instance;
  }

  public async initialize(): Promise<void> {
    try {
      // Start periodic update checks
      this.startUpdateChecks();
      
      // Check for updates on initialization
      await this.checkForUpdates();
      
      console.log('AutoUpdater initialized successfully');
    } catch (error) {
      console.error('AutoUpdater initialization failed:', error);
    }
  }

  public async checkForUpdates(force: boolean = false): Promise<UpdateInfo | null> {
    try {
      const lastCheck = await this.getLastUpdateCheck();
      const now = Date.now();
      
      // Skip check if not forced and within check interval
      if (!force && lastCheck && (now - lastCheck) < this.updateCheckInterval) {
        return null;
      }
      
      // Fetch update information
      const updateInfo = await this.fetchUpdateInfo();
      
      // Store last check time
      await this.setLastUpdateCheck(now);
      
      if (updateInfo && this.isNewerVersion(updateInfo.version, this.currentVersion)) {
        // New version available
        await this.handleUpdateAvailable(updateInfo);
        return updateInfo;
      }
      
      return null;
    } catch (error) {
      console.error('Update check failed:', error);
      return null;
    }
  }

  private async fetchUpdateInfo(): Promise<UpdateInfo | null> {
    try {
      // In a browser extension, we'll use the browser's update mechanism
      // This is primarily for informational purposes and user notifications
      
      const response = await fetch(`${this.updateEndpoint}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentVersion: this.currentVersion,
          platform: this.getPlatform(),
          browser: this.getBrowser()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Update check failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.updateAvailable) {
        return {
          version: data.version,
          releaseDate: new Date(data.releaseDate),
          releaseNotes: data.releaseNotes,
          downloadUrl: data.downloadUrl,
          critical: data.critical || false,
          size: data.size,
          checksum: data.checksum,
          minimumVersion: data.minimumVersion
        };
      }
      
      return null;
    } catch (error) {
      // Fallback to local update check if network fails
      console.warn('Network update check failed, using local mechanism');
      return await this.checkBrowserStoreUpdates();
    }
  }

  private async checkBrowserStoreUpdates(): Promise<UpdateInfo | null> {
    // Browser extensions are typically updated through the browser's store
    // We can check if an update is pending or available
    
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return new Promise((resolve) => {
        chrome.runtime.requestUpdateCheck((status, details) => {
          if (status === 'update_available' && details) {
            resolve({
              version: details.version,
              releaseDate: new Date(),
              releaseNotes: 'Update available through browser store',
              downloadUrl: '',
              critical: false,
              size: 0,
              checksum: '',
              minimumVersion: this.currentVersion
            });
          } else {
            resolve(null);
          }
        });
      });
    }
    
    return null;
  }

  private async handleUpdateAvailable(updateInfo: UpdateInfo): Promise<void> {
    try {
      // Store update information
      await this.storeUpdateInfo(updateInfo);
      
      // Show update notification
      await this.showUpdateNotification(updateInfo);
      
      // If critical update, show more prominent notification
      if (updateInfo.critical) {
        await this.showCriticalUpdateNotification(updateInfo);
      }
      
      // Log update availability
      console.log(`Update available: ${updateInfo.version}`);
      
    } catch (error) {
      console.error('Failed to handle update notification:', error);
    }
  }

  private async showUpdateNotification(updateInfo: UpdateInfo): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      const notificationId = `update-${updateInfo.version}`;
      
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: '/icons/icon-48.png',
        title: 'Privacy Cohort Tracker Update Available',
        message: `Version ${updateInfo.version} is now available. Click to learn more.`,
        buttons: [
          { title: 'View Details' },
          { title: 'Remind Later' }
        ]
      });
      
      // Handle notification clicks
      chrome.notifications.onButtonClicked.addListener((notifId, buttonIndex) => {
        if (notifId === notificationId) {
          if (buttonIndex === 0) {
            this.openUpdatePage(updateInfo);
          } else {
            this.snoozeUpdateNotification();
          }
          chrome.notifications.clear(notifId);
        }
      });
    }
  }

  private async showCriticalUpdateNotification(updateInfo: UpdateInfo): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      const notificationId = `critical-update-${updateInfo.version}`;
      
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: '/icons/icon-48.png',
        title: 'Critical Security Update Available',
        message: `Important security update ${updateInfo.version} is available. Please update as soon as possible.`,
        priority: 2,
        buttons: [
          { title: 'Update Now' },
          { title: 'View Details' }
        ]
      });
      
      chrome.notifications.onButtonClicked.addListener((notifId, buttonIndex) => {
        if (notifId === notificationId) {
          if (buttonIndex === 0) {
            this.initiateUpdate(updateInfo);
          } else {
            this.openUpdatePage(updateInfo);
          }
          chrome.notifications.clear(notifId);
        }
      });
    }
  }

  private async openUpdatePage(updateInfo: UpdateInfo): Promise<void> {
    const updatePageUrl = this.getUpdatePageUrl(updateInfo);
    
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      await chrome.tabs.create({ url: updatePageUrl });
    } else {
      window.open(updatePageUrl, '_blank');
    }
  }

  private getUpdatePageUrl(updateInfo: UpdateInfo): string {
    const browser = this.getBrowser();
    const storeUrls = {
      chrome: 'https://chrome.google.com/webstore/detail/privacy-cohort-tracker',
      firefox: 'https://addons.mozilla.org/firefox/addon/privacy-cohort-tracker',
      safari: 'https://apps.apple.com/app/privacy-cohort-tracker',
      edge: 'https://microsoftedge.microsoft.com/addons/detail/privacy-cohort-tracker'
    };
    
    return storeUrls[browser as keyof typeof storeUrls] || 'https://privacy-cohort-tracker.com/download';
  }

  private async initiateUpdate(updateInfo: UpdateInfo): Promise<void> {
    try {
      // For browser extensions, we can't directly update
      // Instead, we guide the user to the appropriate store
      
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        // Chrome extensions can request an update check
        chrome.runtime.requestUpdateCheck((status) => {
          if (status === 'update_available') {
            chrome.runtime.reload();
          } else {
            this.openUpdatePage(updateInfo);
          }
        });
      } else {
        // For other browsers, open the store page
        this.openUpdatePage(updateInfo);
      }
    } catch (error) {
      console.error('Failed to initiate update:', error);
      this.openUpdatePage(updateInfo);
    }
  }

  private async snoozeUpdateNotification(): Promise<void> {
    // Snooze for 24 hours
    const snoozeUntil = Date.now() + (24 * 60 * 60 * 1000);
    await this.setUpdateSnooze(snoozeUntil);
  }

  private isNewerVersion(newVersion: string, currentVersion: string): boolean {
    const parseVersion = (version: string): number[] => {
      return version.split('.').map(num => parseInt(num, 10));
    };
    
    const newParts = parseVersion(newVersion);
    const currentParts = parseVersion(currentVersion);
    
    for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
      const newPart = newParts[i] || 0;
      const currentPart = currentParts[i] || 0;
      
      if (newPart > currentPart) return true;
      if (newPart < currentPart) return false;
    }
    
    return false;
  }

  private startUpdateChecks(): void {
    this.updateCheckTimer = setInterval(async () => {
      await this.checkForUpdates();
    }, this.updateCheckInterval);
  }

  public stopUpdateChecks(): void {
    if (this.updateCheckTimer) {
      clearInterval(this.updateCheckTimer);
      this.updateCheckTimer = null;
    }
  }

  // Storage methods
  private async getLastUpdateCheck(): Promise<number | null> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(['lastUpdateCheck']);
      return result.lastUpdateCheck || null;
    }
    
    const stored = localStorage.getItem('lastUpdateCheck');
    return stored ? parseInt(stored, 10) : null;
  }

  private async setLastUpdateCheck(timestamp: number): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ lastUpdateCheck: timestamp });
    } else {
      localStorage.setItem('lastUpdateCheck', timestamp.toString());
    }
  }

  private async storeUpdateInfo(updateInfo: UpdateInfo): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ availableUpdate: updateInfo });
    } else {
      localStorage.setItem('availableUpdate', JSON.stringify(updateInfo));
    }
  }

  private async setUpdateSnooze(snoozeUntil: number): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ updateSnoozeUntil: snoozeUntil });
    } else {
      localStorage.setItem('updateSnoozeUntil', snoozeUntil.toString());
    }
  }

  // Utility methods
  private getCurrentVersion(): string {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime.getManifest().version;
    }
    
    // Fallback version
    return '1.0.0';
  }

  private getPlatform(): string {
    if (typeof navigator !== 'undefined') {
      return navigator.platform;
    }
    return 'unknown';
  }

  private getBrowser(): string {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const manifest = chrome.runtime.getManifest();
      if (manifest.manifest_version === 3) {
        return 'chrome';
      }
    }
    
    if (typeof browser !== 'undefined') {
      return 'firefox';
    }
    
    // Detect other browsers
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      return 'safari';
    }
    if (userAgent.includes('edg/')) {
      return 'edge';
    }
    
    return 'unknown';
  }

  // Public API methods
  public async getAvailableUpdate(): Promise<UpdateInfo | null> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(['availableUpdate']);
      return result.availableUpdate || null;
    }
    
    const stored = localStorage.getItem('availableUpdate');
    return stored ? JSON.parse(stored) : null;
  }

  public async dismissUpdate(version: string): Promise<void> {
    const dismissedUpdates = await this.getDismissedUpdates();
    dismissedUpdates.push(version);
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ dismissedUpdates });
    } else {
      localStorage.setItem('dismissedUpdates', JSON.stringify(dismissedUpdates));
    }
  }

  private async getDismissedUpdates(): Promise<string[]> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(['dismissedUpdates']);
      return result.dismissedUpdates || [];
    }
    
    const stored = localStorage.getItem('dismissedUpdates');
    return stored ? JSON.parse(stored) : [];
  }

  public setUpdateCheckInterval(intervalMs: number): void {
    this.updateCheckInterval = intervalMs;
    
    // Restart update checks with new interval
    this.stopUpdateChecks();
    this.startUpdateChecks();
  }

  public getCurrentVersion(): string {
    return this.currentVersion;
  }
}

// Type definitions
export interface UpdateInfo {
  version: string;
  releaseDate: Date;
  releaseNotes: string;
  downloadUrl: string;
  critical: boolean;
  size: number;
  checksum: string;
  minimumVersion: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  updateInfo?: UpdateInfo;
  error?: string;
}
