import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PrivacyControls } from '../src/shared/core/privacy-controls';
import { StorageLayer } from '../src/shared/core/storage-layer';
import { TaxonomyLoader } from '../src/shared/core/taxonomy-loader';
import { CohortAssignment, UserPreferences, Topic } from '../src/shared/interfaces/common';

// Mock dependencies
vi.mock('../src/shared/core/storage-layer');
vi.mock('../src/shared/core/taxonomy-loader');

describe('PrivacyControls', () => {
  let privacyControls: PrivacyControls;
  let mockStorageLayer: vi.Mocked<StorageLayer>;
  let mockTaxonomyLoader: vi.Mocked<TaxonomyLoader>;

  const mockCohorts: CohortAssignment[] = [
    {
      topicId: 1,
      topicName: 'Technology',
      confidence: 0.8,
      assignedDate: new Date('2025-01-01'),
      expiryDate: new Date('2025-02-01') // Future date
    },
    {
      topicId: 2,
      topicName: 'Sports',
      confidence: 0.7,
      assignedDate: new Date('2025-01-02'),
      expiryDate: new Date('2025-02-02') // Future date
    }
  ];

  const mockPreferences: UserPreferences = {
    cohortsEnabled: true,
    disabledTopics: [2], // Sports is disabled
    dataRetentionDays: 21,
    shareWithAdvertisers: true
  };

  const mockTopics: Topic[] = [
    {
      id: 1,
      name: 'Technology',
      level: 1,
      isSensitive: false,
      description: 'Technology and computing topics'
    },
    {
      id: 2,
      name: 'Sports',
      level: 1,
      isSensitive: false,
      description: 'Sports and athletics topics'
    }
  ];

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock instances
    mockStorageLayer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getCohortData: vi.fn().mockResolvedValue(mockCohorts),
      getUserPreferences: vi.fn().mockResolvedValue(mockPreferences),
      storeUserPreferences: vi.fn().mockResolvedValue(undefined),
      clearAllData: vi.fn().mockResolvedValue(undefined)
    } as any;

    mockTaxonomyLoader = {
      loadTaxonomy: vi.fn().mockResolvedValue(undefined),
      getTopicById: vi.fn().mockImplementation((id: number) => 
        mockTopics.find(topic => topic.id === id) || null
      )
    } as any;

    // Mock static getInstance methods
    vi.mocked(StorageLayer).mockImplementation(() => mockStorageLayer);
    vi.mocked(TaxonomyLoader.getInstance).mockReturnValue(mockTaxonomyLoader);

    // Create new instance for each test
    privacyControls = new (PrivacyControls as any)();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('displayCurrentCohorts', () => {
    it('should return cohort display data with correct status', async () => {
      const result = await privacyControls.displayCurrentCohorts();

      expect(result).toHaveLength(2);
      
      // Technology cohort should be active (not in disabled list)
      const techCohort = result.find(c => c.topicName === 'Technology');
      expect(techCohort).toBeDefined();
      expect(techCohort?.isActive).toBe(true);
      expect(techCohort?.topicId).toBe(1);
      expect(techCohort?.canDisable).toBe(true);
      expect(techCohort?.description).toBe('Technology and computing topics');

      // Sports cohort should be inactive (in disabled list)
      const sportsCohort = result.find(c => c.topicName === 'Sports');
      expect(sportsCohort).toBeDefined();
      expect(sportsCohort?.isActive).toBe(false);
      expect(sportsCohort?.topicId).toBe(2);
    });

    it('should sort cohorts by assignment date (most recent first)', async () => {
      const result = await privacyControls.displayCurrentCohorts();

      expect(result[0].topicName).toBe('Sports'); // Assigned on 2025-01-02
      expect(result[1].topicName).toBe('Technology'); // Assigned on 2025-01-01
    });

    it('should handle empty cohorts list', async () => {
      mockStorageLayer.getCohortData.mockResolvedValue([]);

      const result = await privacyControls.displayCurrentCohorts();

      expect(result).toHaveLength(0);
    });

    it('should handle cohorts disabled globally', async () => {
      mockStorageLayer.getUserPreferences.mockResolvedValue({
        ...mockPreferences,
        cohortsEnabled: false
      });

      const result = await privacyControls.displayCurrentCohorts();

      // All cohorts should be inactive when globally disabled
      result.forEach(cohort => {
        expect(cohort.isActive).toBe(false);
      });
    });

    it('should handle storage errors gracefully', async () => {
      mockStorageLayer.getCohortData.mockRejectedValue(new Error('Storage error'));

      const result = await privacyControls.displayCurrentCohorts();

      expect(result).toHaveLength(0);
    });
  });

  describe('toggleCohortStatus', () => {
    it('should enable a disabled cohort', async () => {
      await privacyControls.toggleCohortStatus(2, true); // Enable Sports

      expect(mockStorageLayer.storeUserPreferences).toHaveBeenCalledWith({
        ...mockPreferences,
        disabledTopics: [] // Sports (ID 2) should be removed from disabled list
      });
    });

    it('should disable an enabled cohort', async () => {
      // Reset mock to return fresh preferences for each call
      mockStorageLayer.getUserPreferences.mockResolvedValue({ ...mockPreferences });
      
      await privacyControls.toggleCohortStatus(1, false); // Disable Technology

      const call = mockStorageLayer.storeUserPreferences.mock.calls[0][0];
      expect(call.disabledTopics).toContain(1); // Technology should be in disabled list
      expect(call.disabledTopics).toContain(2); // Sports should still be in disabled list
      expect(call.disabledTopics).toHaveLength(2);
    });

    it('should not add duplicate entries to disabled list', async () => {
      // Reset mock to return fresh preferences for each call
      mockStorageLayer.getUserPreferences.mockResolvedValue({ ...mockPreferences });
      
      await privacyControls.toggleCohortStatus(2, false); // Disable already disabled Sports

      const call = mockStorageLayer.storeUserPreferences.mock.calls[0][0];
      expect(call.disabledTopics).toEqual([2]); // Should remain the same
    });

    it('should handle storage errors', async () => {
      mockStorageLayer.storeUserPreferences.mockRejectedValue(new Error('Storage error'));

      await expect(privacyControls.toggleCohortStatus(1, false))
        .rejects.toThrow('Failed to update cohort preferences');
    });
  });

  describe('exportUserData', () => {
    it('should export complete user data', async () => {
      const result = await privacyControls.exportUserData();

      expect(result).toEqual({
        cohorts: mockCohorts,
        preferences: mockPreferences,
        exportDate: expect.any(Date),
        version: '1.0'
      });
    });

    it('should handle export errors', async () => {
      mockStorageLayer.getCohortData.mockRejectedValue(new Error('Storage error'));

      await expect(privacyControls.exportUserData())
        .rejects.toThrow('Failed to export user data');
    });
  });

  describe('deleteAllData', () => {
    it('should clear all user data', async () => {
      await privacyControls.deleteAllData();

      expect(mockStorageLayer.clearAllData).toHaveBeenCalled();
    });

    it('should handle deletion errors', async () => {
      mockStorageLayer.clearAllData.mockRejectedValue(new Error('Storage error'));

      await expect(privacyControls.deleteAllData())
        .rejects.toThrow('Failed to delete user data');
    });
  });

  describe('showDataUsageExplanation', () => {
    it('should return explanation text', () => {
      const explanation = privacyControls.showDataUsageExplanation();

      expect(explanation).toContain('Privacy Cohort Tracker');
      expect(explanation).toContain('local device');
      expect(explanation).toContain('cohort IDs');
      expect(explanation).toContain('3 weeks');
    });
  });

  describe('getPrivacySettings', () => {
    it('should return current privacy settings', async () => {
      const result = await privacyControls.getPrivacySettings();

      expect(result).toEqual(mockPreferences);
      expect(mockStorageLayer.getUserPreferences).toHaveBeenCalled();
    });
  });

  describe('updatePrivacySettings', () => {
    it('should update privacy settings', async () => {
      const newPreferences: UserPreferences = {
        ...mockPreferences,
        shareWithAdvertisers: false
      };

      await privacyControls.updatePrivacySettings(newPreferences);

      expect(mockStorageLayer.storeUserPreferences).toHaveBeenCalledWith(newPreferences);
    });
  });

  describe('getCohortStatistics', () => {
    it('should return correct statistics', async () => {
      const result = await privacyControls.getCohortStatistics();

      expect(result.totalCohorts).toBe(2);
      expect(result.activeCohorts).toBe(1); // Only Technology is active (Sports is disabled)
      expect(result.disabledCohorts).toBe(1); // Sports is disabled
      expect(result.expiringCohorts).toBe(0); // None expiring within a week (future dates)
    });

    it('should handle cohorts disabled globally', async () => {
      mockStorageLayer.getUserPreferences.mockResolvedValue({
        ...mockPreferences,
        cohortsEnabled: false
      });

      const result = await privacyControls.getCohortStatistics();

      expect(result.activeCohorts).toBe(0); // All should be inactive when globally disabled
    });

    it('should identify expiring cohorts', async () => {
      const now = new Date();
      const soonToExpire = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

      mockStorageLayer.getCohortData.mockResolvedValue([
        {
          ...mockCohorts[0],
          expiryDate: soonToExpire
        }
      ]);

      const result = await privacyControls.getCohortStatistics();

      expect(result.expiringCohorts).toBe(1);
    });

    it('should handle statistics errors gracefully', async () => {
      mockStorageLayer.getCohortData.mockRejectedValue(new Error('Storage error'));

      const result = await privacyControls.getCohortStatistics();

      expect(result).toEqual({
        totalCohorts: 0,
        activeCohorts: 0,
        disabledCohorts: 0,
        expiringCohorts: 0
      });
    });
  });

  describe('generateTopicDescription', () => {
    it('should use existing description when available', async () => {
      const result = await privacyControls.displayCurrentCohorts();
      const techCohort = result.find(c => c.topicName === 'Technology');

      expect(techCohort?.description).toBe('Technology and computing topics');
    });

    it('should generate description for topics without description', async () => {
      mockTaxonomyLoader.getTopicById.mockImplementation((id: number) => {
        if (id === 1) {
          return {
            id: 1,
            name: 'Technology',
            level: 1,
            isSensitive: false,
            description: '' // Empty description
          };
        }
        return null;
      });

      const result = await privacyControls.displayCurrentCohorts();
      const techCohort = result.find(c => c.topicName === 'Technology');

      expect(techCohort?.description).toBe('Interests related to technology (broad category)');
    });
  });
});