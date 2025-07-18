import { 
  StorageError, 
  ProcessingError, 
  APIError, 
  PrivacyError, 
  RecoveryAction 
} from '../interfaces/common';
import { 
  ErrorHandler, 
  APIResponse, 
  PrivacyAction 
} from '../interfaces/error-handling';

/**
 * ErrorLogger provides a centralized logging mechanism for all system errors
 * with privacy-safe diagnostics and severity levels.
 */
export interface ErrorLogger {
  /**
   * Log an error with the specified severity level
   * @param error The error object to log
   * @param context Additional context information about the error
   * @param severity The severity level of the error
   */
  logError(error: Error, context: Record<string, any>, severity: ErrorSeverity): void;
  
  /**
   * Get recent error logs for diagnostics
   * @param count Number of recent logs to retrieve
   * @param minSeverity Minimum severity level to include
   */
  getRecentLogs(count: number, minSeverity?: ErrorSeverity): ErrorLogEntry[];
  
  /**
   * Clear all error logs
   */
  clearLogs(): void;
}

/**
 * Severity levels for error logging
 */
export enum ErrorSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Structure of an error log entry
 */
export interface ErrorLogEntry {
  timestamp: Date;
  errorType: string;
  message: string;
  code?: string;
  severity: ErrorSeverity;
  context: Record<string, any>;
  stackTrace?: string;
}

/**
 * Implementation of the ErrorLogger interface that handles privacy-safe logging
 */
export class PrivacySafeErrorLogger implements ErrorLogger {
  private logs: ErrorLogEntry[] = [];
  private readonly maxLogs: number;
  
  constructor(maxLogs: number = 100) {
    this.maxLogs = maxLogs;
  }
  
  /**
   * Log an error with privacy-safe diagnostics
   */
  public logError(error: Error, context: Record<string, any>, severity: ErrorSeverity): void {
    // Create a sanitized version of the context without PII
    const sanitizedContext = this.sanitizeContext(context);
    
    // Create the log entry
    const logEntry: ErrorLogEntry = {
      timestamp: new Date(),
      errorType: error.constructor.name,
      message: error.message,
      code: this.getErrorCode(error),
      severity,
      context: sanitizedContext,
      stackTrace: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    };
    
    // Add to logs array, maintaining max size
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
    
    // Output to console based on severity
    this.consoleOutput(logEntry);
  }
  
  /**
   * Get recent error logs
   */
  public getRecentLogs(count: number = 10, minSeverity: ErrorSeverity = ErrorSeverity.INFO): ErrorLogEntry[] {
    return this.logs
      .filter(log => this.getSeverityLevel(log.severity) >= this.getSeverityLevel(minSeverity))
      .slice(0, count);
  }
  
  /**
   * Clear all error logs
   */
  public clearLogs(): void {
    this.logs = [];
  }
  
  /**
   * Remove any potential PII from error context
   */
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Skip known PII fields
      if (['userId', 'email', 'password', 'token', 'apiKey'].includes(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      
      // Handle different value types
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          sanitized[key] = '[Array]';
        } else {
          sanitized[key] = '[Object]';
        }
      } else if (typeof value === 'function') {
        sanitized[key] = '[Function]';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  /**
   * Extract error code if available
   */
  private getErrorCode(error: Error): string | undefined {
    if ('code' in error && typeof (error as any).code === 'string') {
      return (error as any).code;
    }
    return undefined;
  }
  
  /**
   * Output log entry to console based on severity
   */
  private consoleOutput(log: ErrorLogEntry): void {
    const logPrefix = `[${log.timestamp.toISOString()}] [${log.severity.toUpperCase()}]`;
    
    switch (log.severity) {
      case ErrorSeverity.DEBUG:
        console.debug(`${logPrefix} ${log.errorType}: ${log.message}`, log.context);
        break;
      case ErrorSeverity.INFO:
        console.info(`${logPrefix} ${log.errorType}: ${log.message}`, log.context);
        break;
      case ErrorSeverity.WARNING:
        console.warn(`${logPrefix} ${log.errorType}: ${log.message}`, log.context);
        break;
      case ErrorSeverity.ERROR:
      case ErrorSeverity.CRITICAL:
        console.error(`${logPrefix} ${log.errorType}: ${log.message}`, log.context);
        if (log.stackTrace) {
          console.error(log.stackTrace);
        }
        break;
    }
  }
  
  /**
   * Get numeric value for severity level for comparison
   */
  private getSeverityLevel(severity: ErrorSeverity): number {
    const levels: Record<ErrorSeverity, number> = {
      [ErrorSeverity.DEBUG]: 0,
      [ErrorSeverity.INFO]: 1,
      [ErrorSeverity.WARNING]: 2,
      [ErrorSeverity.ERROR]: 3,
      [ErrorSeverity.CRITICAL]: 4
    };
    
    return levels[severity] || 0;
  }
}

/**
 * Main error handler implementation that provides recovery strategies
 * for different types of errors and graceful degradation
 */
export class SystemErrorHandler implements ErrorHandler {
  private readonly logger: ErrorLogger;
  private notificationCallback?: (message: string, type: 'error' | 'warning' | 'info') => void;
  
