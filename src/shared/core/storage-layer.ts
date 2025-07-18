import { 
  DataStorageLayer, 
  StorageStats,
  CohortAssignment, 
  UserPreferences, 
  UserCohortProfile, 
  APIRequestLog,
  StorageError,
  RecoveryAction
} from '../interfaces';
import { getSecureStorageProvider } from './storage-factory';
import type { SecureStorageProvider } from '../interfaces/encryption';
import { ErrorFactory } from './error-factory';
import { SystemErrorHandler, PrivacySafeErrorLogger, ErrorSeverity } from './error-handler';

export class StorageLayer implements DataStorageLayer {
  private storageProvider: SecureStorageProvider | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly DATA_RETENTION_DAYS = 21; // 3 weeks
  private errorHandler: SystemErrorHandler;
  private errorLogger: PrivacySafeErrorLogger;

  constructor(errorHandler?: SystemErrorHandler) {
    this.errorLogger = new PrivacySafeErrorLogger();
    this.errorHandler = errorHandler || new SystemErrorHandler(this.errorLogger);
    this.initializeCleanupScheduler();
  }

  async initialize(): Promise<void> {
    if (!this.storageProvider) {
      this.storageProvider = await getSecureStorageProvider();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.storageProvider) {
      await this.initialize();
    }
  }

  // Cohort data operations
  async storeCohortData(cohorts: CohortAssignment[]): Promise<void> {
    await this.ensureInitialized();
    
    try {
      const profile = await this.getUserProfile() || this.createDefaultProfile();
      profile.activeCohorts = cohorts;
      profile.lastUpdated = new Date();
      
      await this.storageProvider!.storeEncrypted('user_profile', profile);
      await this.storageProvider!.storeEncrypted('cohort_data', {
        cohorts,
        timestamp: new Date(),
        version: '1.0'
      });
    } catch (error) {
      const storageError = this.createStorageError('ENCRYPTION_FAILED', 
        `Failed to store cohort data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      if (action === RecoveryAction.FALLBACK_TO_DEFAULT) {
        // Try to store unencrypted as a fallback (only non-sensitive data)
        try {
          await this.storageProvider!.store('cohort_data_fallback', {
            cohortCount: cohorts.length,
            timestamp: new Date(),
            version: '1.0'
          });
        } catch {
          // If fallback fails, rethrow the original error
          throw storageError;
        }
      } else if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        throw storageError;
      }
    }
  }

  async getCohortData(): Promise<CohortAssignment[]> {
    await this.ensureInitialized();
    
    try {
      const cohortData = await this.storageProvider!.retrieveEncrypted<{
        cohorts: CohortAssignment[];
        timestamp: Date;
        version: string;
      }>('cohort_data');
      
      if (!cohortData) {
        return [];
      }
      
      // Filter out expired cohorts
      const now = new Date();
      return cohortData.cohorts.filter(cohort => 
        new Date(cohort.expiryDate) > now
      );
    } catch (error) {
      const storageError = this.createStorageError('CORRUPTION_DETECTED', 
        `Failed to retrieve cohort data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      if (action === RecoveryAction.FALLBACK_TO_DEFAULT) {
        // Try to retrieve fallback data if available
        try {
          const fallbackData = await this.storageProvider!.retrieve('cohort_data_fallback');
          this.errorLogger.logError(
            new Error('Using fallback cohort data due to corruption'), 
            { originalError: error }, 
            ErrorSeverity.WARNING
          );
          return []; // Return empty array as fallback
        } catch {
          // If fallback retrieval fails, rethrow the original error
          throw storageError;
        }
      } else if (action === RecoveryAction.RESET_COMPONENT) {
        // Reset component by returning empty data
        this.errorLogger.logError(
          new Error('Resetting cohort data due to corruption'), 
          { originalError: error }, 
          ErrorSeverity.WARNING
        );
        return [];
      } else if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        throw storageError;
      }
      
      return []; // Default fallback
    }
  }

