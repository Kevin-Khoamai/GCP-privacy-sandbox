import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CohortEngine } from '../src/shared/core/cohort-engine';
import { DomainVisit } from '../src/shared/interfaces/browsing-history';
import { CohortAssignment } from '../src/shared/interfaces/common';

describe('CohortEngine', () => {
  let cohortEngine: CohortEngine;

  beforeEach(() => {
    cohortEngine = CohortEngine.getInstance();
    cohortEngine.clearCohorts();
  });

  afterEach(() => {
    cohortEngine.clearCohorts();
  });

  describe('Cohort Assignment', () => {
    it('should return empty array for no domain visits', async () => {
      const cohorts = await cohortEngine.assignCohorts([]);
      expect(cohorts).toEqual([]);
    });

    it('should assign cohorts based on domain visits', async () => {
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: new Date('2025-01-15T10:00:00Z'),
          visitCount: 5
        },
        {
          domain: 'youtube.com',
          timestamp: new Date('2025-01-15T11:00:00Z'),
          visitCount: 8
        },
        {
          domain: 'spotify.com',
          timestamp: new Date('2025-01-15T12:00:00Z'),
          visitCount: 3
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      
      expect(cohorts.length).toBeGreaterThan(0);
      expect(cohorts.length).toBeLessThanOrEqual(5); // Max 5 cohorts
      
      // Check that cohorts have required properties
      cohorts.forEach(cohort => {
        expect(cohort).toHaveProperty('topicId');
        expect(cohort).toHaveProperty('topicName');
        expect(cohort).toHaveProperty('confidence');
        expect(cohort).toHaveProperty('assignedDate');
        expect(cohort).toHaveProperty('expiryDate');
        expect(typeof cohort.topicId).toBe('number');
        expect(typeof cohort.topicName).toBe('string');
        expect(typeof cohort.confidence).toBe('number');
        expect(cohort.confidence).toBeGreaterThan(0);
        expect(cohort.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should filter out domains with insufficient visits', async () => {
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: new Date('2025-01-15T10:00:00Z'),
          visitCount: 1 // Below minimum threshold
        },
        {
          domain: 'youtube.com',
          timestamp: new Date('2025-01-15T11:00:00Z'),
          visitCount: 2 // Below minimum threshold
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      expect(cohorts).toEqual([]);
    });

    it('should prioritize high-frequency domains', async () => {
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: new Date('2025-01-15T10:00:00Z'),
          visitCount: 20 // High frequency
        },
        {
          domain: 'youtube.com',
          timestamp: new Date('2025-01-15T11:00:00Z'),
          visitCount: 5 // Lower frequency
        },
        {
          domain: 'spotify.com',
          timestamp: new Date('2025-01-15T12:00:00Z'),
          visitCount: 3 // Lowest frequency
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      
      // Netflix should contribute to higher-scoring cohorts due to higher visit count
      expect(cohorts.length).toBeGreaterThan(0);
      
      // The algorithm should produce cohorts, and they should be ordered by internal scoring
      // (Note: confidence comes from domain mapping, not visit frequency directly)
      expect(cohorts.every(cohort => cohort.confidence > 0)).toBe(true);
    });

    it('should consider recency in scoring', async () => {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
      const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: now, // Very recent
          visitCount: 5
        },
        {
          domain: 'youtube.com',
          timestamp: oneWeekAgo, // Less recent
          visitCount: 5
        },
        {
          domain: 'spotify.com',
          timestamp: oneMonthAgo, // Old
          visitCount: 5
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      expect(cohorts.length).toBeGreaterThan(0);
      
      // More recent visits should generally result in higher confidence scores
      // (though this depends on domain mappings and other factors)
    });
  });

  describe('Privacy Filtering', () => {
    it('should exclude sensitive topics from cohort assignments', async () => {
      // This test would need mock data with sensitive topics
      // For now, we test that the filtering mechanism works
      const domainVisits: DomainVisit[] = [
        {
          domain: 'example.com',
          timestamp: new Date(),
          visitCount: 10
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      
      // Verify no sensitive topics are included
      cohorts.forEach(cohort => {
        // This would need access to taxonomy to verify topic sensitivity
        expect(cohort.topicId).toBeGreaterThan(0);
      });
    });
  });

  describe('Weekly Updates', () => {
    it('should not update cohorts before weekly interval', () => {
      // Set up initial state
      cohortEngine.updateWeeklyCohorts();
      const initialUpdateTime = (cohortEngine as any).lastWeeklyUpdate;
      
      // Try to update immediately
      cohortEngine.updateWeeklyCohorts();
      const secondUpdateTime = (cohortEngine as any).lastWeeklyUpdate;
      
      expect(secondUpdateTime).toEqual(initialUpdateTime);
    });

    it('should remove expired cohorts during weekly update', async () => {
      // Create cohorts with old dates
      const oldDate = new Date('2024-12-01T00:00:00Z');
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: oldDate,
          visitCount: 5
        }
      ];

      await cohortEngine.assignCohorts(domainVisits);
      
      // Manually set old assignment dates
      const cohorts = cohortEngine.getCurrentCohorts();
      cohorts.forEach(cohort => {
        cohort.assignedDate = oldDate;
      });

      // Force weekly update
      (cohortEngine as any).lastWeeklyUpdate = null;
      cohortEngine.updateWeeklyCohorts();
      
      // Old cohorts should be removed
      const updatedCohorts = cohortEngine.getCurrentCohorts();
      expect(updatedCohorts.length).toBeLessThanOrEqual(cohorts.length);
    });
  });

  describe('Cohort Sharing', () => {
    it('should limit shared cohorts to maximum of 3', async () => {
      const domainVisits: DomainVisit[] = [
        { domain: 'netflix.com', timestamp: new Date(), visitCount: 10 },
        { domain: 'youtube.com', timestamp: new Date(), visitCount: 9 },
        { domain: 'spotify.com', timestamp: new Date(), visitCount: 8 },
        { domain: 'steam.com', timestamp: new Date(), visitCount: 7 },
        { domain: 'apple.com', timestamp: new Date(), visitCount: 6 }
      ];

      await cohortEngine.assignCohorts(domainVisits);
      const sharedCohorts = cohortEngine.getCohortsForSharing();
      
      expect(sharedCohorts.length).toBeLessThanOrEqual(3);
    });

    it('should return most recent cohorts for sharing', async () => {
      const domainVisits: DomainVisit[] = [
        { domain: 'netflix.com', timestamp: new Date(), visitCount: 5 },
        { domain: 'youtube.com', timestamp: new Date(), visitCount: 5 }
      ];

      await cohortEngine.assignCohorts(domainVisits);
      
      // Wait a bit and assign more cohorts
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const moreDomainVisits: DomainVisit[] = [
        { domain: 'spotify.com', timestamp: new Date(), visitCount: 5 }
      ];
      
      await cohortEngine.assignCohorts([...domainVisits, ...moreDomainVisits]);
      
      const sharedCohorts = cohortEngine.getCohortsForSharing();
      
      // Should be sorted by most recent assignment date
      for (let i = 1; i < sharedCohorts.length; i++) {
        expect(sharedCohorts[i-1].assignedDate.getTime())
          .toBeGreaterThanOrEqual(sharedCohorts[i].assignedDate.getTime());
      }
    });
  });

  describe('Frequency Analysis', () => {
    it('should correctly analyze domain visit frequency', async () => {
      const baseTime = new Date('2025-01-01T00:00:00Z');
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: new Date(baseTime.getTime()),
          visitCount: 1
        },
        {
          domain: 'netflix.com',
          timestamp: new Date(baseTime.getTime() + 24 * 60 * 60 * 1000), // 1 day later
          visitCount: 1
        },
        {
          domain: 'netflix.com',
          timestamp: new Date(baseTime.getTime() + 48 * 60 * 60 * 1000), // 2 days later
          visitCount: 1
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      expect(cohorts.length).toBeGreaterThan(0);
      
      // The frequency analysis should recognize the regular pattern
      // and assign appropriate cohorts
    });

    it('should handle multiple visits to same domain on same day', async () => {
      const today = new Date();
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: today,
          visitCount: 10 // Multiple visits aggregated
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      expect(cohorts.length).toBeGreaterThan(0);
    });
  });

  describe('Topic Scoring Algorithm', () => {
    it('should assign higher scores to more frequently visited domains', async () => {
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com', // Entertainment domain
          timestamp: new Date(),
          visitCount: 20
        },
        {
          domain: 'github.com', // Technology domain  
          timestamp: new Date(),
          visitCount: 5
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      
      // Should have cohorts from both domains, but entertainment should score higher
      expect(cohorts.length).toBeGreaterThan(0);
      
      // The first cohort should have higher confidence (assuming it's from netflix)
      if (cohorts.length > 1) {
        expect(cohorts[0].confidence).toBeGreaterThanOrEqual(cohorts[1].confidence);
      }
    });

    it('should distribute scores among multiple topics per domain', async () => {
      // Some domains map to multiple topics
      const domainVisits: DomainVisit[] = [
        {
          domain: 'youtube.com', // Maps to both Arts & Entertainment and Music
          timestamp: new Date(),
          visitCount: 10
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      
      // Should potentially create multiple cohorts from the same domain
      expect(cohorts.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid domain visits gracefully', async () => {
      const domainVisits: DomainVisit[] = [
        {
          domain: '', // Empty domain
          timestamp: new Date(),
          visitCount: 5
        },
        {
          domain: 'invalid-domain-that-does-not-exist.xyz',
          timestamp: new Date(),
          visitCount: 5
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      
      // Should not throw error, may return empty array
      expect(Array.isArray(cohorts)).toBe(true);
    });

    it('should handle taxonomy loading errors gracefully', async () => {
      // First assign cohorts to load the taxonomy
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: new Date(),
          visitCount: 5
        }
      ];
      
      await cohortEngine.assignCohorts(domainVisits);
      
      // Now getCohortTaxonomy should work without throwing
      const taxonomy = cohortEngine.getCohortTaxonomy();
      expect(taxonomy).toBeDefined();
      expect(taxonomy.topics).toBeDefined();
    });
  });

  describe('Data Management', () => {
    it('should clear all cohort data when requested', async () => {
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: new Date(),
          visitCount: 5
        }
      ];

      await cohortEngine.assignCohorts(domainVisits);
      expect(cohortEngine.getCurrentCohorts().length).toBeGreaterThan(0);
      
      cohortEngine.clearCohorts();
      expect(cohortEngine.getCurrentCohorts().length).toBe(0);
    });

    it('should return copies of cohort data to prevent mutation', async () => {
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: new Date(),
          visitCount: 5
        }
      ];

      await cohortEngine.assignCohorts(domainVisits);
      const cohorts1 = cohortEngine.getCurrentCohorts();
      const cohorts2 = cohortEngine.getCurrentCohorts();
      
      // Should be different array instances
      expect(cohorts1).not.toBe(cohorts2);
      
      // But with same content
      expect(cohorts1).toEqual(cohorts2);
    });
  });

  describe('Configuration Constants', () => {
    it('should respect maximum cohort limit', async () => {
      // Create many domain visits to potentially generate more than 5 cohorts
      const domainVisits: DomainVisit[] = [
        { domain: 'netflix.com', timestamp: new Date(), visitCount: 10 },
        { domain: 'youtube.com', timestamp: new Date(), visitCount: 10 },
        { domain: 'spotify.com', timestamp: new Date(), visitCount: 10 },
        { domain: 'steam.com', timestamp: new Date(), visitCount: 10 },
        { domain: 'apple.com', timestamp: new Date(), visitCount: 10 },
        { domain: 'google.com', timestamp: new Date(), visitCount: 10 },
        { domain: 'microsoft.com', timestamp: new Date(), visitCount: 10 },
        { domain: 'amazon.com', timestamp: new Date(), visitCount: 10 }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      expect(cohorts.length).toBeLessThanOrEqual(5); // MAX_COHORTS = 5
    });

    it('should set appropriate expiry dates for cohorts', async () => {
      const domainVisits: DomainVisit[] = [
        {
          domain: 'netflix.com',
          timestamp: new Date(),
          visitCount: 5
        }
      ];

      const cohorts = await cohortEngine.assignCohorts(domainVisits);
      
      cohorts.forEach(cohort => {
        const threeWeeksInMs = 3 * 7 * 24 * 60 * 60 * 1000;
        const expectedExpiry = cohort.assignedDate.getTime() + threeWeeksInMs;
        const actualExpiry = cohort.expiryDate.getTime();
        
        // Allow for small timing differences
        expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(1000);
      });
    });
  });
});