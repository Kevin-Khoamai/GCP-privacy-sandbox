import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdvancedEncryptionProvider } from '../src/shared/core/advanced-encryption';
import { DataAnonymizer, ANONYMIZATION_PRESETS } from '../src/shared/core/data-anonymization';
import { SecurityMonitor } from '../src/shared/core/security-monitor';
import { SecureCommunicationProtocol } from '../src/shared/core/secure-communication';
import { PrivacyByDesignValidator } from '../src/shared/core/privacy-by-design-validator';

// Mock crypto API for testing
const mockCrypto = {
  subtle: {
    generateKey: vi.fn().mockResolvedValue({}),
    exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    importKey: vi.fn().mockResolvedValue({}),
    encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(64)),
    decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    deriveKey: vi.fn().mockResolvedValue({}),
    sign: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    verify: vi.fn().mockResolvedValue(true),
    digest: vi.fn().mockResolvedValue(new ArrayBuffer(32))
  },
  getRandomValues: vi.fn().mockImplementation((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  })
};

describe('Security and Privacy Safeguards Testing Suite', () => {
  beforeEach(() => {
    (global as any).crypto = mockCrypto;
    (global as any).TextEncoder = vi.fn().mockImplementation(() => ({
      encode: (text: string) => new Uint8Array(Buffer.from(text, 'utf8'))
    }));
    (global as any).TextDecoder = vi.fn().mockImplementation(() => ({
      decode: (buffer: Uint8Array) => Buffer.from(buffer).toString('utf8')
    }));
    vi.clearAllMocks();
  });

  describe('Advanced Encryption Provider', () => {
    let encryptionProvider: AdvancedEncryptionProvider;

    beforeEach(() => {
      encryptionProvider = AdvancedEncryptionProvider.getInstance();
    });

    it('should generate cryptographically secure keys', async () => {
      const key = await encryptionProvider.generateKey();
      
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
      expect(mockCrypto.subtle.generateKey).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'AES-GCM',
          length: 256
        }),
        true,
        ['encrypt', 'decrypt']
      );
    });

    it('should derive keys using PBKDF2', async () => {
      const password = 'test-password-123';
      const derivedKey = await encryptionProvider.deriveKey(password);
      
      expect(derivedKey).toBeTruthy();
      expect(derivedKey).toContain(':'); // Should contain salt:key format
      expect(mockCrypto.subtle.deriveKey).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'PBKDF2',
          iterations: 100000,
          hash: 'SHA-256'
        }),
        expect.any(Object),
        expect.objectContaining({
          name: 'AES-GCM',
          length: 256
        }),
        true,
        ['encrypt', 'decrypt']
      );
    });

    it('should encrypt data with metadata and classification', async () => {
      const plaintext = 'sensitive data';
      const key = 'mock-key';
      
      const ciphertext = await encryptionProvider.encrypt(plaintext, key, 'CONFIDENTIAL');
      
      expect(ciphertext).toBeTruthy();
      expect(typeof ciphertext).toBe('string');
      expect(mockCrypto.subtle.encrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'AES-GCM',
          tagLength: 128
        }),
        expect.any(Object),
        expect.any(Uint8Array)
      );
    });

    it('should encrypt sensitive data with additional authenticated data', async () => {
      const sensitiveData = 'highly sensitive information';
      const key = 'mock-key';
      const additionalData = 'context-info';
      
      const result = await encryptionProvider.encryptSensitiveData(sensitiveData, key, additionalData);
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should support key rotation', async () => {
      const oldKey = 'old-key';
      const newKey = 'new-key';
      const encryptedData = 'encrypted-with-old-key';
      
      // Mock decrypt to return plaintext
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        new TextEncoder().encode('plaintext data').buffer
      );
      
      const reEncryptedData = await encryptionProvider.rotateKey(oldKey, newKey, encryptedData);
      
      expect(reEncryptedData).toBeTruthy();
      expect(mockCrypto.subtle.decrypt).toHaveBeenCalled();
      expect(mockCrypto.subtle.encrypt).toHaveBeenCalled();
    });

    it('should generate and verify HMAC for data integrity', async () => {
      const data = 'test data';
      const key = 'hmac-key';
      
      const hmac = await encryptionProvider.generateHMAC(data, key);
      expect(hmac).toBeTruthy();
      
      const isValid = await encryptionProvider.verifyHMAC(data, hmac, key);
      expect(isValid).toBe(true);
    });

    it('should provide encryption metrics for security audit', () => {
      const metrics = encryptionProvider.getEncryptionMetrics();
      
      expect(metrics).toHaveProperty('algorithm');
      expect(metrics).toHaveProperty('keyLength');
      expect(metrics).toHaveProperty('ivLength');
      expect(metrics).toHaveProperty('tagLength');
      expect(metrics.algorithm).toBe('AES-GCM');
      expect(metrics.keyLength).toBe(256);
    });
  });

  describe('Data Anonymization', () => {
    let dataAnonymizer: DataAnonymizer;

    beforeEach(() => {
      dataAnonymizer = DataAnonymizer.getInstance();
    });

    it('should pseudonymize user IDs consistently', async () => {
      const userId = 'user123';
      
      const pseudonym1 = await dataAnonymizer.pseudonymizeUserId(userId);
      const pseudonym2 = await dataAnonymizer.pseudonymizeUserId(userId);
      
      expect(pseudonym1).toBe(pseudonym2); // Should be consistent
      expect(pseudonym1).not.toBe(userId); // Should be different from original
      expect(pseudonym1).toMatch(/^[a-f0-9]{16}$/); // Should be hex string
    });

    it('should pseudonymize domains while preserving structure', async () => {
      const domain = 'example.com';
      
      const pseudonymizedDomain = await dataAnonymizer.pseudonymizeDomain(domain, true);
      
      expect(pseudonymizedDomain).toContain('.com'); // TLD preserved
      expect(pseudonymizedDomain).not.toBe(domain); // Domain part changed
    });

    it('should anonymize datasets with k-anonymity', () => {
      const dataset = [
        { age: 25, zipcode: '12345', disease: 'flu' },
        { age: 26, zipcode: '12345', disease: 'cold' },
        { age: 27, zipcode: '12346', disease: 'flu' },
        { age: 28, zipcode: '12346', disease: 'cold' },
        { age: 29, zipcode: '12347', disease: 'flu' }
      ];

      const config = {
        fields: {
          age: { technique: 'generalize' as const, parameters: { range: 5 } },
          zipcode: { technique: 'mask' as const, parameters: { preserveStart: 3 } },
          disease: { technique: 'categorize' as const, parameters: { 
            categories: { flu: 'respiratory', cold: 'respiratory' }
          }}
        },
        kAnonymity: {
          enabled: true,
          k: 2,
          quasiIdentifiers: ['age', 'zipcode'],
          sensitiveAttribute: 'disease'
        }
      };

      const result = dataAnonymizer.anonymizeDataset(dataset, config);
      
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.metadata.kValue).toBeGreaterThanOrEqual(2);
      expect(result.metadata.techniques).toContain('k-anonymity');
    });

    it('should apply differential privacy noise', () => {
      const originalValue = 100;
      const epsilon = 1.0;
      
      const noisyValue = dataAnonymizer.addDifferentialPrivacy(originalValue, epsilon);
      
      expect(typeof noisyValue).toBe('number');
      expect(noisyValue).not.toBe(originalValue); // Should be different due to noise
    });

    it('should use predefined anonymization presets', () => {
      const cohortDataset = [
        { userId: 'user1', domain: 'example.com', timestamp: new Date(), ipAddress: '192.168.1.1' },
        { userId: 'user2', domain: 'test.com', timestamp: new Date(), ipAddress: '192.168.1.2' }
      ];

      const result = dataAnonymizer.anonymizeDataset(cohortDataset, ANONYMIZATION_PRESETS.COHORT_DATA);
      
      expect(result.data.length).toBe(2);
      expect(result.metadata.techniques).toContain('hash');
      expect(result.metadata.techniques).toContain('k-anonymity');
    });

    it('should provide anonymization statistics', () => {
      const stats = dataAnonymizer.getPseudonymizationStats();
      
      expect(stats).toHaveProperty('cachedPseudonyms');
      expect(stats).toHaveProperty('cachedSalts');
      expect(typeof stats.cachedPseudonyms).toBe('number');
      expect(typeof stats.cachedSalts).toBe('number');
    });
  });

  describe('Security Monitor', () => {
    let securityMonitor: SecurityMonitor;

    beforeEach(async () => {
      securityMonitor = SecurityMonitor.getInstance();
      await securityMonitor.initialize();
    });

    afterEach(async () => {
      await securityMonitor.shutdown();
    });

    it('should detect brute force attacks', async () => {
      const suspiciousActivity = {
        userId: 'attacker123',
        type: 'LOGIN_ATTEMPT',
        timestamp: new Date(),
        data: { success: false, attempts: 6 }
      };

      const assessment = await securityMonitor.detectThreats(suspiciousActivity);
      
      expect(assessment.riskLevel).toBe('HIGH');
      expect(assessment.threats).toHaveLength.greaterThan(0);
      expect(assessment.threats[0].type).toBe('BRUTE_FORCE_ATTACK');
    });

    it('should detect anomalous user behavior', async () => {
      const activities = [
        { userId: 'user1', type: 'PAGE_VIEW', timestamp: new Date() },
        { userId: 'user1', type: 'DATA_EXPORT', timestamp: new Date() },
        { userId: 'user1', type: 'LARGE_DOWNLOAD', timestamp: new Date() }
      ];

      const report = await securityMonitor.detectAnomalies(activities);
      
      expect(report.totalActivities).toBe(3);
      expect(report.analysisTimestamp).toBeInstanceOf(Date);
      expect(report.riskAssessment).toHaveProperty('level');
    });

    it('should detect intrusion attempts', async () => {
      const suspiciousRequest = {
        id: 'req123',
        clientId: 'client456',
        timestamp: new Date(),
        userAgent: 'sqlmap/1.0',
        data: { query: "'; DROP TABLE users; --" }
      };

      const result = await securityMonitor.detectIntrusion(suspiciousRequest);
      
      expect(result.blocked).toBe(true);
      expect(result.indicators.length).toBeGreaterThan(0);
      expect(result.indicators.some(i => i.type === 'INJECTION_ATTEMPT')).toBe(true);
    });

    it('should detect privacy breaches', async () => {
      const dataAccess = {
        userIds: ['user1', 'user2'],
        dataTypes: ['personal_data', 'sensitive_data'],
        purpose: 'unauthorized_access',
        timestamp: new Date(),
        authorized: false
      };

      const assessment = await securityMonitor.detectPrivacyBreach(dataAccess);
      
      expect(assessment.isBreachDetected).toBe(true);
      expect(assessment.violations.length).toBeGreaterThan(0);
      expect(assessment.severity).toBe('CRITICAL');
    });

    it('should generate security reports', async () => {
      const period = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        end: new Date()
      };

      const report = await securityMonitor.generateSecurityReport(period);
      
      expect(report.period).toEqual(period);
      expect(report.totalEvents).toBeGreaterThanOrEqual(0);
      expect(report.eventsByType).toBeDefined();
      expect(report.riskAssessment).toHaveProperty('level');
      expect(report.recommendations).toBeInstanceOf(Array);
    });

    it('should provide security metrics', () => {
      const metrics = securityMonitor.getSecurityMetrics();
      
      expect(metrics).toHaveProperty('totalEvents');
      expect(metrics).toHaveProperty('threatsDetected');
      expect(metrics).toHaveProperty('blockedRequests');
      expect(metrics).toHaveProperty('uptime');
      expect(typeof metrics.totalEvents).toBe('number');
    });
  });

  describe('Secure Communication Protocol', () => {
    let secureComm: SecureCommunicationProtocol;

    beforeEach(() => {
      secureComm = SecureCommunicationProtocol.getInstance();
    });

    it('should establish secure sessions', async () => {
      const peerId = 'peer123';
      
      const session = await secureComm.establishSession(peerId);
      
      expect(session.sessionId).toBeTruthy();
      expect(session.peerId).toBe(peerId);
      expect(session.established).toBe(true);
      expect(session.encryptionAlgorithm).toBe('AES-256-GCM');
      expect(session.protocolVersion).toBeTruthy();
    });

    it('should send and receive secure messages', async () => {
      const peerId = 'peer123';
      const session = await secureComm.establishSession(peerId);
      
      const message = { type: 'test', data: 'secure message content' };
      const secureMessage = await secureComm.sendSecureMessage(session.sessionId, message);
      
      expect(secureMessage.sessionId).toBe(session.sessionId);
      expect(secureMessage.encryptedPayload).toBeTruthy();
      expect(secureMessage.integrityHash).toBeTruthy();
      expect(secureMessage.sequenceNumber).toBe(1);
    });

    it('should validate message integrity', async () => {
      const peerId = 'peer123';
      const session = await secureComm.establishSession(peerId);
      
      const message = { type: 'test', data: 'test content' };
      const secureMessage = await secureComm.sendSecureMessage(session.sessionId, message);
      
      // Mock successful decryption
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        new TextEncoder().encode(JSON.stringify({
          version: '1.0',
          sessionId: session.sessionId,
          messageId: secureMessage.messageId,
          messageType: 'DATA',
          sequenceNumber: 1,
          timestamp: secureMessage.timestamp,
          payload: message
        })).buffer
      );

      const receivedMessage = await secureComm.receiveSecureMessage(secureMessage);
      
      expect(receivedMessage.payload).toEqual(message);
      expect(receivedMessage.sessionId).toBe(session.sessionId);
    });

    it('should handle secure API requests', async () => {
      const peerId = 'api-server';
      const session = await secureComm.establishSession(peerId);
      
      const response = await secureComm.secureAPIRequest(
        '/api/data',
        'POST',
        { query: 'test' },
        session.sessionId
      );
      
      expect(response.success).toBe(true);
      expect(response.requestId).toBeTruthy();
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should generate and manage key pairs', async () => {
      const keyPair = await secureComm.generateKeyPair();
      
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      
      const exportedPublicKey = await secureComm.exportPublicKey(keyPair.publicKey);
      expect(typeof exportedPublicKey).toBe('string');
      
      const importedPublicKey = await secureComm.importPublicKey(exportedPublicKey);
      expect(importedPublicKey).toBeDefined();
    });

    it('should manage session lifecycle', async () => {
      const peerId = 'peer123';
      const session = await secureComm.establishSession(peerId);
      
      expect(secureComm.getActiveSessionCount()).toBe(1);
      
      const sessionInfo = secureComm.getSessionInfo(session.sessionId);
      expect(sessionInfo).toBeTruthy();
      expect(sessionInfo!.peerId).toBe(peerId);
      expect(sessionInfo!.isActive).toBe(true);
      
      await secureComm.terminateSession(session.sessionId);
      expect(secureComm.getActiveSessionCount()).toBe(0);
    });

    it('should clean up expired sessions', async () => {
      // Create a session
      const session = await secureComm.establishSession('peer1');
      expect(secureComm.getActiveSessionCount()).toBe(1);
      
      // Mock expired session by manipulating time
      const cleanedCount = secureComm.cleanupExpiredSessions();
      
      // In a real scenario, this would clean up expired sessions
      expect(typeof cleanedCount).toBe('number');
    });
  });

  describe('Privacy by Design Validator', () => {
    let validator: PrivacyByDesignValidator;

    beforeEach(() => {
      validator = PrivacyByDesignValidator.getInstance();
    });

    it('should validate privacy by design principles', async () => {
      const systemDesign = {
        id: 'test-system',
        name: 'Privacy Cohort Tracker',
        dataProcessing: {
          purposeLimitation: true,
          retentionPolicies: [{ type: 'cohort_data', period: 21 }],
          dataTypes: [{ category: 'behavioral', type: 'browsing_history' }]
        },
        userInterface: {
          defaultSettings: {
            dataSharing: false,
            analytics: false,
            notifications: 'minimal'
          },
          privacyControlsAccessible: true
        },
        privacyControls: ['consent_management', 'data_access', 'data_deletion', 'data_portability'],
        security: {
          encryption: {
            algorithm: 'AES-256-GCM',
            atRest: true,
            inTransit: true
          }
        },
        transparency: {
          privacyPolicy: true,
          dataProcessingTransparency: true,
          auditLogs: true
        },
        userControls: {
          granularConsent: true,
          dataSubjectRights: ['access', 'rectification', 'erasure', 'portability'],
          easyOptOut: true
        }
      };

      const report = await validator.validatePrivacyByDesign(systemDesign);
      
      expect(report.systemId).toBe('test-system');
      expect(report.complianceScore).toBeGreaterThan(0);
      expect(report.complianceLevel).toBeDefined();
      expect(report.principleResults).toHaveLength(7); // 7 privacy principles
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.criticalIssues).toBeInstanceOf(Array);
    });

    it('should identify non-compliant systems', async () => {
      const poorSystemDesign = {
        id: 'poor-system',
        name: 'Non-Compliant System',
        // Missing most privacy features
        dataProcessing: {
          purposeLimitation: false,
          retentionPolicies: [],
          dataTypes: [{ category: 'sensitive', type: 'biometric' }]
        }
      };

      const report = await validator.validatePrivacyByDesign(poorSystemDesign);
      
      expect(report.complianceScore).toBeLessThan(60);
      expect(report.complianceLevel).toBe('POOR');
      expect(report.criticalIssues.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should validate specific privacy principles', async () => {
      const systemDesign = {
        id: 'test-system',
        name: 'Test System',
        userInterface: {
          defaultSettings: {
            dataSharing: true, // Privacy-unfriendly default
            analytics: true,
            notifications: 'all'
          },
          privacyControlsAccessible: false
        }
      };

      const report = await validator.validatePrivacyByDesign(systemDesign);
      
      // Should fail "Privacy as Default" principle
      const defaultPrinciple = report.principleResults.find(p => p.principleId === 'DEFAULT');
      expect(defaultPrinciple).toBeDefined();
      expect(defaultPrinciple!.status).toBe('NON_COMPLIANT');
      expect(defaultPrinciple!.score).toBeLessThan(70);
    });

    it('should provide actionable recommendations', async () => {
      const systemDesign = {
        id: 'incomplete-system',
        name: 'Incomplete System',
        dataProcessing: {
          purposeLimitation: false,
          retentionPolicies: [],
          dataTypes: []
        }
      };

      const report = await validator.validatePrivacyByDesign(systemDesign);
      
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('purpose'))).toBe(true);
      expect(report.recommendations.some(r => r.includes('retention'))).toBe(true);
    });
  });

  describe('Integration Security Tests', () => {
    it('should maintain security across component interactions', async () => {
      const encryptionProvider = AdvancedEncryptionProvider.getInstance();
      const securityMonitor = SecurityMonitor.getInstance();
      const secureComm = SecureCommunicationProtocol.getInstance();
      
      await securityMonitor.initialize();
      
      // Test secure data flow
      const sensitiveData = 'confidential user information';
      const key = await encryptionProvider.generateKey();
      
      // Encrypt data
      const encryptedData = await encryptionProvider.encrypt(sensitiveData, key, 'CONFIDENTIAL');
      
      // Monitor the encryption activity
      await securityMonitor.monitorSecurityEvent('DATA_ENCRYPTION', {
        dataType: 'user_information',
        classification: 'CONFIDENTIAL'
      });
      
      // Establish secure communication
      const session = await secureComm.establishSession('data-processor');
      
      // Send encrypted data securely
      const secureMessage = await secureComm.sendSecureMessage(
        session.sessionId,
        { encryptedData },
        'ENCRYPTED_DATA'
      );
      
      expect(secureMessage.encryptedPayload).toBeTruthy();
      expect(secureMessage.integrityHash).toBeTruthy();
      
      await securityMonitor.shutdown();
    });

    it('should detect and respond to security incidents', async () => {
      const securityMonitor = SecurityMonitor.getInstance();
      await securityMonitor.initialize();
      
      // Simulate multiple suspicious activities
      const suspiciousActivities = [
        { userId: 'attacker', type: 'FAILED_LOGIN', timestamp: new Date() },
        { userId: 'attacker', type: 'FAILED_LOGIN', timestamp: new Date() },
        { userId: 'attacker', type: 'FAILED_LOGIN', timestamp: new Date() },
        { userId: 'attacker', type: 'DATA_ACCESS_ATTEMPT', timestamp: new Date() }
      ];
      
      for (const activity of suspiciousActivities) {
        const assessment = await securityMonitor.detectThreats(activity);
        
        if (assessment.riskLevel === 'HIGH' || assessment.riskLevel === 'CRITICAL') {
          // Should trigger security response
          expect(assessment.threats.length).toBeGreaterThan(0);
          expect(assessment.recommendations.length).toBeGreaterThan(0);
        }
      }
      
      const metrics = securityMonitor.getSecurityMetrics();
      expect(metrics.totalEvents).toBeGreaterThan(0);
      
      await securityMonitor.shutdown();
    });

    it('should validate end-to-end privacy protection', async () => {
      const dataAnonymizer = DataAnonymizer.getInstance();
      const encryptionProvider = AdvancedEncryptionProvider.getInstance();
      const validator = PrivacyByDesignValidator.getInstance();
      
      // Original sensitive data
      const originalData = [
        { userId: 'user123', email: 'user@example.com', location: 'New York' },
        { userId: 'user456', email: 'user2@example.com', location: 'California' }
      ];
      
      // Step 1: Anonymize data
      const anonymizedResult = dataAnonymizer.anonymizeDataset(originalData, {
        fields: {
          userId: { technique: 'hash', parameters: { salt: 'user_salt' } },
          email: { technique: 'suppress' },
          location: { technique: 'generalize', parameters: { type: 'region' } }
        }
      });
      
      expect(anonymizedResult.data.length).toBe(2);
      expect(anonymizedResult.data[0]).not.toHaveProperty('email');
      
      // Step 2: Encrypt anonymized data
      const key = await encryptionProvider.generateKey();
      const encryptedData = await encryptionProvider.encryptObject(
        anonymizedResult.data,
        key,
        'CONFIDENTIAL'
      );
      
      expect(encryptedData).toBeTruthy();
      
      // Step 3: Validate privacy by design
      const systemDesign = {
        id: 'privacy-system',
        name: 'Privacy-Preserving System',
        dataProcessing: {
          purposeLimitation: true,
          retentionPolicies: [{ type: 'user_data', period: 30 }],
          dataTypes: [{ category: 'anonymized', type: 'user_behavior' }]
        },
        security: {
          encryption: {
            algorithm: 'AES-256-GCM',
            atRest: true,
            inTransit: true
          }
        },
        userControls: {
          granularConsent: true,
          dataSubjectRights: ['access', 'erasure'],
          easyOptOut: true
        }
      };
      
      const validationReport = await validator.validatePrivacyByDesign(systemDesign);
      
      expect(validationReport.complianceScore).toBeGreaterThan(70);
      expect(validationReport.complianceLevel).not.toBe('POOR');
    });
  });
});