  constructor(logger: ErrorLogger) {
    this.logger = logger;
  }
  
  /**
   * Set a callback function to notify users about critical errors
   */
  public setNotificationCallback(callback: (message: string, type: 'error' | 'warning' | 'info') => void): void {
    this.notificationCallback = callback;
  }
  
  /**
   * Handle storage-related errors with appropriate recovery strategies
   */
  public handleStorageError(error: StorageError): RecoveryAction {
    this.logger.logError(error, { type: 'storage' }, ErrorSeverity.ERROR);
    
    switch (error.code) {
      case 'ENCRYPTION_FAILED':
        // Critical security issue - notify user and use fallback
        this.notifyUser('Unable to securely encrypt data. Some features may be limited.', 'error');
        return RecoveryAction.FALLBACK_TO_DEFAULT;
        
      case 'QUOTA_EXCEEDED':
        // Storage space issue - clean up and retry
        this.logger.logError(error, { type: 'storage', action: 'cleanup' }, ErrorSeverity.WARNING);
        return RecoveryAction.RETRY_WITH_BACKOFF;
        
      case 'CORRUPTION_DETECTED':
        // Data integrity issue - reset component
        this.notifyUser('Data corruption detected. Resetting affected component.', 'warning');
        return RecoveryAction.RESET_COMPONENT;
        
      default:
        // Unknown storage error - log and continue
        return RecoveryAction.LOG_AND_CONTINUE;
    }
  }
  
  /**
   * Handle processing-related errors with appropriate recovery strategies
   */
  public handleProcessingError(error: ProcessingError): RecoveryAction {
    this.logger.logError(error, { type: 'processing' }, ErrorSeverity.WARNING);
    
    switch (error.code) {
      case 'INVALID_DOMAIN':
        // Skip invalid domain and continue
        return RecoveryAction.LOG_AND_CONTINUE;
        
      case 'TAXONOMY_LOOKUP_FAILED':
        // Try fallback keyword matching
        return RecoveryAction.FALLBACK_TO_DEFAULT;
        
      case 'ASSIGNMENT_FAILED':
        // Cohort assignment issue - maintain previous assignments
        this.logger.logError(error, { type: 'cohort', action: 'maintain_previous' }, ErrorSeverity.WARNING);
        return RecoveryAction.FALLBACK_TO_DEFAULT;
        
      default:
        // Unknown processing error - log and continue
        return RecoveryAction.LOG_AND_CONTINUE;
    }
  }
  
  /**
   * Handle API-related errors with appropriate responses
   */
  public handleAPIError(error: APIError): APIResponse {
    this.logger.logError(error, { type: 'api' }, ErrorSeverity.ERROR);
    
    switch (error.code) {
      case 'AUTH_FAILED':
        return {
          success: false,
          error: 'Authentication failed. Please check your API credentials.',
          statusCode: 401
        };
        
      case 'RATE_LIMITED':
        return {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          statusCode: 429
        };
        
      case 'INVALID_REQUEST':
        return {
          success: false,
          error: 'Invalid request format. Please check your request parameters.',
          statusCode: 400
        };
        
      default:
        // Unknown API error - internal server error
        return {
          success: false,
          error: 'An unexpected error occurred. Please try again later.',
          statusCode: 500
        };
    }
  }
  
  /**
   * Handle privacy-related errors with appropriate actions
   */
  public handlePrivacyError(error: PrivacyError): PrivacyAction {
    this.logger.logError(error, { type: 'privacy' }, ErrorSeverity.CRITICAL);
    
    switch (error.code) {
      case 'CONSENT_WITHDRAWN':
        // Immediate data deletion and API blocking
        this.notifyUser('Your data is being deleted as requested.', 'info');
        return {
          action: 'DELETE_DATA',
          immediate: true,
          auditLog: true
        };
        
      case 'SENSITIVE_CATEGORY':
        // Exclude sensitive category from processing
        return {
          action: 'EXCLUDE_CATEGORY',
          immediate: true,
          auditLog: true
        };
        
      case 'RETENTION_VIOLATION':
        // Clean up expired data
        return {
          action: 'CLEANUP_DATA',
          immediate: true,
          auditLog: true
        };
        
      default:
        // Unknown privacy error - delete data to be safe
        this.notifyUser('A privacy protection issue was detected. Some data may be deleted.', 'warning');
        return {
          action: 'DELETE_DATA',
          immediate: true,
          auditLog: true
        };
    }
  }
  
  /**
   * Notify user about important errors if callback is set
   */
  private notifyUser(message: string, type: 'error' | 'warning' | 'info'): void {
    if (this.notificationCallback) {
      this.notificationCallback(message, type);
    }
  }
}