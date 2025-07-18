import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MetricsCollector } from '../src/shared/core/metrics-collector';
import { StorageLayer } from '../src/shared/core/storage-layer';
import { EncryptionUtils } from '../src/shared/core/encryption-utils';
import { MetricsEvent, AggregatedMetrics } from '../src/shared/interfaces/metrics';
import { TimeRange } from '../src/shared/interfaces/common';

// Mock dependencies
vi.mock('../src/shared/core/storage-layer');
vi.mock('../src/shared/core/encryption-utils');

describe('MetricsCollector Integration Tests', () => {
  let metricsCollector: MetricsCollector;
  let mockStorageLayer: vi.Mocked<StorageLayer>;
  let mockEncryptionUtils: vi.Mocked<EncryptionUtils>;

  beforeEach(async () => {
    // Create mocked dependencies
    mockStorageLayer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      storeUserProfile: vi.fn().mockResolvedValue(undefined),
      getUserProfile: vi.fn().mockResolvedValue({
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
        metadata: {}
      }),
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
  });

  describe('Core Functionality', () => {
    it('should record and aggregate metrics correctly', async () => {
      const today = new Date();
      const todayKey = today.toISOString().split('T')[0];
      
      // Create test events
      const testEvents: MetricsEvent[] = [
        {
          eventId: 'imp_1',
          eventType: 'impression',
          cohortId: 'cohort_tech',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0),
          domain: 'tech.com'
        },
        {
          eventId: 'imp_2',
          eventType: 'impression',
          cohortId: 'cohort_tech',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 5, 0),
          domain: 'tech.com'
        },
        {
          eventId: 'click_1',
          eventType: 'click',
          cohortId: 'cohort_tech',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 10, 0),
          domain: 'tech.com'
        },
        {
          eventId: 'conv_1',
          eventType: 'conversion',
          cohortId: 'cohort_tech',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 15, 0),
          domain: 'tech.com'
        }
      ];

      // Record all events
      for (const event of testEvents) {
        await metricsCollector.recordEvent(event);
      }

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
          [`metrics_events_${todayKey}`]: `encrypted_${JSON.stringify(testEvents)}`
        }
      };

      mockStorageLayer.getUserProfile.mockResolvedValue(profileWithEvents);

      // Test aggregation
      const timeRange: TimeRange = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

      const metrics = await metricsCollector.getAggregatedMetrics(['cohort_tech'], timeRange);

      // Verify results
      expect(metrics).toHaveLength(1);
      expect(metrics[0].cohortId).toBe('cohort_tech');
      expect(metrics[0].impressions).toBe(2);
      expect(metrics[0].clicks).toBe(1);
      expect(metrics[0].conversions).toBe(1);
      expect(metrics[0].clickThroughRate).toBe(50); // 1 click / 2 impressions = 50%
      expect(metrics[0].conversionRate).toBe(100); // 1 conversion / 1 click = 100%
    });

    it('should apply privacy thresholds correctly', async () => {
      // Test with insufficient data
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

    it('should calculate rates correctly with privacy considerations', async () => {
      // Test normal calculation
      const ctr = metricsCollector.calculateClickThroughRate(1000, 50);
      expect(ctr).toBe(5.0); // 5% CTR

      const conversionRate = metricsCollector.calculateConversionRate(100, 5);
      expect(conversionRate).toBe(5.0); // 5% conversion rate

      // Test privacy suppression for low volume
      const ctrLowVolume = metricsCollector.calculateClickThroughRate(5, 1);
      expect(ctrLowVolume).toBe(0); // Should be suppressed

      const conversionRateLowVolume = metricsCollector.calculateConversionRate(3, 1);
      expect(conversionRateLowVolume).toBe(0); // Should be suppressed
    });

    it('should generate attribution reports', async () => {
      const today = new Date();
      const todayKey = today.toISOString().split('T')[0];
      
      // Create attribution test events
      const attributionEvents: MetricsEvent[] = [
        {
          eventId: 'imp_attr_1',
          eventType: 'impression',
          cohortId: 'cohort_shopping',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0),
          domain: 'shop.com'
        },
        {
          eventId: 'conv_attr_1',
          eventType: 'conversion',
          cohortId: 'cohort_shopping',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 30, 0),
          domain: 'shop.com',
          metadata: { value: 49.99 }
        }
      ];

      // Mock the storage to return attribution events
      const profileWithAttributionEvents = {
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
          [`metrics_events_${todayKey}`]: `encrypted_${JSON.stringify(attributionEvents)}`
        }
      };

      mockStorageLayer.getUserProfile.mockResolvedValue(profileWithAttributionEvents);

      const timeRange: TimeRange = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

      const reports = await metricsCollector.generateAttributionReports(timeRange);

      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0].cohortId).toBe('cohort_shopping');
      expect(reports[0].sourceEvent.eventType).toBe('impression');
      expect(reports[0].triggerEvent.eventType).toBe('conversion');
      expect(reports[0].conversionValue).toBe(49.99);
      expect(reports[0].privacyBudget).toBeGreaterThan(0);
    });

    it('should validate event data properly', async () => {
      // Test invalid event ID
      const invalidEvent1 = {
        eventId: '',
        eventType: 'impression',
        cohortId: 'cohort_tech',
        timestamp: new Date(),
        domain: 'example.com'
      } as MetricsEvent;

      await expect(metricsCollector.recordEvent(invalidEvent1)).rejects.toThrow('Event ID is required');

      // Test invalid event type
      const invalidEvent2 = {
        eventId: 'test_123',
        eventType: 'invalid_type' as any,
        cohortId: 'cohort_tech',
        timestamp: new Date(),
        domain: 'example.com'
      };

      await expect(metricsCollector.recordEvent(invalidEvent2)).rejects.toThrow('Invalid event type');

      // Test missing cohort ID
      const invalidEvent3 = {
        eventId: 'test_123',
        eventType: 'impression',
        cohortId: '',
        timestamp: new Date(),
        domain: 'example.com'
      } as MetricsEvent;

      await expect(metricsCollector.recordEvent(invalidEvent3)).rejects.toThrow('Cohort ID is required');

      // Test missing domain
      const invalidEvent4 = {
        eventId: 'test_123',
        eventType: 'impression',
        cohortId: 'cohort_tech',
        timestamp: new Date(),
        domain: ''
      } as MetricsEvent;

      await expect(metricsCollector.recordEvent(invalidEvent4)).rejects.toThrow('Domain is required');
    });
  });

  describe('Privacy Compliance', () => {
    it('should implement differential privacy correctly', async () => {
      const today = new Date();
      const todayKey = today.toISOString().split('T')[0];
      
      // Create sufficient events for privacy threshold
      const sufficientEvents = Array.from({ length: 200 }, (_, i) => ({
        eventId: `event_${i}`,
        eventType: (i < 150 ? 'impression' : i < 180 ? 'click' : 'conversion') as 'impression' | 'click' | 'conversion',
        cohortId: 'cohort_large',
        timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, i % 60, 0),
        domain: 'example.com'
      }));

      // Mock the storage to return sufficient events
      const profileWithSufficientEvents = {
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
          [`metrics_events_${todayKey}`]: `encrypted_${JSON.stringify(sufficientEvents)}`
        }
      };

      mockStorageLayer.getUserProfile.mockResolvedValue(profileWithSufficientEvents);

      const timeRange: TimeRange = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

      const metrics = await metricsCollector.getAggregatedMetrics(['cohort_large'], timeRange);

      // Metrics should be present and meet privacy thresholds
      expect(metrics).toHaveLength(1);
      expect(metrics[0].impressions).toBeGreaterThan(0);
      expect(metrics[0].privacyThresholdMet).toBe(true);
      expect(metrics[0].dataPoints).toBeGreaterThanOrEqual(100);
    });

    it('should suppress data below privacy thresholds', async () => {
      const today = new Date();
      const todayKey = today.toISOString().split('T')[0];
      
      // Create insufficient events (below privacy threshold)
      const insufficientEvents = Array.from({ length: 5 }, (_, i) => ({
        eventId: `event_${i}`,
        eventType: 'impression' as 'impression',
        cohortId: 'cohort_small',
        timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, i, 0),
        domain: 'example.com'
      }));

      // Mock the storage to return insufficient events
      const profileWithInsufficientEvents = {
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
          [`metrics_events_${todayKey}`]: `encrypted_${JSON.stringify(insufficientEvents)}`
        }
      };

      mockStorageLayer.getUserProfile.mockResolvedValue(profileWithInsufficientEvents);

      const timeRange: TimeRange = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

      const metrics = await metricsCollector.getAggregatedMetrics(['cohort_small'], timeRange);

      // Metrics should be suppressed due to insufficient data
      expect(metrics).toHaveLength(1);
      expect(metrics[0].privacyThresholdMet).toBe(false);
      expect(metrics[0].impressions).toBe(0); // Should be suppressed
      expect(metrics[0].clicks).toBe(0);
      expect(metrics[0].conversions).toBe(0);
    });
  });
});