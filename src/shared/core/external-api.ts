import { ExternalAPIInterface, APIRequestContext, MetricsData } from '../interfaces/api-interface';
import { APIResponse } from '../interfaces/error-handling';
import { TimeRange, CohortAssignment, APIRequestLog, APIError } from '../interfaces/common';
import { APIAuthenticationService } from './api-auth';
import { StorageLayer } from './storage-layer';
import { CohortEngine } from './cohort-engine';
import { PrivacyControls } from './privacy-controls';
import { ErrorFactory } from './error-factory';
import { SystemErrorHandler, PrivacySafeErrorLogger, ErrorSeverity } from './error-handler';

export interface CohortDataResponse {
  cohortIds: string[];
  timestamp: Date;
  expiresAt: Date;
  requestId: string;
}

export interface AggregatedMetricsResponse {
  metrics: MetricsData[];
  aggregationLevel: 'high' | 'medium' | 'low';
  timestamp: Date;
  requestId: string;
  privacyNotice: string;
}

export interface APIValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * External API interface implementation that provides secure, privacy-preserving
 * endpoints for advertisers and publishers to access cohort data and metrics
 */
export class ExternalAPI implements ExternalAPIInterface {
  private static instance: ExternalAPI;
  private authService: APIAuthenticationService;
  private storageLayer: StorageLayer;
  private cohortEngine: CohortEngine;
  private privacyControls: PrivacyControls;
  private errorHandler: SystemErrorHandler;
  private errorLogger: PrivacySafeErrorLogger;

  // Privacy and security constants
  private readonly MIN_COHORT_SIZE_FOR_METRICS = 50; // Minimum cohort size for metric reporting
  private readonly MAX_COHORTS_PER_REQUEST = 3; // Maximum cohorts shared per request
  private readonly COHORT_ID_EXPIRY_HOURS = 24; // Cohort IDs expire after 24 hours
  private readonly METRICS_AGGREGATION_THRESHOLD = 100; // Minimum data points for aggregation

  private constructor(
    authService?: APIAuthenticationService,
    storageLayer?: StorageLayer,
    cohortEngine?: CohortEngine,
    privacyControls?: PrivacyControls,
    errorHandler?: SystemErrorHandler
  ) {
    this.errorLogger = new PrivacySafeErrorLogger();
    this.errorHandler = errorHandler || new SystemErrorHandler(this.errorLogger);
    this.authService = authService || new APIAuthenticationService();
    this.storageLayer = storageLayer || new StorageLayer(this.errorHandler);
    this.cohortEngine = cohortEngine || CohortEngine.getInstance();
    this.privacyControls = privacyControls || PrivacyControls.getInstance();
  }

  /**
   * Get singleton instance of ExternalAPI
   */
  public static getInstance(): ExternalAPI {
    if (!ExternalAPI.instance) {
      ExternalAPI.instance = new ExternalAPI();
    }
    return ExternalAPI.instance;
  }

  /**
   * Create instance with custom dependencies (for testing)
   */
  public static createWithDependencies(
    authService: APIAuthenticationService,
    storageLayer: StorageLayer,
    cohortEngine: CohortEngine,
    privacyControls: PrivacyControls
  ): ExternalAPI {
    return new ExternalAPI(authService, storageLayer, cohortEngine, privacyControls);
  }

  /**
   * Initialize the API service
   */
  public async initialize(): Promise<void> {
    await this.storageLayer.initialize();
    await this.privacyControls.initialize();
  }

