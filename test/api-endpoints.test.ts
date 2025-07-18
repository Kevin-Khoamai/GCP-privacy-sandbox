import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CohortAPIClient } from '../src/shared/core/api-client';
import { CohortAPIResponse, CohortMetricsRequest } from '../src/shared/interfaces/api';

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock API responses
const mockSuccessfulCohortResponse: CohortAPIResponse = {
  success: true,
  cohortIds: [123, 456, 789],
  timestamp: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  requestId: 'req-123'
};

const mockErrorResponse = {
  success: false,
  error: 'Invalid request',
  code: 'INVALID_REQUEST',
  timestamp: new Date().toISOString(),
  requestId: 'req-error'
};

const mockRateLimitResponse = {
  success: false,
  error: 'Rate limit exceeded',
  code: 'RATE_LIMIT_EXCEEDED',
  retryAfter: 60,
  timestamp: new Date().toISOString(),
  requestId: 'req-rate-limit'
};

describe('API Endpoints Testing', () => {
  let apiClient: CohortAPIClient;
  const testApiKey = 'test-api-key-123';
  const testDomain = 'example.com';

  beforeEach(() => {
    apiClient = new CohortAPIClient({
      apiKey: testApiKey,
      baseUrl: 'https://api.cohort-tracker.com',
      timeout: 5000,
      retryAttempts: 3
    });

    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Cohort ID Retrieval', () => {
    it('should successfully retrieve cohort IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSuccessfulCohortResponse,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '99'
        })
      });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(true);
      expect(response.cohortIds).toEqual([123, 456, 789]);
      expect(response.cohortIds?.length).toBeLessThanOrEqual(3);
      
      // Verify API call
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cohort-tracker.com/v1/cohorts',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${testApiKey}`,
            'Content-Type': 'application/json',
            'X-Requesting-Domain': testDomain
          })
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => mockErrorResponse,
        headers: new Headers()
      });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid request');
      expect(response.code).toBe('INVALID_REQUEST');
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => mockRateLimitResponse,
        headers: new Headers({
          'Retry-After': '60'
        })
      });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(response.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.retryAfter).toBe(60);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Network error');
    });

    it('should handle timeout errors', async () => {
      // Mock a delayed response
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 10000))
      );

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(response.error).toContain('timeout');
    });

    it('should validate domain parameter', async () => {
      const invalidDomains = ['', ' ', 'invalid-domain', 'http://example.com'];

      for (const invalidDomain of invalidDomains) {
        const response = await apiClient.getCohortIds(invalidDomain);
        expect(response.success).toBe(false);
        expect(response.error).toContain('Invalid domain');
      }
    });

    it('should include proper headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSuccessfulCohortResponse,
        headers: new Headers()
      });

      await apiClient.getCohortIds(testDomain);

      const [url, options] = mockFetch.mock.calls[0];
      expect(options.headers).toMatchObject({
        'Authorization': `Bearer ${testApiKey}`,
        'Content-Type': 'application/json',
        'X-Requesting-Domain': testDomain,
        'User-Agent': expect.stringContaining('CohortTracker')
      });
    });
  });

  describe('Metrics Submission', () => {
    const mockMetricsRequest: CohortMetricsRequest = {
      domain: testDomain,
      cohortIds: [123, 456],
      metrics: {
        impressions: 100,
        clicks: 5,
        conversions: 1
      },
      timestamp: new Date().toISOString()
    };

    it('should successfully submit metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'Metrics recorded',
          requestId: 'metrics-123'
        }),
        headers: new Headers()
      });

      const response = await apiClient.submitMetrics(mockMetricsRequest);

      expect(response.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cohort-tracker.com/v1/metrics',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockMetricsRequest)
        })
      );
    });

    it('should validate metrics data', async () => {
      const invalidMetrics = [
        { ...mockMetricsRequest, cohortIds: [] },
        { ...mockMetricsRequest, metrics: {} },
        { ...mockMetricsRequest, domain: '' },
        { ...mockMetricsRequest, metrics: { impressions: -1 } }
      ];

      for (const invalid of invalidMetrics) {
        const response = await apiClient.submitMetrics(invalid);
        expect(response.success).toBe(false);
        expect(response.error).toContain('Invalid');
      }
    });

    it('should handle metrics submission errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          success: false,
          error: 'Invalid metrics data',
          code: 'VALIDATION_ERROR'
        }),
        headers: new Headers()
      });

      const response = await apiClient.submitMetrics(mockMetricsRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid metrics data');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should handle invalid API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: 'Invalid API key',
          code: 'UNAUTHORIZED'
        }),
        headers: new Headers()
      });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(response.code).toBe('UNAUTHORIZED');
    });

    it('should handle expired API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: 'API key expired',
          code: 'TOKEN_EXPIRED'
        }),
        headers: new Headers()
      });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(response.code).toBe('TOKEN_EXPIRED');
    });

    it('should handle insufficient permissions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }),
        headers: new Headers()
      });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(response.code).toBe('FORBIDDEN');
    });
  });

  describe('Retry Logic and Error Recovery', () => {
    it('should retry on temporary failures', async () => {
      // First two calls fail, third succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal server error' })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          json: async () => ({ error: 'Bad gateway' })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockSuccessfulCohortResponse
        });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => mockErrorResponse
      });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retry
    });

    it('should implement exponential backoff', async () => {
      const startTime = Date.now();
      
      // Mock multiple failures
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockSuccessfulCohortResponse
        });

      await apiClient.getCohortIds(testDomain);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should have some delay due to backoff (at least 100ms for two retries)
      expect(duration).toBeGreaterThan(100);
    });
  });

  describe('Response Validation', () => {
    it('should validate cohort ID response format', async () => {
      const invalidResponses = [
        { success: true }, // Missing cohortIds
        { success: true, cohortIds: 'not-an-array' },
        { success: true, cohortIds: [1, 2, 3, 4, 5] }, // Too many cohorts
        { success: true, cohortIds: ['invalid', 'ids'] }, // Non-numeric IDs
        { success: true, cohortIds: [-1, 0] } // Invalid ID values
      ];

      for (const invalidResponse of invalidResponses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => invalidResponse,
          headers: new Headers()
        });

        const response = await apiClient.getCohortIds(testDomain);
        expect(response.success).toBe(false);
        expect(response.error).toContain('Invalid response');
      }
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new Error('Invalid JSON'); },
        headers: new Headers()
      });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid JSON');
    });

    it('should validate required response fields', async () => {
      const responseWithMissingFields = {
        success: true,
        cohortIds: [123, 456]
        // Missing timestamp, expiresAt, requestId
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => responseWithMissingFields,
        headers: new Headers()
      });

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(true); // Should still work with optional fields missing
      expect(response.cohortIds).toEqual([123, 456]);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSuccessfulCohortResponse,
        headers: new Headers()
      });

      const domains = Array.from({ length: 10 }, (_, i) => `domain${i}.com`);
      const promises = domains.map(domain => apiClient.getCohortIds(domain));

      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(10);
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });

    it('should respect rate limiting across requests', async () => {
      // First request succeeds, second gets rate limited
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockSuccessfulCohortResponse,
          headers: new Headers({ 'X-RateLimit-Remaining': '0' })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => mockRateLimitResponse,
          headers: new Headers({ 'Retry-After': '60' })
        });

      const response1 = await apiClient.getCohortIds('domain1.com');
      const response2 = await apiClient.getCohortIds('domain2.com');

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(false);
      expect(response2.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should handle large response payloads', async () => {
      const largeResponse = {
        ...mockSuccessfulCohortResponse,
        metadata: {
          description: 'A'.repeat(10000), // Large metadata
          additionalData: Array.from({ length: 1000 }, (_, i) => `item${i}`)
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => largeResponse,
        headers: new Headers()
      });

      const startTime = Date.now();
      const response = await apiClient.getCohortIds(testDomain);
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should handle within timeout
    });
  });

  describe('Security and Privacy', () => {
    it('should not log sensitive data', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSuccessfulCohortResponse,
        headers: new Headers()
      });

      await apiClient.getCohortIds(testDomain);

      // Check that API key is not logged
      const allLogs = [...consoleSpy.mock.calls, ...consoleErrorSpy.mock.calls];
      allLogs.forEach(logArgs => {
        logArgs.forEach(arg => {
          if (typeof arg === 'string') {
            expect(arg).not.toContain(testApiKey);
          }
        });
      });

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should validate HTTPS usage', () => {
      const httpClient = new CohortAPIClient({
        apiKey: testApiKey,
        baseUrl: 'http://api.cohort-tracker.com', // HTTP instead of HTTPS
        timeout: 5000
      });

      expect(() => httpClient.getCohortIds(testDomain)).rejects.toThrow('HTTPS required');
    });

    it('should sanitize error messages', async () => {
      mockFetch.mockRejectedValueOnce(new Error(`Database connection failed: ${testApiKey}`));

      const response = await apiClient.getCohortIds(testDomain);

      expect(response.success).toBe(false);
      expect(response.error).not.toContain(testApiKey);
      expect(response.error).toContain('[REDACTED]');
    });
  });
});
