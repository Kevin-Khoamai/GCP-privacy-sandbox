import { ConsentRecord, ConsentStatus, DataProcessingLawfulness, ConsentManager } from '../interfaces/compliance';
import { SecureStorageProvider } from '../interfaces/data-storage';
import { PrivacySafeErrorLogger } from './error-handler';

/**
 * Granular Consent Management System
 * Implements GDPR-compliant consent collection, storage, and management
 */
export class GranularConsentManager implements ConsentManager {
  private static instance: GranularConsentManager;
  private storageProvider: SecureStorageProvider | null = null;
  private errorLogger: PrivacySafeErrorLogger;

  // Consent purposes and their descriptions
  private readonly CONSENT_PURPOSES = {
    'cohort_assignment': {
      name: 'Interest Cohort Assignment',
      description: 'Analyze your browsing patterns to assign you to interest-based cohorts for privacy-preserving advertising',
      lawfulBasis: 'consent' as DataProcessingLawfulness,
      required: false,
      dataTypes: ['browsing_history', 'domain_visits', 'cohort_assignments']
    },
    'advertising_personalization': {
      name: 'Advertising Personalization',
      description: 'Share your cohort assignments with advertising partners to show more relevant ads',
      lawfulBasis: 'consent' as DataProcessingLawfulness,
      required: false,
      dataTypes: ['cohort_ids', 'advertising_metrics']
    },
    'analytics_improvement': {
      name: 'System Analytics and Improvement',
      description: 'Collect anonymized usage statistics to improve the privacy cohort system',
      lawfulBasis: 'legitimate_interests' as DataProcessingLawfulness,
      required: false,
      dataTypes: ['usage_statistics', 'performance_metrics']
    },
    'security_monitoring': {
      name: 'Security and Fraud Prevention',
      description: 'Monitor for security threats and prevent fraudulent use of the system',
      lawfulBasis: 'legitimate_interests' as DataProcessingLawfulness,
      required: true,
      dataTypes: ['security_logs', 'error_reports']
    },
    'legal_compliance': {
      name: 'Legal Compliance',
      description: 'Maintain records required by law and respond to legal requests',
      lawfulBasis: 'legal_obligation' as DataProcessingLawfulness,
      required: true,
      dataTypes: ['audit_logs', 'compliance_records']
    }
  };

  private constructor() {
    this.errorLogger = new PrivacySafeErrorLogger();
  }

  public static getInstance(): GranularConsentManager {
    if (!GranularConsentManager.instance) {
      GranularConsentManager.instance = new GranularConsentManager();
    }
    return GranularConsentManager.instance;
  }

