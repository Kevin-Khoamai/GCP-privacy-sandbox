import { StorageError, ProcessingError, APIError, PrivacyError, RecoveryAction } from './common';

export interface ErrorHandler {
  handleStorageError(error: StorageError): RecoveryAction;
  handleProcessingError(error: ProcessingError): RecoveryAction;
  handleAPIError(error: APIError): APIResponse;
  handlePrivacyError(error: PrivacyError): PrivacyAction;
}

export interface APIResponse {
  success: boolean;
  data?: any;
  error?: string;
  statusCode: number;
}

export interface PrivacyAction {
  action: 'DELETE_DATA' | 'BLOCK_API' | 'EXCLUDE_CATEGORY' | 'CLEANUP_DATA';
  immediate: boolean;
  auditLog: boolean;
}