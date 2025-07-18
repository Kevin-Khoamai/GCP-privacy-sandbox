import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComplianceManager } from '../src/shared/core/compliance-manager';
import { GranularConsentManager } from '../src/shared/core/consent-manager';
import { ConsentRecord, DataProcessingLawfulness } from '../src/shared/interfaces/compliance';

// Mock storage provider
const mockStorageProvider = {
  storeEncrypted: vi.fn().mockResolvedValue(undefined),
  retrieveEncrypted: vi.fn().mockResolvedValue(null),
  removeEncrypted: vi.fn().mockResolvedValue(undefined),
  clearAll: vi.fn().mockResolvedValue(undefined)
};

describe('GDPR/CCPA Compliance Testing Suite', () => {
  let complianceManager: ComplianceManager;
  let consentManager: GranularConsentManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    complianceManager = ComplianceManager.getInstance();
    consentManager = GranularConsentManager.getInstance();
    
    await complianceManager.initialize(mockStorageProvider as any);
    await consentManager.initialize(mockStorageProvider as any);
  });

  describe('GDPR Article 15 - Right of Access', () => {
    it('should provide comprehensive data access response', async () => {
      const userId = 'test-user-123';
      const requestId = 'access-request-456';

      // Mock user data
      mockStorageProvider.retrieveEncrypted
        .mockResolvedValueOnce([{ topicId: 1, topicName: 'Sports', confidence: 0.8 }]) // cohort_data
        .mockResolvedValueOnce({ cohortsEnabled: true, shareWithAdvertisers: false }) // user_preferences
        .mockResolvedValueOnce({ userId, activeCohorts: [1] }) // user_profile
        .mockResolvedValueOnce([{ timestamp: new Date(), domain: 'example.com' }]); // api_request_logs

      const response = await complianceManager.requestDataAccess(userId, requestId);

      expect(response).toHaveProperty('personalData');
      expect(response).toHaveProperty('processingPurposes');
      expect(response).toHaveProperty('dataCategories');
      expect(response).toHaveProperty('recipients');
      expect(response).toHaveProperty('retentionPeriod');
      expect(response.requestId).toBe(requestId);
      expect(response.timestamp).toBeInstanceOf(Date);

      // Verify data completeness
      expect(response.personalData.cohortAssignments).toBeDefined();
      expect(response.personalData.userPreferences).toBeDefined();
      expect(response.personalData.userProfile).toBeDefined();
      expect(response.personalData.apiRequestHistory).toBeDefined();

      // Verify processing purposes are listed
      expect(response.processingPurposes).toContain('Interest-based cohort assignment for privacy-preserving advertising');
      expect(response.dataCategories).toContain('Browsing behavior data (domains visited)');
    });

    it('should handle access requests for users with no data', async () => {
      const userId = 'new-user-789';
      const requestId = 'access-request-empty';

      // Mock empty data
      mockStorageProvider.retrieveEncrypted.mockResolvedValue(null);

      const response = await complianceManager.requestDataAccess(userId, requestId);

      expect(response.personalData.cohortAssignments).toEqual([]);
      expect(response.personalData.userPreferences).toEqual({});
      expect(response.requestId).toBe(requestId);
    });

    it('should log access requests for audit purposes', async () => {
      const userId = 'audit-user-123';
      const requestId = 'audit-request-456';

      await complianceManager.requestDataAccess(userId, requestId);

      expect(mockStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        'compliance_audit_logs',
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'DATA_ACCESS_REQUEST',
            eventData: expect.objectContaining({
              userId,
              requestId
            })
          })
        ])
      );
    });
  });

  describe('GDPR Article 16 - Right to Rectification', () => {
    it('should allow correction of user preferences', async () => {
      const userId = 'correction-user-123';
      const requestId = 'correction-request-456';

      // Mock existing preferences
      mockStorageProvider.retrieveEncrypted.mockResolvedValue({
        cohortsEnabled: true,
        shareWithAdvertisers: true,
        dataRetentionDays: 30
      });

      const corrections = [
        {
          field: 'preferences.shareWithAdvertisers',
          currentValue: true,
          newValue: false,
          justification: 'User changed privacy preference'
        },
        {
          field: 'preferences.dataRetentionDays',
          currentValue: 30,
          newValue: 14,
          justification: 'User requested shorter retention period'
        }
      ];

      const response = await complianceManager.requestDataCorrection(userId, requestId, corrections);

      expect(response.status).toBe('completed');
      expect(response.correctionsMade).toHaveLength(2);
      expect(response.correctionsMade[0].field).toBe('preferences.shareWithAdvertisers');
      expect(response.correctionsMade[0].newValue).toBe(false);
    });

    it('should reject corrections for non-correctable fields', async () => {
      const userId = 'correction-user-456';
      const requestId = 'correction-request-789';

      const corrections = [
        {
          field: 'system.version',
          currentValue: '1.0.0',
          newValue: '2.0.0',
          justification: 'Invalid correction attempt'
        }
      ];

      const response = await complianceManager.requestDataCorrection(userId, requestId, corrections);

      expect(response.status).toBe('rejected');
      expect(response.correctionsMade).toHaveLength(0);
    });

    it('should handle partial corrections', async () => {
      const userId = 'partial-correction-user';
      const requestId = 'partial-correction-request';

      mockStorageProvider.retrieveEncrypted.mockResolvedValue({
        cohortsEnabled: true,
        shareWithAdvertisers: false
      });

      const corrections = [
        {
          field: 'preferences.cohortsEnabled',
          currentValue: true,
          newValue: false,
          justification: 'Valid correction'
        },
        {
          field: 'invalid.field',
          currentValue: 'old',
          newValue: 'new',
          justification: 'Invalid field'
        }
      ];

      const response = await complianceManager.requestDataCorrection(userId, requestId, corrections);

      expect(response.status).toBe('partial');
      expect(response.correctionsMade).toHaveLength(1);
    });
  });

  describe('GDPR Article 17 - Right to Erasure', () => {
    it('should perform complete data deletion', async () => {
      const userId = 'deletion-user-123';
      const requestId = 'deletion-request-456';

      const deletionScope = {
        deleteAll: true,
        retainForLegalBasis: false
      };

      const response = await complianceManager.requestDataDeletion(userId, requestId, deletionScope);

      expect(response.deletedData).toContain('cohort_data');
      expect(response.deletedData).toContain('user_preferences');
      expect(response.deletedData).toContain('user_profile');
      expect(response.deletedData).toContain('api_request_logs');
      expect(response.deletionDate).toBeInstanceOf(Date);
      expect(response.certificateHash).toMatch(/^CERT-[A-F0-9]+$/);
    });

    it('should retain data for legal basis when requested', async () => {
      const userId = 'legal-retention-user';
      const requestId = 'legal-retention-request';

      const deletionScope = {
        deleteAll: true,
        retainForLegalBasis: true
      };

      const response = await complianceManager.requestDataDeletion(userId, requestId, deletionScope);

      expect(response.retainedData).toContain('compliance_audit_logs');
      expect(response.deletedData).not.toContain('compliance_audit_logs');
    });

    it('should perform selective data deletion', async () => {
      const userId = 'selective-deletion-user';
      const requestId = 'selective-deletion-request';

      const deletionScope = {
        specificData: ['cohort_data', 'user_preferences']
      };

      const response = await complianceManager.requestDataDeletion(userId, requestId, deletionScope);

      expect(response.deletedData).toContain('cohort_data');
      expect(response.deletedData).toContain('user_preferences');
      expect(response.deletedData).not.toContain('api_request_logs');
    });

    it('should generate deletion certificate', async () => {
      const userId = 'certificate-user';
      const requestId = 'certificate-request';

      const response = await complianceManager.requestDataDeletion(userId, requestId, { deleteAll: true });

      expect(response.certificateHash).toBeTruthy();
      expect(typeof response.certificateHash).toBe('string');
      expect(response.certificateHash).toMatch(/^CERT-[A-F0-9]+$/);
    });
  });

  describe('GDPR Article 20 - Right to Data Portability', () => {
    it('should export data in JSON format', async () => {
      const userId = 'export-user-123';
      const requestId = 'export-request-456';

      // Mock user data
      mockStorageProvider.retrieveEncrypted
        .mockResolvedValueOnce([{ topicId: 1, topicName: 'Sports' }])
        .mockResolvedValueOnce({ cohortsEnabled: true })
        .mockResolvedValueOnce({ userId })
        .mockResolvedValueOnce([]);

      const response = await complianceManager.requestDataPortability(userId, requestId, 'json');

      expect(response.format).toBe('json');
      expect(response.exportData).toBeTruthy();
      expect(() => JSON.parse(response.exportData)).not.toThrow();
      expect(response.checksum).toBeTruthy();
      expect(response.exportDate).toBeInstanceOf(Date);
    });

    it('should export data in CSV format', async () => {
      const userId = 'csv-export-user';
      const requestId = 'csv-export-request';

      mockStorageProvider.retrieveEncrypted
        .mockResolvedValueOnce([{ topicId: 1 }])
        .mockResolvedValueOnce({ cohortsEnabled: true })
        .mockResolvedValueOnce({ userId })
        .mockResolvedValueOnce([]);

      const response = await complianceManager.requestDataPortability(userId, requestId, 'csv');

      expect(response.format).toBe('csv');
      expect(response.exportData).toContain(','); // CSV should contain commas
      expect(response.checksum).toBeTruthy();
    });

    it('should export data in XML format', async () => {
      const userId = 'xml-export-user';
      const requestId = 'xml-export-request';

      mockStorageProvider.retrieveEncrypted
        .mockResolvedValueOnce([{ topicId: 1 }])
        .mockResolvedValueOnce({ cohortsEnabled: true })
        .mockResolvedValueOnce({ userId })
        .mockResolvedValueOnce([]);

      const response = await complianceManager.requestDataPortability(userId, requestId, 'xml');

      expect(response.format).toBe('xml');
      expect(response.exportData).toContain('<?xml');
      expect(response.exportData).toContain('<export>');
      expect(response.checksum).toBeTruthy();
    });

    it('should reject unsupported export formats', async () => {
      const userId = 'unsupported-format-user';
      const requestId = 'unsupported-format-request';

      await expect(
        complianceManager.requestDataPortability(userId, requestId, 'pdf' as any)
      ).rejects.toThrow('Unsupported export format: pdf');
    });
  });

  describe('Consent Management', () => {
    it('should record granular consent', async () => {
      const userId = 'consent-user-123';
      
      const consentRecord: ConsentRecord = {
        id: 'consent-123',
        userId,
        purposes: ['cohort_assignment', 'advertising_personalization'],
        lawfulBasis: 'consent',
        consentText: 'I agree to the processing of my data',
        consentVersion: '2.0.0',
        timestamp: new Date(),
        status: 'given',
        granularConsents: {
          'cohort_assignment': true,
          'advertising_personalization': false,
          'analytics_improvement': true
        }
      };

      await consentManager.recordConsent(consentRecord);

      expect(mockStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        `consent_records_${userId}`,
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            userId,
            purposes: consentRecord.purposes,
            granularConsents: consentRecord.granularConsents
          })
        ])
      );
    });

    it('should withdraw consent and handle data implications', async () => {
      const userId = 'withdrawal-user-123';
      const consentId = 'consent-to-withdraw';

      // Mock existing consent
      mockStorageProvider.retrieveEncrypted.mockResolvedValue([
        {
          id: consentId,
          userId,
          purposes: ['cohort_assignment'],
          status: 'given',
          timestamp: new Date()
        }
      ]);

      await consentManager.withdrawConsent(consentId, userId);

      expect(mockStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        `consent_records_${userId}`,
        expect.arrayContaining([
          expect.objectContaining({
            id: consentId,
            status: 'withdrawn',
            withdrawn: true,
            withdrawalDate: expect.any(Date)
          })
        ])
      );

      // Verify data processing implications
      expect(mockStorageProvider.removeEncrypted).toHaveBeenCalledWith(`cohort_data_${userId}`);
    });

    it('should validate consent expiry', async () => {
      const expiredConsent: ConsentRecord = {
        id: 'expired-consent',
        userId: 'test-user',
        purposes: ['cohort_assignment'],
        lawfulBasis: 'consent',
        consentText: 'Test consent',
        consentVersion: '1.0.0',
        timestamp: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000), // 3 years ago
        status: 'given',
        expiryDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // 1 year ago
      };

      // Mock consent retrieval
      mockStorageProvider.retrieveEncrypted.mockResolvedValue([expiredConsent]);

      const isValid = await consentManager.isConsentValid('expired-consent');

      expect(isValid).toBe(false);
    });

    it('should generate consent form with current status', async () => {
      const userId = 'form-user-123';

      // Mock current consent status
      mockStorageProvider.retrieveEncrypted.mockResolvedValue([
        {
          id: 'current-consent',
          userId,
          status: 'given',
          timestamp: new Date(),
          granularConsents: {
            'cohort_assignment': true,
            'advertising_personalization': false
          }
        }
      ]);

      const form = await consentManager.generateConsentForm(userId);

      expect(form.formId).toBeTruthy();
      expect(form.purposes).toBeInstanceOf(Array);
      expect(form.purposes.length).toBeGreaterThan(0);
      expect(form.consentText).toContain('withdraw your consent');
      expect(form.version).toBeTruthy();

      // Check that current status is reflected
      const cohortPurpose = form.purposes.find(p => p.id === 'cohort_assignment');
      expect(cohortPurpose?.currentStatus).toBe(true);

      const adPurpose = form.purposes.find(p => p.id === 'advertising_personalization');
      expect(adPurpose?.currentStatus).toBe(false);
    });
  });

  describe('Data Processing Lawfulness Validation', () => {
    it('should validate lawful processing activities', async () => {
      const processingActivity = {
        purpose: 'Interest-based cohort assignment for privacy-preserving advertising',
        dataTypes: ['browsing_history', 'cohort_assignments'],
        lawfulBasis: 'consent' as DataProcessingLawfulness,
        retentionPeriod: 21
      };

      const validation = await complianceManager.validateDataProcessingLawfulness(processingActivity);

      expect(validation.isLawful).toBe(true);
      expect(validation.lawfulBasis).toBe('consent');
      expect(validation.validationDetails).toBeInstanceOf(Array);
      expect(validation.recommendations).toBeInstanceOf(Array);
    });

    it('should identify unlawful processing activities', async () => {
      const unlawfulActivity = {
        purpose: 'Vague purpose',
        dataTypes: Array.from({ length: 15 }, (_, i) => `dataType${i}`), // Too many data types
        lawfulBasis: 'invalid_basis' as any,
        retentionPeriod: 500 // Too long
      };

      const validation = await complianceManager.validateDataProcessingLawfulness(unlawfulActivity);

      expect(validation.isLawful).toBe(false);
      expect(validation.validationDetails).toContain('Invalid lawful basis specified');
      expect(validation.validationDetails).toContain('Large number of data types may violate data minimization principle');
      expect(validation.recommendations).toContain('Specify a valid GDPR Article 6 lawful basis');
    });

    it('should provide recommendations for improvement', async () => {
      const improvableActivity = {
        purpose: 'Short', // Too short
        dataTypes: ['data1', 'data2'],
        lawfulBasis: 'legitimate_interests' as DataProcessingLawfulness,
        retentionPeriod: 400 // Too long
      };

      const validation = await complianceManager.validateDataProcessingLawfulness(improvableActivity);

      expect(validation.recommendations).toContain('Provide more specific purpose description');
      expect(validation.recommendations).toContain('Consider shorter retention period or provide justification');
    });
  });

  describe('Compliance Audit Logging', () => {
    it('should log all compliance events', async () => {
      const userId = 'audit-test-user';
      const requestId = 'audit-test-request';

      // Perform various compliance operations
      await complianceManager.requestDataAccess(userId, requestId);

      // Verify audit logging
      expect(mockStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        'compliance_audit_logs',
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'DATA_ACCESS_REQUEST',
            eventData: expect.objectContaining({
              userId,
              requestId
            }),
            timestamp: expect.any(Date),
            systemVersion: '1.0.0'
          })
        ])
      );
    });

    it('should handle audit logging failures gracefully', async () => {
      const userId = 'audit-failure-user';
      const requestId = 'audit-failure-request';

      // Mock storage failure for audit logs
      mockStorageProvider.storeEncrypted.mockRejectedValueOnce(new Error('Storage failed'));

      // Should not throw error even if audit logging fails
      await expect(complianceManager.requestDataAccess(userId, requestId)).resolves.toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle storage errors gracefully', async () => {
      const userId = 'error-user';
      const requestId = 'error-request';

      mockStorageProvider.retrieveEncrypted.mockRejectedValue(new Error('Storage error'));

      await expect(complianceManager.requestDataAccess(userId, requestId)).rejects.toThrow();

      // Should log the error
      expect(mockStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        'compliance_audit_logs',
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'DATA_ACCESS_ERROR'
          })
        ])
      );
    });

    it('should validate input parameters', async () => {
      await expect(
        complianceManager.requestDataAccess('', 'request-id')
      ).rejects.toThrow();

      await expect(
        complianceManager.requestDataCorrection('user-id', '', [])
      ).rejects.toThrow();
    });

    it('should handle concurrent requests safely', async () => {
      const userId = 'concurrent-user';
      const requests = Array.from({ length: 5 }, (_, i) => 
        complianceManager.requestDataAccess(userId, `request-${i}`)
      );

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(5);
      responses.forEach((response, index) => {
        expect(response.requestId).toBe(`request-${index}`);
      });
    });
  });

  describe('CCPA Compliance', () => {
    it('should handle CCPA "Do Not Sell" requests', async () => {
      const userId = 'ccpa-user-123';
      
      // Update granular consent to opt out of advertising
      await consentManager.updateGranularConsent(userId, 'advertising_personalization', false);

      expect(mockStorageProvider.storeEncrypted).toHaveBeenCalledWith(
        `advertising_consent_${userId}`,
        expect.objectContaining({
          withdrawn: true,
          date: expect.any(Date)
        })
      );
    });

    it('should provide CCPA-compliant data disclosure', async () => {
      const userId = 'ccpa-disclosure-user';
      const requestId = 'ccpa-disclosure-request';

      const response = await complianceManager.requestDataAccess(userId, requestId);

      // CCPA requires disclosure of categories, sources, and business purposes
      expect(response.dataCategories).toBeInstanceOf(Array);
      expect(response.processingPurposes).toBeInstanceOf(Array);
      expect(response.dataSource).toBeTruthy();
      expect(response.recipients).toBeInstanceOf(Array);
    });
  });
});
