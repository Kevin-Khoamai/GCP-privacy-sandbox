import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrivacyControls } from '../src/shared/core/privacy-controls';
import { UserPreferences } from '../src/shared/interfaces/common';
import { CohortDisplayData } from '../src/shared/interfaces/privacy-controls';

// Mock storage provider
const mockStorageProvider = {
  storeEncrypted: vi.fn().mockResolvedValue(undefined),
  retrieveEncrypted: vi.fn().mockResolvedValue(null),
  removeEncrypted: vi.fn().mockResolvedValue(undefined),
  clearAll: vi.fn().mockResolvedValue(undefined)
};

// Mock cohort engine
const mockCohortEngine = {
  getCurrentCohorts: vi.fn().mockReturnValue([]),
  clearAllCohorts: vi.fn(),
  toggleCohort: vi.fn(),
  removeCohort: vi.fn()
};

describe('Comprehensive Privacy Controls Logic', () => {
  let privacyControls: PrivacyControls;

  beforeEach(() => {
    vi.clearAllMocks();
    privacyControls = PrivacyControls.getInstance();
  });

  describe('Basic Privacy Controls Functionality', () => {
    it('should display current cohorts', async () => {
      const cohorts = await privacyControls.displayCurrentCohorts();

      expect(Array.isArray(cohorts)).toBe(true);
      cohorts.forEach(cohort => {
        expect(cohort).toHaveProperty('topicName');
        expect(cohort).toHaveProperty('description');
        expect(cohort).toHaveProperty('isActive');
        expect(cohort).toHaveProperty('assignedDate');
        expect(cohort).toHaveProperty('expiryDate');
        expect(cohort).toHaveProperty('canDisable');
        expect(cohort).toHaveProperty('topicId');
      });
    });

    it('should validate complex preference combinations', async () => {
      const invalidCombinations = [
        { cohortsEnabled: false, shareWithAdvertisers: true, dataRetentionDays: 21 }, // Can't share if cohorts disabled
        { cohortsEnabled: true, shareWithAdvertisers: true, dataRetentionDays: 1 }    // Too short retention for sharing
      ];

      for (const invalid of invalidCombinations) {
        await expect(privacyControls.updateUserPreferences(invalid))
          .rejects.toThrow('Invalid preference combination');
      }
    });

    it('should apply preference changes with proper validation', async () => {
      const currentPrefs: UserPreferences = {
        cohortsEnabled: true,
        shareWithAdvertisers: false,
        dataRetentionDays: 21
      };

      const newPrefs: UserPreferences = {
        cohortsEnabled: true,
        shareWithAdvertisers: true,
        dataRetentionDays: 14
      };

      mockStorageProvider.retrieveEncrypted.mockResolvedValueOnce(currentPrefs);

      const result = await privacyControls.updateUserPreferences(newPrefs);

      expect(result.success).toBe(true);
      expect(result.changes).toContain('Data sharing enabled');
      expect(result.changes).toContain('Retention period changed');
    });

    it('should handle preference rollback on errors', async () => {
      const originalPrefs: UserPreferences = {
        cohortsEnabled: true,
        shareWithAdvertisers: false,
        dataRetentionDays: 21
      };

      const newPrefs: UserPreferences = {
        cohortsEnabled: false,
        shareWithAdvertisers: false,
        dataRetentionDays: 7
      };

      mockStorageProvider.retrieveEncrypted.mockResolvedValueOnce(originalPrefs);
      mockStorageProvider.storeEncrypted.mockRejectedValueOnce(new Error('Storage failed'));

      await expect(privacyControls.updateUserPreferences(newPrefs))
        .rejects.toThrow('Storage failed');

      // Should maintain original preferences
      const currentPrefs = await privacyControls.getUserPreferences();
      expect(currentPrefs).toEqual(originalPrefs);
    });
  });

  describe('Advanced Consent Management', () => {
    it('should handle consent version upgrades', async () => {
      const oldConsent: ConsentStatus = {
        granted: true,
        timestamp: new Date('2024-01-01'),
        version: '1.0'
      };

      mockStorageProvider.retrieveEncrypted.mockResolvedValueOnce(oldConsent);

      const needsUpgrade = await privacyControls.needsConsentUpgrade('2.0');

      expect(needsUpgrade).toBe(true);
    });

    it('should track consent history', async () => {
      await privacyControls.grantConsent('1.0');
      await privacyControls.grantConsent('1.1');
      await privacyControls.withdrawConsent();

      const history = await privacyControls.getConsentHistory();

      expect(history).toHaveLength(3);
      expect(history[0].action).toBe('granted');
      expect(history[1].action).toBe('upgraded');
      expect(history[2].action).toBe('withdrawn');
    });

    it('should validate consent expiration', async () => {
      const expiredConsent: ConsentStatus = {
        granted: true,
        timestamp: new Date(Date.now() - 366 * 24 * 60 * 60 * 1000), // Over 1 year ago
        version: '1.0'
      };

      mockStorageProvider.retrieveEncrypted.mockResolvedValueOnce(expiredConsent);

      const isValid = await privacyControls.isConsentValid();

      expect(isValid).toBe(false);
    });

    it('should handle partial consent scenarios', async () => {
      const partialConsent = {
        dataProcessing: true,
        advertising: false,
        analytics: true,
        thirdParty: false
      };

      await privacyControls.grantPartialConsent(partialConsent, '1.0');

      const consent = await privacyControls.getConsentStatus();
      expect(consent.granted).toBe(true);
      expect(consent.details).toEqual(partialConsent);
    });
  });

  describe('Advanced Cohort Management', () => {
    const mockAdvancedCohorts = [
      {
        topicId: 1,
        topicName: 'Sports',
        confidence: 0.95,
        assignedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        isActive: true,
        sources: ['espn.com', 'nba.com'],
        subTopics: ['Basketball', 'Football']
      },
      {
        topicId: 2,
        topicName: 'Technology',
        confidence: 0.78,
        assignedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
        isActive: true,
        sources: ['github.com', 'stackoverflow.com'],
        subTopics: ['Programming', 'Web Development']
      },
      {
        topicId: 3,
        topicName: 'Travel',
        confidence: 0.42,
        assignedDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expired
        isActive: false,
        sources: ['expedia.com'],
        subTopics: ['Hotels', 'Flights']
      }
    ];

    beforeEach(() => {
      mockCohortEngine.getCurrentCohorts.mockReturnValue(mockAdvancedCohorts);
    });

    it('should provide detailed cohort analytics', async () => {
      const analytics = await privacyControls.getCohortAnalytics();

      expect(analytics.totalCohorts).toBe(3);
      expect(analytics.activeCohorts).toBe(2);
      expect(analytics.expiredCohorts).toBe(1);
      expect(analytics.averageConfidence).toBeCloseTo(0.72, 2);
      expect(analytics.expiringWithin7Days).toBe(1);
    });

    it('should filter cohorts by confidence threshold', async () => {
      const highConfidenceCohorts = await privacyControls.getCohortsByConfidence(0.8);

      expect(highConfidenceCohorts).toHaveLength(1);
      expect(highConfidenceCohorts[0].topicName).toBe('Sports');
    });

    it('should group cohorts by expiry status', async () => {
      const groupedCohorts = await privacyControls.getCohortsByExpiryStatus();

      expect(groupedCohorts.active).toHaveLength(2);
      expect(groupedCohorts.expiringSoon).toHaveLength(1);
      expect(groupedCohorts.expired).toHaveLength(1);
    });

    it('should provide cohort source attribution', async () => {
      const attribution = await privacyControls.getCohortSourceAttribution(1);

      expect(attribution.sources).toEqual(['espn.com', 'nba.com']);
      expect(attribution.subTopics).toEqual(['Basketball', 'Football']);
      expect(attribution.confidence).toBe(0.95);
    });

    it('should handle bulk cohort operations', async () => {
      const cohortIds = [1, 2];
      
      await privacyControls.bulkToggleCohorts(cohortIds, false);

      expect(mockCohortEngine.toggleCohort).toHaveBeenCalledTimes(2);
      expect(mockCohortEngine.toggleCohort).toHaveBeenCalledWith(1, false);
      expect(mockCohortEngine.toggleCohort).toHaveBeenCalledWith(2, false);
    });

    it('should validate cohort operations', async () => {
      // Try to toggle non-existent cohort
      await expect(privacyControls.toggleCohort(999, false))
        .rejects.toThrow('Cohort not found');

      // Try to delete expired cohort
      await expect(privacyControls.deleteCohort(3))
        .rejects.toThrow('Cannot delete expired cohort');
    });
  });

  describe('Advanced Data Export and Deletion', () => {
    it('should export data with custom filters', async () => {
      const filters = {
        includeExpiredCohorts: false,
        includeSources: true,
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31')
        }
      };

      const exportData = await privacyControls.exportUserData('json', filters);

      expect(exportData.data).not.toContain('Travel'); // Expired cohort excluded
      expect(exportData.data).toContain('sources'); // Sources included
      expect(exportData.metadata.filters).toEqual(filters);
    });

    it('should provide export progress tracking', async () => {
      const progressCallback = vi.fn();
      
      await privacyControls.exportUserData('json', {}, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(expect.objectContaining({
        stage: 'collecting_preferences',
        progress: expect.any(Number)
      }));
    });

    it('should handle incremental data deletion', async () => {
      const deletionOptions = {
        deletePreferences: true,
        deleteCohorts: true,
        deleteConsent: false,
        deleteHistory: true
      };

      await privacyControls.deleteUserData(deletionOptions);

      expect(mockStorageProvider.removeEncrypted).toHaveBeenCalledWith('user_preferences');
      expect(mockCohortEngine.clearAllCohorts).toHaveBeenCalled();
      expect(mockStorageProvider.removeEncrypted).not.toHaveBeenCalledWith('consent_status');
    });

    it('should create data deletion audit trail', async () => {
      await privacyControls.deleteAllUserData();

      const auditTrail = await privacyControls.getDeletionAuditTrail();

      expect(auditTrail).toHaveLength(1);
      expect(auditTrail[0].action).toBe('full_deletion');
      expect(auditTrail[0].timestamp).toBeInstanceOf(Date);
      expect(auditTrail[0].itemsDeleted).toContain('preferences');
      expect(auditTrail[0].itemsDeleted).toContain('cohorts');
    });
  });

  describe('Privacy Risk Assessment', () => {
    it('should calculate comprehensive privacy risk score', async () => {
      const preferences: UserPreferences = {
        cohortsEnabled: true,
        shareWithAdvertisers: true,
        dataRetentionDays: 30
      };

      const riskAssessment = await privacyControls.calculatePrivacyRisk(preferences);

      expect(riskAssessment.overallScore).toBeGreaterThan(0);
      expect(riskAssessment.overallScore).toBeLessThanOrEqual(100);
      expect(riskAssessment.factors).toContain('data_sharing_enabled');
      expect(riskAssessment.factors).toContain('long_retention_period');
      expect(riskAssessment.recommendations).toHaveLength.greaterThan(0);
    });

    it('should identify privacy vulnerabilities', async () => {
      const vulnerabilities = await privacyControls.identifyPrivacyVulnerabilities();

      expect(vulnerabilities).toBeInstanceOf(Array);
      vulnerabilities.forEach(vuln => {
        expect(vuln).toHaveProperty('type');
        expect(vuln).toHaveProperty('severity');
        expect(vuln).toHaveProperty('description');
        expect(vuln).toHaveProperty('mitigation');
      });
    });

    it('should provide privacy improvement suggestions', async () => {
      const suggestions = await privacyControls.getPrivacyImprovementSuggestions();

      expect(suggestions.immediate).toBeInstanceOf(Array);
      expect(suggestions.recommended).toBeInstanceOf(Array);
      expect(suggestions.advanced).toBeInstanceOf(Array);
      
      suggestions.immediate.forEach(suggestion => {
        expect(suggestion).toHaveProperty('action');
        expect(suggestion).toHaveProperty('impact');
        expect(suggestion).toHaveProperty('difficulty');
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of cohorts efficiently', async () => {
      const largeCohortSet = Array.from({ length: 1000 }, (_, i) => ({
        topicId: i,
        topicName: `Topic ${i}`,
        confidence: Math.random(),
        assignedDate: new Date(),
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true
      }));

      mockCohortEngine.getCurrentCohorts.mockReturnValue(largeCohortSet);

      const startTime = Date.now();
      const displayData = await privacyControls.getCohortDisplayData();
      const endTime = Date.now();

      expect(displayData).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should cache frequently accessed data', async () => {
      // First call
      await privacyControls.getUserPreferences();
      // Second call should use cache
      await privacyControls.getUserPreferences();

      // Storage should only be called once due to caching
      expect(mockStorageProvider.retrieveEncrypted).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent operations safely', async () => {
      const operations = [
        privacyControls.toggleCohort(1, false),
        privacyControls.toggleCohort(2, true),
        privacyControls.deleteCohort(3),
        privacyControls.updateUserPreferences({
          cohortsEnabled: true,
          shareWithAdvertisers: false,
          dataRetentionDays: 14
        })
      ];

      await expect(Promise.all(operations)).resolves.toBeDefined();
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from storage corruption', async () => {
      mockStorageProvider.retrieveEncrypted.mockResolvedValueOnce('corrupted-json-data');

      const preferences = await privacyControls.getUserPreferences();

      expect(preferences).toEqual({
        cohortsEnabled: true,
        shareWithAdvertisers: false,
        dataRetentionDays: 21
      });
    });

    it('should handle partial system failures gracefully', async () => {
      mockCohortEngine.getCurrentCohorts.mockImplementation(() => {
        throw new Error('Cohort engine failure');
      });

      const displayData = await privacyControls.getCohortDisplayData();

      expect(displayData).toEqual([]);
      // Should not throw error, just return empty array
    });

    it('should implement circuit breaker for failing operations', async () => {
      // Simulate repeated failures
      mockStorageProvider.storeEncrypted.mockRejectedValue(new Error('Storage failure'));

      const preferences: UserPreferences = {
        cohortsEnabled: true,
        shareWithAdvertisers: false,
        dataRetentionDays: 21
      };

      // After multiple failures, should stop trying
      for (let i = 0; i < 5; i++) {
        try {
          await privacyControls.updateUserPreferences(preferences);
        } catch (error) {
          // Expected to fail
        }
      }

      const circuitBreakerStatus = await privacyControls.getCircuitBreakerStatus();
      expect(circuitBreakerStatus.storage).toBe('open');
    });
  });
});
