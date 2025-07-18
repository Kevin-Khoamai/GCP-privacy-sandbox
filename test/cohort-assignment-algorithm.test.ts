import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CohortEngine } from '../src/shared/core/cohort-engine';
import { DomainVisit } from '../src/shared/interfaces/browsing-history';
import { TopicTaxonomy, Topic } from '../src/shared/interfaces/cohort-assignment';

// Mock data for testing
const mockTopicTaxonomy: TopicTaxonomy = {
  topics: [
    { id: 1, name: 'Sports', parentId: null, level: 1, isSensitive: false, description: 'Sports and athletics' },
    { id: 2, name: 'Football', parentId: 1, level: 2, isSensitive: false, description: 'American football' },
    { id: 3, name: 'Basketball', parentId: 1, level: 2, isSensitive: false, description: 'Basketball' },
    { id: 4, name: 'Technology', parentId: null, level: 1, isSensitive: false, description: 'Technology and computing' },
    { id: 5, name: 'Programming', parentId: 4, level: 2, isSensitive: false, description: 'Software programming' },
    { id: 6, name: 'Health', parentId: null, level: 1, isSensitive: true, description: 'Health and medical' },
    { id: 7, name: 'Finance', parentId: null, level: 1, isSensitive: true, description: 'Financial services' },
    { id: 8, name: 'Travel', parentId: null, level: 1, isSensitive: false, description: 'Travel and tourism' },
    { id: 9, name: 'Food', parentId: null, level: 1, isSensitive: false, description: 'Food and cooking' },
    { id: 10, name: 'Shopping', parentId: null, level: 1, isSensitive: false, description: 'Online shopping' }
  ],
  domainMappings: [
    { domain: 'espn.com', topicIds: [1, 2], confidence: 0.9, lastUpdated: new Date(), source: 'manual' },
    { domain: 'nba.com', topicIds: [1, 3], confidence: 0.95, lastUpdated: new Date(), source: 'manual' },
    { domain: 'github.com', topicIds: [4, 5], confidence: 0.85, lastUpdated: new Date(), source: 'manual' },
    { domain: 'stackoverflow.com', topicIds: [4, 5], confidence: 0.8, lastUpdated: new Date(), source: 'manual' },
    { domain: 'webmd.com', topicIds: [6], confidence: 0.9, lastUpdated: new Date(), source: 'manual' },
    { domain: 'bankofamerica.com', topicIds: [7], confidence: 0.95, lastUpdated: new Date(), source: 'manual' },
    { domain: 'expedia.com', topicIds: [8], confidence: 0.9, lastUpdated: new Date(), source: 'manual' },
    { domain: 'allrecipes.com', topicIds: [9], confidence: 0.85, lastUpdated: new Date(), source: 'manual' },
    { domain: 'amazon.com', topicIds: [10], confidence: 0.7, lastUpdated: new Date(), source: 'manual' }
  ],
  lastUpdated: new Date()
};

const createMockDomainVisits = (visits: Array<{ domain: string; visitCount: number; daysAgo?: number }>): DomainVisit[] => {
  return visits.map(visit => ({
    domain: visit.domain,
    timestamp: new Date(Date.now() - (visit.daysAgo || 0) * 24 * 60 * 60 * 1000),
    visitCount: visit.visitCount
  }));
};

