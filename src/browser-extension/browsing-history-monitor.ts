import { BrowsingHistoryMonitor, DomainVisit } from '../shared/interfaces/browsing-history';
import { TimeRange } from '../shared/interfaces/common';
import { getBrowserAPI, BrowserDetection } from './browser-compatibility';

/**
 * Browser extension implementation of browsing history monitoring
 * Uses webNavigation API to capture page visits with privacy filtering
 */
export class BrowserHistoryMonitor implements BrowsingHistoryMonitor {
  private isMonitoring = false;
  private domainVisits = new Map<string, DomainVisit>();
  private lastProcessTime = 0;
  private readonly RATE_LIMIT_MS = 100; // Minimum time between processing visits
  private readonly MAX_VISITS_PER_DOMAIN = 1000; // Memory optimization
  private browserAPI: any;
  
  // Sensitive domains to exclude from tracking
  private readonly SENSITIVE_DOMAINS = new Set([
    // Banking and financial keywords
    'bank', 'banking', 'credit', 'loan', 'mortgage', 'finance',
    'paypal', 'stripe', 'venmo', 'cashapp', 'zelle',
    
    // Healthcare keywords
    'health', 'medical', 'hospital', 'clinic', 'doctor', 'pharmacy',
    'medicine', 'patient', 'therapy', 'mental',
    
    // Government and legal keywords
    'gov', 'irs', 'tax', 'court', 'legal', 'lawyer',
    
    // Adult content keywords
    'adult', 'porn', 'xxx', 'sex',
    
    // Personal services keywords
    'dating', 'relationship', 'counseling'
  ]);

  // Specific sensitive domains (exact matches)
  private readonly SENSITIVE_EXACT_DOMAINS = new Set([
    // Major banks
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citibank.com',
    'usbank.com', 'pnc.com', 'capitalone.com', 'tdbank.com',
    
    // Financial services
    'paypal.com', 'stripe.com', 'venmo.com', 'cashapp.com',
    
    // Healthcare
    'myhealthrecords.com', 'pharmacy.com', 'mentalhealth.org',
    
    // Government
    'irs.gov', 'state.gov', 'defense.mil'
  ]);

  private readonly SENSITIVE_TLDS = new Set([
    '.gov', '.mil', '.edu'
  ]);

  constructor() {
    this.onNavigationCompleted = this.onNavigationCompleted.bind(this);
    this.browserAPI = getBrowserAPI();
  }

  /**
   * Start monitoring browsing history using webNavigation API
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    if (this.browserAPI && this.browserAPI.webNavigation) {
      this.browserAPI.webNavigation.onCompleted.addListener(this.onNavigationCompleted);
      this.isMonitoring = true;
      console.log(`BrowserHistoryMonitor: Started monitoring on ${BrowserDetection.getBrowserName()}`);
    } else {
      console.error('BrowserHistoryMonitor: webNavigation API not available');
    }
  }

  /**
   * Stop monitoring browsing history
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.browserAPI && this.browserAPI.webNavigation) {
      this.browserAPI.webNavigation.onCompleted.removeListener(this.onNavigationCompleted);
      this.isMonitoring = false;
      console.log(`BrowserHistoryMonitor: Stopped monitoring on ${BrowserDetection.getBrowserName()}`);
    }
  }

  /**
   * Handle page visit events with rate limiting and filtering
   */
  onPageVisit(url: string, timestamp: Date): void {
    try {
      const domain = this.extractDomain(url);
      if (!domain || this.isSensitiveDomain(domain)) {
        return;
      }

      // Rate limiting per domain - prevent excessive processing for same domain
      const existing = this.domainVisits.get(domain);
      if (existing && (timestamp.getTime() - existing.timestamp.getTime()) < this.RATE_LIMIT_MS) {
        return;
      }

      this.recordDomainVisit(domain, timestamp);
    } catch (error) {
      console.error('BrowserHistoryMonitor: Error processing page visit:', error);
    }
  }

