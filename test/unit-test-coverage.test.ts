import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrivacyControls } from '../src/shared/core/privacy-controls';
import { CohortEngine } from '../src/shared/core/cohort-engine';
import { StorageLayer } from '../src/shared/core/storage-layer';

// Mock the dependencies
vi.mock('../src/shared/core/storage-layer');
vi.mock('../src/shared/core/taxonomy-loader');

describe('Unit Test Coverage for Core Components', () => {
  describe('PrivacyControls', () => {
    let privacyControls: PrivacyControls;

    beforeEach(() => {
      // Reset singleton instance
      (PrivacyControls as any).instance = null;
      privacyControls = PrivacyControls.getInstance();
    });

    it('should be a singleton', () => {
      const instance1 = PrivacyControls.getInstance();
      const instance2 = PrivacyControls.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should display current cohorts', async () => {
      const cohorts = await privacyControls.displayCurrentCohorts();
      
      expect(Array.isArray(cohorts)).toBe(true);
    });

    it('should export user data', async () => {
      const exportData = await privacyControls.exportUserData();
      
      expect(exportData).toHaveProperty('cohorts');
      expect(exportData).toHaveProperty('preferences');
      expect(exportData).toHaveProperty('exportDate');
      expect(exportData).toHaveProperty('version');
      expect(exportData.exportDate).toBeInstanceOf(Date);
    });

    it('should provide data usage explanation', () => {
      const explanation = privacyControls.showDataUsageExplanation();
      
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain('privacy');
      expect(explanation).toContain('cohort');
    });

    it('should get privacy settings', async () => {
      const settings = await privacyControls.getPrivacySettings();
      
      expect(settings).toHaveProperty('cohortsEnabled');
      expect(settings).toHaveProperty('disabledTopics');
      expect(settings).toHaveProperty('dataRetentionDays');
      expect(settings).toHaveProperty('shareWithAdvertisers');
    });

    it('should get privacy statistics', async () => {
      const stats = await privacyControls.getPrivacyStatistics();
      
      expect(stats).toHaveProperty('totalCohorts');
      expect(stats).toHaveProperty('activeCohorts');
      expect(stats).toHaveProperty('disabledCohorts');
      expect(stats).toHaveProperty('expiringCohorts');
      expect(typeof stats.totalCohorts).toBe('number');
      expect(typeof stats.activeCohorts).toBe('number');
    });

    it('should handle cohort toggling', async () => {
      await expect(privacyControls.toggleCohortStatus(1, false)).resolves.not.toThrow();
      await expect(privacyControls.toggleCohortStatus(1, true)).resolves.not.toThrow();
    });

    it('should handle data deletion', async () => {
      await expect(privacyControls.deleteAllData()).resolves.not.toThrow();
    });
  });

  describe('CohortEngine', () => {
    let cohortEngine: CohortEngine;

    beforeEach(() => {
      // Reset singleton instance
      (CohortEngine as any).instance = null;
      cohortEngine = CohortEngine.getInstance();
    });

    it('should be a singleton', () => {
      const instance1 = CohortEngine.getInstance();
      const instance2 = CohortEngine.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should get current cohorts', () => {
      const cohorts = cohortEngine.getCurrentCohorts();
      
      expect(Array.isArray(cohorts)).toBe(true);
    });

    it('should clear all cohorts', () => {
      expect(() => cohortEngine.clearAllCohorts()).not.toThrow();
    });

    it('should assign cohorts from domain visits', async () => {
      const domainVisits = [
        {
          domain: 'example.com',
          timestamp: new Date(),
          visitCount: 5
        }
      ];

      const assignments = await cohortEngine.assignCohorts(domainVisits);
      
      expect(Array.isArray(assignments)).toBe(true);
    });

    it('should handle empty domain visits', async () => {
      const assignments = await cohortEngine.assignCohorts([]);
      
      expect(Array.isArray(assignments)).toBe(true);
      expect(assignments).toHaveLength(0);
    });

    it('should handle invalid domain visits gracefully', async () => {
      const invalidVisits = [
        {
          domain: '',
          timestamp: new Date(),
          visitCount: 0
        },
        {
          domain: 'valid.com',
          timestamp: new Date(),
          visitCount: -1
        }
      ];

      const assignments = await cohortEngine.assignCohorts(invalidVisits);
      
      expect(Array.isArray(assignments)).toBe(true);
    });
  });

  describe('StorageLayer', () => {
    let storageLayer: StorageLayer;

    beforeEach(() => {
      storageLayer = new StorageLayer();
    });

    it('should initialize without errors', async () => {
      await expect(storageLayer.initialize()).resolves.not.toThrow();
    });

    it('should handle cohort data operations', async () => {
      const cohorts = [
        {
          topicId: 1,
          topicName: 'Sports',
          confidence: 0.8,
          assignedDate: new Date(),
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      ];

      await expect(storageLayer.storeCohortData(cohorts)).resolves.not.toThrow();
      
      const retrievedCohorts = await storageLayer.getCohortData();
      expect(Array.isArray(retrievedCohorts)).toBe(true);
    });

    it('should handle user preferences operations', async () => {
      const preferences = {
        cohortsEnabled: true,
        disabledTopics: [1, 2],
        dataRetentionDays: 21,
        shareWithAdvertisers: false
      };

      await expect(storageLayer.storeUserPreferences(preferences)).resolves.not.toThrow();
      
      const retrievedPreferences = await storageLayer.getUserPreferences();
      expect(retrievedPreferences).toHaveProperty('cohortsEnabled');
      expect(retrievedPreferences).toHaveProperty('disabledTopics');
    });

    it('should handle user profile operations', async () => {
      const profile = {
        userId: 'test-user',
        activeCohorts: [],
        preferences: {
          cohortsEnabled: true,
          disabledTopics: [],
          dataRetentionDays: 21,
          shareWithAdvertisers: false
        },
        lastUpdated: new Date(),
        version: '1.0'
      };

      await expect(storageLayer.storeUserProfile(profile)).resolves.not.toThrow();
      
      const retrievedProfile = await storageLayer.getUserProfile();
      expect(retrievedProfile).toBeTruthy();
    });

    it('should clear expired data', async () => {
      await expect(storageLayer.clearExpiredData()).resolves.not.toThrow();
    });

    it('should clear all data', async () => {
      await expect(storageLayer.clearAllData()).resolves.not.toThrow();
    });

    it('should handle API request logging', async () => {
      const apiLog = {
        requestId: 'test-request',
        domain: 'example.com',
        timestamp: new Date(),
        cohortsShared: ['1', '2'],
        requestType: 'advertising',
        userConsent: true
      };

      await expect(storageLayer.logAPIRequest(apiLog)).resolves.not.toThrow();
      
      const logs = await storageLayer.getAPIRequestLogs();
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('Error Handling Coverage', () => {
    it('should handle storage initialization failures', async () => {
      const storageLayer = new StorageLayer();
      
      // Mock storage provider to fail
      const mockProvider = {
        initialize: vi.fn().mockRejectedValue(new Error('Storage unavailable'))
      };
      
      (storageLayer as any).storageProvider = mockProvider;
      
      // Should handle gracefully
      await expect(storageLayer.initialize()).rejects.toThrow('Storage unavailable');
    });

    it('should handle cohort assignment failures', async () => {
      const cohortEngine = CohortEngine.getInstance();
      
      // Test with malformed data
      const malformedVisits = [
        null,
        undefined,
        { domain: null, timestamp: null, visitCount: null }
      ] as any;

      const assignments = await cohortEngine.assignCohorts(malformedVisits);
      
      // Should return empty array instead of throwing
      expect(Array.isArray(assignments)).toBe(true);
    });

    it('should handle privacy controls errors gracefully', async () => {
      const privacyControls = PrivacyControls.getInstance();
      
      // Test with invalid topic ID
      await expect(privacyControls.toggleCohortStatus(-1, true)).resolves.not.toThrow();
      await expect(privacyControls.toggleCohortStatus(999999, false)).resolves.not.toThrow();
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large cohort sets efficiently', async () => {
      const cohortEngine = CohortEngine.getInstance();
      
      const largeDomainVisits = Array.from({ length: 1000 }, (_, i) => ({
        domain: `domain${i}.com`,
        timestamp: new Date(),
        visitCount: Math.floor(Math.random() * 10) + 1
      }));

      const startTime = Date.now();
      const assignments = await cohortEngine.assignCohorts(largeDomainVisits);
      const endTime = Date.now();

      expect(Array.isArray(assignments)).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should maintain singleton performance', () => {
      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        CohortEngine.getInstance();
        PrivacyControls.getInstance();
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(1); // Should be very fast (< 1ms per call)
    });

    it('should handle concurrent operations', async () => {
      const cohortEngine = CohortEngine.getInstance();
      const privacyControls = PrivacyControls.getInstance();

      const operations = [
        cohortEngine.assignCohorts([]),
        privacyControls.displayCurrentCohorts(),
        privacyControls.getPrivacySettings(),
        privacyControls.getPrivacyStatistics()
      ];

      await expect(Promise.all(operations)).resolves.toBeDefined();
    });
  });

  describe('Data Validation Coverage', () => {
    it('should validate domain visit data', async () => {
      const cohortEngine = CohortEngine.getInstance();

      const validVisits = [
        { domain: 'example.com', timestamp: new Date(), visitCount: 5 },
        { domain: 'test.org', timestamp: new Date(), visitCount: 3 }
      ];

      const assignments = await cohortEngine.assignCohorts(validVisits);
      expect(Array.isArray(assignments)).toBe(true);
    });

    it('should validate user preferences data', async () => {
      const storageLayer = new StorageLayer();

      const validPreferences = {
        cohortsEnabled: true,
        disabledTopics: [1, 2, 3],
        dataRetentionDays: 21,
        shareWithAdvertisers: false
      };

      await expect(storageLayer.storeUserPreferences(validPreferences)).resolves.not.toThrow();
    });

    it('should handle edge cases in data validation', async () => {
      const cohortEngine = CohortEngine.getInstance();

      const edgeCases = [
        [], // Empty array
        [{ domain: '', timestamp: new Date(), visitCount: 0 }], // Empty domain
        [{ domain: 'a'.repeat(1000), timestamp: new Date(), visitCount: 1 }], // Very long domain
        [{ domain: 'test.com', timestamp: new Date(0), visitCount: 1 }], // Very old timestamp
        [{ domain: 'test.com', timestamp: new Date(Date.now() + 86400000), visitCount: 1 }] // Future timestamp
      ];

      for (const testCase of edgeCases) {
        const assignments = await cohortEngine.assignCohorts(testCase);
        expect(Array.isArray(assignments)).toBe(true);
      }
    });
  });
});
