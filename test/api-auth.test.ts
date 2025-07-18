import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APIAuthenticationService, APIKeyData, APIPermission } from '../src/shared/core/api-auth';
import { APIRequestContext } from '../src/shared/interfaces/api-interface';

describe('APIAuthenticationService', () => {
  let authService: APIAuthenticationService;
  let mockRequestContext: APIRequestContext;

  beforeEach(() => {
    authService = new APIAuthenticationService();
    mockRequestContext = {
      domain: 'example.com',
      apiKey: 'test-api-key-12345',
      requestType: 'advertising',
      timestamp: new Date()
    };
  });

  describe('validateAPIKey', () => {
    it('should validate existing API key', async () => {
      const isValid = await authService.validateAPIKey('test-api-key-12345');
      expect(isValid).toBe(true);
    });

    it('should reject invalid API key', async () => {
      const isValid = await authService.validateAPIKey('invalid-key');
      expect(isValid).toBe(false);
    });

    it('should reject expired API key', async () => {
      const expiredKey = await authService.createAPIKey('test.com', [
        { type: 'cohort_access', scope: ['*'] }
      ]);
      
      // Manually expire the key by setting past expiry date
      const keyData = (authService as any).apiKeys.get(expiredKey);
      keyData.expiresAt = new Date(Date.now() - 1000);
      
      const isValid = await authService.validateAPIKey(expiredKey);
      expect(isValid).toBe(false);
    });

    it('should reject inactive API key', async () => {
      const inactiveKey = await authService.createAPIKey('test.com', [
        { type: 'cohort_access', scope: ['*'] }
      ]);
      
      await authService.revokeAPIKey(inactiveKey);
      const isValid = await authService.validateAPIKey(inactiveKey);
      expect(isValid).toBe(false);
    });
  });

  describe('authenticateRequest', () => {
    it('should authenticate valid request', async () => {
      const response = await authService.authenticateRequest(mockRequestContext);
      expect(response.success).toBe(true);
      expect(response.statusCode).toBe(200);
    });

    it('should reject request with invalid API key', async () => {
      const invalidContext = {
        ...mockRequestContext,
        apiKey: 'invalid-key'
      };
      
      const response = await authService.authenticateRequest(invalidContext);
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(401);
      expect(response.error).toContain('Invalid or expired API key');
    });

    it('should reject request from unauthorized domain', async () => {
      const restrictedKey = await authService.createAPIKey('restricted.com', [
        { type: 'cohort_access', scope: ['*'] }
      ]);
      
      const unauthorizedContext = {
        ...mockRequestContext,
        apiKey: restrictedKey,
        domain: 'unauthorized.com'
      };
      
      const response = await authService.authenticateRequest(unauthorizedContext);
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(403);
      expect(response.error).toContain('Domain not authorized');
    });

    it('should reject request without required permissions', async () => {
      const limitedKey = await authService.createAPIKey('example.com', [
        { type: 'metrics_access', scope: ['*'] }
      ]);
      
      const cohortContext = {
        ...mockRequestContext,
        apiKey: limitedKey,
        requestType: 'advertising' as const
      };
      
      const response = await authService.authenticateRequest(cohortContext);
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(403);
      expect(response.error).toContain('Insufficient permissions');
    });
  });

  describe('rate limiting', () => {
    it('should enforce minute rate limits', async () => {
      const limitedKey = await authService.createAPIKey('example.com', [
        { type: 'cohort_access', scope: ['*'] }
      ], {
        requestsPerMinute: 2,
        requestsPerHour: 100,
        requestsPerDay: 1000
      });

      const context = {
        ...mockRequestContext,
        apiKey: limitedKey
      };

      // First two requests should succeed
      let response = await authService.authenticateRequest(context);
      expect(response.success).toBe(true);
      
      response = await authService.authenticateRequest(context);
      expect(response.success).toBe(true);

      // Third request should be rate limited
      response = await authService.authenticateRequest(context);
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(429);
      expect(response.error).toContain('Rate limit exceeded');
    });

    it('should enforce hour rate limits', async () => {
      const limitedKey = await authService.createAPIKey('example.com', [
        { type: 'cohort_access', scope: ['*'] }
      ], {
        requestsPerMinute: 100,
        requestsPerHour: 1,
        requestsPerDay: 1000
      });

      const context = {
        ...mockRequestContext,
        apiKey: limitedKey
      };

      // First request should succeed
      let response = await authService.authenticateRequest(context);
      expect(response.success).toBe(true);

      // Second request should be rate limited
      response = await authService.authenticateRequest(context);
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(429);
    });

    it('should enforce day rate limits', async () => {
      const limitedKey = await authService.createAPIKey('example.com', [
        { type: 'cohort_access', scope: ['*'] }
      ], {
        requestsPerMinute: 100,
        requestsPerHour: 100,
        requestsPerDay: 1
      });

      const context = {
        ...mockRequestContext,
        apiKey: limitedKey
      };

      // First request should succeed
      let response = await authService.authenticateRequest(context);
      expect(response.success).toBe(true);

      // Second request should be rate limited
      response = await authService.authenticateRequest(context);
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(429);
    });
  });

  describe('API key management', () => {
    it('should create new API key with correct format', async () => {
      const permissions: APIPermission[] = [
        { type: 'cohort_access', scope: ['*'] }
      ];
      
      const apiKey = await authService.createAPIKey('newdomain.com', permissions);
      expect(apiKey).toMatch(/^lpct_[A-Za-z0-9]{32}$/);
      
      const isValid = await authService.validateAPIKey(apiKey);
      expect(isValid).toBe(true);
    });

    it('should revoke API key successfully', async () => {
      const apiKey = await authService.createAPIKey('test.com', [
        { type: 'cohort_access', scope: ['*'] }
      ]);
      
      expect(await authService.validateAPIKey(apiKey)).toBe(true);
      
      const revoked = await authService.revokeAPIKey(apiKey);
      expect(revoked).toBe(true);
      expect(await authService.validateAPIKey(apiKey)).toBe(false);
    });

    it('should return false when revoking non-existent key', async () => {
      const revoked = await authService.revokeAPIKey('non-existent-key');
      expect(revoked).toBe(false);
    });
  });

  describe('audit logging', () => {
    it('should log successful authentication requests', async () => {
      const initialLogCount = authService.getAuditLogs().length;
      
      await authService.authenticateRequest(mockRequestContext);
      
      const logs = authService.getAuditLogs();
      expect(logs.length).toBe(initialLogCount + 1);
      
      const latestLog = logs[logs.length - 1];
      expect(latestLog.domain).toBe(mockRequestContext.domain);
      expect(latestLog.requestType).toBe(mockRequestContext.requestType);
      expect(latestLog.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });

    it('should filter audit logs by time range', async () => {
      const startTime = new Date();
      await authService.authenticateRequest(mockRequestContext);
      const endTime = new Date();

      const filteredLogs = authService.getAuditLogs({
        start: startTime,
        end: endTime
      });

      expect(filteredLogs.length).toBeGreaterThan(0);
      filteredLogs.forEach(log => {
        expect(log.timestamp.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
        expect(log.timestamp.getTime()).toBeLessThanOrEqual(endTime.getTime());
      });
    });

    it('should limit audit log storage to prevent memory issues', async () => {
      // Mock a large number of logs
      const authServiceWithLogs = new APIAuthenticationService();
      const largeLogs = Array.from({ length: 15000 }, (_, i) => ({
        requestId: `req_${i}`,
        domain: 'test.com',
        timestamp: new Date(),
        cohortsShared: [],
        requestType: 'advertising',
        userConsent: true
      }));

      // Manually set logs to test cleanup
      (authServiceWithLogs as any).auditLogs = largeLogs;
      
      // Trigger log cleanup by making a request
      await authServiceWithLogs.authenticateRequest(mockRequestContext);
      
      const logs = authServiceWithLogs.getAuditLogs();
      expect(logs.length).toBeLessThanOrEqual(5001); // 5000 + 1 new log
    });
  });

  describe('rate limit status', () => {
    it('should return rate limit status for API key', async () => {
      const apiKey = await authService.createAPIKey('example.com', [
        { type: 'cohort_access', scope: ['*'] }
      ]);

      // Make a request to initialize rate limit state
      await authService.authenticateRequest({
        ...mockRequestContext,
        apiKey
      });

      const status = authService.getRateLimitStatus(apiKey);
      expect(status).toBeDefined();
      expect(status!.minuteCount).toBe(1);
      expect(status!.hourCount).toBe(1);
      expect(status!.dayCount).toBe(1);
    });

    it('should return null for non-existent API key', () => {
      const status = authService.getRateLimitStatus('non-existent-key');
      expect(status).toBeNull();
    });
  });

  describe('permission validation', () => {
    it('should allow admin permission for all request types', async () => {
      const adminKey = await authService.createAPIKey('example.com', [
        { type: 'admin', scope: ['*'] }
      ]);

      const advertisingContext = {
        ...mockRequestContext,
        apiKey: adminKey,
        requestType: 'advertising' as const
      };

      const measurementContext = {
        ...mockRequestContext,
        apiKey: adminKey,
        requestType: 'measurement' as const
      };

      const adResponse = await authService.authenticateRequest(advertisingContext);
      expect(adResponse.success).toBe(true);

      const measurementResponse = await authService.authenticateRequest(measurementContext);
      expect(measurementResponse.success).toBe(true);
    });

    it('should restrict cohort_access to advertising requests only', async () => {
      const cohortKey = await authService.createAPIKey('example.com', [
        { type: 'cohort_access', scope: ['*'] }
      ]);

      const advertisingContext = {
        ...mockRequestContext,
        apiKey: cohortKey,
        requestType: 'advertising' as const
      };

      const measurementContext = {
        ...mockRequestContext,
        apiKey: cohortKey,
        requestType: 'measurement' as const
      };

      const adResponse = await authService.authenticateRequest(advertisingContext);
      expect(adResponse.success).toBe(true);

      const measurementResponse = await authService.authenticateRequest(measurementContext);
      expect(measurementResponse.success).toBe(false);
      expect(measurementResponse.statusCode).toBe(403);
    });

    it('should restrict metrics_access to measurement requests only', async () => {
      const metricsKey = await authService.createAPIKey('example.com', [
        { type: 'metrics_access', scope: ['*'] }
      ]);

      const advertisingContext = {
        ...mockRequestContext,
        apiKey: metricsKey,
        requestType: 'advertising' as const
      };

      const measurementContext = {
        ...mockRequestContext,
        apiKey: metricsKey,
        requestType: 'measurement' as const
      };

      const adResponse = await authService.authenticateRequest(advertisingContext);
      expect(adResponse.success).toBe(false);
      expect(adResponse.statusCode).toBe(403);

      const measurementResponse = await authService.authenticateRequest(measurementContext);
      expect(measurementResponse.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle internal errors gracefully', async () => {
      // Mock an internal error by corrupting the API keys map
      const originalValidate = authService.validateAPIKey;
      authService.validateAPIKey = vi.fn().mockRejectedValue(new Error('Internal error'));

      const response = await authService.authenticateRequest(mockRequestContext);
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(500);
      expect(response.error).toContain('Internal authentication error');

      // Restore original method
      authService.validateAPIKey = originalValidate;
    });
  });
});