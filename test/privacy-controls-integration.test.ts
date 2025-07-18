import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrivacyControls } from '../src/shared/core/privacy-controls';
import { StorageLayer } from '../src/shared/core/storage-layer';
import { TaxonomyLoader } from '../src/shared/core/taxonomy-loader';
import { CohortAssignment, UserPreferences, Topic } from '../src/shared/interfaces/common';

/**
 * Integration tests for privacy controls functionality
 * Tests the complete workflow of privacy settings and data management
 */
describe('Privacy Controls Integration Tests', () => {
  let privacyControls: PrivacyControls;
  let storageLayer: StorageLayer;
  let taxonomyLoader: TaxonomyLoader;

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
    },
    {
      id: 3,
      name: 'Health',
      level: 1,
      isSensitive: true,
      description: 'Health and medical topics'
    }
  ];

  const mockCohorts: CohortAssignment[] = [
    {
      topicId: 1,
      topicName: 'Technology',
      confidence: 0.8,
      assignedDate: new Date('2025-01-01'),
      expiryDate: new Date('2025-02-01')
    },
    {
      topicId: 2,
      topicName: 'Sports',
      confidence: 0.7,
      assignedDate: new Date('2025-01-02'),
      expiryDate: new Date('2025-02-02')
    }
  ];

  beforeEach(async () => {
    // Create real instances but mock their dependencies
    storageLayer = new StorageLayer();
    taxonomyLoader = TaxonomyLoader.getInstance();
    privacyControls = PrivacyControls.getInstance();

    // Mock storage layer methods
    vi.spyOn(storageLayer, 'initialize').mockResolvedValue();
    vi.spyOn(storageLayer, 'getCohortData').mockResolvedValue([...mockCohorts]);
    vi.spyOn(storageLayer, 'getUserPreferences').mockResolvedValue({
      cohortsEnabled: true,
      disabledTopics: [],
      dataRetentionDays: 21,
      shareWithAdvertisers: true
    });
    vi.spyOn(storageLayer, 'storeUserPreferences').mockResolvedValue();
    vi.spyOn(storageLayer, 'clearAllData').mockResolvedValue();

    // Mock taxonomy loader methods
    vi.spyOn(taxonomyLoader, 'loadTaxonomy').mockResolvedValue();
    vi.spyOn(taxonomyLoader, 'getTopicById').mockImplementation((id: number) => 
      mockTopics.find(topic => topic.id === id) || null
    );

    // Replace the storage layer instance in privacy controls
    (privacyControls as any).storageLayer = storageLayer;
    (privacyControls as any).taxonomyLoader = taxonomyLoader;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Privacy Workflow', () => {
    it('should handle complete privacy settings workflow', async () => {
      // Step 1: Display initial cohorts
      const initialCohorts = await privacyControls.displayCurrentCohorts();
      expect(initialCohorts).toHaveLength(2);
      expect(initialCohorts.every(c => c.isActive)).toBe(true);

      // Step 2: Disable a specific cohort
      await privacyControls.toggleCohortStatus(1, false);
      expect(storageLayer.storeUserPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          disabledTopics: [1]
        })
      );

      // Step 3: Update global settings
      const newPreferences: UserPreferences = {
        cohortsEnabled: false,
        disabledTopics: [1],
        dataRetentionDays: 14,
        shareWithAdvertisers: false
      };
      await privacyControls.updatePrivacySettings(newPreferences);
      expect(storageLayer.storeUserPreferences).toHaveBeenCalledWith(newPreferences);

      // Step 4: Export data
      const exportData = await privacyControls.exportUserData();
      expect(exportData).toEqual({
        cohorts: mockCohorts,
        preferences: expect.any(Object),
        exportDate: expect.any(Date),
        version: '1.0'
      });

      // Step 5: Delete all data
      await privacyControls.deleteAllData();
      expect(storageLayer.clearAllData).toHaveBeenCalled();
    });

    it('should handle cohort enable/disable workflow', async () => {
      // Mock preferences with some disabled topics
      vi.spyOn(storageLayer, 'getUserPreferences').mockResolvedValue({
        cohortsEnabled: true,
        disabledTopics: [2], // Sports disabled
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      });

      // Display cohorts - Sports should be inactive
      const cohorts = await privacyControls.displayCurrentCohorts();
      const sportsCohort = cohorts.find(c => c.topicName === 'Sports');
      const techCohort = cohorts.find(c => c.topicName === 'Technology');
      
      expect(sportsCohort?.isActive).toBe(false);
      expect(techCohort?.isActive).toBe(true);

      // Enable Sports cohort
      await privacyControls.toggleCohortStatus(2, true);
      expect(storageLayer.storeUserPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          disabledTopics: [] // Sports should be removed from disabled list
        })
      );

      // Disable Technology cohort
      await privacyControls.toggleCohortStatus(1, false);
      expect(storageLayer.storeUserPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          disabledTopics: [1] // Technology should be added to disabled list
        })
      );
    });

    it('should handle global cohort disable/enable', async () => {
      // Initially enabled
      let cohorts = await privacyControls.displayCurrentCohorts();
      expect(cohorts.every(c => c.isActive)).toBe(true);

      // Disable globally
      await privacyControls.updatePrivacySettings({
        cohortsEnabled: false,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      });

      // Mock the updated preferences
      vi.spyOn(storageLayer, 'getUserPreferences').mockResolvedValue({
        cohortsEnabled: false,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      });

      // All cohorts should be inactive
      cohorts = await privacyControls.displayCurrentCohorts();
      expect(cohorts.every(c => !c.isActive)).toBe(true);

      // Statistics should reflect global disable
      const stats = await privacyControls.getCohortStatistics();
      expect(stats.activeCohorts).toBe(0);
    });
  });

  describe('Data Export and Deletion', () => {
    it('should export complete user data in GDPR-compliant format', async () => {
      const exportData = await privacyControls.exportUserData();

      // Verify export structure
      expect(exportData).toHaveProperty('cohorts');
      expect(exportData).toHaveProperty('preferences');
      expect(exportData).toHaveProperty('exportDate');
      expect(exportData).toHaveProperty('version');

      // Verify cohorts data
      expect(exportData.cohorts).toEqual(mockCohorts);

      // Verify export date is recent
      const now = new Date();
      const exportDate = new Date(exportData.exportDate);
      expect(exportDate.getTime()).toBeCloseTo(now.getTime(), -3); // Within 1 second

      // Verify version
      expect(exportData.version).toBe('1.0');
    });

    it('should handle complete data deletion', async () => {
      // Verify data exists initially
      const initialCohorts = await privacyControls.displayCurrentCohorts();
      expect(initialCohorts).toHaveLength(2);

      // Delete all data
      await privacyControls.deleteAllData();
      expect(storageLayer.clearAllData).toHaveBeenCalled();

      // Verify deletion was called
      expect(storageLayer.clearAllData).toHaveBeenCalledTimes(1);
    });

    it('should handle data export errors gracefully', async () => {
      // Mock storage error
      vi.spyOn(storageLayer, 'getCohortData').mockRejectedValue(new Error('Storage error'));

      // Export should throw error
      await expect(privacyControls.exportUserData()).rejects.toThrow('Failed to export user data');
    });

    it('should handle data deletion errors gracefully', async () => {
      // Mock storage error
      vi.spyOn(storageLayer, 'clearAllData').mockRejectedValue(new Error('Storage error'));

      // Deletion should throw error
      await expect(privacyControls.deleteAllData()).rejects.toThrow('Failed to delete user data');
    });
  });

  describe('Privacy Settings Management', () => {
    it('should update and persist privacy settings', async () => {
      const newSettings: UserPreferences = {
        cohortsEnabled: false,
        disabledTopics: [1, 2],
        dataRetentionDays: 7,
        shareWithAdvertisers: false
      };

      await privacyControls.updatePrivacySettings(newSettings);
      expect(storageLayer.storeUserPreferences).toHaveBeenCalledWith(newSettings);
    });

    it('should retrieve current privacy settings', async () => {
      const settings = await privacyControls.getPrivacySettings();
      
      expect(settings).toEqual({
        cohortsEnabled: true,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      });
    });

    it('should handle privacy settings errors', async () => {
      // Mock storage error for retrieval
      vi.spyOn(storageLayer, 'getUserPreferences').mockRejectedValue(new Error('Storage error'));

      await expect(privacyControls.getPrivacySettings()).rejects.toThrow();

      // Mock storage error for update
      vi.spyOn(storageLayer, 'storeUserPreferences').mockRejectedValue(new Error('Storage error'));

      const newSettings: UserPreferences = {
        cohortsEnabled: false,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      };

      await expect(privacyControls.updatePrivacySettings(newSettings)).rejects.toThrow();
    });
  });

  describe('Cohort Statistics', () => {
    it('should calculate accurate cohort statistics', async () => {
      // Mock preferences with some disabled topics
      vi.spyOn(storageLayer, 'getUserPreferences').mockResolvedValue({
        cohortsEnabled: true,
        disabledTopics: [2], // Sports disabled
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      });

      const stats = await privacyControls.getCohortStatistics();

      expect(stats.totalCohorts).toBe(2);
      expect(stats.activeCohorts).toBe(1); // Only Technology active
      expect(stats.disabledCohorts).toBe(1); // Sports disabled
      // Note: expiringCohorts may vary based on current date vs mock dates
    });

    it('should identify expiring cohorts correctly', async () => {
      // Mock cohorts with one expiring soon
      const now = new Date();
      const soonToExpire = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
      
      vi.spyOn(storageLayer, 'getCohortData').mockResolvedValue([
        {
          ...mockCohorts[0],
          expiryDate: soonToExpire
        },
        mockCohorts[1]
      ]);

      const stats = await privacyControls.getCohortStatistics();
      expect(stats.expiringCohorts).toBeGreaterThanOrEqual(1); // At least one expiring
    });

    it('should handle statistics calculation with global disable', async () => {
      // Mock globally disabled cohorts
      vi.spyOn(storageLayer, 'getUserPreferences').mockResolvedValue({
        cohortsEnabled: false,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      });

      const stats = await privacyControls.getCohortStatistics();
      expect(stats.activeCohorts).toBe(0); // All inactive when globally disabled
      expect(stats.totalCohorts).toBe(2); // Total count unchanged
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle storage initialization errors', async () => {
      vi.spyOn(storageLayer, 'initialize').mockRejectedValue(new Error('Init error'));

      // Should handle initialization error gracefully
      await expect(privacyControls.displayCurrentCohorts()).rejects.toThrow();
    });

    it('should handle taxonomy loading errors', async () => {
      vi.spyOn(taxonomyLoader, 'loadTaxonomy').mockRejectedValue(new Error('Taxonomy error'));

      // Should handle taxonomy error gracefully
      await expect(privacyControls.displayCurrentCohorts()).rejects.toThrow();
    });

    it('should handle missing topic data gracefully', async () => {
      // Mock taxonomy loader to return null for some topics
      vi.spyOn(taxonomyLoader, 'getTopicById').mockReturnValue(null);

      const cohorts = await privacyControls.displayCurrentCohorts();
      expect(cohorts).toHaveLength(0); // Should filter out cohorts with missing topics
    });

    it('should provide fallback statistics on error', async () => {
      vi.spyOn(storageLayer, 'getCohortData').mockRejectedValue(new Error('Storage error'));

      const stats = await privacyControls.getCohortStatistics();
      expect(stats).toEqual({
        totalCohorts: 0,
        activeCohorts: 0,
        disabledCohorts: 0,
        expiringCohorts: 0
      });
    });
  });

  describe('Data Usage Explanation', () => {
    it('should provide comprehensive data usage explanation', () => {
      const explanation = privacyControls.showDataUsageExplanation();

      // Verify key privacy concepts are explained
      expect(explanation).toContain('local device');
      expect(explanation).toContain('cohort IDs');
      expect(explanation).toContain('3 weeks');
      expect(explanation).toContain('anonymized');
      expect(explanation).toContain('individual browsing data never leaves');
      expect(explanation).toContain('disable any cohort');
      expect(explanation).toContain('Export all your data');
      expect(explanation).toContain('Delete all data completely');
    });
  });
});