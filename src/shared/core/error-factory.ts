import { 
  StorageError, 
  ProcessingError, 
  APIError, 
  PrivacyError 
} from '../interfaces/common';

/**
 * Factory class for creating typed error objects
 */
export class ErrorFactory {
  /**
   * Create a StorageError with the specified code and message
   */
  public static createStorageError(
    code: 'ENCRYPTION_FAILED' | 'QUOTA_EXCEEDED' | 'CORRUPTION_DETECTED',
    message: string
  ): StorageError {
    const error = new Error(message) as StorageError;
    error.code = code;
    return error;
  }
  
  /**
   * Create a ProcessingError with the specified code and message
   */
  public static createProcessingError(
    code: 'INVALID_DOMAIN' | 'TAXONOMY_LOOKUP_FAILED' | 'ASSIGNMENT_FAILED',
    message: string
  ): ProcessingError {
    const error = new Error(message) as ProcessingError;
    error.code = code;
    return error;
  }
  
  /**
   * Create an APIError with the specified code, message, and status code
   */
  public static createAPIError(
    code: 'AUTH_FAILED' | 'RATE_LIMITED' | 'INVALID_REQUEST',
    message: string,
    statusCode: number
  ): APIError {
    const error = new Error(message) as APIError;
    error.code = code;
    error.statusCode = statusCode;
    return error;
  }
  
  /**
   * Create a PrivacyError with the specified code and message
   */
  public static createPrivacyError(
    code: 'CONSENT_WITHDRAWN' | 'SENSITIVE_CATEGORY' | 'RETENTION_VIOLATION',
    message: string
  ): PrivacyError {
    const error = new Error(message) as PrivacyError;
    error.code = code;
    return error;
  }
}