  /**
   * Get domain visits within specified time range
   */
  getDomainVisits(timeRange: TimeRange): DomainVisit[] {
    const visits: DomainVisit[] = [];
    
    for (const visit of this.domainVisits.values()) {
      if (visit.timestamp >= timeRange.startDate && visit.timestamp <= timeRange.endDate) {
        visits.push({ ...visit }); // Return copy to prevent mutation
      }
    }

    return visits.sort((a, b) => b.visitCount - a.visitCount);
  }

  /**
   * Handle webNavigation onCompleted events
   */
  private onNavigationCompleted(details: chrome.webNavigation.WebNavigationCompletedEvent): void {
    // Only process main frame navigations (not iframes)
    if (details.frameId !== 0) {
      return;
    }

    // Skip non-HTTP(S) URLs
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) {
      return;
    }

    this.onPageVisit(details.url, new Date());
  }

  /**
   * Extract domain from URL with error handling
   */
  private extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch (error) {
      console.warn('BrowserHistoryMonitor: Invalid URL:', url);
      return null;
    }
  }

  /**
   * Check if domain should be excluded from tracking
   */
  private isSensitiveDomain(domain: string): boolean {
    const domainLower = domain.toLowerCase();
    
    // Check for exact domain matches first
    if (this.SENSITIVE_EXACT_DOMAINS.has(domainLower)) {
      return true;
    }

    // Check for sensitive TLDs
    for (const tld of this.SENSITIVE_TLDS) {
      if (domainLower.endsWith(tld)) {
        return true;
      }
    }

    // Check for sensitive keywords in domain
    for (const keyword of this.SENSITIVE_DOMAINS) {
      if (domainLower.includes(keyword)) {
        return true;
      }
    }

    // Additional checks for common sensitive patterns
    if (this.isLocalhost(domain) || this.isPrivateIP(domain)) {
      return true;
    }

    return false;
  }

  /**
   * Check if domain is localhost
   */
  private isLocalhost(domain: string): boolean {
    return domain === 'localhost' || 
           domain.startsWith('127.') || 
           domain.startsWith('192.168.') ||
           domain.startsWith('10.') ||
           domain.startsWith('172.');
  }

  /**
   * Check if domain is a private IP address
   */
  private isPrivateIP(domain: string): boolean {
    const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (!ipRegex.test(domain)) {
      return false;
    }

    const parts = domain.split('.').map(Number);
    return (
      (parts[0] === 10) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }

  /**
   * Record or update domain visit with memory optimization
   */
  private recordDomainVisit(domain: string, timestamp: Date): void {
    const existing = this.domainVisits.get(domain);
    
    if (existing) {
      // Update existing visit - increment count and update timestamp
      existing.visitCount = Math.min(existing.visitCount + 1, this.MAX_VISITS_PER_DOMAIN);
      existing.timestamp = timestamp;
    } else {
      // Create new visit record
      this.domainVisits.set(domain, {
        domain,
        timestamp,
        visitCount: 1
      });
    }

    // Memory optimization - limit total stored domains
    if (this.domainVisits.size > 10000) {
      this.cleanupOldVisits();
    }
  }

  /**
   * Clean up old visits to prevent memory bloat
   */
  private cleanupOldVisits(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDelete: string[] = [];

    for (const [domain, visit] of this.domainVisits.entries()) {
      if (visit.timestamp < oneWeekAgo) {
        toDelete.push(domain);
      }
    }

    for (const domain of toDelete) {
      this.domainVisits.delete(domain);
    }

    console.log(`BrowserHistoryMonitor: Cleaned up ${toDelete.length} old visits`);
  }

  /**
   * Get current monitoring status
   */
  isCurrentlyMonitoring(): boolean {
    return this.isMonitoring;
  }

  /**
   * Get total number of tracked domains
   */
  getTrackedDomainCount(): number {
    return this.domainVisits.size;
  }

  /**
   * Clear all stored visit data
   */
  clearAllData(): void {
    this.domainVisits.clear();
    console.log('BrowserHistoryMonitor: Cleared all visit data');
  }
}