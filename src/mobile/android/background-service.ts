/**
 * Android background service for cohort processing
 * Handles background cohort assignment, data processing, and privacy management
 */

import { CohortEngine } from '../../shared/core/cohort-engine';
import { AndroidSecureStorageProvider } from './secure-storage';
import { BrowsingHistoryMonitor, DomainVisit } from '../../shared/interfaces/browsing-history';
import { TimeRange } from '../../shared/interfaces/common';

// Android-specific interfaces for native bridge communication
interface AndroidBackgroundService {
  startService(): Promise<void>;
  stopService(): Promise<void>;
  isServiceRunning(): Promise<boolean>;
  schedulePeriodicWork(intervalMinutes: number): Promise<void>;
  cancelPeriodicWork(): Promise<void>;
}

interface AndroidBrowserHistory {
  getVisitedUrls(timeRange: TimeRange): Promise<string[]>;
  requestHistoryPermission(): Promise<boolean>;
  hasHistoryPermission(): Promise<boolean>;
}

// Mock implementations for development - in real app these would be provided by native bridge
declare global {
  interface Window {
    AndroidBackgroundService?: AndroidBackgroundService;
    AndroidBrowserHistory?: AndroidBrowserHistory;
  }
}

/**
 * Android-specific browsing history monitor
 */
export class AndroidBrowsingHistoryMonitor implements BrowsingHistoryMonitor {
  private browserHistory: AndroidBrowserHistory;
  private isMonitoring = false;
  private domainVisits = new Map<string, DomainVisit>();
  private readonly SYNC_INTERVAL_MINUTES = 15;

  constructor() {
    if (!window.AndroidBrowserHistory) {
      throw new Error('Android browser history API not available');
    }
    this.browserHistory = window.AndroidBrowserHistory;
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    // Request permission if not already granted
    const hasPermission = await this.browserHistory.hasHistoryPermission();
    if (!hasPermission) {
      const granted = await this.browserHistory.requestHistoryPermission();
      if (!granted) {
        throw new Error('Browser history permission denied');
      }
    }

    this.isMonitoring = true;
    console.log('AndroidBrowsingHistoryMonitor: Started monitoring');
    
    // Start periodic sync
    this.schedulePeriodicSync();
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    console.log('AndroidBrowsingHistoryMonitor: Stopped monitoring');
  }

  onPageVisit(url: string, timestamp: Date): void {
    try {
      const domain = this.extractDomain(url);
      if (!domain || this.isSensitiveDomain(domain)) {
        return;
      }

      this.recordDomainVisit(domain, timestamp);
    } catch (error) {
      console.error('AndroidBrowsingHistoryMonitor: Error processing page visit:', error);
    }
  }

  async getVisitedDomains(timeRange: TimeRange): Promise<DomainVisit[]> {
    try {
      const urls = await this.browserHistory.getVisitedUrls(timeRange);
      const domainCounts = new Map<string, number>();

      // Process URLs and count domain visits
      for (const url of urls) {
        const domain = this.extractDomain(url);
        if (domain && !this.isSensitiveDomain(domain)) {
          domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
        }
      }

      // Convert to DomainVisit array
      const visits: DomainVisit[] = [];
      for (const [domain, count] of domainCounts.entries()) {
        visits.push({
          domain,
          timestamp: new Date(), // Use current time as approximation
          visitCount: count
        });
      }

      return visits.sort((a, b) => b.visitCount - a.visitCount);
    } catch (error) {
      console.error('AndroidBrowsingHistoryMonitor: Failed to get visited domains:', error);
      return [];
    }
  }

  clearAllData(): void {
    this.domainVisits.clear();
    console.log('AndroidBrowsingHistoryMonitor: Cleared all visit data');
  }

  private async schedulePeriodicSync(): Promise<void> {
    if (!this.isMonitoring) return;

    try {
      // Sync recent history
      const timeRange: TimeRange = {
        startDate: new Date(Date.now() - this.SYNC_INTERVAL_MINUTES * 60 * 1000),
        endDate: new Date()
      };

      const visits = await this.getVisitedDomains(timeRange);
      for (const visit of visits) {
        this.recordDomainVisit(visit.domain, visit.timestamp);
      }

      // Schedule next sync
      setTimeout(() => this.schedulePeriodicSync(), this.SYNC_INTERVAL_MINUTES * 60 * 1000);
    } catch (error) {
      console.error('AndroidBrowsingHistoryMonitor: Periodic sync failed:', error);
    }
  }

