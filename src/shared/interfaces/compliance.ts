// GDPR/CCPA Compliance Interfaces

export type DataProcessingLawfulness = 
  | 'consent'              // GDPR Article 6(1)(a) - Consent
  | 'contract'             // GDPR Article 6(1)(b) - Contract performance
  | 'legal_obligation'     // GDPR Article 6(1)(c) - Legal obligation
  | 'vital_interests'      // GDPR Article 6(1)(d) - Vital interests
  | 'public_task'          // GDPR Article 6(1)(e) - Public task
  | 'legitimate_interests'; // GDPR Article 6(1)(f) - Legitimate interests

export type ConsentStatus = 'given' | 'withdrawn' | 'expired' | 'pending';

export type DataSubjectRightType = 
  | 'access'        // GDPR Article 15 - Right of access
  | 'rectification' // GDPR Article 16 - Right to rectification
  | 'erasure'       // GDPR Article 17 - Right to erasure
  | 'restriction'   // GDPR Article 18 - Right to restriction
  | 'portability'   // GDPR Article 20 - Right to data portability
  | 'objection';    // GDPR Article 21 - Right to object

export interface ConsentRecord {
  id: string;
  userId: string;
  purposes: string[];
  lawfulBasis: DataProcessingLawfulness;
  consentText: string;
  consentVersion: string;
  timestamp: Date;
  expiryDate?: Date;
  status: ConsentStatus;
  withdrawn?: boolean;
  withdrawalDate?: Date;
  ipAddress?: string; // For audit purposes only
  userAgent?: string; // For audit purposes only
  granularConsents?: {
    [purpose: string]: boolean;
  };
}

export interface DataSubjectRequest {
  id: string;
  userId: string;
  requestType: DataSubjectRightType;
  requestDate: Date;
  requestDetails: any;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  completionDate?: Date;
  responseData?: any;
  rejectionReason?: string;
  verificationMethod: 'email' | 'identity_document' | 'two_factor';
  verificationCompleted: boolean;
}

export interface ComplianceAuditLog {
  id: string;
  timestamp: Date;
  eventType: string;
  eventData: any;
  userId?: string;
  systemVersion: string;
  userAgent: string;
  ipAddress: string;
  sessionId: string;
}

export interface DataProcessingRecord {
  id: string;
  purpose: string;
  lawfulBasis: DataProcessingLawfulness;
  dataCategories: string[];
  dataSubjects: string[];
  recipients: string[];
  thirdCountryTransfers?: {
    country: string;
    adequacyDecision: boolean;
    safeguards: string[];
  }[];
  retentionPeriod: number; // in days
  securityMeasures: string[];
  createdDate: Date;
  lastReviewed: Date;
}

export interface PrivacyImpactAssessment {
  id: string;
  processingActivity: string;
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];
  mitigationMeasures: string[];
  residualRisk: 'low' | 'medium' | 'high';
  reviewDate: Date;
  approvedBy: string;
  approvalDate: Date;
}

export interface DataBreachRecord {
  id: string;
  incidentDate: Date;
  discoveryDate: Date;
  reportingDate: Date;
  breachType: 'confidentiality' | 'integrity' | 'availability';
  affectedDataTypes: string[];
  affectedDataSubjects: number;
  riskLevel: 'low' | 'medium' | 'high';
  notificationRequired: boolean;
  supervisoryAuthorityNotified: boolean;
  dataSubjectsNotified: boolean;
  containmentMeasures: string[];
  status: 'open' | 'investigating' | 'contained' | 'resolved';
}

// GDPR Article 15 - Right of Access
export interface DataAccessResponse {
  personalData: any;
  processingPurposes: string[];
  dataCategories: string[];
  recipients: string[];
  retentionPeriod: string;
  dataSource: string;
  requestId: string;
  timestamp: Date;
  thirdCountryTransfers?: {
    country: string;
    safeguards: string[];
  }[];
  automatedDecisionMaking?: {
    exists: boolean;
    logic?: string;
    significance?: string;
  };
}

// GDPR Article 16 - Right to Rectification
export interface DataRectificationRequest {
  requestId: string;
  corrections: Array<{
    field: string;
    currentValue: any;
    newValue: any;
    justification: string;
  }>;
}

export interface DataRectificationResponse {
  correctionsMade: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    timestamp: Date;
  }>;
  requestId: string;
  status: 'completed' | 'partial' | 'rejected';
  rejectionReasons?: string[];
}

// GDPR Article 17 - Right to Erasure
export interface DataErasureRequest {
  requestId: string;
  erasureGrounds: 
    | 'no_longer_necessary'     // Article 17(1)(a)
    | 'consent_withdrawn'       // Article 17(1)(b)
    | 'unlawful_processing'     // Article 17(1)(d)
    | 'legal_obligation'        // Article 17(1)(c)
    | 'child_consent';          // Article 17(1)(f)
  specificData?: string[];
  retainForLegalBasis?: boolean;
}

export interface DataErasureResponse {
  deletedData: string[];
  retainedData: string[];
  retentionReasons?: string[];
  deletionDate: Date;
  requestId: string;
  certificateHash: string;
}