  public async initialize(storageProvider: SecureStorageProvider): Promise<void> {
    this.storageProvider = storageProvider;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.storageProvider) {
      throw new Error('ConsentManager not initialized. Call initialize() first.');
    }
  }

  public async recordConsent(consentRecord: ConsentRecord): Promise<void> {
    await this.ensureInitialized();

    try {
      // Validate consent record
      this.validateConsentRecord(consentRecord);

      // Add system-generated fields
      const enhancedRecord: ConsentRecord = {
        ...consentRecord,
        id: consentRecord.id || this.generateConsentId(),
        timestamp: new Date(),
        status: 'given',
        consentVersion: this.getCurrentConsentVersion(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
      };

      // Store consent record
      const existingConsents = await this.getConsentHistory(consentRecord.userId);
      const updatedConsents = [...existingConsents, enhancedRecord];
      
      await this.storageProvider!.storeEncrypted(`consent_records_${consentRecord.userId}`, updatedConsents);

      // Log consent event
      await this.logConsentEvent('CONSENT_GIVEN', {
        consentId: enhancedRecord.id,
        userId: consentRecord.userId,
        purposes: consentRecord.purposes,
        lawfulBasis: consentRecord.lawfulBasis,
        granularConsents: consentRecord.granularConsents
      });

    } catch (error) {
      this.errorLogger.logError('CONSENT_RECORDING_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  public async withdrawConsent(consentId: string, userId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const consents = await this.getConsentHistory(userId);
      const consentIndex = consents.findIndex(c => c.id === consentId);

      if (consentIndex === -1) {
        throw new Error(`Consent record ${consentId} not found for user ${userId}`);
      }

      // Mark consent as withdrawn
      consents[consentIndex] = {
        ...consents[consentIndex],
        status: 'withdrawn',
        withdrawn: true,
        withdrawalDate: new Date()
      };

      await this.storageProvider!.storeEncrypted(`consent_records_${userId}`, consents);

      // Handle data processing implications
      await this.handleConsentWithdrawal(consents[consentIndex]);

      // Log withdrawal event
      await this.logConsentEvent('CONSENT_WITHDRAWN', {
        consentId,
        userId,
        withdrawalDate: new Date(),
        purposes: consents[consentIndex].purposes
      });

    } catch (error) {
      this.errorLogger.logError('CONSENT_WITHDRAWAL_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  public async getConsentHistory(userId: string): Promise<ConsentRecord[]> {
    await this.ensureInitialized();

    try {
      return await this.storageProvider!.retrieveEncrypted(`consent_records_${userId}`) || [];
    } catch (error) {
      this.errorLogger.logError('CONSENT_HISTORY_RETRIEVAL_FAILED', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  public async isConsentValid(consentId: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      // Find consent record across all users (in production, this would be more efficient)
      const allUsers = await this.getAllUserIds();
      
      for (const userId of allUsers) {
        const consents = await this.getConsentHistory(userId);
        const consent = consents.find(c => c.id === consentId);
        
        if (consent) {
          return this.isConsentRecordValid(consent);
        }
      }

      return false;
    } catch (error) {
      this.errorLogger.logError('CONSENT_VALIDATION_FAILED', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  public async renewConsent(consentId: string, newConsentRecord: ConsentRecord): Promise<void> {
    await this.ensureInitialized();

    try {
      // Withdraw old consent
      await this.withdrawConsent(consentId, newConsentRecord.userId);

      // Record new consent
      await this.recordConsent({
        ...newConsentRecord,
        id: this.generateConsentId() // Generate new ID for renewed consent
      });

      // Log renewal event
      await this.logConsentEvent('CONSENT_RENEWED', {
        oldConsentId: consentId,
        newConsentId: newConsentRecord.id,
        userId: newConsentRecord.userId,
        purposes: newConsentRecord.purposes
      });

    } catch (error) {
      this.errorLogger.logError('CONSENT_RENEWAL_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // Granular consent management
  public async updateGranularConsent(userId: string, purpose: string, granted: boolean): Promise<void> {
    await this.ensureInitialized();

    try {
      const consents = await this.getConsentHistory(userId);
      const activeConsent = consents.find(c => c.status === 'given' && !c.withdrawn);

      if (!activeConsent) {
        throw new Error('No active consent found for user');
      }

      // Update granular consent
      if (!activeConsent.granularConsents) {
        activeConsent.granularConsents = {};
      }

      activeConsent.granularConsents[purpose] = granted;

      // Save updated consent
      const updatedConsents = consents.map(c => c.id === activeConsent.id ? activeConsent : c);
      await this.storageProvider!.storeEncrypted(`consent_records_${userId}`, updatedConsents);

      // Handle data processing implications
      if (!granted) {
        await this.handlePurposeWithdrawal(userId, purpose);
      }

      // Log granular consent change
      await this.logConsentEvent('GRANULAR_CONSENT_UPDATED', {
        consentId: activeConsent.id,
        userId,
        purpose,
        granted,
        timestamp: new Date()
      });

    } catch (error) {
      this.errorLogger.logError('GRANULAR_CONSENT_UPDATE_FAILED', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  public async getConsentStatus(userId: string): Promise<{
    hasValidConsent: boolean;
    consentDetails: {
      [purpose: string]: {
        granted: boolean;
        required: boolean;
        lawfulBasis: DataProcessingLawfulness;
        description: string;
      };
    };
    lastConsentDate?: Date;
    expiryDate?: Date;
  }> {
    await this.ensureInitialized();

    try {
      const consents = await this.getConsentHistory(userId);
      const activeConsent = consents.find(c => c.status === 'given' && !c.withdrawn && this.isConsentRecordValid(c));

      const consentDetails: any = {};

      // Initialize all purposes
      for (const [purposeKey, purposeInfo] of Object.entries(this.CONSENT_PURPOSES)) {
        consentDetails[purposeKey] = {
          granted: false,
          required: purposeInfo.required,
          lawfulBasis: purposeInfo.lawfulBasis,
          description: purposeInfo.description
        };
      }

      if (activeConsent) {
        // Update with actual consent status
        if (activeConsent.granularConsents) {
          for (const [purpose, granted] of Object.entries(activeConsent.granularConsents)) {
            if (consentDetails[purpose]) {
              consentDetails[purpose].granted = granted;
            }
          }
        }

        return {
          hasValidConsent: true,
          consentDetails,
          lastConsentDate: activeConsent.timestamp,
          expiryDate: activeConsent.expiryDate
        };
      }

      return {
        hasValidConsent: false,
        consentDetails
      };

    } catch (error) {
      this.errorLogger.logError('CONSENT_STATUS_RETRIEVAL_FAILED', error instanceof Error ? error.message : 'Unknown error');
      return {
        hasValidConsent: false,
        consentDetails: {}
      };
    }
  }

  public async generateConsentForm(userId: string): Promise<{
    formId: string;
    purposes: Array<{
      id: string;
      name: string;
      description: string;
      required: boolean;
      lawfulBasis: DataProcessingLawfulness;
      dataTypes: string[];
      currentStatus?: boolean;
    }>;
    consentText: string;
    version: string;
  }> {
    const currentStatus = await this.getConsentStatus(userId);
    
    const purposes = Object.entries(this.CONSENT_PURPOSES).map(([id, info]) => ({
      id,
      name: info.name,
      description: info.description,
      required: info.required,
      lawfulBasis: info.lawfulBasis,
      dataTypes: info.dataTypes,
      currentStatus: currentStatus.consentDetails[id]?.granted || false
    }));

    const consentText = this.generateConsentText();

    return {
      formId: this.generateFormId(),
      purposes,
      consentText,
      version: this.getCurrentConsentVersion()
    };
  }

  // Helper methods
  private validateConsentRecord(record: ConsentRecord): void {
    if (!record.userId) {
      throw new Error('User ID is required for consent record');
    }

    if (!record.purposes || record.purposes.length === 0) {
      throw new Error('At least one purpose must be specified');
    }

    if (!record.consentText || record.consentText.trim().length === 0) {
      throw new Error('Consent text is required');
    }

    if (!record.lawfulBasis) {
      throw new Error('Lawful basis is required');
    }
  }

  private isConsentRecordValid(consent: ConsentRecord): boolean {
    if (consent.status !== 'given' || consent.withdrawn) {
      return false;
    }

    if (consent.expiryDate && new Date() > consent.expiryDate) {
      return false;
    }

    // Check if consent is older than maximum allowed period (2 years for GDPR)
    const maxAge = 2 * 365 * 24 * 60 * 60 * 1000; // 2 years in milliseconds
    if (new Date().getTime() - consent.timestamp.getTime() > maxAge) {
      return false;
    }

    return true;
  }

  private async handleConsentWithdrawal(consent: ConsentRecord): Promise<void> {
    // Handle data processing implications of consent withdrawal
    for (const purpose of consent.purposes) {
      await this.handlePurposeWithdrawal(consent.userId, purpose);
    }
  }

  private async handlePurposeWithdrawal(userId: string, purpose: string): Promise<void> {
    // Implement purpose-specific data handling
    switch (purpose) {
      case 'cohort_assignment':
        // Stop cohort assignment and clear existing cohorts
        await this.storageProvider!.removeEncrypted(`cohort_data_${userId}`);
        break;
      
      case 'advertising_personalization':
        // Stop sharing cohort data with advertisers
        await this.storageProvider!.storeEncrypted(`advertising_consent_${userId}`, { withdrawn: true, date: new Date() });
        break;
      
      case 'analytics_improvement':
        // Stop collecting analytics data
        await this.storageProvider!.storeEncrypted(`analytics_consent_${userId}`, { withdrawn: true, date: new Date() });
        break;
    }
  }

  private async getAllUserIds(): Promise<string[]> {
    // In a real implementation, this would be more efficient
    // For now, return empty array as we don't have a user registry
    return [];
  }

  private generateConsentText(): string {
    return `
By clicking "I Agree", you consent to the processing of your personal data for the purposes selected above.

Your Rights:
• You can withdraw your consent at any time
• You have the right to access your personal data
• You have the right to rectify inaccurate data
• You have the right to erase your data
• You have the right to data portability
• You have the right to object to processing

Data Controller: Privacy Cohort Tracker
Contact: privacy@cohorttracker.com

This consent is valid for 2 years from the date given, unless withdrawn earlier.
    `.trim();
  }

  private getCurrentConsentVersion(): string {
    return '2.0.0'; // Version should be updated when consent requirements change
  }

  private generateConsentId(): string {
    return `CONSENT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFormId(): string {
    return `FORM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async logConsentEvent(eventType: string, eventData: any): Promise<void> {
    try {
      const auditEntry = {
        id: `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        eventType,
        eventData,
        systemVersion: '1.0.0'
      };

      const existingLogs = await this.storageProvider!.retrieveEncrypted('consent_audit_logs') || [];
      existingLogs.push(auditEntry);

      // Keep only last 1000 entries to prevent storage bloat
      if (existingLogs.length > 1000) {
        existingLogs.splice(0, existingLogs.length - 1000);
      }

      await this.storageProvider!.storeEncrypted('consent_audit_logs', existingLogs);
    } catch (error) {
      this.errorLogger.logError('CONSENT_AUDIT_LOG_FAILED', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