describe('Cohort Assignment Algorithm', () => {
  let cohortEngine: CohortEngine;

  beforeEach(() => {
    cohortEngine = CohortEngine.getInstance();
    // Reset the engine state
    cohortEngine.clearAllCohorts();
    
    // Mock the taxonomy loading
    vi.spyOn(cohortEngine as any, 'loadTopicTaxonomy').mockResolvedValue(mockTopicTaxonomy);
  });

  describe('Basic Cohort Assignment', () => {
    it('should assign cohorts based on domain visits', async () => {
      const domainVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 10 },
        { domain: 'nba.com', visitCount: 8 },
        { domain: 'github.com', visitCount: 15 }
      ]);

      const assignments = await cohortEngine.assignCohorts(domainVisits);

      expect(assignments).toHaveLength(3); // Sports, Technology, Programming
      
      const sportsAssignment = assignments.find(a => a.topicId === 1);
      const techAssignment = assignments.find(a => a.topicId === 4);
      const programmingAssignment = assignments.find(a => a.topicId === 5);

      expect(sportsAssignment).toBeTruthy();
      expect(sportsAssignment?.confidence).toBeGreaterThan(0.5);
      expect(techAssignment).toBeTruthy();
      expect(programmingAssignment).toBeTruthy();
    });

    it('should calculate confidence scores correctly', async () => {
      const domainVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 20 }, // High confidence
        { domain: 'github.com', visitCount: 2 }  // Lower confidence
      ]);

      const assignments = await cohortEngine.assignCohorts(domainVisits);

      const sportsAssignment = assignments.find(a => a.topicId === 1);
      const techAssignment = assignments.find(a => a.topicId === 4);

      expect(sportsAssignment?.confidence).toBeGreaterThan(techAssignment?.confidence || 0);
    });

    it('should filter out sensitive topics', async () => {
      const domainVisits = createMockDomainVisits([
        { domain: 'webmd.com', visitCount: 10 },      // Health - sensitive
        { domain: 'bankofamerica.com', visitCount: 5 }, // Finance - sensitive
        { domain: 'espn.com', visitCount: 3 }          // Sports - not sensitive
      ]);

      const assignments = await cohortEngine.assignCohorts(domainVisits);

      // Should only have sports assignment, not health or finance
      expect(assignments).toHaveLength(1);
      expect(assignments[0].topicId).toBe(1); // Sports
      
      // Verify sensitive topics are not assigned
      const healthAssignment = assignments.find(a => a.topicId === 6);
      const financeAssignment = assignments.find(a => a.topicId === 7);
      expect(healthAssignment).toBeUndefined();
      expect(financeAssignment).toBeUndefined();
    });

    it('should handle unknown domains gracefully', async () => {
      const domainVisits = createMockDomainVisits([
        { domain: 'unknown-domain.com', visitCount: 10 },
        { domain: 'another-unknown.net', visitCount: 5 },
        { domain: 'espn.com', visitCount: 3 }
      ]);

      const assignments = await cohortEngine.assignCohorts(domainVisits);

      // Should only assign cohorts for known domains
      expect(assignments).toHaveLength(1);
      expect(assignments[0].topicId).toBe(1); // Sports from espn.com
    });
  });

  describe('Confidence Score Calculation', () => {
    it('should increase confidence with more visits', async () => {
      const lowVisits = createMockDomainVisits([{ domain: 'espn.com', visitCount: 1 }]);
      const highVisits = createMockDomainVisits([{ domain: 'espn.com', visitCount: 20 }]);

      const lowAssignments = await cohortEngine.assignCohorts(lowVisits);
      const highAssignments = await cohortEngine.assignCohorts(highVisits);

      const lowConfidence = lowAssignments.find(a => a.topicId === 1)?.confidence || 0;
      const highConfidence = highAssignments.find(a => a.topicId === 1)?.confidence || 0;

      expect(highConfidence).toBeGreaterThan(lowConfidence);
    });

    it('should consider domain mapping confidence', async () => {
      // espn.com has 0.9 confidence, amazon.com has 0.7 confidence
      const domainVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 5 },
        { domain: 'amazon.com', visitCount: 5 }
      ]);

      const assignments = await cohortEngine.assignCohorts(domainVisits);

      const sportsAssignment = assignments.find(a => a.topicId === 1);
      const shoppingAssignment = assignments.find(a => a.topicId === 10);

      expect(sportsAssignment?.confidence).toBeGreaterThan(shoppingAssignment?.confidence || 0);
    });

    it('should apply recency weighting', async () => {
      const recentVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 5, daysAgo: 1 }
      ]);
      const oldVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 5, daysAgo: 20 }
      ]);

      const recentAssignments = await cohortEngine.assignCohorts(recentVisits);
      const oldAssignments = await cohortEngine.assignCohorts(oldVisits);

      const recentConfidence = recentAssignments.find(a => a.topicId === 1)?.confidence || 0;
      const oldConfidence = oldAssignments.find(a => a.topicId === 1)?.confidence || 0;

      expect(recentConfidence).toBeGreaterThan(oldConfidence);
    });
  });

  describe('Cohort Limits and Thresholds', () => {
    it('should limit maximum number of cohorts', async () => {
      const domainVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 10 },
        { domain: 'nba.com', visitCount: 9 },
        { domain: 'github.com', visitCount: 8 },
        { domain: 'stackoverflow.com', visitCount: 7 },
        { domain: 'expedia.com', visitCount: 6 },
        { domain: 'allrecipes.com', visitCount: 5 },
        { domain: 'amazon.com', visitCount: 4 }
      ]);

      const assignments = await cohortEngine.assignCohorts(domainVisits);

      // Should limit to maximum cohorts (typically 3-5)
      expect(assignments.length).toBeLessThanOrEqual(5);
      
      // Should prioritize highest confidence assignments
      const confidences = assignments.map(a => a.confidence).sort((a, b) => b - a);
      expect(confidences).toEqual([...confidences].sort((a, b) => b - a));
    });

    it('should apply minimum confidence threshold', async () => {
      const domainVisits = createMockDomainVisits([
        { domain: 'amazon.com', visitCount: 1 } // Very low visits, should have low confidence
      ]);

      const assignments = await cohortEngine.assignCohorts(domainVisits);

      // Should filter out assignments below minimum confidence threshold
      assignments.forEach(assignment => {
        expect(assignment.confidence).toBeGreaterThan(0.1); // Minimum threshold
      });
    });

    it('should handle empty domain visits', async () => {
      const assignments = await cohortEngine.assignCohorts([]);
      expect(assignments).toHaveLength(0);
    });
  });

  describe('Temporal Aspects', () => {
    it('should set appropriate expiry dates', async () => {
      const domainVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 10 }
      ]);

      const assignments = await cohortEngine.assignCohorts(domainVisits);
      const assignment = assignments[0];

      expect(assignment.expiryDate).toBeInstanceOf(Date);
      expect(assignment.expiryDate.getTime()).toBeGreaterThan(Date.now());
      
      // Should expire within reasonable timeframe (7-21 days)
      const daysUntilExpiry = (assignment.expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysUntilExpiry).toBeGreaterThan(6);
      expect(daysUntilExpiry).toBeLessThan(22);
    });

    it('should handle cohort updates correctly', async () => {
      // Initial assignment
      const initialVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 5 }
      ]);
      const initialAssignments = await cohortEngine.assignCohorts(initialVisits);
      
      // Additional visits should update confidence
      const additionalVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 10 },
        { domain: 'nba.com', visitCount: 8 }
      ]);
      const updatedAssignments = await cohortEngine.assignCohorts(additionalVisits);

      expect(updatedAssignments.length).toBeGreaterThanOrEqual(initialAssignments.length);
      
      const updatedSportsAssignment = updatedAssignments.find(a => a.topicId === 1);
      const initialSportsAssignment = initialAssignments.find(a => a.topicId === 1);
      
      expect(updatedSportsAssignment?.confidence).toBeGreaterThan(initialSportsAssignment?.confidence || 0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed domain visits', async () => {
      const malformedVisits: DomainVisit[] = [
        { domain: '', timestamp: new Date(), visitCount: 5 },
        { domain: 'valid.com', timestamp: new Date(), visitCount: 0 },
        { domain: 'espn.com', timestamp: new Date(), visitCount: -1 }
      ];

      const assignments = await cohortEngine.assignCohorts(malformedVisits);
      
      // Should handle gracefully without throwing errors
      expect(assignments).toBeDefined();
      expect(Array.isArray(assignments)).toBe(true);
    });

    it('should handle very large visit counts', async () => {
      const domainVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 999999 }
      ]);

      const assignments = await cohortEngine.assignCohorts(domainVisits);
      
      expect(assignments).toHaveLength(1);
      expect(assignments[0].confidence).toBeLessThanOrEqual(1.0);
      expect(assignments[0].confidence).toBeGreaterThan(0);
    });

    it('should handle future timestamps', async () => {
      const futureVisits: DomainVisit[] = [
        {
          domain: 'espn.com',
          timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          visitCount: 5
        }
      ];

      const assignments = await cohortEngine.assignCohorts(futureVisits);
      
      // Should handle gracefully
      expect(assignments).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of domain visits efficiently', async () => {
      const largeDomainVisits = Array.from({ length: 1000 }, (_, i) => ({
        domain: `domain${i}.com`,
        timestamp: new Date(),
        visitCount: Math.floor(Math.random() * 10) + 1
      }));

      // Add some known domains
      largeDomainVisits.push(...createMockDomainVisits([
        { domain: 'espn.com', visitCount: 10 },
        { domain: 'github.com', visitCount: 8 }
      ]));

      const startTime = Date.now();
      const assignments = await cohortEngine.assignCohorts(largeDomainVisits);
      const endTime = Date.now();

      // Should complete within reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(assignments).toBeDefined();
      expect(assignments.length).toBeGreaterThan(0);
    });

    it('should maintain consistent results for identical inputs', async () => {
      const domainVisits = createMockDomainVisits([
        { domain: 'espn.com', visitCount: 10 },
        { domain: 'github.com', visitCount: 8 }
      ]);

      const assignments1 = await cohortEngine.assignCohorts(domainVisits);
      const assignments2 = await cohortEngine.assignCohorts(domainVisits);

      expect(assignments1).toHaveLength(assignments2.length);
      
      // Compare assignments (allowing for small floating-point differences)
      assignments1.forEach((assignment1, index) => {
        const assignment2 = assignments2[index];
        expect(assignment1.topicId).toBe(assignment2.topicId);
        expect(Math.abs(assignment1.confidence - assignment2.confidence)).toBeLessThan(0.001);
      });
    });
  });
});
