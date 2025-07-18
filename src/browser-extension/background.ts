import { BrowserHistoryMonitor } from './browsing-history-monitor';
import { getBrowserAPI, BrowserDetection } from './browser-compatibility';

// Browser extension background service worker
class BackgroundService {
  private historyMonitor: BrowserHistoryMonitor;

  constructor() {
    this.historyMonitor = new BrowserHistoryMonitor();
    this.initialize();
  }

  private initialize(): void {
    // Start monitoring when extension loads
    this.historyMonitor.startMonitoring();
    
    // Handle extension lifecycle events
    chrome.runtime.onStartup.addListener(() => {
      console.log('Extension startup - starting history monitoring');
      this.historyMonitor.startMonitoring();
    });

    chrome.runtime.onSuspend.addListener(() => {
      console.log('Extension suspend - stopping history monitoring');
      this.historyMonitor.stopMonitoring();
    });

    // Handle messages from popup or content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  private handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void): void {
    switch (message.type) {
      case 'GET_MONITORING_STATUS':
        sendResponse({
          isMonitoring: this.historyMonitor.isCurrentlyMonitoring(),
          trackedDomains: this.historyMonitor.getTrackedDomainCount()
        });
        break;

      case 'START_MONITORING':
        this.historyMonitor.startMonitoring();
        sendResponse({ success: true });
        break;

      case 'STOP_MONITORING':
        this.historyMonitor.stopMonitoring();
        sendResponse({ success: true });
        break;

      case 'GET_DOMAIN_VISITS':
        const timeRange = message.timeRange;
        const visits = this.historyMonitor.getDomainVisits(timeRange);
        sendResponse({ visits });
        break;

      case 'CLEAR_DATA':
        this.historyMonitor.clearAllData();
        sendResponse({ success: true });
        break;

      case 'GET_ACTIVE_COHORTS':
        this.getActiveCohorts(sendResponse);
        break;

      case 'GET_SHARING_PREFERENCES':
        this.getSharingPreferences(sendResponse);
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }

  /**
   * Get active cohort IDs for content script
   */
  private async getActiveCohorts(sendResponse: (response: any) => void): Promise<void> {
    try {
      const profile = await this.storage.getUserProfile('current_user');
      const cohortIds = profile?.activeCohorts || [];
      sendResponse({ cohortIds });
    } catch (error) {
      console.error('Failed to get active cohorts:', error);
      sendResponse({ cohortIds: [] });
    }
  }

  /**
   * Get sharing preferences for content script
   */
  private async getSharingPreferences(sendResponse: (response: any) => void): Promise<void> {
    try {
      const profile = await this.storage.getUserProfile('current_user');
      const shareWithAdvertisers = profile?.preferences?.shareWithAdvertisers || false;
      sendResponse({ shareWithAdvertisers });
    } catch (error) {
      console.error('Failed to get sharing preferences:', error);
      sendResponse({ shareWithAdvertisers: false });
    }
  }
}

// Initialize background service
const backgroundService = new BackgroundService();