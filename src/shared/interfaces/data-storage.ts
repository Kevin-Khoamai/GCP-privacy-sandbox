import { CohortAssignment, UserPreferences, UserCohortProfile, APIRequestLog } from './common';

export interface DataStorageLayer {
  // Cohort data operations
  storeCohortData(cohorts: CohortAssignment[]): Promise<void>;
  getCohortData(): Promise<CohortAssignment[]>;
  
  // User preferences operations
  storeUserPreferences(prefs: UserPreferences): Promise<void>;
  getUserPreferences(): Promise<UserPreferences>;
  
  // User profile operations
  storeUserProfile(profile: UserCohortProfile): Promise<void>;
  getUserProfile(): Promise<UserCohortProfile | null>;
  
  // API request logging
  logAPIRequest(log: APIRequestLog): Promise<void>;
  getAPIRequestLogs(timeRange?: { startDate: Date; endDate: Date }): Promise<APIRequestLog[]>;
  
  // Data management
  clearExpiredData(): Promise<void>;
  clearAllData(): Promise<void>;
  getStorageStats(): Promise<StorageStats>;
  
  // Legacy encryption methods (deprecated - use SecureStorageProvider instead)
  encryptData(data: any): string;
  decryptData(encryptedData: string): any;
}

export interface StorageStats {
  totalSize: number;
  cohortDataSize: number;
  preferencesSize: number;
  logsSize: number;
  lastCleanup: Date;
  itemCount: number;
}