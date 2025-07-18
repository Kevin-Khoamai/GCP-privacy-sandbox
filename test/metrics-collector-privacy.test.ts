import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MetricsCollector } from '../src/shared/core/metrics-collector';
import { StorageLayer } from '../src/shared/core/storage-layer';
import { EncryptionUtils } from '../src/shared/core/encryption-utils';
import { MetricsEvent } from '../src/shared/interfaces/metrics';
import { TimeRange } from '../src/shared/interfaces/common';

// Mock dependencies
vi.mock('../src/shared/core/storage-layer');
vi.mock('../src/shared/core/encryption-utils');

describe('MetricsCollector Privacy-Preserving Aggregation', () => {
  let metricsCollector: MetricsCollector;
  let mockStorageLayer: vi.Mocked<StorageLayer>;
  let mockEncryptionUtils: vi.Mocked<EncryptionUtils>;

  beforeEach(async () => {
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
  });

  describe('Privacy-Preserving Aggregated Metrics', () => {
    beforeEach(() => {
      // Mock storage to return sample events with sufficient data for privacy thresholds
      const today = new Date();
      const todayKey = today.toISOString().split('T')[0];
      
      // Create a large dataset to ensure privacy thresholds are met
      const sampleEvents = Array.from({ length: 500 }, (_, i) => ({
        eventId: `event_${i}`,
        eventType: (i < 350 ? 'impression' : i < 450 ? 'click' : 'conversion') as 'impression' | 'click' | 'conversion',
        cohortId: 'cohort_tech',
        timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, i % 60, 0),
        domain: 'tech.com'
      }));

      // Mock getUserProfile to return a profile with metrics events in metadata
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
          [`metrics_events_${todayKey}`]: `encrypted_${JSON.stringify(sampleEvents)}`
        }
      });
    });

    it('should generate privacy-preserving aggregated metrics', async () => {
      const today = new Date();
      const timeRange: TimeRange = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

      const metrics = await metricsCollector.getPrivacyPreservingAggregatedMetrics(['cohort_tech'], timeRange);

      // Verify the structure and content of the metrics
      expect(metrics).toHaveLength(1);
      expect(metrics[0].cohortId).toBe('cohort_tech');
      
      // Verify metrics data
      expect(metrics[0].metrics.impressions).toBeGreaterThan(0);
      expect(metrics[0].metrics.clicks).toBeGreaterThan(0);
      expect(metrics[0].metrics.conversions).toBeGreaterThan(0);
      expect(metrics[0].metrics.clickThroughRate).toBeGreaterThan(0);
      expect(metrics[0].metrics.conversionRate).toBeGreaterThan(0);
      
      // Verify performance scores
      expect(metrics[0].performance.engagementScore).toBeGreaterThan(0);
      expect(metrics[0].performance.reachScore).toBeGreaterThan(0);
      expect(metrics[0].performance.relevanceScore).toBeGreaterThan(0);
      expect(metrics[0].performance.overallPerformance).toBeGreaterThan(0);
      
      // Verify privacy info
      expect(metrics[0].privacyInfo.dataPoints).toBeGreaterThan(0);
      expect(metrics[0].privacyInfo.noiseLevel).toBeGreaterThanOrEqual(0);
      expect(metrics[0].privacyInfo.noiseLevel).toBeLessThanOrEqual(1);
      expect(metrics[0].privacyInfo.privacyThresholdMet).toBe(true);
      
      // Verify aggregation info
      expect(metrics[0].aggregationInfo.level).toBe('daily');
      expect(metrics[0].aggregationInfo.periodCount).toBeGreaterThan(0);
      expect(metrics[0].aggregationInfo.completeness).toBeGreaterThan(0);
      expect(metrics[0].aggregationInfo.completeness).toBeLessThanOrEqual(1);
    });

    it('should apply data suppression for insufficient cohort sizes', async () => {
      const today = new Date();
      const todayKey = today.toISOString().split('T')[0];
      
      // Create a small dataset that won't meet privacy thresholds
      const smallDataset = Array.from({ length: 5 }, (_, i) => ({
        eventId: `small_event_${i}`,
        eventType: (i < 3 ? 'impression' : i < 4 ? 'click' : 'conversion') as 'impression' | 'click' | 'conversion',
        cohortId: 'cohort_small',
        timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, i, 0),
        domain: 'small.com'
      }));

      // Mock getUserProfile to return a profile with small dataset
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
          [`metrics_events_${todayKey}`]: `encrypted_${JSON.stringify(smallDataset)}`
        }
      });

      const timeRange: TimeRange = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

      const metrics = await metricsCollector.getPrivacyPreservingAggregatedMetrics(['cohort_small'], timeRange);

      // Should return empty array since data doesn't meet privacy thresholds
      expect(metrics).toHaveLength(0);
    });

    it('should support different aggregation levels', async () => {
      const today = new Date();
      const timeRange: TimeRange = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7, 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

      // Test hourly aggregation
      const hourlyMetrics = await metricsCollector.getPrivacyPreservingAggregatedMetrics(
        ['cohort_tech'], 
        timeRange, 
        'hourly'
      );
      
      expect(hourlyMetrics[0].aggregationInfo.level).toBe('hourly');
      
      // Test weekly aggregation
      const weeklyMetrics = await metricsCollector.getPrivacyPreservingAggregatedMetrics(
        ['cohort_tech'], 
        timeRange, 
        'weekly'
      );
      
      expect(weeklyMetrics[0].aggregationInfo.level).toBe('weekly');
      expect(weeklyMetrics[0].aggregationInfo.periodCount).toBeLessThanOrEqual(2); // Should be 1 or 2 weeks
    });

    it('should apply differential privacy to protect user privacy', async () => {
      // Create two identical datasets
      const today = new Date();
      const todayKey = today.toISOString().split('T')[0];
      
      const dataset1 = Array.from({ length: 200 }, (_, i) => ({
        eventId: `event_${i}`,
        eventType: (i < 150 ? 'impression' : i < 180 ? 'click' : 'conversion') as 'impression' | 'click' | 'conversion',
        cohortId: 'cohort_dp_test',
        timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, i % 60, 0),
        domain: 'dp-test.com'
      }));
      
      // Mock getUserProfile to return the first dataset
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
          [`metrics_events_${todayKey}`]: `encrypted_${JSON.stringify(dataset1)}`
        }
      });

      const timeRange: TimeRange = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

      // Get metrics for the first dataset
      const metrics1 = await metricsCollector.getPrivacyPreservingAggregatedMetrics(['cohort_dp_test'], timeRange);
      
      // Now add one more user to the dataset (this should trigger differential privacy)
      const dataset2 = [
        ...dataset1,
        {
          eventId: 'extra_event',
          eventType: 'impression',
          cohortId: 'cohort_dp_test',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 30, 0),
          domain: 'dp-test.com'
        }
      ];
      
      // Mock getUserProfile to return the second dataset
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
          [`metrics_events_${todayKey}`]: `encrypted_${JSON.stringify(dataset2)}`
        }
      });
      
      // Get metrics for the second dataset
      const metrics2 = await metricsCollector.getPrivacyPreservingAggregatedMetrics(['cohort_dp_test'], timeRange);
      
      // The difference in impression count should not exactly match the difference in the datasets
      // due to differential privacy noise
      const expectedDifference = 1; // We added one impression
      const actualDifference = metrics2[0].metrics.impressions - metrics1[0].metrics.impressions;
      
      // The actual difference should not exactly match the expected difference due to noise
      // This is a probabilistic test, but with high probability it should pass
      expect(Math.abs(actualDifference - expectedDifference)).toBeGreaterThan(0);
    });
  });

  describe('Attribution Reporting API Compliance', () => {
    it('should follow Attribution Reporting API principles', async () => {
      const today = new Date();
      const todayKey = today.toISOString().split('T')[0];
      
      // Create attribution events
      const attributionEvents: MetricsEvent[] = [
        {
          eventId: 'imp_1',
          eventType: 'impression',
          cohortId: 'cohort_attribution',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0),
          domain: 'ad.example.com'
        },
        {
          eventId: 'click_1',
          eventType: 'click',
          cohortId: 'cohort_attribution',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 5, 0),
          domain: 'ad.example.com'
        },
        {
          eventId: 'conv_1',
          eventType: 'conversion',
          cohortId: 'cohort_attribution',
          timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 30, 0),
          domain: 'shop.example.com',
          metadata: { value: 49.99 }
        }
      ];
      
      // Add enough events to meet privacy thresholds
      const additionalEvents = Array.from({ length: 150 }, (_, i) => ({
        eventId: `event_${i}`,
        eventType: 'impression' as 'impression',
        cohortId: 'cohort_attribution',
        timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, i % 60, 0),
        domain: 'ad.example.com'
      }));
      
      const allEvents = [...attributionEvents, ...additionalEvents];

      // Mock getUserProfile to return attribution events
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
          [`metrics_events_${todayKey}`]: `encrypted_${JSON.stringify(allEvents)}`
        }
      });

      const timeRange: TimeRange = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      };

      // Test attribution reports
      const reports = await metricsCollector.generateAttributionReports(timeRange);
      
      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0].sourceEvent.eventType).toBe('impression');
      expect(reports[0].triggerEvent.eventType).toBe('conversion');
      
      // Test privacy-preserving aggregated metrics
      const metrics = await metricsCollector.getPrivacyPreservingAggregatedMetrics(['cohort_attribution'], timeRange);
      
      expect(metrics).toHaveLength(1);
      expect(metrics[0].privacyInfo.privacyThresholdMet).toBe(true);
      
      // Verify that the conversion value has noise applied (differential privacy)
      const aggregatedReports = await metricsCollector.generateAggregatedAttributionReports(
        ['cohort_attribution'], 
        timeRange
      );
      
      expect(aggregatedReports).toHaveLength(1);
      expect(aggregatedReports[0].privacyCompliant).toBe(true);
      
      // The conversion value should be approximately 49.99 but with noise applied
      expect(Math.abs(aggregatedReports[0].totalConversionValue - 49.99)).toBeLessThan(5);
    });
  });
});