  /**
   * Get cohort IDs for the current user with anonymization and privacy controls
   * @param requestContext API request context with authentication
   * @returns Promise<string[]> Array of anonymized cohort IDs
   */
  public async getCohortIds(requestContext: APIRequestContext): Promise<string[]> {
    // Step 1: Authenticate and authorize the request
    const authResult = await this.authService.authenticateRequest(requestContext);
    if (!authResult.success) {
      const apiError = this.createAPIError(authResult.statusCode, authResult.error || 'Authentication failed', 'AUTH_FAILED');
      this.errorLogger.logError(apiError, { 
        domain: requestContext.domain, 
        requestType: requestContext.requestType 
      }, ErrorSeverity.ERROR);
      throw apiError;
    }

    // Step 2: Validate request parameters
    const validationErrors = this.validateCohortRequest(requestContext);
    if (validationErrors.length > 0) {
      const apiError = this.createAPIError(400, `Validation failed: ${validationErrors.map(e => e.message).join(', ')}`, 'INVALID_REQUEST');
      this.errorLogger.logError(apiError, { 
        domain: requestContext.domain, 
        validationErrors 
      }, ErrorSeverity.WARNING);
      throw apiError;
    }

    try {
      // Step 3: Check user privacy preferences
      const preferences = await this.storageLayer.getUserPreferences();
      if (!preferences.cohortsEnabled || !preferences.shareWithAdvertisers) {
        // Return empty array if user has disabled cohort sharing
        await this.logAPIRequest(requestContext, [], true);
        return [];
      }

      // Step 4: Get current cohorts for sharing
      const cohortsForSharing = this.cohortEngine.getCohortsForSharing();
      
      // Step 5: Apply privacy filtering and anonymization
      const anonymizedCohortIds = this.anonymizeCohortIds(cohortsForSharing, preferences.disabledTopics);

      // Step 6: Limit to maximum cohorts per request
      const limitedCohortIds = anonymizedCohortIds.slice(0, this.MAX_COHORTS_PER_REQUEST);

      // Step 7: Log the API request for audit purposes
      await this.logAPIRequest(requestContext, limitedCohortIds, true);

      return limitedCohortIds;

    } catch (error) {
      // Log failed request
      await this.logAPIRequest(requestContext, [], false);
      
      if (error instanceof Error && 'code' in error && 'statusCode' in error) {
        // Handle API errors with our error handler
        const apiError = error as APIError;
        const response = this.errorHandler.handleAPIError(apiError);
        
        this.errorLogger.logError(apiError, { 
          domain: requestContext.domain, 
          requestType: requestContext.requestType,
          response
        }, ErrorSeverity.ERROR);
        
        throw apiError; // Re-throw API errors after handling
      }
      
      // For unknown errors, create a generic API error
      const apiError = this.createAPIError(500, 'Internal server error while retrieving cohort data', 'AUTH_FAILED');
      this.errorLogger.logError(apiError, { 
        originalError: error instanceof Error ? error.message : String(error),
        domain: requestContext.domain
      }, ErrorSeverity.CRITICAL);
      
      throw apiError;
    }
  }

  /**
   * Get aggregated metrics for specified cohorts with privacy safeguards
   * @param cohortIds Array of cohort IDs to get metrics for
   * @param timeRange Time range for metrics aggregation
   * @returns Promise<MetricsData> Aggregated metrics data
   */
  public async getAggregatedMetrics(cohortIds: string[], timeRange: TimeRange): Promise<MetricsData> {
    // Note: This is a simplified implementation as we don't have actual impression/click data
    // In a real implementation, this would aggregate data from ad servers and attribution systems
    
    try {
      // Step 1: Validate input parameters
      const validationErrors = this.validateMetricsRequest(cohortIds, timeRange);
      if (validationErrors.length > 0) {
        const apiError = this.createAPIError(400, `Validation failed: ${validationErrors.map(e => e.message).join(', ')}`, 'INVALID_REQUEST');
        this.errorLogger.logError(apiError, { 
          cohortIds, 
          timeRange, 
          validationErrors 
        }, ErrorSeverity.WARNING);
        throw apiError;
      }

      // Step 2: Check if we have sufficient data for privacy-safe aggregation
      const aggregationLevel = this.determineAggregationLevel(cohortIds.length);
      
      // Step 3: Generate mock aggregated metrics (in real implementation, this would query actual data)
      const aggregatedMetrics = this.generateAggregatedMetrics(cohortIds, timeRange, aggregationLevel);

      // Step 4: Apply privacy thresholds and suppression
      const privacySafeMetrics = this.applyPrivacyThresholds(aggregatedMetrics);

      return privacySafeMetrics;

    } catch (error) {
      if (error instanceof Error && 'code' in error && 'statusCode' in error) {
        // Handle API errors with our error handler
        const apiError = error as APIError;
        const response = this.errorHandler.handleAPIError(apiError);
        
        this.errorLogger.logError(apiError, { 
          cohortIds,
          timeRange,
          response
        }, ErrorSeverity.ERROR);
        
        throw apiError; // Re-throw API errors after handling
      }
      
      // For unknown errors, create a generic API error
      const apiError = this.createAPIError(500, 'Internal server error while retrieving metrics', 'AUTH_FAILED');
      this.errorLogger.logError(apiError, { 
        originalError: error instanceof Error ? error.message : String(error),
        cohortIds,
        timeRange
      }, ErrorSeverity.CRITICAL);
      
      throw apiError;
    }
  }

  /**
   * Validate API key (public method for external validation)
   * @param apiKey API key to validate
   * @returns Promise<boolean> True if valid, false otherwise
   */
  public async validateAPIKey(apiKey: string): Promise<boolean> {
    return await this.authService.validateAPIKey(apiKey);
  }

  /**
   * Get detailed cohort data response with metadata
   * @param requestContext API request context
   * @returns Promise<CohortDataResponse> Detailed cohort response
   */
  public async getCohortDataResponse(requestContext: APIRequestContext): Promise<CohortDataResponse> {
    const cohortIds = await this.getCohortIds(requestContext);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.COHORT_ID_EXPIRY_HOURS * 60 * 60 * 1000);

