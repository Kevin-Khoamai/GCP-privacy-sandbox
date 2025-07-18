// Common types and interfaces used across the system

export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

export interface Topic {
  id: number;
  name: string;
  parentId?: number;
  level: number;
  isSensitive: boolean;
  description: string;
}

export interface DomainMapping {
  domain: string;
  topicIds: number[];
  confidence: number;
  lastUpdated: Date;
  source: 'manual' | 'ml' | 'keyword';
}

export interface TopicTaxonomy {
  topics: Topic[];
  domainMappings: Map<string, number[]>;
}

export interface UserPreferences {
  cohortsEnabled: boolean;
  disabledTopics: number[];
  dataRetentionDays: number;
  shareWithAdvertisers: boolean;
}

export interface UserDataExport {
  cohorts: CohortAssignment[];
  preferences: UserPreferences;
  exportDate: Date;
  version: string;
}

export interface CohortAssignment {
  topicId: number;
  topicName: string;
  confidence: number;
  assignedDate: Date;
  expiryDate: Date;
}

export interface UserCohortProfile {
  userId: string; // Local device identifier
  activeCohorts: CohortAssignment[];
  preferences: UserPreferences;
  lastUpdated: Date;
  version: string;
  metadata?: Record<string, any>; // For storing additional data like metrics events
}

export interface APIRequestLog {
  requestId: string;
  domain: string;
  timestamp: Date;
  cohortsShared: string[];
  requestType: string;
  userConsent: boolean;
}

export enum RecoveryAction {
  RETRY_WITH_BACKOFF = 'retry_with_backoff',
  FALLBACK_TO_DEFAULT = 'fallback_to_default',
  RESET_COMPONENT = 'reset_component',
  NOTIFY_USER = 'notify_user',
  LOG_AND_CONTINUE = 'log_and_continue'
}

export interface StorageError extends Error {
  code: 'ENCRYPTION_FAILED' | 'QUOTA_EXCEEDED' | 'CORRUPTION_DETECTED';
}

export interface ProcessingError extends Error {
  code: 'INVALID_DOMAIN' | 'TAXONOMY_LOOKUP_FAILED' | 'ASSIGNMENT_FAILED';
}

export interface APIError extends Error {
  code: 'AUTH_FAILED' | 'RATE_LIMITED' | 'INVALID_REQUEST';
  statusCode: number;
}

export interface PrivacyError extends Error {
  code: 'CONSENT_WITHDRAWN' | 'SENSITIVE_CATEGORY' | 'RETENTION_VIOLATION';
}