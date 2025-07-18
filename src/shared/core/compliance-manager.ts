import { DataSubjectRights, ConsentRecord, ComplianceAuditLog, DataProcessingLawfulness } from '../interfaces/compliance';
import { UserPreferences, CohortAssignment } from '../interfaces/common';
import { SecureStorageProvider } from '../interfaces/data-storage';
import { PrivacySafeErrorLogger } from './error-handler';

/**
 * GDPR/CCPA Compliance Manager
 * Implements data subject rights, consent management, and compliance audit logging
 */
export class ComplianceManager implements DataSubjectRights {
  private static instance: ComplianceManager;
  private storageProvider: SecureStorageProvider | null = null;
  private errorLogger: PrivacySafeErrorLogger;
  private auditLog: ComplianceAuditLog[] = [];

  private constructor() {
    this.errorLogger = new PrivacySafeErrorLogger();
  }

  public static getInstance(): ComplianceManager {
    if (!ComplianceManager.instance) {
      ComplianceManager.instance = new ComplianceManager();
    }
    return ComplianceManager.instance;
  }

  public async initialize(storageProvider: SecureStorageProvider): Promise<void> {
    this.storageProvider = storageProvider;
    await this.loadAuditLog();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.storageProvider) {
      throw new Error('ComplianceManager not initialized. Call initialize() first.');
    }
  }

  // GDPR Article 15 - Right of Access
  public async requestDataAccess(userId: string, requestId: string): Promise<{
    personalData: any;
    processingPurposes: string[];
    dataCategories: string[];
    recipients: string[];
    retentionPeriod: string;
    dataSource: string;
    requestId: string;
    timestamp: Date;
  }> {
    await this.ensureInitialized();

    try {
      // Collect all personal data
      const cohorts = await this.storageProvider!.retrieveEncrypted('cohort_data') || [];
      const preferences = await this.storageProvider!.retrieveEncrypted('user_preferences') || {};
      const profile = await this.storageProvider!.retrieveEncrypted('user_profile') || {};
      const apiLogs = await this.storageProvider!.retrieveEncrypted('api_request_logs') || [];

      const personalData = {
        cohortAssignments: cohorts,
        userPreferences: preferences,
        userProfile: profile,
        apiRequestHistory: apiLogs.map((log: any) => ({
          timestamp: log.timestamp,
          domain: log.domain,
          cohortsShared: log.cohortsShared,
          userConsent: log.userConsent
        }))
      };

      const accessResponse = {
        personalData,
        processingPurposes: [
          'Interest-based cohort assignment for privacy-preserving advertising',
          'User preference management',
          'Compliance with legal obligations',
          'System security and fraud prevention'
        ],
        dataCategories: [
          'Browsing behavior data (domains visited)',
          'Interest cohort assignments',
          'User preferences and settings',
          'Consent records',
          'Technical data (timestamps, identifiers)'
        ],
        recipients: [
          'Advertising partners (only anonymized cohort IDs)',
          'No third parties receive personal browsing data'
        ],
        retentionPeriod: `${preferences.dataRetentionDays || 21} days`,
        dataSource: 'User browsing activity on local device',
        requestId,
        timestamp: new Date()
      };

      await this.logComplianceEvent('DATA_ACCESS_REQUEST', {
        userId,
        requestId,
        dataCategories: accessResponse.dataCategories.length,
        timestamp: new Date()
      });

      return accessResponse;
    } catch (error) {
      await this.logComplianceEvent('DATA_ACCESS_ERROR', {
        userId,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
      throw error;
    }
  }

  // GDPR Article 16 - Right to Rectification
  public async requestDataCorrection(userId: string, requestId: string, corrections: {
    field: string;
    currentValue: any;
    newValue: any;
    justification: string;
  }[]): Promise<{
    correctionsMade: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      timestamp: Date;
    }>;
    requestId: string;
    status: 'completed' | 'partial' | 'rejected';
  }> {
    await this.ensureInitialized();

    const correctionsMade: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      timestamp: Date;
    }> = [];

    try {
      for (const correction of corrections) {
        const { field, currentValue, newValue, justification } = correction;

        // Validate correction request
        if (!this.isFieldCorrectable(field)) {
          await this.logComplianceEvent('DATA_CORRECTION_REJECTED', {
            userId,
            requestId,
            field,
            reason: 'Field not correctable',
            timestamp: new Date()
          });
          continue;
        }

        // Apply correction based on field type
        let correctionApplied = false;

        if (field.startsWith('preferences.')) {
          const prefField = field.replace('preferences.', '');
          const preferences = await this.storageProvider!.retrieveEncrypted('user_preferences') || {};
          
          if (preferences[prefField] !== undefined) {
            const oldValue = preferences[prefField];
            preferences[prefField] = newValue;
            await this.storageProvider!.storeEncrypted('user_preferences', preferences);
            
            correctionsMade.push({
              field,
              oldValue,
              newValue,
              timestamp: new Date()
            });
            correctionApplied = true;
          }
        }

        if (correctionApplied) {
          await this.logComplianceEvent('DATA_CORRECTION_APPLIED', {
            userId,
            requestId,
            field,
            justification,
            timestamp: new Date()
          });
        }
      }

      const status = correctionsMade.length === corrections.length ? 'completed' :
                    correctionsMade.length > 0 ? 'partial' : 'rejected';

      return {
        correctionsMade,
        requestId,
        status
      };

    } catch (error) {
      await this.logComplianceEvent('DATA_CORRECTION_ERROR', {
        userId,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
      throw error;
    }
  }

  // GDPR Article 17 - Right to Erasure (Right to be Forgotten)
  public async requestDataDeletion(userId: string, requestId: string, deletionScope: {
    deleteAll?: boolean;
    specificData?: string[];
    retainForLegalBasis?: boolean;
  }): Promise<{
    deletedData: string[];
    retainedData: string[];
    deletionDate: Date;
    requestId: string;
    certificateHash: string;
  }> {
    await this.ensureInitialized();

    const deletedData: string[] = [];
    const retainedData: string[] = [];

    try {
      if (deletionScope.deleteAll) {
        // Complete data deletion
        const dataTypes = ['cohort_data', 'user_preferences', 'user_profile', 'api_request_logs'];
        
        for (const dataType of dataTypes) {
          try {
            await this.storageProvider!.removeEncrypted(dataType);
            deletedData.push(dataType);
          } catch (error) {
            retainedData.push(dataType);
          }
        }

        // Retain compliance audit logs for legal basis
        if (deletionScope.retainForLegalBasis) {
          retainedData.push('compliance_audit_logs');
        } else {
          await this.storageProvider!.removeEncrypted('compliance_audit_logs');
          deletedData.push('compliance_audit_logs');
        }
      } else if (deletionScope.specificData) {
        // Selective data deletion
        for (const dataType of deletionScope.specificData) {
          try {
            await this.storageProvider!.removeEncrypted(dataType);
            deletedData.push(dataType);
          } catch (error) {
            retainedData.push(dataType);
          }
        }
      }

      const deletionDate = new Date();
      
      // Generate deletion certificate hash
      const certificateData = {
        userId,
        requestId,
        deletedData,
        deletionDate: deletionDate.toISOString(),
        systemVersion: '1.0.0'
      };
      
      const certificateHash = await this.generateDeletionCertificate(certificateData);

      await this.logComplianceEvent('DATA_DELETION_COMPLETED', {
        userId,
        requestId,
        deletedData,
        retainedData,
        certificateHash,
        timestamp: deletionDate
      });

      return {
        deletedData,
        retainedData,
        deletionDate,
        requestId,
        certificateHash
      };

    } catch (error) {
      await this.logComplianceEvent('DATA_DELETION_ERROR', {
        userId,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
      throw error;
    }
  }

  // GDPR Article 20 - Right to Data Portability
  public async requestDataPortability(userId: string, requestId: string, format: 'json' | 'csv' | 'xml'): Promise<{
    exportData: string;
    format: string;
    exportDate: Date;
    requestId: string;
    checksum: string;
  }> {
    await this.ensureInitialized();

    try {
      const accessData = await this.requestDataAccess(userId, requestId);
      
      let exportData: string;
      let checksum: string;

      switch (format) {
        case 'json':
          exportData = JSON.stringify(accessData.personalData, null, 2);
          break;
        case 'csv':
          exportData = this.convertToCSV(accessData.personalData);
          break;
        case 'xml':
          exportData = this.convertToXML(accessData.personalData);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      checksum = await this.generateChecksum(exportData);

      await this.logComplianceEvent('DATA_PORTABILITY_REQUEST', {
        userId,
        requestId,
        format,
        dataSize: exportData.length,
        checksum,
        timestamp: new Date()
      });

      return {
        exportData,
        format,
        exportDate: new Date(),
        requestId,
        checksum
      };

    } catch (error) {
      await this.logComplianceEvent('DATA_PORTABILITY_ERROR', {
        userId,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
      throw error;
    }
  }

  // Consent Management
  public async recordConsent(consentRecord: ConsentRecord): Promise<void> {
    await this.ensureInitialized();

    try {
      const existingConsents = await this.storageProvider!.retrieveEncrypted('consent_records') || [];
      existingConsents.push({
        ...consentRecord,
        timestamp: new Date(),
        id: this.generateConsentId()
      });

      await this.storageProvider!.storeEncrypted('consent_records', existingConsents);

      await this.logComplianceEvent('CONSENT_RECORDED', {
        consentId: consentRecord.id,
        purposes: consentRecord.purposes,
        lawfulBasis: consentRecord.lawfulBasis,
        timestamp: new Date()
      });

    } catch (error) {
      await this.logComplianceEvent('CONSENT_RECORDING_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
      throw error;
    }
  }

  public async withdrawConsent(consentId: string, userId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const consents = await this.storageProvider!.retrieveEncrypted('consent_records') || [];
      const updatedConsents = consents.map((consent: ConsentRecord) => {
        if (consent.id === consentId) {
          return {
            ...consent,
            withdrawn: true,
            withdrawalDate: new Date(),
            status: 'withdrawn' as const
          };
        }
        return consent;
      });

      await this.storageProvider!.storeEncrypted('consent_records', updatedConsents);

      await this.logComplianceEvent('CONSENT_WITHDRAWN', {
        consentId,
        userId,
        timestamp: new Date()
      });

    } catch (error) {
      await this.logComplianceEvent('CONSENT_WITHDRAWAL_ERROR', {
        consentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
      throw error;
    }
  }

  // Data Processing Lawfulness Validation
  public async validateDataProcessingLawfulness(processingActivity: {
    purpose: string;
    dataTypes: string[];
    lawfulBasis: DataProcessingLawfulness;
    retentionPeriod: number;
  }): Promise<{
    isLawful: boolean;
    lawfulBasis: DataProcessingLawfulness;
    validationDetails: string[];
    recommendations: string[];
  }> {
    const validationDetails: string[] = [];
    const recommendations: string[] = [];
    let isLawful = true;

    // Validate lawful basis
    if (!this.isValidLawfulBasis(processingActivity.lawfulBasis)) {
      isLawful = false;
      validationDetails.push('Invalid lawful basis specified');
      recommendations.push('Specify a valid GDPR Article 6 lawful basis');
    }

    // Validate data minimization
    if (processingActivity.dataTypes.length > 10) {
      validationDetails.push('Large number of data types may violate data minimization principle');
      recommendations.push('Review data types and collect only necessary data');
    }

    // Validate retention period
    if (processingActivity.retentionPeriod > 365) {
      validationDetails.push('Retention period exceeds recommended maximum');
      recommendations.push('Consider shorter retention period or provide justification');
    }

    // Validate purpose limitation
    if (processingActivity.purpose.length < 10) {
      validationDetails.push('Processing purpose description too vague');
      recommendations.push('Provide more specific purpose description');
    }

    await this.logComplianceEvent('LAWFULNESS_VALIDATION', {
      purpose: processingActivity.purpose,
      lawfulBasis: processingActivity.lawfulBasis,
      isLawful,
      timestamp: new Date()
    });

    return {
      isLawful,
      lawfulBasis: processingActivity.lawfulBasis,
      validationDetails,
      recommendations
    };
  }

  // Compliance Audit Logging
  private async logComplianceEvent(eventType: string, eventData: any): Promise<void> {
    const auditEntry: ComplianceAuditLog = {
      id: this.generateAuditId(),
      timestamp: new Date(),
      eventType,
      eventData,
      systemVersion: '1.0.0',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server',
      ipAddress: 'local', // Local processing, no IP tracking
      sessionId: this.generateSessionId()
    };

    this.auditLog.push(auditEntry);

    // Persist audit log
    if (this.storageProvider) {
      try {
        await this.storageProvider.storeEncrypted('compliance_audit_logs', this.auditLog);
      } catch (error) {
        this.errorLogger.logError('AUDIT_LOG_STORAGE_FAILED', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  private async loadAuditLog(): Promise<void> {
    if (this.storageProvider) {
      try {
        this.auditLog = await this.storageProvider.retrieveEncrypted('compliance_audit_logs') || [];
      } catch (error) {
        this.auditLog = [];
      }
    }
  }

  // Helper methods
  private isFieldCorrectable(field: string): boolean {
    const correctableFields = [
      'preferences.cohortsEnabled',
      'preferences.shareWithAdvertisers',
      'preferences.dataRetentionDays',
      'preferences.disabledTopics'
    ];
    return correctableFields.includes(field);
  }

  private isValidLawfulBasis(basis: DataProcessingLawfulness): boolean {
    const validBases: DataProcessingLawfulness[] = [
      'consent',
      'contract',
      'legal_obligation',
      'vital_interests',
      'public_task',
      'legitimate_interests'
    ];
    return validBases.includes(basis);
  }

  private async generateDeletionCertificate(data: any): Promise<string> {
    const dataString = JSON.stringify(data);
    // Simple hash for demonstration - in production, use proper cryptographic hash
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `CERT-${Math.abs(hash).toString(16).toUpperCase()}`;
  }

  private async generateChecksum(data: string): Promise<string> {
    // Simple checksum for demonstration
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum += data.charCodeAt(i);
    }
    return checksum.toString(16).toUpperCase();
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion - in production, use proper CSV library
    const rows: string[] = [];
    
    const flattenObject = (obj: any, prefix = ''): any => {
      const flattened: any = {};
      for (const key in obj) {
        if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          Object.assign(flattened, flattenObject(obj[key], `${prefix}${key}.`));
        } else {
          flattened[`${prefix}${key}`] = obj[key];
        }
      }
      return flattened;
    };

    const flattened = flattenObject(data);
    const headers = Object.keys(flattened);
    rows.push(headers.join(','));
    rows.push(headers.map(header => flattened[header]).join(','));

    return rows.join('\n');
  }

  private convertToXML(data: any): string {
    // Simple XML conversion - in production, use proper XML library
    const convertValue = (value: any, key: string): string => {
      if (value === null || value === undefined) {
        return `<${key}></${key}>`;
      }
      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          return `<${key}>${value.map((item, index) => convertValue(item, `item_${index}`)).join('')}</${key}>`;
        } else {
          const inner = Object.entries(value).map(([k, v]) => convertValue(v, k)).join('');
          return `<${key}>${inner}</${key}>`;
        }
      }
      return `<${key}>${String(value)}</${key}>`;
    };

    return `<?xml version="1.0" encoding="UTF-8"?>\n<export>${convertValue(data, 'data')}</export>`;
  }

  private generateConsentId(): string {
    return `CONSENT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAuditId(): string {
    return `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `SESSION-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
