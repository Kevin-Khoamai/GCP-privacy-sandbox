import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserHistoryMonitor } from '../src/browser-extension/browsing-history-monitor';
import { TimeRange } from '../src/shared/interfaces/common';

// Mock Chrome APIs
const mockChrome = {
  webNavigation: {
    onCompleted: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
};

// Make chrome available globally
(global as any).chrome = mockChrome;

describe('BrowserHistoryMonitor', () => {
  let monitor: BrowserHistoryMonitor;

  beforeEach(() => {
    monitor = new BrowserHistoryMonitor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  describe('Monitoring Control', () => {
    it('should start monitoring and register webNavigation listener', () => {
      monitor.startMonitoring();
      
      expect(mockChrome.webNavigation.onCompleted.addListener).toHaveBeenCalledTimes(1);
      expect(monitor.isCurrentlyMonitoring()).toBe(true);
    });

    it('should stop monitoring and remove webNavigation listener', () => {
      monitor.startMonitoring();
      monitor.stopMonitoring();
      
      expect(mockChrome.webNavigation.onCompleted.removeListener).toHaveBeenCalledTimes(1);
      expect(monitor.isCurrentlyMonitoring()).toBe(false);
    });

    it('should not start monitoring twice', () => {
      monitor.startMonitoring();
      monitor.startMonitoring();
      
      expect(mockChrome.webNavigation.onCompleted.addListener).toHaveBeenCalledTimes(1);
    });

    it('should handle missing webNavigation API gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (global as any).chrome = {};
      
      const newMonitor = new BrowserHistoryMonitor();
      newMonitor.startMonitoring();
      
      expect(consoleSpy).toHaveBeenCalledWith('BrowserHistoryMonitor: webNavigation API not available');
      expect(newMonitor.isCurrentlyMonitoring()).toBe(false);
      
      consoleSpy.mockRestore();
      (global as any).chrome = mockChrome;
    });
  });

  describe('Page Visit Processing', () => {
    it('should record valid domain visits', () => {
      const testUrl = 'https://example.com/page';
      const timestamp = new Date();
      
      monitor.onPageVisit(testUrl, timestamp);
      
      const timeRange: TimeRange = {
        startDate: new Date(timestamp.getTime() - 1000),
        endDate: new Date(timestamp.getTime() + 1000)
      };
      
      const visits = monitor.getDomainVisits(timeRange);
      expect(visits).toHaveLength(1);
      expect(visits[0].domain).toBe('example.com');
      expect(visits[0].visitCount).toBe(1);
    });

    it('should increment visit count for repeated visits to same domain', () => {
      const testUrl = 'https://example.com/page1';
      const timestamp1 = new Date();
      const timestamp2 = new Date(timestamp1.getTime() + 120000); // 2 minutes later
      
      monitor.onPageVisit(testUrl, timestamp1);
      monitor.onPageVisit('https://example.com/page2', timestamp2);
      
      const timeRange: TimeRange = {
        startDate: new Date(timestamp1.getTime() - 1000),
        endDate: new Date(timestamp2.getTime() + 1000)
      };
      
      const visits = monitor.getDomainVisits(timeRange);
      expect(visits).toHaveLength(1);
      expect(visits[0].domain).toBe('example.com');
      expect(visits[0].visitCount).toBe(2);
    });

    it('should not increment visit count for rapid successive visits', () => {
      const testUrl = 'https://example.com/page';
      const timestamp = new Date();
      
      monitor.onPageVisit(testUrl, timestamp);
      monitor.onPageVisit(testUrl, new Date(timestamp.getTime() + 50)); // 50ms later (within rate limit)
      
      const timeRange: TimeRange = {
        startDate: new Date(timestamp.getTime() - 1000),
        endDate: new Date(timestamp.getTime() + 60000)
      };
      
      const visits = monitor.getDomainVisits(timeRange);
      expect(visits).toHaveLength(1);
      expect(visits[0].visitCount).toBe(1);
    });

    it('should handle invalid URLs gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      monitor.onPageVisit('invalid-url', new Date());
      
      expect(consoleSpy).toHaveBeenCalledWith('BrowserHistoryMonitor: Invalid URL:', 'invalid-url');
      expect(monitor.getTrackedDomainCount()).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Domain Filtering', () => {
    it('should filter out banking domains', () => {
      const bankingUrls = [
        'https://chase.com/login',
        'https://bankofamerica.com/account',
        'https://wellsfargo.com/banking',
        'https://paypal.com/send'
      ];
      
      bankingUrls.forEach(url => {
        monitor.onPageVisit(url, new Date());
      });
      
      expect(monitor.getTrackedDomainCount()).toBe(0);
    });

    it('should filter out healthcare domains', () => {
      const healthUrls = [
        'https://myhealthrecords.com',
        'https://doctoroffice.medical',
        'https://pharmacy.com/prescriptions',
        'https://mentalhealth.org'
      ];
      
      healthUrls.forEach(url => {
        monitor.onPageVisit(url, new Date());
      });
      
      expect(monitor.getTrackedDomainCount()).toBe(0);
    });

    it('should filter out government domains', () => {
      const govUrls = [
        'https://irs.gov/taxes',
        'https://state.gov/passport',
        'https://defense.mil/news'
      ];
      
      govUrls.forEach(url => {
        monitor.onPageVisit(url, new Date());
      });
      
      expect(monitor.getTrackedDomainCount()).toBe(0);
    });

    it('should filter out localhost and private IPs', () => {
      const localUrls = [
        'http://localhost:3000',
        'http://127.0.0.1:8080',
        'http://192.168.1.1',
        'http://10.0.0.1',
        'http://172.16.0.1'
      ];
      
      localUrls.forEach(url => {
        monitor.onPageVisit(url, new Date());
      });
      
      expect(monitor.getTrackedDomainCount()).toBe(0);
    });

    it('should allow legitimate domains', () => {
      const legitimateUrls = [
        'https://google.com/search',
        'https://stackoverflow.com/questions',
        'https://github.com/user/repo',
        'https://news.ycombinator.com'
      ];
      
      legitimateUrls.forEach(url => {
        monitor.onPageVisit(url, new Date());
      });
      
      expect(monitor.getTrackedDomainCount()).toBe(4);
    });
  });

  describe('Time Range Filtering', () => {
    it('should return visits within specified time range', () => {
      const baseTime = new Date('2025-01-01T12:00:00Z');
      const urls = [
        { url: 'https://example1.com', time: new Date(baseTime.getTime()) },
        { url: 'https://example2.com', time: new Date(baseTime.getTime() + 3600000) }, // 1 hour later
        { url: 'https://example3.com', time: new Date(baseTime.getTime() + 7200000) }  // 2 hours later
      ];
      
      urls.forEach(({ url, time }) => {
        monitor.onPageVisit(url, time);
      });
      
      const timeRange: TimeRange = {
        startDate: new Date(baseTime.getTime() + 1800000), // 30 minutes after base
        endDate: new Date(baseTime.getTime() + 5400000)    // 1.5 hours after base
      };
      
      const visits = monitor.getDomainVisits(timeRange);
      expect(visits).toHaveLength(1);
      expect(visits[0].domain).toBe('example2.com');
    });

    it('should return empty array for time range with no visits', () => {
      monitor.onPageVisit('https://example.com', new Date('2025-01-01T12:00:00Z'));
      
      const timeRange: TimeRange = {
        startDate: new Date('2025-01-02T12:00:00Z'),
        endDate: new Date('2025-01-03T12:00:00Z')
      };
      
      const visits = monitor.getDomainVisits(timeRange);
      expect(visits).toHaveLength(0);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to prevent excessive processing', () => {
      const testUrl = 'https://example.com';
      const timestamp = new Date();
      
      // Rapid successive calls
      for (let i = 0; i < 10; i++) {
        monitor.onPageVisit(testUrl, new Date(timestamp.getTime() + i * 10));
      }
      
      // Should have processed fewer visits due to rate limiting
      expect(monitor.getTrackedDomainCount()).toBeLessThanOrEqual(2);
    });
  });

  describe('Memory Management', () => {
    it('should limit visit count per domain', () => {
      const testUrl = 'https://example.com';
      const baseTime = new Date();
      
      // Simulate many visits over time
      for (let i = 0; i < 1500; i++) {
        monitor.onPageVisit(testUrl, new Date(baseTime.getTime() + i * 120000)); // 2 minutes apart
      }
      
      const timeRange: TimeRange = {
        startDate: new Date(baseTime.getTime() - 1000),
        endDate: new Date(baseTime.getTime() + 200000000)
      };
      
      const visits = monitor.getDomainVisits(timeRange);
      expect(visits[0].visitCount).toBeLessThanOrEqual(1000);
    });

    it('should clear all data when requested', () => {
      monitor.onPageVisit('https://example1.com', new Date());
      monitor.onPageVisit('https://example2.com', new Date());
      
      expect(monitor.getTrackedDomainCount()).toBe(2);
      
      monitor.clearAllData();
      
      expect(monitor.getTrackedDomainCount()).toBe(0);
    });
  });

  describe('Visit Sorting', () => {
    it('should return visits sorted by visit count descending', () => {
      const baseTime = new Date();
      
      // Create visits with different frequencies
      monitor.onPageVisit('https://low-frequency.com', baseTime);
      
      for (let i = 0; i < 3; i++) {
        monitor.onPageVisit('https://high-frequency.com', new Date(baseTime.getTime() + i * 120000));
      }
      
      for (let i = 0; i < 2; i++) {
        monitor.onPageVisit('https://medium-frequency.com', new Date(baseTime.getTime() + i * 120000));
      }
      
      const timeRange: TimeRange = {
        startDate: new Date(baseTime.getTime() - 1000),
        endDate: new Date(baseTime.getTime() + 500000)
      };
      
      const visits = monitor.getDomainVisits(timeRange);
      expect(visits).toHaveLength(3);
      expect(visits[0].domain).toBe('high-frequency.com');
      expect(visits[0].visitCount).toBe(3);
      expect(visits[1].domain).toBe('medium-frequency.com');
      expect(visits[1].visitCount).toBe(2);
      expect(visits[2].domain).toBe('low-frequency.com');
      expect(visits[2].visitCount).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in onPageVisit gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Force an error by mocking the extractDomain method to throw
      const originalExtractDomain = (monitor as any).extractDomain;
      (monitor as any).extractDomain = vi.fn().mockImplementation(() => {
        throw new Error('Domain extraction failed');
      });
      
      monitor.onPageVisit('https://example.com', new Date());
      
      expect(consoleSpy).toHaveBeenCalledWith('BrowserHistoryMonitor: Error processing page visit:', expect.any(Error));
      
      // Restore
      (monitor as any).extractDomain = originalExtractDomain;
      consoleSpy.mockRestore();
    });
  });
});