    return {
      cohortIds,
      timestamp: now,
      expiresAt,
      requestId: this.generateRequestId()
    };
  }

  /**
   * Get detailed aggregated metrics response with metadata
   * @param cohortIds Array of cohort IDs
   * @param timeRange Time range for metrics
   * @returns Promise<AggregatedMetricsResponse> Detailed metrics response
   */
  public async getAggregatedMetricsResponse(cohortIds: string[], timeRange: TimeRange): Promise<AggregatedMetricsResponse> {
    const metrics = await this.getAggregatedMetrics(cohortIds, timeRange);
    const aggregationLevel = this.determineAggregationLevel(cohortIds.length);

    return {
      metrics: [metrics], // Wrap single metric in array for consistency
      aggregationLevel,
      timestamp: new Date(),
      requestId: this.generateRequestId(),
      privacyNotice: this.getPrivacyNotice()
    };
  }

  /**
   * Validate cohort request parameters
   * @param requestContext Request context to validate
   * @returns APIValidationError[] Array of validation errors
   */
  private validateCohortRequest(requestContext: APIRequestContext): APIValidationError[] {
    const errors: APIValidationError[] = [];

    if (!requestContext.domain || requestContext.domain.trim() === '') {
      errors.push({
        field: 'domain',
        message: 'Domain is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (!requestContext.apiKey || requestContext.apiKey.trim() === '') {
      errors.push({
        field: 'apiKey',
        message: 'API key is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (!['advertising', 'measurement'].includes(requestContext.requestType)) {
      errors.push({
        field: 'requestType',
        message: 'Request type must be either "advertising" or "measurement"',
        code: 'INVALID_VALUE'
      });
    }

    if (!requestContext.timestamp || isNaN(requestContext.timestamp.getTime())) {
      errors.push({
        field: 'timestamp',
        message: 'Valid timestamp is required',
        code: 'INVALID_FORMAT'
      });
    }

    // Check if timestamp is too old (prevent replay attacks)
    if (requestContext.timestamp) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (requestContext.timestamp < fiveMinutesAgo) {
        errors.push({
          field: 'timestamp',
          message: 'Request timestamp is too old (max 5 minutes)',
          code: 'TIMESTAMP_TOO_OLD'
        });
      }
    }

    return errors;
  }

  /**
   * Validate metrics request parameters
   * @param cohortIds Array of cohort IDs
   * @param timeRange Time range for metrics
   * @returns APIValidationError[] Array of validation errors
   */
  private validateMetricsRequest(cohortIds: string[], timeRange: TimeRange): APIValidationError[] {
    const errors: APIValidationError[] = [];

    if (!Array.isArray(cohortIds) || cohortIds.length === 0) {
      errors.push({
        field: 'cohortIds',
        message: 'At least one cohort ID is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (cohortIds.length > 10) {
      errors.push({
        field: 'cohortIds',
        message: 'Maximum 10 cohort IDs allowed per request',
        code: 'LIMIT_EXCEEDED'
      });
    }

    if (!timeRange.startDate || !timeRange.endDate) {
      errors.push({
        field: 'timeRange',
        message: 'Both startDate and endDate are required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (timeRange.startDate && timeRange.endDate && timeRange.startDate >= timeRange.endDate) {
      errors.push({
        field: 'timeRange',
        message: 'startDate must be before endDate',
        code: 'INVALID_RANGE'
      });
    }

    // Limit time range to prevent excessive data processing
    if (timeRange.startDate && timeRange.endDate) {
      const daysDiff = (timeRange.endDate.getTime() - timeRange.startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 90) {
        errors.push({
          field: 'timeRange',
          message: 'Time range cannot exceed 90 days',
          code: 'RANGE_TOO_LARGE'
        });
      }
    }

    return errors;
  }

  /**
   * Anonymize cohort IDs by converting topic IDs to anonymized strings
   * @param cohorts Array of cohort assignments
   * @param disabledTopics Array of disabled topic IDs
   * @returns string[] Array of anonymized cohort IDs
   */
  private anonymizeCohortIds(cohorts: CohortAssignment[], disabledTopics: number[]): string[] {
    return cohorts
      .filter(cohort => !disabledTopics.includes(cohort.topicId))
      .map(cohort => this.generateAnonymizedCohortId(cohort.topicId, cohort.topicName))
      .filter(id => id !== null) as string[];
  }

  /**
   * Generate anonymized cohort ID from topic information
   * @param topicId Topic ID
   * @param topicName Topic name
   * @returns string Anonymized cohort ID
   */
  private generateAnonymizedCohortId(topicId: number, topicName: string): string {
    // Create a hash-based anonymized ID that doesn't reveal the actual topic ID
    const hashInput = `${topicId}_${topicName}_${this.getWeekIdentifier()}`;
    return `cohort_${this.simpleHash(hashInput)}`;
  }

  /**
   * Get current week identifier for cohort ID generation
   * @returns string Week identifier
   */
  private getWeekIdentifier(): string {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((now.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
    return `${now.getFullYear()}_W${weekNumber}`;
  }

  /**
   * Simple hash function for generating anonymized IDs
   * @param str String to hash
   * @returns string Hash value
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).padStart(8, '0');
  }

  /**
   * Determine aggregation level based on data size
   * @param cohortCount Number of cohorts
   * @returns 'high' | 'medium' | 'low' Aggregation level
   */
  private determineAggregationLevel(cohortCount: number): 'high' | 'medium' | 'low' {
    if (cohortCount >= 5) return 'high';
    if (cohortCount >= 3) return 'medium';
    return 'low';
  }

  /**
   * Generate mock aggregated metrics (placeholder implementation)
   * @param cohortIds Array of cohort IDs
   * @param timeRange Time range for metrics
   * @param aggregationLevel Aggregation level
   * @returns MetricsData Mock metrics data
   */
  private generateAggregatedMetrics(cohortIds: string[], timeRange: TimeRange, aggregationLevel: 'high' | 'medium' | 'low'): MetricsData {
    // This is a mock implementation - in reality, this would aggregate real impression/click data
    const daysDiff = Math.max(1, (timeRange.endDate.getTime() - timeRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const baseImpressions = Math.floor(Math.random() * 1000 * daysDiff);
    const baseClicks = Math.floor(baseImpressions * (0.01 + Math.random() * 0.05)); // 1-6% CTR
    const baseConversions = Math.floor(baseClicks * (0.02 + Math.random() * 0.08)); // 2-10% conversion rate

    return {
      cohortId: cohortIds.join(','), // Combined cohort identifier
      impressions: baseImpressions,
      clicks: baseClicks,
      conversions: baseConversions,
      aggregationLevel
    };
  }

  /**
   * Apply privacy thresholds and data suppression
   * @param metrics Raw metrics data
   * @returns MetricsData Privacy-safe metrics
   */
  private applyPrivacyThresholds(metrics: MetricsData): MetricsData {
    // Apply minimum threshold enforcement
    if (metrics.impressions < this.MIN_COHORT_SIZE_FOR_METRICS) {
      return {
        cohortId: metrics.cohortId,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        aggregationLevel: 'low'
      };
    }

    // Apply noise injection for differential privacy (simplified)
    const noiseLevel = metrics.aggregationLevel === 'low' ? 0.1 : 0.05;
    
    return {
      cohortId: metrics.cohortId,
      impressions: Math.max(0, Math.floor(metrics.impressions * (1 + (Math.random() - 0.5) * noiseLevel))),
      clicks: Math.max(0, Math.floor(metrics.clicks * (1 + (Math.random() - 0.5) * noiseLevel))),
      conversions: Math.max(0, Math.floor(metrics.conversions * (1 + (Math.random() - 0.5) * noiseLevel))),
      aggregationLevel: metrics.aggregationLevel
    };
  }

  /**
   * Log API request for audit purposes
   * @param requestContext Request context
   * @param cohortsShared Array of cohort IDs shared
   * @param success Whether the request was successful
   */
  private async logAPIRequest(requestContext: APIRequestContext, cohortsShared: string[], success: boolean): Promise<void> {
    try {
      const log: APIRequestLog = {
        requestId: this.generateRequestId(),
        domain: requestContext.domain,
        timestamp: new Date(),
        cohortsShared,
        requestType: requestContext.requestType,
        userConsent: true // Assuming consent is checked elsewhere
      };

      await this.storageLayer.logAPIRequest(log);
    } catch (error) {
      // Don't let logging errors break the main functionality
      console.warn('Failed to log API request:', error);
    }
  }

  /**
   * Generate unique request ID
   * @returns string Request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create standardized API error
   * @param statusCode HTTP status code
   * @param message Error message
   * @param code Error code
   * @returns APIError API error object
   */
  private createAPIError(statusCode: number, message: string, code: APIError['code']): APIError {
    return ErrorFactory.createAPIError(code, message, statusCode);
  }

  /**
   * Get privacy notice for API responses
   * @returns string Privacy notice text
   */
  private getPrivacyNotice(): string {
    return 'This data is aggregated and anonymized to protect user privacy. Individual user data is never shared.';
  }
}

// Export singleton instance
export const externalAPI = ExternalAPI.getInstance();