  // User preferences operations
  async storeUserPreferences(prefs: UserPreferences): Promise<void> {
    await this.ensureInitialized();
    
    try {
      await this.storageProvider!.storeEncrypted('user_preferences', {
        ...prefs,
        lastUpdated: new Date()
      });
    } catch (error) {
      const storageError = this.createStorageError('ENCRYPTION_FAILED', 
        `Failed to store user preferences: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      if (action === RecoveryAction.FALLBACK_TO_DEFAULT) {
        // Try to store unencrypted as a fallback (only non-sensitive data)
        try {
          await this.storageProvider!.store('user_preferences_fallback', {
            cohortsEnabled: prefs.cohortsEnabled,
            dataRetentionDays: prefs.dataRetentionDays,
            lastUpdated: new Date()
          });
        } catch {
          // If fallback fails, rethrow the original error
          throw storageError;
        }
      } else if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        throw storageError;
      }
    }
  }

  async getUserPreferences(): Promise<UserPreferences> {
    await this.ensureInitialized();
    
    try {
      const prefs = await this.storageProvider!.retrieveEncrypted<UserPreferences & { lastUpdated: Date }>('user_preferences');
      
      if (!prefs) {
        return this.createDefaultPreferences();
      }
      
      return {
        cohortsEnabled: prefs.cohortsEnabled,
        disabledTopics: prefs.disabledTopics,
        dataRetentionDays: prefs.dataRetentionDays,
        shareWithAdvertisers: prefs.shareWithAdvertisers
      };
    } catch (error) {
      const storageError = this.createStorageError('CORRUPTION_DETECTED', 
        `Failed to retrieve user preferences: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      if (action === RecoveryAction.FALLBACK_TO_DEFAULT) {
        // Try to retrieve fallback data if available
        try {
          const fallbackData = await this.storageProvider!.retrieve('user_preferences_fallback');
          this.errorLogger.logError(
            new Error('Using fallback user preferences due to corruption'), 
            { originalError: error }, 
            ErrorSeverity.WARNING
          );
          
          // Create default preferences but override with any available fallback data
          const defaultPrefs = this.createDefaultPreferences();
          if (fallbackData && typeof fallbackData === 'object') {
            return {
              ...defaultPrefs,
              cohortsEnabled: fallbackData.cohortsEnabled ?? defaultPrefs.cohortsEnabled,
              dataRetentionDays: fallbackData.dataRetentionDays ?? defaultPrefs.dataRetentionDays
            };
          }
          return defaultPrefs;
        } catch {
          // If fallback retrieval fails, return default preferences
          return this.createDefaultPreferences();
        }
      } else if (action === RecoveryAction.RESET_COMPONENT) {
        // Reset component by returning default preferences
        this.errorLogger.logError(
          new Error('Resetting user preferences due to corruption'), 
          { originalError: error }, 
          ErrorSeverity.WARNING
        );
        return this.createDefaultPreferences();
      } else if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        throw storageError;
      }
      
      return this.createDefaultPreferences(); // Default fallback
    }
  }

  // User profile operations
  async storeUserProfile(profile: UserCohortProfile): Promise<void> {
    await this.ensureInitialized();
    
    try {
      await this.storageProvider!.storeEncrypted('user_profile', profile);
    } catch (error) {
      const storageError = this.createStorageError('ENCRYPTION_FAILED', 
        `Failed to store user profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      if (action === RecoveryAction.FALLBACK_TO_DEFAULT) {
        // Try to store minimal profile data as a fallback (only non-sensitive data)
        try {
          await this.storageProvider!.store('user_profile_fallback', {
            lastUpdated: profile.lastUpdated,
            version: profile.version
          });
        } catch {
          // If fallback fails, rethrow the original error
          throw storageError;
        }
      } else if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        throw storageError;
      }
    }
  }

  async getUserProfile(): Promise<UserCohortProfile | null> {
    await this.ensureInitialized();
    
    try {
      return await this.storageProvider!.retrieveEncrypted<UserCohortProfile>('user_profile');
    } catch (error) {
      const storageError = this.createStorageError('CORRUPTION_DETECTED', 
        `Failed to retrieve user profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      if (action === RecoveryAction.FALLBACK_TO_DEFAULT) {
        // Try to retrieve fallback data if available
        try {
          const fallbackData = await this.storageProvider!.retrieve('user_profile_fallback');
          this.errorLogger.logError(
            new Error('Using fallback user profile due to corruption'), 
            { originalError: error }, 
            ErrorSeverity.WARNING
          );
          
          // If we have some fallback data, create a minimal profile
          if (fallbackData && typeof fallbackData === 'object') {
            return {
              userId: this.generateUserId(),
              activeCohorts: [],
              preferences: this.createDefaultPreferences(),
              lastUpdated: fallbackData.lastUpdated || new Date(),
              version: fallbackData.version || '1.0'
            };
          }
          return null;
        } catch {
          // If fallback retrieval fails, return null
          return null;
        }
      } else if (action === RecoveryAction.RESET_COMPONENT) {
        // Reset component by returning null
        this.errorLogger.logError(
          new Error('Resetting user profile due to corruption'), 
          { originalError: error }, 
          ErrorSeverity.WARNING
        );
        return null;
      } else if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        throw storageError;
      }
      
      return null; // Default fallback
    }
  }

