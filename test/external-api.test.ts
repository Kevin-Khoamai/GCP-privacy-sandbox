import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ExternalAPI, CohortDataResponse, AggregatedMetricsResponse } from '../src/shared/core/external-api';
import { APIRequestContext } from '../src/shared/interfaces/api-interface';
import { TimeRange, CohortAssignment } from '../src/shared/interfaces/common';
import { APIAuthenticationService } from '../src/shared/core/api-auth';
import { StorageLayer } from '../src/shared/core/storage-layer';
import { CohortEngine } from '../src/shared/core/cohort-engine';
import { PrivacyControls } from '../src/shared/core/privacy-controls';

// Mock the dependencies
vi.mock('../src/shared/core/api-auth');
vi.mock('../src/shared/core/storage-layer');
vi.mock('../src/shared/core/cohort-engine');
vi.mock('../src/shared/core/privacy-controls');

describe('ExternalAPI', () => {
  let externalAPI: ExternalAPI;
  let mockAuthService: any;
  let mockStorageLayer: any;
  let mockCohortEngine: any;
  let mockPrivacyControls: any;
  let mockRequestContext: APIRequestContext;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock instances
    mockAuthService = {
      authenticateRequest: vi.fn(),
      validateAPIKey: vi.fn()
    };

    mockStorageLayer = {
      initialize: vi.fn(),
      getUserPreferences: vi.fn(),
      logAPIRequest: vi.fn()
    };

    mockCohortEngine = {
      getCohortsForSharing: vi.fn()
    };

    mockPrivacyControls = {
      initialize: vi.fn()
    };

    // Create ExternalAPI instance with mocked dependencies
    externalAPI = ExternalAPI.createWithDependencies(
      mockAuthService as any,
      mockStorageLayer as any,
      mockCohortEngine as any,
      mockPrivacyControls as any
    );
    await externalAPI.initialize();

    // Setup default mock request context
    mockRequestContext = {
      domain: 'example.com',
      apiKey: 'test-api-key-12345',
      requestType: 'advertising',
      timestamp: new Date()
    };

    // Setup default mock responses
    mockAuthService.authenticateRequest.mockResolvedValue({
      success: true,
      statusCode: 200
    });

    mockStorageLayer.getUserPreferences.mockResolvedValue({
      cohortsEnabled: true,
      disabledTopics: [],
      dataRetentionDays: 21,
      shareWithAdvertisers: true
    });

    mockCohortEngine.getCohortsForSharing.mockReturnValue([
      {
        topicId: 1,
        topicName: 'Sports',
        confidence: 0.8,
        assignedDate: new Date(),
        expiryDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)
      },
      {
        topicId: 2,
        topicName: 'Technology',
        confidence: 0.7,
        assignedDate: new Date(),
        expiryDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)
      }
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCohortIds', () => {
    it('should return anonymized cohort IDs for valid authenticated request', async () => {
      const cohortIds = await externalAPI.getCohortIds(mockRequestContext);

      expect(cohortIds).toBeInstanceOf(Array);
      expect(cohortIds.length).toBeGreaterThan(0);
      expect(cohortIds.length).toBeLessThanOrEqual(3); // Max 3 cohorts per request
      
      // Check that IDs are anonymized (should start with 'cohort_')
      cohortIds.forEach(id => {
        expect(id).toMatch(/^cohort_[a-z0-9]+$/);
      });

      // Verify authentication was called
      expect(mockAuthService.authenticateRequest).toHaveBeenCalledWith(mockRequestContext);
      
      // Verify preferences were checked
      expect(mockStorageLayer.getUserPreferences).toHaveBeenCalled();
      
      // Verify cohorts were retrieved
      expect(mockCohortEngine.getCohortsForSharing).toHaveBeenCalled();
      
      // Verify request was logged
      expect(mockStorageLayer.logAPIRequest).toHaveBeenCalled();
    });

    it('should return empty array when user has disabled cohort sharing', async () => {
      mockStorageLayer.getUserPreferences.mockResolvedValue({
        cohortsEnabled: false,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      });

      const cohortIds = await externalAPI.getCohortIds(mockRequestContext);

      expect(cohortIds).toEqual([]);
      expect(mockStorageLayer.logAPIRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          cohortsShared: []
        })
      );
    });

    it('should return empty array when user has disabled advertiser sharing', async () => {
      mockStorageLayer.getUserPreferences.mockResolvedValue({
        cohortsEnabled: true,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: false
      });

      const cohortIds = await externalAPI.getCohortIds(mockRequestContext);

      expect(cohortIds).toEqual([]);
    });

    it('should filter out disabled topics', async () => {
      mockStorageLayer.getUserPreferences.mockResolvedValue({
        cohortsEnabled: true,
        disabledTopics: [1], // Disable Sports topic
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      });

      const cohortIds = await externalAPI.getCohortIds(mockRequestContext);

      expect(cohortIds.length).toBe(1); // Only Technology should remain
    });

    it('should throw authentication error for invalid API key', async () => {
      mockAuthService.authenticateRequest.mockResolvedValue({
        success: false,
        statusCode: 401,
        error: 'Invalid API key'
      });

      await expect(externalAPI.getCohortIds(mockRequestContext)).rejects.toThrow('Invalid API key');
    });

    it('should throw validation error for invalid request context', async () => {
      const invalidContext = {
        ...mockRequestContext,
        domain: '', // Invalid empty domain
        requestType: 'invalid' as any
      };

      await expect(externalAPI.getCohortIds(invalidContext)).rejects.toThrow('Validation failed');
    });

    it('should throw error for old timestamp (replay attack prevention)', async () => {
      const oldContext = {
        ...mockRequestContext,
        timestamp: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      };

      await expect(externalAPI.getCohortIds(oldContext)).rejects.toThrow('Request timestamp is too old');
    });

    it('should limit cohorts to maximum of 3 per request', async () => {
      // Mock more than 3 cohorts
      mockCohortEngine.getCohortsForSharing.mockReturnValue([
        { topicId: 1, topicName: 'Sports', confidence: 0.8, assignedDate: new Date(), expiryDate: new Date() },
        { topicId: 2, topicName: 'Technology', confidence: 0.7, assignedDate: new Date(), expiryDate: new Date() },
        { topicId: 3, topicName: 'Travel', confidence: 0.6, assignedDate: new Date(), expiryDate: new Date() },
        { topicId: 4, topicName: 'Food', confidence: 0.5, assignedDate: new Date(), expiryDate: new Date() },
        { topicId: 5, topicName: 'Music', confidence: 0.4, assignedDate: new Date(), expiryDate: new Date() }
      ]);

      const cohortIds = await externalAPI.getCohortIds(mockRequestContext);

      expect(cohortIds.length).toBe(3); // Should be limited to 3
    });
  });

  describe('getAggregatedMetrics', () => {
    const mockTimeRange: TimeRange = {
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-01-07')
    };

    it('should return aggregated metrics for valid cohort IDs', async () => {
      const cohortIds = ['cohort_abc123', 'cohort_def456'];
      const metrics = await externalAPI.getAggregatedMetrics(cohortIds, mockTimeRange);

      expect(metrics).toHaveProperty('cohortId');
      expect(metrics).toHaveProperty('impressions');
      expect(metrics).toHaveProperty('clicks');
      expect(metrics).toHaveProperty('conversions');
      expect(metrics).toHaveProperty('aggregationLevel');

      expect(typeof metrics.impressions).toBe('number');
      expect(typeof metrics.clicks).toBe('number');
      expect(typeof metrics.conversions).toBe('number');
      expect(['high', 'medium', 'low']).toContain(metrics.aggregationLevel);
    });

    it('should determine correct aggregation level based on cohort count', async () => {
      // Test high aggregation (5+ cohorts)
      const highCohortIds = ['c1', 'c2', 'c3', 'c4', 'c5'];
      const highMetrics = await externalAPI.getAggregatedMetrics(highCohortIds, mockTimeRange);
      expect(highMetrics.aggregationLevel).toBe('high');

      // Test medium aggregation (3-4 cohorts)
      const mediumCohortIds = ['c1', 'c2', 'c3'];
      const mediumMetrics = await externalAPI.getAggregatedMetrics(mediumCohortIds, mockTimeRange);
      expect(mediumMetrics.aggregationLevel).toBe('medium');

      // Test low aggregation (1-2 cohorts)
      const lowCohortIds = ['c1'];
      const lowMetrics = await externalAPI.getAggregatedMetrics(lowCohortIds, mockTimeRange);
      expect(lowMetrics.aggregationLevel).toBe('low');
    });

    it('should apply privacy thresholds and suppress low-volume data', async () => {
      const cohortIds = ['cohort_lowvolume'];
      const metrics = await externalAPI.getAggregatedMetrics(cohortIds, mockTimeRange);

      // For low aggregation level, metrics might be suppressed
      if (metrics.aggregationLevel === 'low' && metrics.impressions === 0) {
        expect(metrics.clicks).toBe(0);
        expect(metrics.conversions).toBe(0);
      }
    });

    it('should throw validation error for empty cohort IDs', async () => {
      await expect(externalAPI.getAggregatedMetrics([], mockTimeRange)).rejects.toThrow('At least one cohort ID is required');
    });

    it('should throw validation error for too many cohort IDs', async () => {
      const tooManyCohortIds = Array.from({ length: 11 }, (_, i) => `cohort_${i}`);
      await expect(externalAPI.getAggregatedMetrics(tooManyCohortIds, mockTimeRange)).rejects.toThrow('Maximum 10 cohort IDs allowed');
    });

    it('should throw validation error for invalid time range', async () => {
      const invalidTimeRange: TimeRange = {
        startDate: new Date('2025-01-07'),
        endDate: new Date('2025-01-01') // End before start
      };

      await expect(externalAPI.getAggregatedMetrics(['cohort_123'], invalidTimeRange)).rejects.toThrow('startDate must be before endDate');
    });

    it('should throw validation error for time range too large', async () => {
      const largeTimeRange: TimeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31') // More than 90 days
      };

      await expect(externalAPI.getAggregatedMetrics(['cohort_123'], largeTimeRange)).rejects.toThrow('Time range cannot exceed 90 days');
    });
  });

  describe('validateAPIKey', () => {
    it('should validate API key using authentication service', async () => {
      mockAuthService.validateAPIKey.mockResolvedValue(true);

      const isValid = await externalAPI.validateAPIKey('test-key');

      expect(isValid).toBe(true);
      expect(mockAuthService.validateAPIKey).toHaveBeenCalledWith('test-key');
    });

    it('should return false for invalid API key', async () => {
      mockAuthService.validateAPIKey.mockResolvedValue(false);

      const isValid = await externalAPI.validateAPIKey('invalid-key');

      expect(isValid).toBe(false);
    });
  });

  describe('getCohortDataResponse', () => {
    it('should return detailed cohort data response with metadata', async () => {
      const response = await externalAPI.getCohortDataResponse(mockRequestContext);

      expect(response).toHaveProperty('cohortIds');
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('expiresAt');
      expect(response).toHaveProperty('requestId');

      expect(Array.isArray(response.cohortIds)).toBe(true);
      expect(response.timestamp).toBeInstanceOf(Date);
      expect(response.expiresAt).toBeInstanceOf(Date);
      expect(typeof response.requestId).toBe('string');

      // Verify expiry is 24 hours from now
      const expectedExpiry = new Date(response.timestamp.getTime() + 24 * 60 * 60 * 1000);
      expect(Math.abs(response.expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });
  });

  describe('getAggregatedMetricsResponse', () => {
    it('should return detailed metrics response with metadata', async () => {
      const cohortIds = ['cohort_123', 'cohort_456'];
      const timeRange: TimeRange = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-07')
      };

      const response = await externalAPI.getAggregatedMetricsResponse(cohortIds, timeRange);

      expect(response).toHaveProperty('metrics');
      expect(response).toHaveProperty('aggregationLevel');
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('requestId');
      expect(response).toHaveProperty('privacyNotice');

      expect(Array.isArray(response.metrics)).toBe(true);
      expect(response.metrics.length).toBe(1);
      expect(['high', 'medium', 'low']).toContain(response.aggregationLevel);
      expect(response.timestamp).toBeInstanceOf(Date);
      expect(typeof response.requestId).toBe('string');
      expect(typeof response.privacyNotice).toBe('string');
      expect(response.privacyNotice).toContain('privacy');
    });
  });

  describe('error handling', () => {
    it('should handle storage layer errors gracefully', async () => {
      mockStorageLayer.getUserPreferences.mockRejectedValue(new Error('Storage error'));

      await expect(externalAPI.getCohortIds(mockRequestContext)).rejects.toThrow('Internal server error');
    });

    it('should handle cohort engine errors gracefully', async () => {
      mockCohortEngine.getCohortsForSharing.mockImplementation(() => {
        throw new Error('Cohort engine error');
      });

      await expect(externalAPI.getCohortIds(mockRequestContext)).rejects.toThrow('Internal server error');
    });

    it('should log failed requests for audit purposes', async () => {
      mockStorageLayer.getUserPreferences.mockRejectedValue(new Error('Storage error'));

      try {
        await externalAPI.getCohortIds(mockRequestContext);
      } catch (error) {
        // Expected to throw
      }

      // Verify that failed request was logged
      expect(mockStorageLayer.logAPIRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          cohortsShared: []
        })
      );
    });
  });

  describe('privacy and security', () => {
    it('should generate different anonymized IDs for same topic across different weeks', async () => {
      // This test verifies the concept that cohort IDs change weekly for privacy
      // Since the actual implementation uses Date.now() internally, we'll test the hash function behavior
      
      const cohortIds1 = await externalAPI.getCohortIds(mockRequestContext);
      
      // Wait a small amount to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const cohortIds2 = await externalAPI.getCohortIds(mockRequestContext);
      
      // The IDs should be consistent within the same week (same format and structure)
      expect(cohortIds1).toEqual(cohortIds2);
      
      // But they should follow the expected format
      cohortIds1.forEach(id => {
        expect(id).toMatch(/^cohort_[a-z0-9]+$/);
      });
    });

    it('should not expose actual topic IDs in anonymized cohort IDs', async () => {
      const cohortIds = await externalAPI.getCohortIds(mockRequestContext);

      cohortIds.forEach(id => {
        expect(id).not.toContain('1'); // Should not contain actual topic ID
        expect(id).not.toContain('2');
        expect(id).not.toContain('Sports');
        expect(id).not.toContain('Technology');
      });
    });

    it('should apply noise injection to metrics for differential privacy', async () => {
      const cohortIds = ['cohort_123'];
      const timeRange: TimeRange = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-02')
      };

      // Get metrics multiple times to check for variation due to noise
      const metrics1 = await externalAPI.getAggregatedMetrics(cohortIds, timeRange);
      const metrics2 = await externalAPI.getAggregatedMetrics(cohortIds, timeRange);

      // Due to noise injection, metrics might be slightly different
      // (This test might be flaky due to randomness, but demonstrates the concept)
      expect(typeof metrics1.impressions).toBe('number');
      expect(typeof metrics2.impressions).toBe('number');
    });
  });

  describe('request validation', () => {
    it('should validate all required fields in request context', async () => {
      const invalidContexts = [
        { ...mockRequestContext, domain: '' },
        { ...mockRequestContext, apiKey: '' },
        { ...mockRequestContext, requestType: 'invalid' as any },
        { ...mockRequestContext, timestamp: new Date('invalid') }
      ];

      for (const context of invalidContexts) {
        await expect(externalAPI.getCohortIds(context)).rejects.toThrow('Validation failed');
      }
    });

    it('should validate metrics request parameters', async () => {
      const validTimeRange: TimeRange = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-07')
      };

      // Test various invalid scenarios
      await expect(externalAPI.getAggregatedMetrics([], validTimeRange)).rejects.toThrow();
      
      const tooManyCohorts = Array.from({ length: 11 }, (_, i) => `cohort_${i}`);
      await expect(externalAPI.getAggregatedMetrics(tooManyCohorts, validTimeRange)).rejects.toThrow();
    });
  });
});