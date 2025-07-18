import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SystemIntegrator } from '../../src/shared/core/system-integrator';
import { CohortAssignmentEngine } from '../../src/shared/core/cohort-assignment-engine';
import { PrivacyStorageManager } from '../../src/shared/core/privacy-storage-manager';
import { AdvancedEncryptionProvider } from '../../src/shared/core/advanced-encryption';
import { DataAnonymizer } from '../../src/shared/core/data-anonymization';
import { SecurityMonitor } from '../../src/shared/core/security-monitor';

/**
 * Performance Benchmarking Test Suite
 * Tests system performance under various load conditions
 */
describe('Privacy Cohort Tracker - Performance Benchmarks', () => {
  let systemIntegrator: SystemIntegrator;
  let performanceMetrics: PerformanceMetrics = {
    cohortAssignment: [],
    dataStorage: [],
    encryption: [],
    anonymization: [],
    securityMonitoring: []
  };

  beforeAll(async () => {
    systemIntegrator = SystemIntegrator.getInstance();
    await systemIntegrator.initialize();
    console.log('🚀 Performance testing environment initialized');
  });

  afterAll(async () => {
    await systemIntegrator.shutdown();
    
    // Generate performance report
    generatePerformanceReport(performanceMetrics);
    console.log('📊 Performance testing completed');
  });

  describe('Cohort Assignment Performance', () => {
    it('should assign cohorts to single user within performance threshold', async () => {
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      const userId = `perf_single_${Date.now()}`;
      
      const startTime = performance.now();
      
      await cohortEngine!.assignUserToCohorts(userId, {
        interests: ['technology', 'health', 'finance'],
        demographics: { ageGroup: '25-34', region: 'US' }
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within 50ms for single user
      expect(duration).toBeLessThan(50);
      
      performanceMetrics.cohortAssignment.push({
        operation: 'single_user_assignment',
        duration,
        userCount: 1,
        timestamp: new Date()
      });
      
      // Cleanup
      await cohortEngine!.deleteUserData(userId);
      
      console.log(`✅ Single user cohort assignment: ${duration.toFixed(2)}ms`);
    });

    it('should handle batch cohort assignments efficiently', async () => {
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      const userCount = 100;
      const batchSize = 10;
      
      const startTime = performance.now();
      
      // Process users in batches
      for (let i = 0; i < userCount; i += batchSize) {
        const batchPromises = [];
        
        for (let j = 0; j < batchSize && (i + j) < userCount; j++) {
          const userId = `perf_batch_${i + j}_${Date.now()}`;
          const promise = cohortEngine!.assignUserToCohorts(userId, {
            interests: ['technology', 'health', 'finance'][j % 3],
            demographics: { ageGroup: '25-34', region: 'US' }
          });
          batchPromises.push(promise);
        }
        
        await Promise.all(batchPromises);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerUser = duration / userCount;
      
      // Should process users efficiently (less than 10ms per user in batch)
      expect(avgTimePerUser).toBeLessThan(10);
      
      performanceMetrics.cohortAssignment.push({
        operation: 'batch_assignment',
        duration,
        userCount,
        avgPerUser: avgTimePerUser,
        timestamp: new Date()
      });
      
      // Cleanup
      for (let i = 0; i < userCount; i++) {
        await cohortEngine!.deleteUserData(`perf_batch_${i}_${Date.now()}`);
      }
      
      console.log(`✅ Batch cohort assignment: ${avgTimePerUser.toFixed(2)}ms per user`);
    });

    it('should handle concurrent cohort assignments', async () => {
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      const concurrentUsers = 50;
      
      const startTime = performance.now();
      
      // Create concurrent assignments
      const promises = Array.from({ length: concurrentUsers }, (_, i) => {
        const userId = `perf_concurrent_${i}_${Date.now()}`;
        return cohortEngine!.assignUserToCohorts(userId, {
          interests: ['technology', 'health', 'finance', 'entertainment'][i % 4],
          demographics: { ageGroup: '25-34', region: 'US' }
        });
      });
      
      await Promise.all(promises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerUser = duration / concurrentUsers;
      
      // Concurrent processing should be efficient
      expect(avgTimePerUser).toBeLessThan(20);
      
      performanceMetrics.cohortAssignment.push({
        operation: 'concurrent_assignment',
        duration,
        userCount: concurrentUsers,
        avgPerUser: avgTimePerUser,
        timestamp: new Date()
      });
      
      // Cleanup
      for (let i = 0; i < concurrentUsers; i++) {
        await cohortEngine!.deleteUserData(`perf_concurrent_${i}_${Date.now()}`);
      }
      
      console.log(`✅ Concurrent cohort assignment: ${avgTimePerUser.toFixed(2)}ms per user`);
    });
  });

  describe('Data Storage Performance', () => {
    it('should store and retrieve data efficiently', async () => {
      const storageManager = systemIntegrator.getComponent<PrivacyStorageManager>('storage');
      const testData = {
        userId: `perf_storage_${Date.now()}`,
        cohorts: Array.from({ length: 10 }, (_, i) => ({
          id: `cohort_${i}`,
          name: `Test Cohort ${i}`,
          category: 'technology',
          confidence: 0.8
        })),
        preferences: {
          theme: 'dark',
          notifications: true,
          language: 'en'
        }
      };
      
      // Test storage performance
      const storeStartTime = performance.now();
      await storageManager!.store(`perf_test:${testData.userId}`, testData);
      const storeEndTime = performance.now();
      const storeDuration = storeEndTime - storeStartTime;
      
      // Test retrieval performance
      const retrieveStartTime = performance.now();
      const retrievedData = await storageManager!.retrieve(`perf_test:${testData.userId}`);
      const retrieveEndTime = performance.now();
      const retrieveDuration = retrieveEndTime - retrieveStartTime;
      
      // Storage operations should be fast
      expect(storeDuration).toBeLessThan(10);
      expect(retrieveDuration).toBeLessThan(5);
      expect(retrievedData).toEqual(testData);
      
      performanceMetrics.dataStorage.push({
        operation: 'store',
        duration: storeDuration,
        dataSize: JSON.stringify(testData).length,
        timestamp: new Date()
      });
      
      performanceMetrics.dataStorage.push({
        operation: 'retrieve',
        duration: retrieveDuration,
        dataSize: JSON.stringify(retrievedData).length,
        timestamp: new Date()
      });
      
      // Cleanup
      await storageManager!.delete(`perf_test:${testData.userId}`);
      
      console.log(`✅ Storage performance: Store ${storeDuration.toFixed(2)}ms, Retrieve ${retrieveDuration.toFixed(2)}ms`);
    });

    it('should handle large data volumes efficiently', async () => {
      const storageManager = systemIntegrator.getComponent<PrivacyStorageManager>('storage');
      const recordCount = 1000;
      
      const startTime = performance.now();
      
      // Store multiple records
      const storePromises = Array.from({ length: recordCount }, (_, i) => {
        const data = {
          id: i,
          userId: `bulk_user_${i}`,
          cohorts: [`cohort_${i % 10}`],
          timestamp: new Date()
        };
        return storageManager!.store(`bulk_test:${i}`, data);
      });
      
      await Promise.all(storePromises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerRecord = duration / recordCount;
      
      // Should handle bulk operations efficiently
      expect(avgTimePerRecord).toBeLessThan(2);
      
      performanceMetrics.dataStorage.push({
        operation: 'bulk_store',
        duration,
        recordCount,
        avgPerRecord: avgTimePerRecord,
        timestamp: new Date()
      });
      
      // Cleanup
      for (let i = 0; i < recordCount; i++) {
        await storageManager!.delete(`bulk_test:${i}`);
      }
      
      console.log(`✅ Bulk storage performance: ${avgTimePerRecord.toFixed(2)}ms per record`);
    });
  });

  describe('Encryption Performance', () => {
    it('should encrypt and decrypt data within performance thresholds', async () => {
      const encryptionProvider = AdvancedEncryptionProvider.getInstance();
      const testData = 'This is test data for encryption performance testing. '.repeat(100);
      const key = await encryptionProvider.generateKey();
      
      // Test encryption performance
      const encryptStartTime = performance.now();
      const encryptedData = await encryptionProvider.encrypt(testData, key, 'CONFIDENTIAL');
      const encryptEndTime = performance.now();
      const encryptDuration = encryptEndTime - encryptStartTime;
      
      // Test decryption performance
      const decryptStartTime = performance.now();
      const decryptedData = await encryptionProvider.decrypt(encryptedData, key);
      const decryptEndTime = performance.now();
      const decryptDuration = decryptEndTime - decryptStartTime;
      
      // Encryption operations should be fast
      expect(encryptDuration).toBeLessThan(20);
      expect(decryptDuration).toBeLessThan(20);
      expect(decryptedData).toBe(testData);
      
      performanceMetrics.encryption.push({
        operation: 'encrypt',
        duration: encryptDuration,
        dataSize: testData.length,
        timestamp: new Date()
      });
      
      performanceMetrics.encryption.push({
        operation: 'decrypt',
        duration: decryptDuration,
        dataSize: testData.length,
        timestamp: new Date()
      });
      
      console.log(`✅ Encryption performance: Encrypt ${encryptDuration.toFixed(2)}ms, Decrypt ${decryptDuration.toFixed(2)}ms`);
    });

    it('should handle bulk encryption efficiently', async () => {
      const encryptionProvider = AdvancedEncryptionProvider.getInstance();
      const key = await encryptionProvider.generateKey();
      const dataItems = Array.from({ length: 100 }, (_, i) => `Test data item ${i}`);
      
      const startTime = performance.now();
      
      // Encrypt multiple items
      const encryptPromises = dataItems.map(data => 
        encryptionProvider.encrypt(data, key, 'CONFIDENTIAL')
      );
      
      await Promise.all(encryptPromises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerItem = duration / dataItems.length;
      
      // Bulk encryption should be efficient
      expect(avgTimePerItem).toBeLessThan(5);
      
      performanceMetrics.encryption.push({
        operation: 'bulk_encrypt',
        duration,
        itemCount: dataItems.length,
        avgPerItem: avgTimePerItem,
        timestamp: new Date()
      });
      
      console.log(`✅ Bulk encryption performance: ${avgTimePerItem.toFixed(2)}ms per item`);
    });
  });

  describe('Data Anonymization Performance', () => {
    it('should anonymize datasets efficiently', async () => {
      const dataAnonymizer = DataAnonymizer.getInstance();
      const dataset = Array.from({ length: 1000 }, (_, i) => ({
        userId: `user_${i}`,
        age: 25 + (i % 40),
        zipcode: `${10000 + (i % 90000)}`,
        interests: ['technology', 'health', 'finance'][i % 3]
      }));
      
      const config = {
        fields: {
          userId: { technique: 'hash' as const, parameters: { salt: 'test_salt' } },
          age: { technique: 'generalize' as const, parameters: { range: 5 } },
          zipcode: { technique: 'mask' as const, parameters: { preserveStart: 3 } }
        },
        kAnonymity: {
          enabled: true,
          k: 10,
          quasiIdentifiers: ['age', 'zipcode'],
          sensitiveAttribute: 'interests'
        }
      };
      
      const startTime = performance.now();
      const result = dataAnonymizer.anonymizeDataset(dataset, config);
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerRecord = duration / dataset.length;
      
      // Anonymization should be efficient
      expect(avgTimePerRecord).toBeLessThan(1);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.metadata.kValue).toBeGreaterThanOrEqual(10);
      
      performanceMetrics.anonymization.push({
        operation: 'dataset_anonymization',
        duration,
        recordCount: dataset.length,
        avgPerRecord: avgTimePerRecord,
        timestamp: new Date()
      });
      
      console.log(`✅ Anonymization performance: ${avgTimePerRecord.toFixed(3)}ms per record`);
    });
  });

  describe('Security Monitoring Performance', () => {
    it('should process security events efficiently', async () => {
      const securityMonitor = systemIntegrator.getComponent<SecurityMonitor>('security');
      const eventCount = 500;
      
      const startTime = performance.now();
      
      // Process multiple security events
      const eventPromises = Array.from({ length: eventCount }, (_, i) => {
        const event = {
          userId: `user_${i}`,
          type: 'LOGIN_ATTEMPT',
          timestamp: new Date(),
          data: { success: i % 10 !== 0, ipAddress: `192.168.1.${i % 255}` }
        };
        return securityMonitor!.detectThreats(event);
      });
      
      await Promise.all(eventPromises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerEvent = duration / eventCount;
      
      // Security monitoring should be fast
      expect(avgTimePerEvent).toBeLessThan(5);
      
      performanceMetrics.securityMonitoring.push({
        operation: 'threat_detection',
        duration,
        eventCount,
        avgPerEvent: avgTimePerEvent,
        timestamp: new Date()
      });
      
      console.log(`✅ Security monitoring performance: ${avgTimePerEvent.toFixed(2)}ms per event`);
    });
  });

  describe('Memory Usage Testing', () => {
    it('should maintain memory usage within acceptable limits', async () => {
      const initialMemory = process.memoryUsage();
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      
      // Perform memory-intensive operations
      const userCount = 200;
      for (let i = 0; i < userCount; i++) {
        await cohortEngine!.assignUserToCohorts(`memory_test_${i}`, {
          interests: ['technology', 'health', 'finance', 'entertainment', 'sports'],
          demographics: { ageGroup: '25-34', region: 'US' }
        });
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
      
      // Memory increase should be reasonable (less than 50MB for 200 users)
      expect(memoryIncreaseMB).toBeLessThan(50);
      
      // Cleanup
      for (let i = 0; i < userCount; i++) {
        await cohortEngine!.deleteUserData(`memory_test_${i}`);
      }
      
      console.log(`✅ Memory usage test: ${memoryIncreaseMB.toFixed(2)}MB increase for ${userCount} users`);
    });
  });

  describe('Stress Testing', () => {
    it('should handle high concurrent load', async () => {
      const cohortEngine = systemIntegrator.getComponent<CohortAssignmentEngine>('cohorts');
      const concurrentRequests = 100;
      const requestsPerBatch = 20;
      
      const startTime = performance.now();
      
      // Process requests in batches to avoid overwhelming the system
      for (let i = 0; i < concurrentRequests; i += requestsPerBatch) {
        const batchPromises = [];
        
        for (let j = 0; j < requestsPerBatch && (i + j) < concurrentRequests; j++) {
          const userId = `stress_test_${i + j}_${Date.now()}`;
          const promise = cohortEngine!.assignUserToCohorts(userId, {
            interests: ['technology', 'health', 'finance'][j % 3],
            demographics: { ageGroup: '25-34', region: 'US' }
          });
          batchPromises.push(promise);
        }
        
        await Promise.all(batchPromises);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerRequest = duration / concurrentRequests;
      
      // System should handle stress load reasonably
      expect(avgTimePerRequest).toBeLessThan(50);
      
      // Cleanup
      for (let i = 0; i < concurrentRequests; i++) {
        await cohortEngine!.deleteUserData(`stress_test_${i}_${Date.now()}`);
      }
      
      console.log(`✅ Stress test: ${avgTimePerRequest.toFixed(2)}ms per request under load`);
    });
  });
});

// Performance metrics types and utilities
interface PerformanceMetrics {
  cohortAssignment: PerformanceEntry[];
  dataStorage: PerformanceEntry[];
  encryption: PerformanceEntry[];
  anonymization: PerformanceEntry[];
  securityMonitoring: PerformanceEntry[];
}

interface PerformanceEntry {
  operation: string;
  duration: number;
  timestamp: Date;
  userCount?: number;
  recordCount?: number;
  itemCount?: number;
  eventCount?: number;
  dataSize?: number;
  avgPerUser?: number;
  avgPerRecord?: number;
  avgPerItem?: number;
  avgPerEvent?: number;
}

function generatePerformanceReport(metrics: PerformanceMetrics): void {
  console.log('\n📊 PERFORMANCE REPORT');
  console.log('====================');
  
  for (const [category, entries] of Object.entries(metrics)) {
    if (entries.length === 0) continue;
    
    console.log(`\n${category.toUpperCase()}:`);
    
    const avgDuration = entries.reduce((sum, entry) => sum + entry.duration, 0) / entries.length;
    const minDuration = Math.min(...entries.map(e => e.duration));
    const maxDuration = Math.max(...entries.map(e => e.duration));
    
    console.log(`  Average Duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Min Duration: ${minDuration.toFixed(2)}ms`);
    console.log(`  Max Duration: ${maxDuration.toFixed(2)}ms`);
    console.log(`  Total Operations: ${entries.length}`);
    
    // Category-specific metrics
    if (category === 'cohortAssignment') {
      const totalUsers = entries.reduce((sum, entry) => sum + (entry.userCount || 0), 0);
      if (totalUsers > 0) {
        console.log(`  Total Users Processed: ${totalUsers}`);
        console.log(`  Average Time Per User: ${(entries.reduce((sum, entry) => sum + entry.duration, 0) / totalUsers).toFixed(2)}ms`);
      }
    }
    
    if (category === 'dataStorage') {
      const totalDataSize = entries.reduce((sum, entry) => sum + (entry.dataSize || 0), 0);
      if (totalDataSize > 0) {
        console.log(`  Total Data Processed: ${(totalDataSize / 1024).toFixed(2)}KB`);
      }
    }
  }
  
  console.log('\n====================');
  console.log('Performance testing completed successfully! ✅');
}