  private extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch (error) {
      return null;
    }
  }

  private isSensitiveDomain(domain: string): boolean {
    const sensitiveKeywords = ['bank', 'health', 'medical', 'gov', 'adult', 'porn'];
    const sensitiveTlds = ['.gov', '.mil', '.edu'];
    
    return sensitiveKeywords.some(keyword => domain.includes(keyword)) ||
           sensitiveTlds.some(tld => domain.endsWith(tld));
  }

  private recordDomainVisit(domain: string, timestamp: Date): void {
    const existing = this.domainVisits.get(domain);
    
    if (existing) {
      existing.visitCount += 1;
      existing.timestamp = timestamp;
    } else {
      this.domainVisits.set(domain, {
        domain,
        timestamp,
        visitCount: 1
      });
    }
  }
}

/**
 * Android background service for cohort processing
 */
export class AndroidCohortBackgroundService {
  private cohortEngine: CohortEngine;
  private storageProvider: AndroidSecureStorageProvider;
  private historyMonitor: AndroidBrowsingHistoryMonitor;
  private backgroundService: AndroidBackgroundService;
  private isRunning = false;

  constructor() {
    this.storageProvider = new AndroidSecureStorageProvider();
    this.cohortEngine = CohortEngine.getInstance();
    this.historyMonitor = new AndroidBrowsingHistoryMonitor();

    if (!window.AndroidBackgroundService) {
      throw new Error('Android background service API not available');
    }
    this.backgroundService = window.AndroidBackgroundService;
  }

  /**
   * Initialize the background service
   */
  async initialize(): Promise<void> {
    try {
      await this.storageProvider.initialize();
      console.log('AndroidCohortBackgroundService: Initialized successfully');
    } catch (error) {
      console.error('AndroidCohortBackgroundService: Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start the background service
   */
  async startService(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      await this.backgroundService.startService();
      await this.historyMonitor.startMonitoring();
      
      // Schedule periodic cohort processing
      await this.backgroundService.schedulePeriodicWork(30); // Every 30 minutes
      
      this.isRunning = true;
      console.log('AndroidCohortBackgroundService: Service started');
    } catch (error) {
      console.error('AndroidCohortBackgroundService: Failed to start service:', error);
      throw error;
    }
  }

  /**
   * Stop the background service
   */
  async stopService(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.backgroundService.stopService();
      await this.backgroundService.cancelPeriodicWork();
      this.historyMonitor.stopMonitoring();
      
      this.isRunning = false;
      console.log('AndroidCohortBackgroundService: Service stopped');
    } catch (error) {
      console.error('AndroidCohortBackgroundService: Failed to stop service:', error);
      throw error;
    }
  }

  /**
   * Check if service is running
   */
  async isServiceRunning(): Promise<boolean> {
    try {
      return await this.backgroundService.isServiceRunning();
    } catch (error) {
      console.error('AndroidCohortBackgroundService: Failed to check service status:', error);
      return false;
    }
  }

  /**
   * Process cohorts based on recent browsing history
   */
  async processCohorts(): Promise<void> {
    try {
      const timeRange: TimeRange = {
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        endDate: new Date()
      };

      const visits = await this.historyMonitor.getVisitedDomains(timeRange);

      if (visits.length > 0) {
        await this.cohortEngine.assignCohorts(visits);
        console.log(`AndroidCohortBackgroundService: Processed ${visits.length} domain visits`);
      }
    } catch (error) {
      console.error('AndroidCohortBackgroundService: Cohort processing failed:', error);
    }
  }

  /**
   * Get current service status
   */
  async getServiceStatus(): Promise<{
    isRunning: boolean;
    lastProcessed: Date | null;
    totalCohorts: number;
    activeCohorts: number;
  }> {
    try {
      const isRunning = await this.isServiceRunning();
      const currentCohorts = this.cohortEngine.getCurrentCohorts();

      return {
        isRunning,
        lastProcessed: new Date(), // Use current time as approximation
        totalCohorts: currentCohorts.length,
        activeCohorts: currentCohorts.length // All current cohorts are active
      };
    } catch (error) {
      console.error('AndroidCohortBackgroundService: Failed to get service status:', error);
      return {
        isRunning: false,
        lastProcessed: null,
        totalCohorts: 0,
        activeCohorts: 0
      };
    }
  }
}
