import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  SystemErrorHandler, 
  PrivacySafeErrorLogger, 
  ErrorSeverity 
} from '../src/shared/core/error-handler';
import { 
  StorageError, 
  ProcessingError, 
  APIError, 
  PrivacyError, 
  RecoveryAction 
} from '../src/shared/interfaces/common';

describe('PrivacySafeErrorLogger', () => {
  let logger: PrivacySafeErrorLogger;
  
  beforeEach(() => {
    logger = new PrivacySafeErrorLogger(10);
    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should log errors with appropriate severity', () => {
    const error = new Error('Test error');
    logger.logError(error, { component: 'test' }, ErrorSeverity.ERROR);
    
    const logs = logger.getRecentLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('Test error');
    expect(logs[0].severity).toBe(ErrorSeverity.ERROR);
    expect(console.error).toHaveBeenCalled();
  });
  
  it('should sanitize context to remove PII', () => {
    const error = new Error('Privacy error');
    const context = {
      userId: 'user123',
      email: 'user@example.com',
      component: 'privacy',
      data: { valid: true }
    };
    
    logger.logError(error, context, ErrorSeverity.WARNING);
    
    const logs = logger.getRecentLogs(1);
    expect(logs[0].context.userId).toBe('[REDACTED]');
    expect(logs[0].context.email).toBe('[REDACTED]');
    expect(logs[0].context.component).toBe('privacy');
    expect(logs[0].context.data).toBe('[Object]');
  });
  
  it('should limit the number of logs stored', () => {
    const maxLogs = 3;
    const limitedLogger = new PrivacySafeErrorLogger(maxLogs);
    
    // Add more logs than the limit
    for (let i = 0; i < maxLogs + 2; i++) {
      limitedLogger.logError(new Error(`Error ${i}`), {}, ErrorSeverity.INFO);
    }
    
    const logs = limitedLogger.getRecentLogs(10);
    expect(logs).toHaveLength(maxLogs);
    // Most recent should be first
    expect(logs[0].message).toBe('Error 4');
  });
  
  it('should filter logs by minimum severity', () => {
    // Add logs with different severity levels
    logger.logError(new Error('Debug'), {}, ErrorSeverity.DEBUG);
    logger.logError(new Error('Info'), {}, ErrorSeverity.INFO);
    logger.logError(new Error('Warning'), {}, ErrorSeverity.WARNING);
    logger.logError(new Error('Error'), {}, ErrorSeverity.ERROR);
    logger.logError(new Error('Critical'), {}, ErrorSeverity.CRITICAL);
    
    // Get logs with minimum WARNING severity
    const warningAndAbove = logger.getRecentLogs(10, ErrorSeverity.WARNING);
    expect(warningAndAbove).toHaveLength(3);
    expect(warningAndAbove.map(log => log.severity)).toEqual(
      expect.arrayContaining([ErrorSeverity.WARNING, ErrorSeverity.ERROR, ErrorSeverity.CRITICAL])
    );
  });
  
  it('should clear all logs', () => {
    logger.logError(new Error('Test'), {}, ErrorSeverity.INFO);
    expect(logger.getRecentLogs()).toHaveLength(1);
    
    logger.clearLogs();
    expect(logger.getRecentLogs()).toHaveLength(0);
  });
});