  // API request logging
  async logAPIRequest(log: APIRequestLog): Promise<void> {
    await this.ensureInitialized();
    
    try {
      const logKey = `api_log_${log.timestamp.getFullYear()}_${log.timestamp.getMonth() + 1}`;
      const existingLogs = await this.storageProvider!.retrieveEncrypted<APIRequestLog[]>(logKey) || [];
      
      existingLogs.push(log);
      
      // Keep only last 1000 logs per month to prevent storage bloat
      if (existingLogs.length > 1000) {
        existingLogs.splice(0, existingLogs.length - 1000);
      }
      
      await this.storageProvider!.storeEncrypted(logKey, existingLogs);
    } catch (error) {
      // Log errors shouldn't break the main functionality
      console.warn('Failed to log API request:', error);
    }
  }

  async getAPIRequestLogs(timeRange?: { startDate: Date; endDate: Date }): Promise<APIRequestLog[]> {
    await this.ensureInitialized();
    
    try {
      const logs: APIRequestLog[] = [];
      const now = new Date();
      const startDate = timeRange?.startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const endDate = timeRange?.endDate || now;
      
      // Generate keys for the time range
      const keys = this.generateLogKeysForRange(startDate, endDate);
      
      for (const key of keys) {
        const monthLogs = await this.storageProvider!.retrieveEncrypted<APIRequestLog[]>(key);
        if (monthLogs) {
          logs.push(...monthLogs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= startDate && logDate <= endDate;
          }));
        }
      }
      