// GDPR Article 20 - Right to Data Portability
export interface DataPortabilityRequest {
  requestId: string;
  format: 'json' | 'csv' | 'xml';
  dataTypes?: string[];
}

export interface DataPortabilityResponse {
  exportData: string;
  format: string;
  exportDate: Date;
  requestId: string;
  checksum: string;
  dataTypes: string[];
}

// CCPA Specific Interfaces
export interface CCPAConsumerRequest {
  id: string;
  consumerId: string;
  requestType: 'know' | 'delete' | 'opt_out';
  requestDate: Date;
  verificationMethod: 'email' | 'phone' | 'identity_document';
  verificationStatus: 'pending' | 'verified' | 'failed';
  status: 'pending' | 'processing' | 'completed' | 'denied';
  responseDate?: Date;
  denialReason?: string;
}

export interface CCPADataDisclosure {
  categories: string[];
  sources: string[];
  businessPurposes: string[];
  thirdParties: string[];
  soldToThirdParties: boolean;
  retentionPeriod: string;
}

// Data Subject Rights Interface
export interface DataSubjectRights {
  // GDPR Article 15 - Right of Access
  requestDataAccess(userId: string, requestId: string): Promise<DataAccessResponse>;
  
  // GDPR Article 16 - Right to Rectification
  requestDataCorrection(
    userId: string, 
    requestId: string, 
    corrections: DataRectificationRequest['corrections']
  ): Promise<DataRectificationResponse>;
  
  // GDPR Article 17 - Right to Erasure
  requestDataDeletion(
    userId: string, 
    requestId: string, 
    deletionScope: DataErasureRequest
  ): Promise<DataErasureResponse>;
  
  // GDPR Article 20 - Right to Data Portability
  requestDataPortability(
    userId: string, 
    requestId: string, 
    format: 'json' | 'csv' | 'xml'
  ): Promise<DataPortabilityResponse>;
}

// Consent Management Interface
export interface ConsentManager {
  recordConsent(consentRecord: ConsentRecord): Promise<void>;
  withdrawConsent(consentId: string, userId: string): Promise<void>;
  getConsentHistory(userId: string): Promise<ConsentRecord[]>;
  isConsentValid(consentId: string): Promise<boolean>;
  renewConsent(consentId: string, newConsentRecord: ConsentRecord): Promise<void>;
}

// Compliance Validation Interface
export interface ComplianceValidator {
  validateDataProcessingLawfulness(processingActivity: DataProcessingRecord): Promise<{
    isLawful: boolean;
    lawfulBasis: DataProcessingLawfulness;
    validationDetails: string[];
    recommendations: string[];
  }>;
  
  validateDataMinimization(dataCollection: {
    purpose: string;
    dataTypes: string[];
    necessity: { [dataType: string]: string };
  }): Promise<{
    isCompliant: boolean;
    unnecessaryData: string[];
    recommendations: string[];
  }>;
  
  validateRetentionPeriod(dataType: string, retentionPeriod: number, purpose: string): Promise<{
    isCompliant: boolean;
    recommendedPeriod: number;
    justification: string;
  }>;
  
  performPrivacyImpactAssessment(processingActivity: DataProcessingRecord): Promise<PrivacyImpactAssessment>;
}

// Audit and Monitoring Interface
export interface ComplianceAuditor {
  logComplianceEvent(eventType: string, eventData: any): Promise<void>;
  getAuditLog(startDate: Date, endDate: Date): Promise<ComplianceAuditLog[]>;
  generateComplianceReport(period: { start: Date; end: Date }): Promise<{
    totalRequests: number;
    requestsByType: { [type: string]: number };
    averageResponseTime: number;
    complianceRate: number;
    issues: string[];
  }>;
  monitorDataProcessingActivities(): Promise<{
    activities: DataProcessingRecord[];
    complianceStatus: { [activityId: string]: boolean };
    recommendations: string[];
  }>;
}

// Data Protection Officer Interface
export interface DataProtectionOfficer {
  reviewDataProcessingActivity(activityId: string): Promise<{
    approved: boolean;
    conditions?: string[];
    recommendations?: string[];
  }>;
  
  handleDataSubjectComplaint(complaint: {
    complainantId: string;
    complaintType: string;
    description: string;
    evidence?: any[];
  }): Promise<{
    caseId: string;
    status: 'investigating' | 'resolved' | 'escalated';
    resolution?: string;
  }>;
  
  conductPrivacyTraining(): Promise<{
    trainingId: string;
    completionRate: number;
    assessmentResults: { [userId: string]: number };
  }>;
}

export interface ComplianceConfiguration {
  jurisdiction: 'GDPR' | 'CCPA' | 'BOTH';
  dataRetentionDefaults: { [dataType: string]: number };
  consentExpiryPeriod: number; // days
  dataSubjectRequestDeadline: number; // days
  supervisoryAuthority: {
    name: string;
    contactInfo: string;
    reportingEndpoint?: string;
  };
  dataProtectionOfficer?: {
    name: string;
    contactInfo: string;
  };
  privacyPolicyVersion: string;
  lastUpdated: Date;
}
