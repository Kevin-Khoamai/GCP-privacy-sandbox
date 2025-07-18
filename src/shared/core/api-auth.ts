import { APIRequestContext, APIError, APIRequestLog } from '../interfaces/common';
import { APIResponse } from '../interfaces/error-handling';

export interface APIKeyData {
  key: string;
  domain: string;
  permissions: APIPermission[];
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  rateLimitConfig: RateLimitConfig;
}

export interface APIPermission {
  type: 'cohort_access' | 'metrics_access' | 'admin';
  scope: string[]; // domains or cohort IDs
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
}

export interface RateLimitState {
  minuteCount: number;
  hourCount: number;
  dayCount: number;
  lastMinute: number;
  lastHour: number;
  lastDay: number;
}

export class APIAuthenticationService {
  private apiKeys: Map<string, APIKeyData> = new Map();
  private rateLimitStates: Map<string, RateLimitState> = new Map();
  private auditLogs: APIRequestLog[] = [];

  constructor() {
    this.initializeDefaultKeys();
  }

  /**
   * Initialize with some default API keys for testing
   */
  private initializeDefaultKeys(): void {
    const defaultKey: APIKeyData = {
      key: 'test-api-key-12345',
      domain: 'example.com',
      permissions: [
        { type: 'cohort_access', scope: ['*'] },
        { type: 'metrics_access', scope: ['*'] }
      ],
      createdAt: new Date(),
      isActive: true,
      rateLimitConfig: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      }
    };
    