      return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      const storageError = this.createStorageError('CORRUPTION_DETECTED', 
        `Failed to retrieve API request logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      if (action === RecoveryAction.FALLBACK_TO_DEFAULT || action === RecoveryAction.RESET_COMPONENT) {
        // For logs, we can safely return an empty array as fallback
        this.errorLogger.logError(
          new Error('Returning empty API logs due to data corruption'), 
          { originalError: error }, 
          ErrorSeverity.WARNING
        );
        return [];
      } else if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        throw storageError;
      }
      
      return []; // Default fallback
    }
  }

  // Data management
  async clearExpiredData(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - this.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      
      // Clear expired cohorts
      const cohorts = await this.getCohortData();
      const validCohorts = cohorts.filter(cohort => new Date(cohort.expiryDate) > now);
      
      if (validCohorts.length !== cohorts.length) {
        await this.storeCohortData(validCohorts);
      }
      
      // Clear old API logs
      await this.clearOldAPILogs(cutoffDate);
      
      // Update cleanup timestamp
      await this.storageProvider!.storeEncrypted('last_cleanup', { timestamp: now });
      
    } catch (error) {
      const storageError = this.createStorageError('CORRUPTION_DETECTED', 
        `Failed to clear expired data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      // For data cleanup, we can log and continue in most cases
      if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        this.errorLogger.logError(
          new Error('Error during expired data cleanup'), 
          { originalError: error }, 
          ErrorSeverity.WARNING
        );
      }
    }
  }

  async clearAllData(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      // Perform cryptographic erasure by clearing all encrypted data
      await this.storageProvider!.clearAllEncrypted();
      
      // Re-initialize with default data
      await this.storeUserPreferences(this.createDefaultPreferences());
      
    } catch (error) {
      const storageError = this.createStorageError('ENCRYPTION_FAILED', 
        `Failed to clear all data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      // For data deletion, we need to ensure it completes or notify the user
      if (action === RecoveryAction.FALLBACK_TO_DEFAULT) {
        // Try to clear unencrypted data as fallback
        try {
          // Clear any fallback data we might have stored
          await this.storageProvider!.remove('cohort_data_fallback');
          await this.storageProvider!.remove('user_preferences_fallback');
          await this.storageProvider!.remove('user_profile_fallback');
          
          // Re-initialize with default preferences
          await this.storageProvider!.store('user_preferences_fallback', {
            cohortsEnabled: true,
            dataRetentionDays: this.DATA_RETENTION_DAYS,
            lastUpdated: new Date()
          });
        } catch {
          // If fallback fails, rethrow the original error
          throw storageError;
        }
      } else if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        throw storageError;
      }
    }
  }

  async getStorageStats(): Promise<StorageStats> {
    await this.ensureInitialized();
    
    try {
      const cohortData = await this.storageProvider!.retrieveEncrypted('cohort_data');
      const preferences = await this.storageProvider!.retrieveEncrypted('user_preferences');
      const profile = await this.storageProvider!.retrieveEncrypted('user_profile');
      const lastCleanup = await this.storageProvider!.retrieveEncrypted<{ timestamp: Date }>('last_cleanup');
      
      // Estimate sizes (rough calculation)
      const cohortDataSize = cohortData ? JSON.stringify(cohortData).length : 0;
      const preferencesSize = preferences ? JSON.stringify(preferences).length : 0;
      const profileSize = profile ? JSON.stringify(profile).length : 0;
      
      // Get API logs size
      const logs = await this.getAPIRequestLogs();
      const logsSize = JSON.stringify(logs).length;
      
      return {
        totalSize: cohortDataSize + preferencesSize + profileSize + logsSize,
        cohortDataSize,
        preferencesSize: preferencesSize + profileSize,
        logsSize,
        lastCleanup: lastCleanup?.timestamp || new Date(0),
        itemCount: (cohortData?.cohorts?.length || 0) + logs.length + 2 // +2 for preferences and profile
      };
    } catch (error) {
      const storageError = this.createStorageError('CORRUPTION_DETECTED', 
        `Failed to get storage stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      const action = this.errorHandler.handleStorageError(storageError);
      
      if (action === RecoveryAction.FALLBACK_TO_DEFAULT || action === RecoveryAction.RESET_COMPONENT) {
        // Return default stats as fallback
        this.errorLogger.logError(
          new Error('Returning default storage stats due to data corruption'), 
          { originalError: error }, 
          ErrorSeverity.WARNING
        );
        return {
          totalSize: 0,
          cohortDataSize: 0,
          preferencesSize: 0,
          logsSize: 0,
          lastCleanup: new Date(0),
          itemCount: 0
        };
      } else if (action !== RecoveryAction.LOG_AND_CONTINUE) {
        throw storageError;
      }
      
      // Default fallback
      return {
        totalSize: 0,
        cohortDataSize: 0,
        preferencesSize: 0,
        logsSize: 0,
        lastCleanup: new Date(0),
        itemCount: 0
      };
    }
  }

  // Legacy encryption methods (deprecated)
  encryptData(data: any): string {
    console.warn('encryptData is deprecated. Use SecureStorageProvider instead.');
    return JSON.stringify(data); // Fallback implementation
  }

  decryptData(encryptedData: string): any {
    console.warn('decryptData is deprecated. Use SecureStorageProvider instead.');
    return JSON.parse(encryptedData); // Fallback implementation
  }

  // Private helper methods
  private createDefaultPreferences(): UserPreferences {
    return {
      cohortsEnabled: true,
      disabledTopics: [],
      dataRetentionDays: this.DATA_RETENTION_DAYS,
      shareWithAdvertisers: true
    };
  }

  private createDefaultProfile(): UserCohortProfile {
    return {
      userId: this.generateUserId(),
      activeCohorts: [],
      preferences: this.createDefaultPreferences(),
      lastUpdated: new Date(),
      version: '1.0'
    };
  }

  private generateUserId(): string {
    // Generate a random local device identifier
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private generateLogKeysForRange(startDate: Date, endDate: Date): string[] {
    const keys: string[] = [];
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    
    while (current <= end) {
      keys.push(`api_log_${current.getFullYear()}_${current.getMonth() + 1}`);
      current.setMonth(current.getMonth() + 1);
    }
    
    return keys;
  }

  private async clearOldAPILogs(cutoffDate: Date): Promise<void> {
    const now = new Date();
    const startDate = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const keys = this.generateLogKeysForRange(startDate, endDate);
    
    for (const key of keys) {
      const logs = await this.storageProvider!.retrieveEncrypted<APIRequestLog[]>(key);
      if (logs) {
        const validLogs = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
        
        if (validLogs.length === 0) {
          await this.storageProvider!.removeEncrypted(key);
        } else if (validLogs.length !== logs.length) {
          await this.storageProvider!.storeEncrypted(key, validLogs);
        }
      }
    }
  }

  private initializeCleanupScheduler(): void {
    // Schedule automatic cleanup every 24 hours
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.clearExpiredData();
      } catch (error) {
        console.warn('Automatic cleanup failed:', error);
      }
    }, this.CLEANUP_INTERVAL_MS);
  }

  private createStorageError(code: StorageError['code'], message: string): StorageError {
    return ErrorFactory.createStorageError(code, message);
  }

  // Cleanup method for proper disposal
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}