describe('SystemErrorHandler', () => {
  let logger: PrivacySafeErrorLogger;
  let errorHandler: SystemErrorHandler;
  let notificationMock: vi.Mock;
  
  beforeEach(() => {
    logger = new PrivacySafeErrorLogger();
    vi.spyOn(logger, 'logError').mockImplementation(() => {});
    
    errorHandler = new SystemErrorHandler(logger);
    notificationMock = vi.fn();
    errorHandler.setNotificationCallback(notificationMock);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('handleStorageError', () => {
    it('should handle ENCRYPTION_FAILED with fallback strategy', () => {
      const error = new Error('Encryption failed') as StorageError;
      error.code = 'ENCRYPTION_FAILED';
      
      const action = errorHandler.handleStorageError(error);
      
      expect(action).toBe(RecoveryAction.FALLBACK_TO_DEFAULT);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.ERROR);
      expect(notificationMock).toHaveBeenCalledWith(expect.stringContaining('Unable to securely encrypt'), 'error');
    });
    
    it('should handle QUOTA_EXCEEDED with retry strategy', () => {
      const error = new Error('Storage quota exceeded') as StorageError;
      error.code = 'QUOTA_EXCEEDED';
      
      const action = errorHandler.handleStorageError(error);
      
      expect(action).toBe(RecoveryAction.RETRY_WITH_BACKOFF);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.ERROR);
      expect(notificationMock).not.toHaveBeenCalled();
    });
    
    it('should handle CORRUPTION_DETECTED with reset strategy', () => {
      const error = new Error('Data corruption detected') as StorageError;
      error.code = 'CORRUPTION_DETECTED';
      
      const action = errorHandler.handleStorageError(error);
      
      expect(action).toBe(RecoveryAction.RESET_COMPONENT);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.ERROR);
      expect(notificationMock).toHaveBeenCalledWith(expect.stringContaining('Data corruption'), 'warning');
    });
  });
  
  describe('handleProcessingError', () => {
    it('should handle INVALID_DOMAIN with continue strategy', () => {
      const error = new Error('Invalid domain format') as ProcessingError;
      error.code = 'INVALID_DOMAIN';
      
      const action = errorHandler.handleProcessingError(error);
      
      expect(action).toBe(RecoveryAction.LOG_AND_CONTINUE);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.WARNING);
    });
    
    it('should handle TAXONOMY_LOOKUP_FAILED with fallback strategy', () => {
      const error = new Error('Taxonomy lookup failed') as ProcessingError;
      error.code = 'TAXONOMY_LOOKUP_FAILED';
      
      const action = errorHandler.handleProcessingError(error);
      
      expect(action).toBe(RecoveryAction.FALLBACK_TO_DEFAULT);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.WARNING);
    });
    
    it('should handle ASSIGNMENT_FAILED with fallback strategy', () => {
      const error = new Error('Cohort assignment failed') as ProcessingError;
      error.code = 'ASSIGNMENT_FAILED';
      
      const action = errorHandler.handleProcessingError(error);
      
      expect(action).toBe(RecoveryAction.FALLBACK_TO_DEFAULT);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.WARNING);
    });
  });
  
  describe('handleAPIError', () => {
    it('should handle AUTH_FAILED with 401 response', () => {
      const error = new Error('Authentication failed') as APIError;
      error.code = 'AUTH_FAILED';
      error.statusCode = 401;
      
      const response = errorHandler.handleAPIError(error);
      
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(401);
      expect(response.error).toContain('Authentication failed');
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.ERROR);
    });
    
    it('should handle RATE_LIMITED with 429 response', () => {
      const error = new Error('Rate limit exceeded') as APIError;
      error.code = 'RATE_LIMITED';
      error.statusCode = 429;
      
      const response = errorHandler.handleAPIError(error);
      
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(429);
      expect(response.error).toContain('Rate limit');
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.ERROR);
    });
    
    it('should handle INVALID_REQUEST with 400 response', () => {
      const error = new Error('Invalid request format') as APIError;
      error.code = 'INVALID_REQUEST';
      error.statusCode = 400;
      
      const response = errorHandler.handleAPIError(error);
      
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(400);
      expect(response.error).toContain('Invalid request');
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.ERROR);
    });
    
    it('should handle unknown API errors with 500 response', () => {
      const error = new Error('Unknown error') as APIError;
      error.code = 'UNKNOWN' as any;
      error.statusCode = 500;
      
      const response = errorHandler.handleAPIError(error);
      
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(500);
      expect(response.error).toContain('unexpected error');
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.ERROR);
    });
  });
  
  describe('handlePrivacyError', () => {
    it('should handle CONSENT_WITHDRAWN with immediate data deletion', () => {
      const error = new Error('User withdrew consent') as PrivacyError;
      error.code = 'CONSENT_WITHDRAWN';
      
      const action = errorHandler.handlePrivacyError(error);
      
      expect(action.action).toBe('DELETE_DATA');
      expect(action.immediate).toBe(true);
      expect(action.auditLog).toBe(true);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.CRITICAL);
      expect(notificationMock).toHaveBeenCalledWith(expect.stringContaining('data is being deleted'), 'info');
    });
    
    it('should handle SENSITIVE_CATEGORY with category exclusion', () => {
      const error = new Error('Sensitive category detected') as PrivacyError;
      error.code = 'SENSITIVE_CATEGORY';
      
      const action = errorHandler.handlePrivacyError(error);
      
      expect(action.action).toBe('EXCLUDE_CATEGORY');
      expect(action.immediate).toBe(true);
      expect(action.auditLog).toBe(true);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.CRITICAL);
    });
    
    it('should handle RETENTION_VIOLATION with data cleanup', () => {
      const error = new Error('Data retention period exceeded') as PrivacyError;
      error.code = 'RETENTION_VIOLATION';
      
      const action = errorHandler.handlePrivacyError(error);
      
      expect(action.action).toBe('CLEANUP_DATA');
      expect(action.immediate).toBe(true);
      expect(action.auditLog).toBe(true);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.CRITICAL);
    });
    
    it('should handle unknown privacy errors with data deletion', () => {
      const error = new Error('Unknown privacy issue') as PrivacyError;
      error.code = 'UNKNOWN' as any;
      
      const action = errorHandler.handlePrivacyError(error);
      
      expect(action.action).toBe('DELETE_DATA');
      expect(action.immediate).toBe(true);
      expect(action.auditLog).toBe(true);
      expect(logger.logError).toHaveBeenCalledWith(error, expect.any(Object), ErrorSeverity.CRITICAL);
      expect(notificationMock).toHaveBeenCalledWith(expect.stringContaining('privacy protection issue'), 'warning');
    });
  });
});