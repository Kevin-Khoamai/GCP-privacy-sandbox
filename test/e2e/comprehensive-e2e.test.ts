import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { SystemIntegrator } from '../../src/shared/core/system-integrator';
import { ConfigurationManager } from '../../src/shared/core/configuration-manager';
import { CohortAssignmentEngine } from '../../src/shared/core/cohort-assignment-engine';
import { PrivacyStorageManager } from '../../src/shared/core/privacy-storage-manager';
import { ComplianceManager } from '../../src/shared/core/compliance-manager';
import { SecurityMonitor } from '../../src/shared/core/security-monitor';
import { PrivacyByDesignValidator } from '../../src/shared/core/privacy-by-design-validator';

/**
 * Comprehensive End-to-End Testing Suite
 * Tests complete user journeys and system integration scenarios
 */
describe('Privacy Cohort Tracker - Comprehensive E2E Tests', () => {
  let systemIntegrator: SystemIntegrator;
  let testUserId: string;
  let testSessionId: string;

  beforeAll(async () => {
    // Initialize the complete system
    systemIntegrator = SystemIntegrator.getInstance();
    await systemIntegrator.initialize();
    
    // Set up test environment
    const configManager = ConfigurationManager.getInstance();
    configManager.set('environment', 'test');
    configManager.set('privacy.dataRetentionDays', 1); // Short retention for testing
    
    console.log('🧪 E2E Test Environment Initialized');
  });

  afterAll(async () => {
    // Clean up test environment
    await systemIntegrator.shutdown();
    console.log('🧹 E2E Test Environment Cleaned Up');
  });

  beforeEach(async () => {
    // Generate unique test identifiers
    testUserId = `test_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    testSessionId = `test_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🔄 Starting test with User ID: ${testUserId}`);
  });

  afterEach(async () => {
    // Clean up test data
    try {
      const complianceManager = systemIntegrator.getComponent<ComplianceManager>('compliance');
      if (complianceManager) {
        await complianceManager.handleDataDeletionRequest(testUserId, { scope: 'all' });
      }
    } catch (error) {
      console.warn('Test cleanup warning:', error);
    }
  });

  describe('Complete User Journey Tests', () => {
    it('should handle complete new user onboarding flow', async () => {
      // Step 1: User visits website for first time
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      const storageManager = systemIntegrator.getComponent<PrivacyStorageManager>('storage');
      
      // Simulate initial page visit
      const initialVisit = {
        userId: testUserId,
        url: 'https://example.com',
        timestamp: new Date(),
        sessionId: testSessionId
      };
      
      // Step 2: System should create initial user profile
      await cohortEngine!.processUserActivity(testUserId, {
        type: 'page_visit',
        data: initialVisit
      });
      
      // Step 3: Verify user profile creation
      const userProfile = await storageManager!.retrieve(`profile:${testUserId}`);
      expect(userProfile).toBeTruthy();
      expect(userProfile.userId).toBe(testUserId);
      expect(userProfile.createdAt).toBeInstanceOf(Date);
      
      // Step 4: User should have no cohorts initially
      const initialCohorts = await cohortEngine!.getUserCohorts(testUserId);
      expect(initialCohorts).toHaveLength(0);
      
      // Step 5: Simulate browsing activity to trigger cohort assignment
      const browsingActivities = [
        { url: 'https://techcrunch.com', category: 'technology' },
        { url: 'https://arstechnica.com', category: 'technology' },
        { url: 'https://wired.com', category: 'technology' },
        { url: 'https://github.com', category: 'technology' },
        { url: 'https://stackoverflow.com', category: 'technology' }
      ];
      
      for (const activity of browsingActivities) {
        await cohortEngine!.processUserActivity(testUserId, {
          type: 'page_visit',
          data: { ...activity, timestamp: new Date(), sessionId: testSessionId }
        });
      }
      
      // Step 6: Trigger cohort assignment
      await cohortEngine!.assignUserToCohorts(testUserId);
      
      // Step 7: Verify cohort assignment
      const assignedCohorts = await cohortEngine!.getUserCohorts(testUserId);
      expect(assignedCohorts.length).toBeGreaterThan(0);
      
      const techCohort = assignedCohorts.find(c => c.category === 'technology');
      expect(techCohort).toBeTruthy();
      expect(techCohort!.confidence).toBeGreaterThan(0.5);
      
      console.log('✅ Complete user onboarding flow test passed');
    });

    it('should handle user privacy preference changes', async () => {
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      const complianceManager = systemIntegrator.getComponent<ComplianceManager>('compliance');
      
      // Step 1: Create user with initial cohorts
      await cohortEngine!.assignUserToCohorts(testUserId, {
        interests: ['technology', 'health'],
        demographics: { ageGroup: '25-34', region: 'US' }
      });
      
      const initialCohorts = await cohortEngine!.getUserCohorts(testUserId);
      expect(initialCohorts.length).toBeGreaterThan(0);
      
      // Step 2: User opts out of health-related cohorts
      await complianceManager!.updateConsentPreferences(testUserId, {
        cohortCategories: {
          technology: true,
          health: false,
          finance: true
        }
      });
      
      // Step 3: System should remove health cohorts
      await cohortEngine!.recalculateUserCohorts(testUserId);
      
      const updatedCohorts = await cohortEngine!.getUserCohorts(testUserId);
      const healthCohorts = updatedCohorts.filter(c => c.category === 'health');
      expect(healthCohorts).toHaveLength(0);
      
      // Step 4: Technology cohorts should remain
      const techCohorts = updatedCohorts.filter(c => c.category === 'technology');
      expect(techCohorts.length).toBeGreaterThan(0);
      
      console.log('✅ Privacy preference changes test passed');
    });

    it('should handle complete data export request', async () => {
      const complianceManager = systemIntegrator.getComponent<ComplianceManager>('compliance');
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      
      // Step 1: Create user with data
      await cohortEngine!.assignUserToCohorts(testUserId, {
        interests: ['technology', 'finance'],
        demographics: { ageGroup: '25-34' }
      });
      
      // Step 2: User requests data export
      const exportRequest = await complianceManager!.handleDataAccessRequest(testUserId, {
        format: 'json',
        includeMetadata: true
      });
      
      // Step 3: Verify export contains all user data
      expect(exportRequest.status).toBe('completed');
      expect(exportRequest.data).toBeTruthy();
      expect(exportRequest.data.userId).toBe(testUserId);
      expect(exportRequest.data.cohorts).toBeDefined();
      expect(exportRequest.data.preferences).toBeDefined();
      expect(exportRequest.data.metadata).toBeDefined();
      
      // Step 4: Verify data integrity
      expect(exportRequest.data.cohorts.length).toBeGreaterThan(0);
      expect(exportRequest.data.metadata.exportDate).toBeInstanceOf(Date);
      expect(exportRequest.data.metadata.dataTypes).toContain('cohorts');
      
      console.log('✅ Complete data export test passed');
    });

    it('should handle complete data deletion request', async () => {
      const complianceManager = systemIntegrator.getComponent<ComplianceManager>('compliance');
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      const storageManager = systemIntegrator.getComponent<PrivacyStorageManager>('storage');
      
      // Step 1: Create user with comprehensive data
      await cohortEngine!.assignUserToCohorts(testUserId, {
        interests: ['technology', 'health', 'finance']
      });
      
      // Store additional user data
      await storageManager!.store(`preferences:${testUserId}`, {
        theme: 'dark',
        notifications: true,
        language: 'en'
      });
      
      // Verify data exists
      const initialCohorts = await cohortEngine!.getUserCohorts(testUserId);
      const initialPreferences = await storageManager!.retrieve(`preferences:${testUserId}`);
      expect(initialCohorts.length).toBeGreaterThan(0);
      expect(initialPreferences).toBeTruthy();
      
      // Step 2: User requests complete data deletion
      const deletionRequest = await complianceManager!.handleDataDeletionRequest(testUserId, {
        scope: 'all',
        reason: 'user_request'
      });
      
      // Step 3: Verify deletion completed
      expect(deletionRequest.status).toBe('completed');
      expect(deletionRequest.deletedDataTypes).toContain('cohorts');
      expect(deletionRequest.deletedDataTypes).toContain('preferences');
      
      // Step 4: Verify data is actually deleted
      const finalCohorts = await cohortEngine!.getUserCohorts(testUserId);
      const finalPreferences = await storageManager!.retrieve(`preferences:${testUserId}`);
      expect(finalCohorts).toHaveLength(0);
      expect(finalPreferences).toBeNull();
      
      console.log('✅ Complete data deletion test passed');
    });
  });

  describe('Privacy Compliance Testing', () => {
    it('should maintain k-anonymity throughout cohort assignment', async () => {
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      const configManager = ConfigurationManager.getInstance();
      
      const kThreshold = configManager.get<number>('privacy.kAnonymityThreshold');
      
      // Create multiple test users
      const testUsers = Array.from({ length: 150 }, (_, i) => 
        `test_user_kanon_${Date.now()}_${i}`
      );
      
      // Assign similar interests to create cohorts
      for (const userId of testUsers) {
        await cohortEngine!.assignUserToCohorts(userId, {
          interests: ['technology'],
          demographics: { ageGroup: '25-34', region: 'US' }
        });
      }
      
      // Verify k-anonymity for each cohort
      const allCohorts = new Map<string, string[]>();
      
      for (const userId of testUsers) {
        const userCohorts = await cohortEngine!.getUserCohorts(userId);
        for (const cohort of userCohorts) {
          if (!allCohorts.has(cohort.id)) {
            allCohorts.set(cohort.id, []);
          }
          allCohorts.get(cohort.id)!.push(userId);
        }
      }
      
      // Check k-anonymity constraint
      for (const [cohortId, members] of allCohorts) {
        expect(members.length).toBeGreaterThanOrEqual(kThreshold);
      }
      
      // Cleanup test users
      for (const userId of testUsers) {
        await cohortEngine!.deleteUserData(userId);
      }
      
      console.log('✅ K-anonymity compliance test passed');
    });

    it('should enforce data retention policies', async () => {
      const storageManager = systemIntegrator.getComponent<PrivacyStorageManager>('storage');
      const configManager = ConfigurationManager.getInstance();
      
      // Set short retention period for testing
      configManager.set('privacy.dataRetentionDays', 0.001); // ~1.4 minutes
      
      // Store test data
      const testData = {
        userId: testUserId,
        data: 'test data for retention',
        timestamp: new Date()
      };
      
      await storageManager!.store(`retention_test:${testUserId}`, testData);
      
      // Verify data exists initially
      const initialData = await storageManager!.retrieve(`retention_test:${testUserId}`);
      expect(initialData).toBeTruthy();
      
      // Wait for retention period to pass
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms
      
      // Trigger cleanup
      await storageManager!.cleanupExpiredData();
      
      // Verify data is deleted
      const expiredData = await storageManager!.retrieve(`retention_test:${testUserId}`);
      expect(expiredData).toBeNull();
      
      console.log('✅ Data retention policy test passed');
    });

    it('should validate privacy-by-design compliance', async () => {
      const validator = PrivacyByDesignValidator.getInstance();
      
      // Create system design for validation
      const systemDesign = {
        id: 'test-system',
        name: 'Privacy Cohort Tracker Test',
        dataProcessing: {
          purposeLimitation: true,
          retentionPolicies: [{ type: 'cohort_data', period: 21 }],
          dataTypes: [{ category: 'behavioral', type: 'browsing_patterns' }]
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
      
      // Validate privacy by design
      const validationReport = await validator.validatePrivacyByDesign(systemDesign);
      
      // Verify high compliance score
      expect(validationReport.complianceScore).toBeGreaterThan(80);
      expect(validationReport.complianceLevel).not.toBe('POOR');
      expect(validationReport.principleResults).toHaveLength(7);
      
      // Verify all principles are at least partially compliant
      const nonCompliantPrinciples = validationReport.principleResults.filter(
        p => p.status === 'NON_COMPLIANT'
      );
      expect(nonCompliantPrinciples).toHaveLength(0);
      
      console.log('✅ Privacy-by-design validation test passed');
    });
  });

  describe('Security Testing', () => {
    it('should detect and prevent security threats', async () => {
      const securityMonitor = systemIntegrator.getComponent<SecurityMonitor>('security');
      
      // Simulate brute force attack
      const suspiciousActivities = Array.from({ length: 10 }, (_, i) => ({
        userId: testUserId,
        type: 'LOGIN_ATTEMPT',
        timestamp: new Date(),
        data: { success: false, attempt: i + 1 }
      }));
      
      let threatDetected = false;
      
      for (const activity of suspiciousActivities) {
        const assessment = await securityMonitor!.detectThreats(activity);
        
        if (assessment.riskLevel === 'HIGH' || assessment.riskLevel === 'CRITICAL') {
          threatDetected = true;
          expect(assessment.threats.length).toBeGreaterThan(0);
          expect(assessment.threats[0].type).toBe('BRUTE_FORCE_ATTACK');
          break;
        }
      }
      
      expect(threatDetected).toBe(true);
      console.log('✅ Security threat detection test passed');
    });

    it('should detect privacy breaches', async () => {
      const securityMonitor = systemIntegrator.getComponent<SecurityMonitor>('security');
      
      // Simulate unauthorized data access
      const unauthorizedAccess = {
        userIds: [testUserId, 'other_user_123'],
        dataTypes: ['personal_data', 'sensitive_data'],
        purpose: 'unauthorized_access',
        timestamp: new Date(),
        authorized: false
      };
      
      const breachAssessment = await securityMonitor!.detectPrivacyBreach(unauthorizedAccess);
      
      expect(breachAssessment.isBreachDetected).toBe(true);
      expect(breachAssessment.violations.length).toBeGreaterThan(0);
      expect(breachAssessment.severity).toBe('CRITICAL');
      
      console.log('✅ Privacy breach detection test passed');
    });
  });

  describe('Performance Testing', () => {
    it('should handle high-volume cohort assignments efficiently', async () => {
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      
      const startTime = Date.now();
      const userCount = 100;
      
      // Create multiple users with cohort assignments
      const promises = Array.from({ length: userCount }, async (_, i) => {
        const userId = `perf_test_user_${i}`;
        return cohortEngine!.assignUserToCohorts(userId, {
          interests: ['technology', 'health', 'finance'][i % 3],
          demographics: { ageGroup: '25-34' }
        });
      });
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const avgTimePerUser = duration / userCount;
      
      // Should process users efficiently (less than 100ms per user)
      expect(avgTimePerUser).toBeLessThan(100);
      
      // Cleanup
      for (let i = 0; i < userCount; i++) {
        await cohortEngine!.deleteUserData(`perf_test_user_${i}`);
      }
      
      console.log(`✅ Performance test passed: ${avgTimePerUser.toFixed(2)}ms per user`);
    });

    it('should maintain memory usage within limits', async () => {
      const configManager = ConfigurationManager.getInstance();
      const maxMemoryMB = configManager.get<number>('performance.maxMemoryUsageMB');
      
      // Get initial memory usage
      const initialMemory = process.memoryUsage();
      
      // Perform memory-intensive operations
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      
      for (let i = 0; i < 50; i++) {
        await cohortEngine!.assignUserToCohorts(`memory_test_user_${i}`, {
          interests: ['technology', 'health', 'finance', 'entertainment', 'sports'],
          demographics: { ageGroup: '25-34', region: 'US' }
        });
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncreaseMB = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      
      expect(memoryIncreaseMB).toBeLessThan(maxMemoryMB);
      
      // Cleanup
      for (let i = 0; i < 50; i++) {
        await cohortEngine!.deleteUserData(`memory_test_user_${i}`);
      }
      
      console.log(`✅ Memory usage test passed: ${memoryIncreaseMB.toFixed(2)}MB increase`);
    });
  });

  describe('Cross-Platform Integration Testing', () => {
    it('should maintain data consistency across components', async () => {
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      const storageManager = systemIntegrator.getComponent<PrivacyStorageManager>('storage');
      const complianceManager = systemIntegrator.getComponent<ComplianceManager>('compliance');
      
      // Step 1: Create user through cohort engine
      await cohortEngine!.assignUserToCohorts(testUserId, {
        interests: ['technology'],
        demographics: { ageGroup: '25-34' }
      });
      
      // Step 2: Verify data is accessible through storage manager
      const storedCohorts = await storageManager!.retrieve(`cohorts:${testUserId}`);
      expect(storedCohorts).toBeTruthy();
      
      // Step 3: Verify data is accessible through compliance manager
      const exportedData = await complianceManager!.handleDataAccessRequest(testUserId, {
        format: 'json'
      });
      expect(exportedData.data.cohorts).toBeTruthy();
      expect(exportedData.data.cohorts.length).toBeGreaterThan(0);
      
      // Step 4: Modify data through one component
      await cohortEngine!.updateUserPreferences(testUserId, {
        interests: ['technology', 'health']
      });
      
      // Step 5: Verify changes are reflected in other components
      const updatedExport = await complianceManager!.handleDataAccessRequest(testUserId, {
        format: 'json'
      });
      
      const healthCohorts = updatedExport.data.cohorts.filter((c: any) => c.category === 'health');
      expect(healthCohorts.length).toBeGreaterThan(0);
      
      console.log('✅ Cross-component data consistency test passed');
    });
  });

  describe('Error Handling and Recovery Testing', () => {
    it('should gracefully handle component failures', async () => {
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      
      // Simulate storage failure
      const originalStore = cohortEngine!.setStorageProvider;
      
      // Mock failing storage
      cohortEngine!.setStorageProvider({
        async store() { throw new Error('Storage failure'); },
        async retrieve() { throw new Error('Storage failure'); },
        async delete() { throw new Error('Storage failure'); }
      });
      
      // Attempt operation that should fail gracefully
      try {
        await cohortEngine!.assignUserToCohorts(testUserId, {
          interests: ['technology']
        });
        
        // Should not reach here if error handling works
        expect(false).toBe(true);
      } catch (error) {
        // Error should be handled gracefully
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Storage failure');
      }
      
      console.log('✅ Error handling test passed');
    });
  });

  describe('System Health and Monitoring', () => {
    it('should provide accurate system health status', async () => {
      // Get health status from all components
      const components = ['cohorts', 'storage', 'compliance', 'security'];
      
      for (const componentName of components) {
        const component = systemIntegrator.getComponent<any>(componentName);
        
        if (component && component.getHealthStatus) {
          const health = component.getHealthStatus();
          
          expect(health).toBeTruthy();
          expect(health.status).toMatch(/^(healthy|degraded|unhealthy)$/);
          expect(health.lastCheck).toBeInstanceOf(Date);
        }
      }
      
      // Get overall system status
      const systemStatus = systemIntegrator.getSystemStatus();
      
      expect(systemStatus.initialized).toBe(true);
      expect(systemStatus.componentCount).toBeGreaterThan(0);
      expect(systemStatus.components.length).toBeGreaterThan(0);
      
      console.log('✅ System health monitoring test passed');
    });
  });
});

// Test utilities
export class E2ETestUtils {
  static async createTestUser(userId: string, interests: string[] = ['technology']): Promise<void> {
    const systemIntegrator = SystemIntegrator.getInstance();
    const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
    
    await cohortEngine!.assignUserToCohorts(userId, {
      interests,
      demographics: { ageGroup: '25-34', region: 'US' }
    });
  }
  
  static async cleanupTestUser(userId: string): Promise<void> {
    const systemIntegrator = SystemIntegrator.getInstance();
    const complianceManager = systemIntegrator.getComponent<ComplianceManager>('compliance');
    
    await complianceManager!.handleDataDeletionRequest(userId, { scope: 'all' });
  }
  
  static async waitForSystemReady(timeoutMs: number = 10000): Promise<void> {
    const startTime = Date.now();
    const systemIntegrator = SystemIntegrator.getInstance();
    
    while (Date.now() - startTime < timeoutMs) {
      if (systemIntegrator.isReady()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error('System did not become ready within timeout');
  }
}