    this.apiKeys.set(defaultKey.key, defaultKey);
  }

  /**
   * Validate API key and check permissions
   */
  async validateAPIKey(apiKey: string): Promise<boolean> {
    const keyData = this.apiKeys.get(apiKey);
    
    if (!keyData) {
      return false;
    }

    // Check if key is active
    if (!keyData.isActive) {
      return false;
    }

    // Check if key has expired
    if (keyData.expiresAt && keyData.expiresAt < new Date()) {
      return false;
    }

    return true;
  }

  /**
   * Authenticate and authorize API request
   */
  async authenticateRequest(requestContext: APIRequestContext): Promise<APIResponse> {
    try {
      // Validate API key
      const isValidKey = await this.validateAPIKey(requestContext.apiKey);
      if (!isValidKey) {
        const error: APIError = {
          name: 'AuthenticationError',
          message: 'Invalid or expired API key',
          code: 'AUTH_FAILED',
          statusCode: 401
        };
        return this.createErrorResponse(error);
      }

      const keyData = this.apiKeys.get(requestContext.apiKey)!;

      // Check domain authorization
      if (!this.isDomainAuthorized(keyData, requestContext.domain)) {
        const error: APIError = {
          name: 'AuthorizationError',
          message: 'Domain not authorized for this API key',
          code: 'AUTH_FAILED',
          statusCode: 403
        };
        return this.createErrorResponse(error);
      }

      // Check rate limits
      const rateLimitResult = this.checkRateLimit(requestContext.apiKey, keyData.rateLimitConfig);
      if (!rateLimitResult.allowed) {
        const error: APIError = {
          name: 'RateLimitError',
          message: `Rate limit exceeded: ${rateLimitResult.reason}`,
          code: 'RATE_LIMITED',
          statusCode: 429
        };
        return this.createErrorResponse(error);
      }

      // Check permissions for request type
      if (!this.hasPermission(keyData, requestContext.requestType)) {
        const error: APIError = {
          name: 'PermissionError',
          message: 'Insufficient permissions for this request type',
          code: 'AUTH_FAILED',
          statusCode: 403
        };
        return this.createErrorResponse(error);
      }

      // Log successful authentication
      this.logAPIRequest(requestContext, true);

      return {
        success: true,
        statusCode: 200
      };

    } catch (error) {
      const apiError: APIError = {
        name: 'InternalError',
        message: 'Internal authentication error',
        code: 'AUTH_FAILED',
        statusCode: 500
      };
      return this.createErrorResponse(apiError);
    }
  }

  /**
   * Check if domain is authorized for the API key
   */
  private isDomainAuthorized(keyData: APIKeyData, domain: string): boolean {
    // If key allows all domains (*) or matches the specific domain
    return keyData.domain === '*' || keyData.domain === domain;
  }

  /**
   * Check if API key has required permissions
   */
  private hasPermission(keyData: APIKeyData, requestType: string): boolean {
    const requiredPermission = requestType === 'advertising' ? 'cohort_access' : 'metrics_access';
    
    return keyData.permissions.some(permission => 
      permission.type === requiredPermission || permission.type === 'admin'
    );
  }

  /**
   * Check rate limits for API key
   */
  private checkRateLimit(apiKey: string, config: RateLimitConfig): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    const currentHour = Math.floor(now / 3600000);
    const currentDay = Math.floor(now / 86400000);

    let state = this.rateLimitStates.get(apiKey);
    
    if (!state) {
      state = {
        minuteCount: 0,
        hourCount: 0,
        dayCount: 0,
        lastMinute: currentMinute,
        lastHour: currentHour,
        lastDay: currentDay
      };
      this.rateLimitStates.set(apiKey, state);
    }

    // Reset counters if time periods have changed
    if (state.lastMinute !== currentMinute) {
      state.minuteCount = 0;
      state.lastMinute = currentMinute;
    }
    if (state.lastHour !== currentHour) {
      state.hourCount = 0;
      state.lastHour = currentHour;
    }
    if (state.lastDay !== currentDay) {
      state.dayCount = 0;
      state.lastDay = currentDay;
    }

    // Check limits
    if (state.minuteCount >= config.requestsPerMinute) {
      return { allowed: false, reason: 'Minute limit exceeded' };
    }
    if (state.hourCount >= config.requestsPerHour) {
      return { allowed: false, reason: 'Hour limit exceeded' };
    }
    if (state.dayCount >= config.requestsPerDay) {
      return { allowed: false, reason: 'Day limit exceeded' };
    }

    // Increment counters
    state.minuteCount++;
    state.hourCount++;
    state.dayCount++;

    return { allowed: true };
  }

  /**
   * Log API request for audit purposes
   */
  private logAPIRequest(requestContext: APIRequestContext, success: boolean): void {
    const log: APIRequestLog = {
      requestId: this.generateRequestId(),
      domain: requestContext.domain,
      timestamp: requestContext.timestamp,
      cohortsShared: [], // Will be populated by the API endpoint
      requestType: requestContext.requestType,
      userConsent: true // Assuming consent is checked elsewhere
    };

    this.auditLogs.push(log);

    // Keep only last 10000 logs to prevent memory issues
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-5000);
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create standardized error response
   */
  private createErrorResponse(error: APIError): APIResponse {
    return {
      success: false,
      error: error.message,
      statusCode: error.statusCode
    };
  }

  /**
   * Create new API key (admin function)
   */
  async createAPIKey(domain: string, permissions: APIPermission[], rateLimitConfig?: RateLimitConfig): Promise<string> {
    const apiKey = this.generateAPIKey();
    const keyData: APIKeyData = {
      key: apiKey,
      domain,
      permissions,
      createdAt: new Date(),
      isActive: true,
      rateLimitConfig: rateLimitConfig || {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      }
    };

    this.apiKeys.set(apiKey, keyData);
    return apiKey;
  }

  /**
   * Generate secure API key
   */
  private generateAPIKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'lpct_'; // Local Privacy Cohort Tracker prefix
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Revoke API key
   */
  async revokeAPIKey(apiKey: string): Promise<boolean> {
    const keyData = this.apiKeys.get(apiKey);
    if (keyData) {
      keyData.isActive = false;
      return true;
    }
    return false;
  }

  /**
   * Get audit logs for compliance
   */
  getAuditLogs(timeRange?: { start: Date; end: Date }): APIRequestLog[] {
    if (!timeRange) {
      return [...this.auditLogs];
    }

    return this.auditLogs.filter(log => 
      log.timestamp >= timeRange.start && log.timestamp <= timeRange.end
    );
  }

  /**
   * Get rate limit status for API key
   */
  getRateLimitStatus(apiKey: string): RateLimitState | null {
    return this.rateLimitStates.get(apiKey) || null;
  }
}