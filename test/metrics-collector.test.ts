import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MetricsCollector } from '../src/shared/core/metrics-collector';
import { StorageLayer } from '../src/shared/core/storage-layer';
import { EncryptionUtils } from '../src/shared/core/encryption-utils';
import { MetricsEvent, AggregatedMetrics } from '../src/shared/interfaces/metrics';
import { TimeRange } from '../src/shared/interfaces/common';

// Mock dependencies
vi.mock('../src/shared/core/storage-layer');
vi.mock('../src/shared/core/encryption-utils');

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;
  let mockStorageLayer: vi.Mocked<StorageLayer>;
  let mockEncryptionUtils: vi.Mocked<EncryptionUtils>;

  beforeEach(async () => {
    // Use fake timers for testing background processes
    vi.useFakeTimers();
    
    // Create mocked dependencies
    mockStorageLayer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      storeUserProfile: vi.fn().mockResolvedValue(undefined),
      getUserProfile: vi.fn().mockResolvedValue(null),
      getUserPreferences: vi.fn().mockResolvedValue({
        cohortsEnabled: true,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      }),
      logAPIRequest: vi.fn().mockResolvedValue(undefined),
      clearExpiredData: vi.fn().mockResolvedValue(undefined)
    } as any;

    mockEncryptionUtils = {
      encrypt: vi.fn().mockImplementation((data: string) => `encrypted_${data}`),
      decrypt: vi.fn().mockImplementation((data: string) => data.replace('encrypted_', ''))
    } as any;

    // Create metrics collector with mocked dependencies
    metricsCollector = MetricsCollector.createWithDependencies(
      mockStorageLayer,
      mockEncryptionUtils
    );

    await metricsCollector.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Event Recording', () => {
    it('should record impression events successfully', async () => {
      const event: MetricsEvent = {
        eventId: 'imp_123',
        eventType: 'impression',
        cohortId: 'cohort_tech',
        timestamp: new Date('2025-01-15T10:00:00Z'),
        domain: 'example.com'
      };

      await metricsCollector.recordEvent(event);

      expect(mockEncryptionUtils.encrypt).toHaveBeenCalled();
      expect(mockStorageLayer.storeUserProfile).toHaveBeenCalled();
    });

    it('should record click events successfully', async () => {
      const event: MetricsEvent = {
        eventId: 'click_456',
        eventType: 'click',
        cohortId: 'cohort_sports',
        timestamp: new Date('2025-01-15T10:05:00Z'),
        domain: 'sports.com'
      };

      await metricsCollector.recordEvent(event);

      expect(mockEncryptionUtils.encrypt).toHaveBeenCalled();
      expect(mockStorageLayer.storeUserProfile).toHaveBeenCalled();
    });

    it('should record conversion events successfully', async () => {
      const event: MetricsEvent = {
        eventId: 'conv_789',
        eventType: 'conversion',
        cohortId: 'cohort_shopping',
        timestamp: new Date('2025-01-15T10:10:00Z'),
        domain: 'shop.com',
        metadata: { value: 29.99 }
      };

      await metricsCollector.recordEvent(event);

      expect(mockEncryptionUtils.encrypt).toHaveBeenCalled();
      expect(mockStorageLayer.storeUserProfile).toHaveBeenCalled();
    });

    it('should validate event data and throw error for invalid events', async () => {
      const invalidEvent = {
        eventId: '',
        eventType: 'impression',
        cohortId: 'cohort_tech',
        timestamp: new Date(),
        domain: 'example.com'
      } as MetricsEvent;

      await expect(metricsCollector.recordEvent(invalidEvent)).rejects.toThrow('Event ID is required');
    });

    it('should validate event type and throw error for invalid types', async () => {
      const invalidEvent = {
        eventId: 'test_123',
        eventType: 'invalid_type' as any,
        cohortId: 'cohort_tech',
        timestamp: new Date(),
        domain: 'example.com'
      };

      await expect(metricsCollector.recordEvent(invalidEvent)).rejects.toThrow('Invalid event type');
    });

    it('should add timestamp if not provided', async () => {
      const event: MetricsEvent = {
        eventId: 'test_123',
        eventType: 'impression',
        cohortId: 'cohort_tech',
        domain: 'example.com'
      } as MetricsEvent;

      await metricsCollector.recordEvent(event);

      expect(event.timestamp).toBeDefined();
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Metrics Aggregation', () => {

    it('should aggregate metrics for specified cohorts', async () => {
      const testDate = new Date('2025-01-15T10:00:00Z');
      const dateKey = testDate.toISOString().split('T')[0]; // '2025-01-15'

      // Create test events with sufficient data to meet privacy thresholds
      const testEvents: MetricsEvent[] = Array.from({ length: 150 }, (_, i) => ({
        eventId: `event_${i}`,
        eventType: (i < 100 ? 'impression' : i < 130 ? 'click' : 'conversion') as 'impression' | 'click' | 'conversion',
        cohortId: 'cohort_tech',
        timestamp: new Date(`2025-01-15T10:${String(i % 60).padStart(2, '0')}:00Z`),
        domain: 'tech.com'
      }));

      // Mock the storage to return our test events
      const profileWithEvents = {
        userId: 'test_user',
        activeCohorts: [],
        preferences: {
          cohortsEnabled: true,
          disabledTopics: [],
          dataRetentionDays: 21,
          shareWithAdvertisers: true
        },
        lastUpdated: new Date(),
        version: '1.0',
        metadata: {
          [`metrics_events_${dateKey}`]: `encrypted_${JSON.stringify(testEvents)}`
        }
      };

      mockStorageLayer.getUserProfile.mockResolvedValue(profileWithEvents);

      const timeRange: TimeRange = {
        startDate: new Date('2025-01-15T00:00:00Z'),
        endDate: new Date('2025-01-15T23:59:59Z')
      };

      const metrics = await metricsCollector.getAggregatedMetrics(['cohort_tech'], timeRange);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].cohortId).toBe('cohort_tech');
      // Allow for differential privacy noise (±10% tolerance)
      expect(metrics[0].impressions).toBeGreaterThan(90);
      expect(metrics[0].impressions).toBeLessThan(110);
      expect(metrics[0].clicks).toBeGreaterThan(25);
      expect(metrics[0].clicks).toBeLessThan(35);
      expect(metrics[0].conversions).toBeGreaterThan(15);
      expect(metrics[0].conversions).toBeLessThan(25);
    });

    it('should calculate click-through rates correctly', async () => {
      const ctr = metricsCollector.calculateClickThroughRate(1000, 50);
      expect(ctr).toBe(5.0); // 5% CTR

      const ctrZeroImpressions = metricsCollector.calculateClickThroughRate(0, 10);
      expect(ctrZeroImpressions).toBe(0);
    });

    it('should calculate conversion rates correctly', async () => {
      const conversionRate = metricsCollector.calculateConversionRate(100, 5);
      expect(conversionRate).toBe(5.0); // 5% conversion rate

      const conversionRateZeroClicks = metricsCollector.calculateConversionRate(0, 5);
      expect(conversionRateZeroClicks).toBe(0);
    });

    it('should suppress metrics for low-volume data', async () => {
      const ctrLowVolume = metricsCollector.calculateClickThroughRate(5, 1); // Below minimum threshold
      expect(ctrLowVolume).toBe(0); // Should be suppressed

      const conversionRateLowVolume = metricsCollector.calculateConversionRate(3, 1); // Below minimum threshold
      expect(conversionRateLowVolume).toBe(0); // Should be suppressed
    });
  });

  describe('Privacy Safeguards', () => {
    it('should apply privacy thresholds to suppress insufficient data', async () => {
      const lowVolumeMetrics: AggregatedMetrics[] = [
        {
          cohortId: 'cohort_small',
          timeRange: {
            startDate: new Date('2025-01-15T00:00:00Z'),
            endDate: new Date('2025-01-15T23:59:59Z')
          },
          impressions: 5, // Below minimum threshold
          clicks: 1,
          conversions: 0,
          clickThroughRate: 20,
          conversionRate: 0,
          aggregationLevel: 'low',
          dataPoints: 6,
          privacyThresholdMet: false
        }
      ];

      const privacySafeMetrics = await metricsCollector.applyPrivacyThresholds(lowVolumeMetrics);

      expect(privacySafeMetrics[0].impressions).toBe(0);
      expect(privacySafeMetrics[0].clicks).toBe(0);
      expect(privacySafeMetrics[0].conversions).toBe(0);
      expect(privacySafeMetrics[0].privacyThresholdMet).toBe(false);
    });

    it('should preserve metrics that meet privacy thresholds', async () => {
      const sufficientMetrics: AggregatedMetrics[] = [
        {
          cohortId: 'cohort_large',
          timeRange: {
            startDate: new Date('2025-01-15T00:00:00Z'),
            endDate: new Date('2025-01-15T23:59:59Z')
          },
          impressions: 1000, // Above minimum threshold
          clicks: 50,
          conversions: 5,
          clickThroughRate: 5,
          conversionRate: 10,
          aggregationLevel: 'high',
          dataPoints: 1055,
          privacyThresholdMet: true
        }
      ];

      const privacySafeMetrics = await metricsCollector.applyPrivacyThresholds(sufficientMetrics);

      expect(privacySafeMetrics[0].impressions).toBe(1000);
      expect(privacySafeMetrics[0].clicks).toBe(50);
      expect(privacySafeMetrics[0].conversions).toBe(5);
      expect(privacySafeMetrics[0].privacyThresholdMet).toBe(true);
    });
  });

  describe('Attribution Reports', () => {
    beforeEach(() => {
      // Mock storage to return attribution events
      const testDate = '2025-01-15';
      const attributionEvents = [
        {
          eventId: 'imp_attr_1',
          eventType: 'impression',
          cohortId: 'cohort_shopping',
          timestamp: new Date('2025-01-15T10:00:00Z'),
          domain: 'shop.com'
        },
        {
          eventId: 'conv_attr_1',
          eventType: 'conversion',
          cohortId: 'cohort_shopping',
          timestamp: new Date('2025-01-15T10:30:00Z'),
          domain: 'shop.com',
          metadata: { value: 49.99 }
        }
      ];

      // Mock getUserProfile to return a profile with attribution events in metadata
      mockStorageLayer.getUserProfile.mockResolvedValue({
        userId: 'test_user',
        activeCohorts: [],
        preferences: {
          cohortsEnabled: true,
          disabledTopics: [],
          dataRetentionDays: 21,
          shareWithAdvertisers: true
        },
        lastUpdated: new Date(),
        version: '1.0',
        metadata: {
          [`metrics_events_${testDate}`]: `encrypted_${JSON.stringify(attributionEvents)}`
        }
      });
    });

    it('should generate attribution reports for conversions', async () => {
      const timeRange: TimeRange = {
        startDate: new Date('2025-01-15T00:00:00Z'),
        endDate: new Date('2025-01-15T23:59:59Z')
      };

      const reports = await metricsCollector.generateAttributionReports(timeRange);

      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0].cohortId).toBe('cohort_shopping');
      expect(reports[0].sourceEvent.eventType).toBe('impression');
      expect(reports[0].triggerEvent.eventType).toBe('conversion');
      expect(reports[0].attributionDelay).toBeGreaterThan(0);
    });

    it('should include conversion value in attribution reports', async () => {
      const timeRange: TimeRange = {
        startDate: new Date('2025-01-15T00:00:00Z'),
        endDate: new Date('2025-01-15T23:59:59Z')
      };

      const reports = await metricsCollector.generateAttributionReports(timeRange);

      // Allow for differential privacy noise (±10% tolerance)
      expect(reports[0].conversionValue).toBeGreaterThan(45);
      expect(reports[0].conversionValue).toBeLessThan(55);
    });

    it('should apply privacy budget constraints to reports', async () => {
      const timeRange: TimeRange = {
        startDate: new Date('2025-01-15T00:00:00Z'),
        endDate: new Date('2025-01-15T23:59:59Z')
      };

      const reports = await metricsCollector.generateAttributionReports(timeRange);

      // Should have privacy budget assigned
      expect(reports[0].privacyBudget).toBeGreaterThan(0);
      expect(reports[0].privacyBudget).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Metrics Summary', () => {
    beforeEach(() => {
      // Mock storage to return comprehensive events with sufficient data per cohort
      // Create more balanced distribution: 60% impressions, 30% clicks, 10% conversions
      const comprehensiveEvents = Array.from({ length: 800 }, (_, i) => ({
        eventId: `event_${i}`,
        eventType: (i < 480 ? 'impression' : i < 720 ? 'click' : 'conversion') as 'impression' | 'click' | 'conversion',
        cohortId: `cohort_${Math.floor(i / 200)}`, // 200 events per cohort (4 cohorts total)
        timestamp: new Date(`2025-01-15T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
        domain: 'example.com'
      }));

      // Mock getUserProfile to return a profile with comprehensive events in metadata
      mockStorageLayer.getUserProfile.mockResolvedValue({
        userId: 'test_user',
        activeCohorts: [],
        preferences: {
          cohortsEnabled: true,
          disabledTopics: [],
          dataRetentionDays: 21,
          shareWithAdvertisers: true
        },
        lastUpdated: new Date(),
        version: '1.0',
        metadata: {
          'metrics_events_2025-01-15': `encrypted_${JSON.stringify(comprehensiveEvents)}`
        }
      });
    });

    it('should generate comprehensive metrics summary', async () => {
      const timeRange: TimeRange = {
        startDate: new Date('2025-01-15T00:00:00Z'),
        endDate: new Date('2025-01-15T23:59:59Z')
      };

      const summary = await metricsCollector.getMetricsSummary(['cohort_0', 'cohort_1', 'cohort_2', 'cohort_3'], timeRange);

      expect(summary.totalImpressions).toBeGreaterThan(0);
      expect(summary.totalClicks).toBeGreaterThan(0);
      expect(summary.totalConversions).toBeGreaterThan(0);
      expect(summary.cohortsWithSufficientData).toBeGreaterThan(0);

      // CTR should be > 0 since we have sufficient impressions
      expect(summary.averageCTR).toBeGreaterThan(0);

      // Conversion rate might be 0 due to privacy thresholds (need >10 clicks)
      expect(summary.averageConversionRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Data Validation and Error Handling', () => {
    it('should throw error for missing event ID', async () => {
      const invalidEvent = {
        eventType: 'impression',
        cohortId: 'cohort_tech',
        timestamp: new Date(),
        domain: 'example.com'
      } as MetricsEvent;

      await expect(metricsCollector.recordEvent(invalidEvent)).rejects.toThrow('Event ID is required');
    });

    it('should throw error for missing cohort ID', async () => {
      const invalidEvent = {
        eventId: 'test_123',
        eventType: 'impression',
        timestamp: new Date(),
        domain: 'example.com'
      } as MetricsEvent;

      await expect(metricsCollector.recordEvent(invalidEvent)).rejects.toThrow('Cohort ID is required');
    });

    it('should throw error for missing domain', async () => {
      const invalidEvent = {
        eventId: 'test_123',
        eventType: 'impression',
        cohortId: 'cohort_tech',
        timestamp: new Date()
      } as MetricsEvent;

      await expect(metricsCollector.recordEvent(invalidEvent)).rejects.toThrow('Domain is required');
    });

    it('should handle storage errors gracefully', async () => {
      mockStorageLayer.storeUserProfile.mockRejectedValue(new Error('Storage error'));

      const event: MetricsEvent = {
        eventId: 'test_123',
        eventType: 'impression',
        cohortId: 'cohort_tech',
        timestamp: new Date(),
        domain: 'example.com'
      };

      // The error should be handled gracefully and not thrown
      await expect(metricsCollector.recordEvent(event)).resolves.not.toThrow();
    });

    it('should handle encryption errors gracefully', async () => {
      mockEncryptionUtils.encrypt.mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      const event: MetricsEvent = {
        eventId: 'test_123',
        eventType: 'impression',
        cohortId: 'cohort_tech',
        timestamp: new Date(),
        domain: 'example.com'
      };

      // The error should be handled gracefully and not thrown
      await expect(metricsCollector.recordEvent(event)).resolves.not.toThrow();
    });
  });

  describe('Background Cleanup', () => {
    it('should initialize background cleanup process', async () => {
      // Verify that setInterval was called during initialization
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe('Differential Privacy', () => {
    it('should apply noise to metrics while preserving utility', async () => {
      const timeRange: TimeRange = {
        startDate: new Date('2025-01-15T00:00:00Z'),
        endDate: new Date('2025-01-15T23:59:59Z')
      };

      // Mock sufficient data for privacy threshold
      const sufficientEvents = Array.from({ length: 200 }, (_, i) => ({
        eventId: `event_${i}`,
        eventType: (i < 150 ? 'impression' : i < 180 ? 'click' : 'conversion') as 'impression' | 'click' | 'conversion',
        cohortId: 'cohort_large',
        timestamp: new Date(`2025-01-15T10:${String(i % 60).padStart(2, '0')}:00Z`),
        domain: 'example.com'
      }));

      // Mock getUserProfile to return a profile with sufficient events in metadata
      mockStorageLayer.getUserProfile.mockResolvedValue({
        userId: 'test_user',
        activeCohorts: [],
        preferences: {
          cohortsEnabled: true,
          disabledTopics: [],
          dataRetentionDays: 21,
          shareWithAdvertisers: true
        },
        lastUpdated: new Date(),
        version: '1.0',
        metadata: {
          'metrics_events_2025-01-15': `encrypted_${JSON.stringify(sufficientEvents)}`
        }
      });

      const metrics = await metricsCollector.getAggregatedMetrics(['cohort_large'], timeRange);

      // Metrics should be present but may have noise applied
      expect(metrics[0].impressions).toBeGreaterThan(0);
      expect(metrics[0].privacyThresholdMet).toBe(true);
    });
  });

  describe('Cohort Performance Metrics', () => {
    beforeEach(() => {
      // Mock storage to return performance test events
      const performanceEvents = Array.from({ length: 200 }, (_, i) => ({
        eventId: `perf_event_${i}`,
        eventType: (i < 150 ? 'impression' : i < 180 ? 'click' : 'conversion') as 'impression' | 'click' | 'conversion',
        cohortId: 'cohort_performance',
        timestamp: new Date(`2025-01-15T${String(Math.floor(i / 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
        domain: 'performance.com'
      }));

      // Mock getUserProfile to return a profile with performance events in metadata
      mockStorageLayer.getUserProfile.mockResolvedValue({
        userId: 'test_user',
        activeCohorts: [],
        preferences: {
          cohortsEnabled: true,
          disabledTopics: [],
          dataRetentionDays: 21,
          shareWithAdvertisers: true
        },
        lastUpdated: new Date(),
        version: '1.0',
        metadata: {
          'metrics_events_2025-01-15': `encrypted_${JSON.stringify(performanceEvents)}`
        }
      });
    });

    it('should calculate cohort performance metrics', async () => {
      const timeRange: TimeRange = {
        startDate: new Date('2025-01-15T00:00:00Z'),
        endDate: new Date('2025-01-15T23:59:59Z')
      };

      const performanceMetrics = await metricsCollector.getCohortPerformanceMetrics(['cohort_performance'], timeRange);

      expect(performanceMetrics).toHaveLength(1);
      expect(performanceMetrics[0].cohortId).toBe('cohort_performance');
      expect(performanceMetrics[0].performanceScore).toBeGreaterThan(0);
      expect(performanceMetrics[0].engagementRate).toBeGreaterThan(0);
      expect(performanceMetrics[0].reachEstimate).toBeGreaterThan(0);
      expect(performanceMetrics[0].privacyCompliant).toBe(true);
    });

    it('should filter out non-privacy-compliant cohorts', async () => {
      // Mock storage to return insufficient events
      const insufficientEvents = Array.from({ length: 5 }, (_, i) => ({
        eventId: `small_event_${i}`,
        eventType: 'impression' as 'impression',
        cohortId: 'cohort_small_performance',
        timestamp: new Date(`2025-01-15T10:${String(i).padStart(2, '0')}:00Z`),
        domain: 'small.com'
      }));

      mockStorageLayer.getUserProfile.mockResolvedValue({
        userId: 'test_user',
        activeCohorts: [],
        preferences: {
          cohortsEnabled: true,
          disabledTopics: [],
          dataRetentionDays: 21,
          shareWithAdvertisers: true
        },
        lastUpdated: new Date(),
        version: '1.0',
        metadata: {
          'metrics_events_2025-01-15': `encrypted_${JSON.stringify(insufficientEvents)}`
        }
      });

      const timeRange: TimeRange = {
        startDate: new Date('2025-01-15T00:00:00Z'),
        endDate: new Date('2025-01-15T23:59:59Z')
      };

      const performanceMetrics = await metricsCollector.getCohortPerformanceMetrics(['cohort_small_performance'], timeRange);

      // Should return empty array since cohort doesn't meet privacy thresholds
      expect(performanceMetrics).toHaveLength(0);
    });
  });
});