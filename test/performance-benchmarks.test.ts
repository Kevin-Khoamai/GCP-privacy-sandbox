import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CohortEngine } from '../src/shared/core/cohort-engine';
import { AESEncryptionProvider } from '../src/shared/core/encryption-utils';
import { PrivacyControlsManager } from '../src/shared/core/privacy-controls';
import { DomainVisit } from '../src/shared/interfaces/browsing-history';

// Performance test utilities
class PerformanceTimer {
  private startTime: number = 0;
  private measurements: number[] = [];

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    const duration = performance.now() - this.startTime;
    this.measurements.push(duration);
    return duration;
  }

  getAverage(): number {
    return this.measurements.reduce((sum, time) => sum + time, 0) / this.measurements.length;
  }

  getMedian(): number {
    const sorted = [...this.measurements].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  getPercentile(percentile: number): number {
    const sorted = [...this.measurements].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  reset(): void {
    this.measurements = [];
  }
}

// Mock data generators
const generateDomainVisits = (count: number): DomainVisit[] => {
  const domains = [
    'example.com', 'test.com', 'demo.org', 'sample.net', 'mock.io',
    'github.com', 'stackoverflow.com', 'google.com', 'amazon.com', 'facebook.com'
  ];

  return Array.from({ length: count }, (_, i) => ({
    domain: domains[i % domains.length],
    timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
    visitCount: Math.floor(Math.random() * 50) + 1
  }));
};

const generateLargeObject = (size: number) => {
  return {
    id: 'test-object',
    data: Array.from({ length: size }, (_, i) => ({
      index: i,
      value: `item-${i}`,
      metadata: {
        created: new Date().toISOString(),
        tags: [`tag-${i % 10}`, `category-${i % 5}`],
        properties: {
          active: i % 2 === 0,
          priority: Math.floor(Math.random() * 10),
          description: `Description for item ${i}`.repeat(3)
        }
      }
    }))
  };
};

describe('Performance Benchmarks', () => {
  let timer: PerformanceTimer;

  beforeEach(() => {
    timer = new PerformanceTimer();
  });

  describe('Cohort Assignment Performance', () => {
    let cohortEngine: CohortEngine;

    beforeEach(() => {
      cohortEngine = CohortEngine.getInstance();
      cohortEngine.clearAllCohorts();
    });

    it('should process small domain visit sets quickly', async () => {
      const domainVisits = generateDomainVisits(10);
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await cohortEngine.assignCohorts(domainVisits);
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(50); // Average < 50ms
      expect(p95Time).toBeLessThan(100); // 95th percentile < 100ms

      console.log(`Small cohort assignment - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });

    it('should handle medium domain visit sets efficiently', async () => {
      const domainVisits = generateDomainVisits(100);
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await cohortEngine.assignCohorts(domainVisits);
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(200); // Average < 200ms
      expect(p95Time).toBeLessThan(500); // 95th percentile < 500ms

      console.log(`Medium cohort assignment - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });

    it('should scale to large domain visit sets', async () => {
      const domainVisits = generateDomainVisits(1000);
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await cohortEngine.assignCohorts(domainVisits);
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(1000); // Average < 1s
      expect(p95Time).toBeLessThan(2000); // 95th percentile < 2s

      console.log(`Large cohort assignment - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });

    it('should maintain performance under concurrent load', async () => {
      const domainVisits = generateDomainVisits(50);
      const concurrentRequests = 10;
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        
        const promises = Array.from({ length: concurrentRequests }, () =>
          cohortEngine.assignCohorts(domainVisits)
        );
        
        await Promise.all(promises);
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(1000); // Average < 1s for 10 concurrent requests
      expect(p95Time).toBeLessThan(2000); // 95th percentile < 2s

      console.log(`Concurrent cohort assignment - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });
  });

  describe('Encryption Performance', () => {
    let encryptionProvider: AESEncryptionProvider;
    let testKey: string;

    beforeEach(async () => {
      encryptionProvider = new AESEncryptionProvider();
      
      // Mock crypto operations for consistent testing
      const mockCrypto = {
        subtle: {
          generateKey: vi.fn().mockResolvedValue({}),
          exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
          importKey: vi.fn().mockResolvedValue({}),
          encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(64)),
          decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32))
        },
        getRandomValues: vi.fn().mockImplementation((array: Uint8Array) => {
          for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
          }
          return array;
        })
      };

      (global as any).crypto = mockCrypto;
      (global as any).TextEncoder = vi.fn().mockImplementation(() => ({
        encode: (text: string) => new Uint8Array(Buffer.from(text, 'utf8'))
      }));
      (global as any).TextDecoder = vi.fn().mockImplementation(() => ({
        decode: (buffer: Uint8Array) => Buffer.from(buffer).toString('utf8')
      }));

      testKey = await encryptionProvider.generateKey();
    });

    it('should encrypt small text data quickly', async () => {
      const testData = 'Hello, World!';
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await encryptionProvider.encrypt(testData, testKey);
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(10); // Average < 10ms
      expect(p95Time).toBeLessThan(20); // 95th percentile < 20ms

      console.log(`Small text encryption - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });

    it('should handle medium-sized objects efficiently', async () => {
      const testObject = generateLargeObject(100);
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await encryptionProvider.encryptObject(testObject, testKey);
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(50); // Average < 50ms
      expect(p95Time).toBeLessThan(100); // 95th percentile < 100ms

      console.log(`Medium object encryption - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });

    it('should scale to large objects', async () => {
      const testObject = generateLargeObject(1000);
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await encryptionProvider.encryptObject(testObject, testKey);
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(200); // Average < 200ms
      expect(p95Time).toBeLessThan(500); // 95th percentile < 500ms

      console.log(`Large object encryption - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });

    it('should maintain performance for concurrent encryption', async () => {
      const testData = 'Concurrent encryption test data';
      const concurrentOperations = 20;
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        
        const promises = Array.from({ length: concurrentOperations }, () =>
          encryptionProvider.encrypt(testData, testKey)
        );
        
        await Promise.all(promises);
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(500); // Average < 500ms for 20 concurrent operations
      expect(p95Time).toBeLessThan(1000); // 95th percentile < 1s

      console.log(`Concurrent encryption - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });
  });

  describe('Privacy Controls Performance', () => {
    let privacyControls: PrivacyControlsManager;
    let mockStorageProvider: any;
    let mockCohortEngine: any;

    beforeEach(() => {
      mockStorageProvider = {
        storeEncrypted: vi.fn().mockResolvedValue(undefined),
        retrieveEncrypted: vi.fn().mockResolvedValue(null),
        removeEncrypted: vi.fn().mockResolvedValue(undefined),
        clearAll: vi.fn().mockResolvedValue(undefined)
      };

      mockCohortEngine = {
        getCurrentCohorts: vi.fn().mockReturnValue([]),
        clearAllCohorts: vi.fn(),
        toggleCohort: vi.fn(),
        removeCohort: vi.fn()
      };

      privacyControls = new PrivacyControlsManager(mockStorageProvider, mockCohortEngine);
    });

    it('should retrieve user preferences quickly', async () => {
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await privacyControls.getUserPreferences();
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(5); // Average < 5ms
      expect(p95Time).toBeLessThan(10); // 95th percentile < 10ms

      console.log(`Preference retrieval - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });

    it('should handle large cohort sets efficiently', async () => {
      const largeCohortSet = Array.from({ length: 1000 }, (_, i) => ({
        topicId: i,
        topicName: `Topic ${i}`,
        confidence: Math.random(),
        assignedDate: new Date(),
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true
      }));

      mockCohortEngine.getCurrentCohorts.mockReturnValue(largeCohortSet);

      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await privacyControls.getCohortDisplayData();
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(100); // Average < 100ms
      expect(p95Time).toBeLessThan(200); // 95th percentile < 200ms

      console.log(`Large cohort display - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });

    it('should export large datasets efficiently', async () => {
      const largePreferences = {
        cohortsEnabled: true,
        shareWithAdvertisers: false,
        dataRetentionDays: 21,
        customSettings: generateLargeObject(500)
      };

      mockStorageProvider.retrieveEncrypted.mockResolvedValue(largePreferences);

      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await privacyControls.exportUserData('json');
        timer.stop();
      }

      const averageTime = timer.getAverage();
      const p95Time = timer.getPercentile(95);

      expect(averageTime).toBeLessThan(500); // Average < 500ms
      expect(p95Time).toBeLessThan(1000); // 95th percentile < 1s

      console.log(`Large data export - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage Benchmarks', () => {
    it('should maintain reasonable memory usage during cohort processing', async () => {
      const cohortEngine = CohortEngine.getInstance();
      const initialMemory = process.memoryUsage().heapUsed;

      // Process multiple large domain visit sets
      for (let i = 0; i < 10; i++) {
        const domainVisits = generateDomainVisits(1000);
        await cohortEngine.assignCohorts(domainVisits);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      expect(memoryIncreaseMB).toBeLessThan(50); // Should not increase by more than 50MB

      console.log(`Memory increase during cohort processing: ${memoryIncreaseMB.toFixed(2)}MB`);
    });

    it('should clean up memory after operations', async () => {
      const cohortEngine = CohortEngine.getInstance();
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform operations
      const domainVisits = generateDomainVisits(1000);
      await cohortEngine.assignCohorts(domainVisits);

      // Clear cohorts
      cohortEngine.clearAllCohorts();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryDifference = Math.abs(finalMemory - initialMemory);
      const memoryDifferenceMB = memoryDifference / (1024 * 1024);

      expect(memoryDifferenceMB).toBeLessThan(10); // Should return close to initial memory

      console.log(`Memory difference after cleanup: ${memoryDifferenceMB.toFixed(2)}MB`);
    });
  });

  describe('Stress Testing', () => {
    it('should handle sustained high load', async () => {
      const cohortEngine = CohortEngine.getInstance();
      const duration = 5000; // 5 seconds
      const startTime = Date.now();
      let operationCount = 0;

      while (Date.now() - startTime < duration) {
        const domainVisits = generateDomainVisits(50);
        await cohortEngine.assignCohorts(domainVisits);
        operationCount++;
      }

      const operationsPerSecond = operationCount / (duration / 1000);

      expect(operationsPerSecond).toBeGreaterThan(10); // At least 10 operations per second

      console.log(`Sustained load test - Operations per second: ${operationsPerSecond.toFixed(2)}`);
    });

    it('should recover from memory pressure', async () => {
      const cohortEngine = CohortEngine.getInstance();
      const largeObjects: any[] = [];

      try {
        // Create memory pressure
        for (let i = 0; i < 100; i++) {
          largeObjects.push(generateLargeObject(1000));
        }

        // Should still be able to perform operations
        const domainVisits = generateDomainVisits(100);
        timer.start();
        await cohortEngine.assignCohorts(domainVisits);
        const operationTime = timer.stop();

        expect(operationTime).toBeLessThan(2000); // Should complete within 2 seconds even under pressure

        console.log(`Operation under memory pressure: ${operationTime.toFixed(2)}ms`);
      } finally {
        // Clean up
        largeObjects.length = 0;
      }
    });
  });

  describe('Performance Regression Tests', () => {
    // Baseline performance metrics (these would be updated as the system evolves)
    const PERFORMANCE_BASELINES = {
      cohortAssignmentSmall: 50, // ms
      cohortAssignmentMedium: 200, // ms
      cohortAssignmentLarge: 1000, // ms
      encryptionSmall: 10, // ms
      encryptionMedium: 50, // ms
      privacyControlsRetrieval: 5, // ms
      storageOperations: 20, // ms
      memoryUsageIncrease: 50 // MB
    };

    it('should not regress on small cohort assignment performance', async () => {
      const cohortEngine = CohortEngine.getInstance();
      const domainVisits = generateDomainVisits(10);
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await cohortEngine.assignCohorts(domainVisits);
        timer.stop();
      }

      const averageTime = timer.getAverage();

      expect(averageTime).toBeLessThan(PERFORMANCE_BASELINES.cohortAssignmentSmall);

      if (averageTime > PERFORMANCE_BASELINES.cohortAssignmentSmall * 0.9) {
        console.warn(`Performance approaching baseline: ${averageTime.toFixed(2)}ms vs ${PERFORMANCE_BASELINES.cohortAssignmentSmall}ms baseline`);
      }
    });

    it('should not regress on encryption performance', async () => {
      const encryptionProvider = new AESEncryptionProvider();

      // Mock crypto operations
      const mockCrypto = {
        subtle: {
          generateKey: vi.fn().mockResolvedValue({}),
          exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
          importKey: vi.fn().mockResolvedValue({}),
          encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(64)),
          decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32))
        },
        getRandomValues: vi.fn().mockImplementation((array: Uint8Array) => {
          for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
          }
          return array;
        })
      };

      (global as any).crypto = mockCrypto;
      (global as any).TextEncoder = vi.fn().mockImplementation(() => ({
        encode: (text: string) => new Uint8Array(Buffer.from(text, 'utf8'))
      }));

      const testKey = await encryptionProvider.generateKey();
      const testData = 'Performance test data';
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        timer.start();
        await encryptionProvider.encrypt(testData, testKey);
        timer.stop();
      }

      const averageTime = timer.getAverage();

      expect(averageTime).toBeLessThan(PERFORMANCE_BASELINES.encryptionSmall);
    });

    it('should track performance trends over time', async () => {
      // This would integrate with a performance tracking system
      const performanceMetrics = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        metrics: {
          cohortAssignmentSmall: timer.getAverage(),
          memoryUsage: process.memoryUsage().heapUsed / (1024 * 1024),
          testEnvironment: 'vitest'
        }
      };

      // In a real system, this would be stored in a performance database
      expect(performanceMetrics.metrics.memoryUsage).toBeLessThan(200); // Less than 200MB
      expect(performanceMetrics.timestamp).toBeTruthy();
    });

    it('should detect performance anomalies', async () => {
      const cohortEngine = CohortEngine.getInstance();
      const domainVisits = generateDomainVisits(100);
      const measurements: number[] = [];

      // Take multiple measurements
      for (let i = 0; i < 20; i++) {
        timer.start();
        await cohortEngine.assignCohorts(domainVisits);
        measurements.push(timer.stop());
      }

      // Calculate statistics
      const mean = measurements.reduce((sum, time) => sum + time, 0) / measurements.length;
      const variance = measurements.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / measurements.length;
      const standardDeviation = Math.sqrt(variance);

      // Check for anomalies (measurements more than 2 standard deviations from mean)
      const anomalies = measurements.filter(time => Math.abs(time - mean) > 2 * standardDeviation);

      expect(anomalies.length).toBeLessThan(measurements.length * 0.1); // Less than 10% anomalies

      if (anomalies.length > 0) {
        console.warn(`Performance anomalies detected: ${anomalies.length} out of ${measurements.length} measurements`);
      }
    });
  });
});
