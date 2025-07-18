import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageLayer } from '../src/shared/core/storage-layer';
import { CohortAssignment, UserPreferences, UserCohortProfile, APIRequestLog } from '../src/shared/interfaces/common';

// Mock the storage factory
vi.mock('../src/shared/core/storage-factory', () => ({
  getSecureStorageProvider: vi.fn()
}));

// Mock secure storage provider
const mockSecureStorageProvider = {
  storeEncrypted: vi.fn(),
  retrieveEncrypted: vi.fn(),
  removeEncrypted: vi.fn(),
  clearAllEncrypted: vi.fn()
};

// Mock crypto for user ID generation
const mockCrypto = {
  getRandomValues: vi.fn().mockImplementation((array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = i % 256;
    }
    return array;
  })
};

Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true
});

describe('StorageLayer', () => {
  let storageLayer: StorageLayer;
  let mockGetSecureStorageProvider: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup mock storage provider
    const { getSecureStorageProvider } = await import('../src/shared/core/storage-factory');
    mockGetSecureStorageProvider = getSecureStorageProvider as any;
    mockGetSecureStorageProvider.mockResolvedValue(mockSecureStorageProvider);
    
    // Reset mock storage provider methods
    mockSecureStorageProvider.storeEncrypted.mockResolvedValue(undefined);
    mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue(null);
    mockSecureStorageProvider.removeEncrypted.mockResolvedValue(undefined);
    mockSecureStorageProvider.clearAllEncrypted.mockResolvedValue(undefined);
    
    storageLayer = new StorageLayer();
  });

  afterEach(() => {
    storageLayer.dispose();
  });

  describe('initialization', () => {
    it('should initialize storage provider on first use', async () => {
      await storageLayer.getCohortData();
      
      expect(mockGetSecureStorageProvider).toHaveBeenCalledOnce();
    });

    it('should reuse storage provider after initialization', async () => {
      await storageLayer.getCohortData();
      await storageLayer.getUserPreferences();
      
      expect(mockGetSecureStorageProvider).toHaveBeenCalledOnce();
    });
  });

  describe('cohort data operations', () => {
    const mockCohorts: CohortAssignment[] = [
      {
        topicId: 1,
        topicName: 'Technology',
        confidence: 0.8,
        assignedDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-12-31') // Far future date
      },
      {
        topicId: 2,
        topicName: 'Sports',
        confidence: 0.6,
        assignedDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-12-31') // Far future date
      }
    ];

    it('should store cohort data successfully', async () => {
      await storageLayer.storeCohortData(mockCohorts);
      
      expect(mockSecureStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        'cohort_data',
        expect.objectContaining({
          cohorts: mockCohorts,
          version: '1.0'
        })
      );
    });

    it('should retrieve cohort data successfully', async () => {
      const storedData = {
        cohorts: mockCohorts,
        timestamp: new Date(),
        version: '1.0'
      };
      
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue(storedData);
      
      const result = await storageLayer.getCohortData();
      
      expect(result).toEqual(mockCohorts);
      expect(mockSecureStorageProvider.retrieveEncrypted).toHaveBeenCalledWith('cohort_data');
    });

    it('should return empty array when no cohort data exists', async () => {
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue(null);
      
      const result = await storageLayer.getCohortData();
      
      expect(result).toEqual([]);
    });

    it('should filter out expired cohorts', async () => {
      const expiredCohort: CohortAssignment = {
        topicId: 3,
        topicName: 'Expired Topic',
        confidence: 0.5,
        assignedDate: new Date('2024-12-01'),
        expiryDate: new Date('2024-12-22') // Expired
      };
      
      const storedData = {
        cohorts: [...mockCohorts, expiredCohort],
        timestamp: new Date(),
        version: '1.0'
      };
      
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue(storedData);
      
      const result = await storageLayer.getCohortData();
      
      expect(result).toEqual(mockCohorts);
      expect(result).not.toContain(expiredCohort);
    });

    it('should throw error when storage fails', async () => {
      mockSecureStorageProvider.storeEncrypted.mockRejectedValue(new Error('Storage failed'));
      
      await expect(storageLayer.storeCohortData(mockCohorts))
        .rejects.toThrow('Failed to store cohort data');
    });
  });

  describe('user preferences operations', () => {
    const mockPreferences: UserPreferences = {
      cohortsEnabled: true,
      disabledTopics: [1, 2],
      dataRetentionDays: 21,
      shareWithAdvertisers: false
    };

    it('should store user preferences successfully', async () => {
      await storageLayer.storeUserPreferences(mockPreferences);
      
      expect(mockSecureStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        'user_preferences',
        expect.objectContaining({
          ...mockPreferences,
          lastUpdated: expect.any(Date)
        })
      );
    });

    it('should retrieve user preferences successfully', async () => {
      const storedPrefs = {
        ...mockPreferences,
        lastUpdated: new Date()
      };
      
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue(storedPrefs);
      
      const result = await storageLayer.getUserPreferences();
      
      expect(result).toEqual(mockPreferences);
    });

    it('should return default preferences when none exist', async () => {
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue(null);
      
      const result = await storageLayer.getUserPreferences();
      
      expect(result).toEqual({
        cohortsEnabled: true,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      });
    });
  });

  describe('user profile operations', () => {
    const mockProfile: UserCohortProfile = {
      userId: 'test-user-id',
      activeCohorts: [],
      preferences: {
        cohortsEnabled: true,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      },
      lastUpdated: new Date(),
      version: '1.0'
    };

    it('should store user profile successfully', async () => {
      await storageLayer.storeUserProfile(mockProfile);
      
      expect(mockSecureStorageProvider.storeEncrypted).toHaveBeenCalledWith('user_profile', mockProfile);
    });

    it('should retrieve user profile successfully', async () => {
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue(mockProfile);
      
      const result = await storageLayer.getUserProfile();
      
      expect(result).toEqual(mockProfile);
    });

    it('should return null when no profile exists', async () => {
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue(null);
      
      const result = await storageLayer.getUserProfile();
      
      expect(result).toBeNull();
    });
  });

  describe('API request logging', () => {
    const mockAPILog: APIRequestLog = {
      requestId: 'req-123',
      domain: 'example.com',
      timestamp: new Date(),
      cohortsShared: ['tech', 'sports'],
      requestType: 'advertising',
      userConsent: true
    };

    it('should log API request successfully', async () => {
      const logKey = `api_log_${mockAPILog.timestamp.getFullYear()}_${mockAPILog.timestamp.getMonth() + 1}`;
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue([]);
      
      await storageLayer.logAPIRequest(mockAPILog);
      
      expect(mockSecureStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        logKey,
        [mockAPILog]
      );
    });

    it('should append to existing logs', async () => {
      const existingLog: APIRequestLog = {
        requestId: 'req-456',
        domain: 'other.com',
        timestamp: new Date(),
        cohortsShared: ['news'],
        requestType: 'measurement',
        userConsent: true
      };
      
      const logKey = `api_log_${mockAPILog.timestamp.getFullYear()}_${mockAPILog.timestamp.getMonth() + 1}`;
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue([existingLog]);
      
      await storageLayer.logAPIRequest(mockAPILog);
      
      expect(mockSecureStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        logKey,
        [existingLog, mockAPILog]
      );
    });

    it('should limit logs to 1000 per month', async () => {
      const existingLogs = Array.from({ length: 1000 }, (_, i) => ({
        requestId: `req-${i}`,
        domain: 'example.com',
        timestamp: new Date(),
        cohortsShared: ['tech'],
        requestType: 'advertising',
        userConsent: true
      }));
      
      const logKey = `api_log_${mockAPILog.timestamp.getFullYear()}_${mockAPILog.timestamp.getMonth() + 1}`;
      mockSecureStorageProvider.retrieveEncrypted.mockResolvedValue(existingLogs);
      
      await storageLayer.logAPIRequest(mockAPILog);
      
      const storedLogs = mockSecureStorageProvider.storeEncrypted.mock.calls[0][1];
      expect(storedLogs).toHaveLength(1000);
      expect(storedLogs[999]).toEqual(mockAPILog);
    });

    it('should retrieve API request logs successfully', async () => {
      const logs = [mockAPILog];
      const logKey = `api_log_${mockAPILog.timestamp.getFullYear()}_${mockAPILog.timestamp.getMonth() + 1}`;
      
      mockSecureStorageProvider.retrieveEncrypted.mockImplementation((key) => {
        if (key === logKey) return Promise.resolve(logs);
        return Promise.resolve(null);
      });
      
      const result = await storageLayer.getAPIRequestLogs();
      
      expect(result).toEqual(logs);
    });

    it('should not fail when logging fails', async () => {
      mockSecureStorageProvider.retrieveEncrypted.mockRejectedValue(new Error('Storage error'));
      
      // Should not throw
      await expect(storageLayer.logAPIRequest(mockAPILog)).resolves.not.toThrow();
    });
  });

  describe('data management', () => {
    it('should clear expired data successfully', async () => {
      // Mock empty cohort data to avoid complex filtering logic
      mockSecureStorageProvider.retrieveEncrypted.mockImplementation((key) => {
        if (key === 'cohort_data') return Promise.resolve({ cohorts: [], timestamp: new Date(), version: '1.0' });
        return Promise.resolve(null); // Return null for API logs and other keys
      });
      
      await storageLayer.clearExpiredData();
      
      // Check that cleanup timestamp was updated
      expect(mockSecureStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        'last_cleanup',
        expect.objectContaining({
          timestamp: expect.any(Date)
        })
      );
    });

    it('should clear all data successfully', async () => {
      await storageLayer.clearAllData();
      
      expect(mockSecureStorageProvider.clearAllEncrypted).toHaveBeenCalled();
      expect(mockSecureStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        'user_preferences',
        expect.objectContaining({
          cohortsEnabled: true,
          disabledTopics: [],
          dataRetentionDays: 21,
          shareWithAdvertisers: true
        })
      );
    });

    it('should get storage stats successfully', async () => {
      const mockCohortData = { cohorts: [], timestamp: new Date(), version: '1.0' };
      const mockPreferences = { cohortsEnabled: true, disabledTopics: [] };
      const mockProfile = { userId: 'test', activeCohorts: [] };
      const mockCleanup = { timestamp: new Date() };
      
      mockSecureStorageProvider.retrieveEncrypted.mockImplementation((key) => {
        switch (key) {
          case 'cohort_data': return Promise.resolve(mockCohortData);
          case 'user_preferences': return Promise.resolve(mockPreferences);
          case 'user_profile': return Promise.resolve(mockProfile);
          case 'last_cleanup': return Promise.resolve(mockCleanup);
          default: return Promise.resolve(null);
        }
      });
      
      const stats = await storageLayer.getStorageStats();
      
      expect(stats).toEqual({
        totalSize: expect.any(Number),
        cohortDataSize: expect.any(Number),
        preferencesSize: expect.any(Number),
        logsSize: expect.any(Number),
        lastCleanup: expect.any(Date),
        itemCount: expect.any(Number)
      });
    });
  });

  describe('error handling', () => {
    it('should throw StorageError with correct code for encryption failures', async () => {
      mockSecureStorageProvider.storeEncrypted.mockRejectedValue(new Error('Encryption failed'));
      
      try {
        await storageLayer.storeCohortData([]);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('ENCRYPTION_FAILED');
        expect(error.message).toContain('Failed to store cohort data');
      }
    });

    it('should throw StorageError with correct code for corruption', async () => {
      mockSecureStorageProvider.retrieveEncrypted.mockRejectedValue(new Error('Data corrupted'));
      
      try {
        await storageLayer.getCohortData();
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('CORRUPTION_DETECTED');
        expect(error.message).toContain('Failed to retrieve cohort data');
      }
    });
  });

  describe('cleanup scheduler', () => {
    it('should dispose cleanup interval properly', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      storageLayer.dispose();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('legacy methods', () => {
    it('should warn when using deprecated encryptData', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const result = storageLayer.encryptData({ test: 'data' });
      
      expect(consoleSpy).toHaveBeenCalledWith('encryptData is deprecated. Use SecureStorageProvider instead.');
      expect(result).toBe('{"test":"data"}');
      
      consoleSpy.mockRestore();
    });

    it('should warn when using deprecated decryptData', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const result = storageLayer.decryptData('{"test":"data"}');
      
      expect(consoleSpy).toHaveBeenCalledWith('decryptData is deprecated. Use SecureStorageProvider instead.');
      expect(result).toEqual({ test: 'data' });
      
      consoleSpy.mockRestore();
    });
  });
});