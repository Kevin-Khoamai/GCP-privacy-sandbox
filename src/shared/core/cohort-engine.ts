import { CohortAssignmentEngine } from '../interfaces/cohort-assignment';
import { CohortAssignment, TopicTaxonomy } from '../interfaces/common';
import { DomainVisit } from '../interfaces/browsing-history';
import { DomainMapper, DomainClassificationResult } from './domain-mapper';
import { TaxonomyLoader } from './taxonomy-loader';

/**
 * Domain frequency analysis result
 */
interface DomainFrequencyAnalysis {
  domain: string;
  totalVisits: number;
  recentVisits: number;
  firstVisit: Date;
  lastVisit: Date;
  frequency: number; // visits per day
  recencyScore: number; // 0-1 based on how recent visits are
}

/**
 * Topic scoring result for cohort assignment
 */
interface TopicScore {
  topicId: number;
  topicName: string;
  score: number;
  confidence: number;
  contributingDomains: string[];
  visitCount: number;
}

/**
 * Cohort assignment engine that analyzes browsing history and assigns users to interest-based cohorts
 * Implements frequency analysis, weighted scoring, and privacy filtering
 */
export class CohortEngine implements CohortAssignmentEngine {
  private static instance: CohortEngine;
  private domainMapper: DomainMapper;
  private taxonomyLoader: TaxonomyLoader;
  private lastWeeklyUpdate: Date | null = null;
  private currentCohorts: CohortAssignment[] = [];

  // Configuration constants
  private readonly MAX_COHORTS = 5; // Top 5 topics as per requirements
  private readonly SHARED_COHORTS = 3; // Only 3 topics shared per week
  private readonly COHORT_RETENTION_WEEKS = 3; // 3-week retention period
  private readonly MIN_VISITS_FOR_COHORT = 3; // Minimum visits to consider for cohort
  private readonly RECENCY_WEIGHT = 0.4; // Weight for recency in scoring
  private readonly FREQUENCY_WEIGHT = 0.6; // Weight for frequency in scoring

  private constructor() {
    this.domainMapper = DomainMapper.getInstance();
    this.taxonomyLoader = TaxonomyLoader.getInstance();
  }

  /**
   * Get singleton instance of CohortEngine
   */
  public static getInstance(): CohortEngine {
    if (!CohortEngine.instance) {
      CohortEngine.instance = new CohortEngine();
    }
    return CohortEngine.instance;
  }

  /**
   * Assign cohorts based on domain visits with frequency analysis and weighted scoring
   * @param domainVisits Array of domain visits to analyze
   * @returns CohortAssignment[] Array of cohort assignments
   */
  public async assignCohorts(domainVisits: DomainVisit[]): Promise<CohortAssignment[]> {
    if (domainVisits.length === 0) {
      return [];
    }

    // Initialize dependencies
    await this.domainMapper.initialize();
    await this.taxonomyLoader.loadTaxonomy();

    // Step 1: Perform frequency analysis on domain visits
    const frequencyAnalysis = this.performFrequencyAnalysis(domainVisits);

    // Step 2: Classify domains and get topic mappings
    const domainClassifications = await this.classifyDomains(frequencyAnalysis);

    // Step 3: Calculate topic scores with weighted algorithm
    const topicScores = this.calculateTopicScores(frequencyAnalysis, domainClassifications);

    // Step 4: Apply privacy filtering to exclude sensitive categories
    const filteredScores = this.applyPrivacyFiltering(topicScores);

    // Step 5: Select top cohorts and create assignments
    const cohortAssignments = this.selectTopCohorts(filteredScores);

    // Update current cohorts
    this.currentCohorts = cohortAssignments;

    return cohortAssignments;
  }

  /**
   * Update weekly cohorts - selects 3 topics from top 5 for sharing
   */
  public updateWeeklyCohorts(): void {
    const now = new Date();
    
    // Check if weekly update is needed
    if (this.lastWeeklyUpdate) {
      const daysSinceUpdate = (now.getTime() - this.lastWeeklyUpdate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 7) {
        return; // Not time for weekly update yet
      }
    }

    // Remove expired cohorts (older than 3 weeks)
    const threeWeeksAgo = new Date(now.getTime() - (3 * 7 * 24 * 60 * 60 * 1000));
    this.currentCohorts = this.currentCohorts.filter(cohort => cohort.assignedDate >= threeWeeksAgo);

    // Update expiry dates for remaining cohorts
    this.currentCohorts.forEach(cohort => {
      cohort.expiryDate = new Date(cohort.assignedDate.getTime() + (3 * 7 * 24 * 60 * 60 * 1000));
    });

    this.lastWeeklyUpdate = now;
  }

  /**
   * Get the current cohort taxonomy
   * @returns TopicTaxonomy The taxonomy with domain mappings
   */
  public getCohortTaxonomy(): TopicTaxonomy {
    const taxonomy = this.taxonomyLoader.cachedTaxonomy;
    if (!taxonomy) {
      throw new Error('Taxonomy not loaded. Call assignCohorts first.');
    }
    return taxonomy;
  }

  /**
   * Get current active cohorts
   * @returns CohortAssignment[] Array of current cohort assignments
   */
  public getCurrentCohorts(): CohortAssignment[] {
    return [...this.currentCohorts]; // Return copy to prevent mutation
  }

  /**
   * Get cohorts for sharing (limited to 3 most recent)
   * @returns CohortAssignment[] Array of cohorts to share with advertisers
   */
  public getCohortsForSharing(): CohortAssignment[] {
    return this.currentCohorts
      .sort((a, b) => b.assignedDate.getTime() - a.assignedDate.getTime())
      .slice(0, this.SHARED_COHORTS);
  }

  /**
   * Clear all cohort data (useful for testing or privacy reset)
   */
  public clearCohorts(): void {
    this.currentCohorts = [];
    this.lastWeeklyUpdate = null;
  }

  /**
   * Perform frequency analysis on domain visits
   * @param domainVisits Array of domain visits
   * @returns DomainFrequencyAnalysis[] Analysis results
   */
  private performFrequencyAnalysis(domainVisits: DomainVisit[]): DomainFrequencyAnalysis[] {
    const domainMap = new Map<string, DomainVisit[]>();
    
    // Group visits by domain
    for (const visit of domainVisits) {
      if (!domainMap.has(visit.domain)) {
        domainMap.set(visit.domain, []);
      }
      domainMap.get(visit.domain)!.push(visit);
    }

    const analyses: DomainFrequencyAnalysis[] = [];
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    for (const [domain, visits] of domainMap) {
      const sortedVisits = visits.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const firstVisit = sortedVisits[0].timestamp;
      const lastVisit = sortedVisits[sortedVisits.length - 1].timestamp;
      
      const totalVisits = visits.reduce((sum, visit) => sum + visit.visitCount, 0);
      const recentVisits = visits
        .filter(visit => visit.timestamp >= oneWeekAgo)
        .reduce((sum, visit) => sum + visit.visitCount, 0);

      // Calculate frequency (visits per day)
      const daysSinceFirst = Math.max(1, (now.getTime() - firstVisit.getTime()) / (1000 * 60 * 60 * 24));
      const frequency = totalVisits / daysSinceFirst;

      // Calculate recency score (0-1, higher for more recent visits)
      const daysSinceLast = (now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - (daysSinceLast / 30)); // Decay over 30 days

      analyses.push({
        domain,
        totalVisits,
        recentVisits,
        firstVisit,
        lastVisit,
        frequency,
        recencyScore
      });
    }

    return analyses.filter(analysis => analysis.totalVisits >= this.MIN_VISITS_FOR_COHORT);
  }

  /**
   * Classify domains using the domain mapper
   * @param frequencyAnalyses Array of frequency analyses
   * @returns Promise<DomainClassificationResult[]> Classification results
   */
  private async classifyDomains(frequencyAnalyses: DomainFrequencyAnalysis[]): Promise<DomainClassificationResult[]> {
    const domains = frequencyAnalyses.map(analysis => analysis.domain);
    return await this.domainMapper.classifyDomains(domains);
  }

  /**
   * Calculate topic scores using weighted algorithm
   * @param frequencyAnalyses Domain frequency analyses
   * @param classifications Domain classifications
   * @returns TopicScore[] Topic scores
   */
  private calculateTopicScores(
    frequencyAnalyses: DomainFrequencyAnalysis[],
    classifications: DomainClassificationResult[]
  ): TopicScore[] {
    const topicScoreMap = new Map<number, {
      score: number;
      confidence: number;
      domains: Set<string>;
      visitCount: number;
    }>();

    // Create lookup map for frequency analyses
    const frequencyMap = new Map(frequencyAnalyses.map(analysis => [analysis.domain, analysis]));

    for (const classification of classifications) {
      const frequencyAnalysis = frequencyMap.get(classification.domain);
      if (!frequencyAnalysis || classification.topicIds.length === 0) {
        continue;
      }

      // Calculate domain score based on frequency and recency
      const domainScore = (
        this.FREQUENCY_WEIGHT * Math.log(1 + frequencyAnalysis.frequency) +
        this.RECENCY_WEIGHT * frequencyAnalysis.recencyScore
      ) * classification.confidence;

      // Distribute score among topics (if multiple topics per domain)
      const scorePerTopic = domainScore / classification.topicIds.length;

      for (const topicId of classification.topicIds) {
        if (!topicScoreMap.has(topicId)) {
          topicScoreMap.set(topicId, {
            score: 0,
            confidence: 0,
            domains: new Set(),
            visitCount: 0
          });
        }

        const topicData = topicScoreMap.get(topicId)!;
        topicData.score += scorePerTopic;
        topicData.confidence = Math.max(topicData.confidence, classification.confidence);
        topicData.domains.add(classification.domain);
        topicData.visitCount += frequencyAnalysis.totalVisits;
      }
    }

    // Convert to TopicScore array
    const topicScores: TopicScore[] = [];
    for (const [topicId, data] of topicScoreMap) {
      const topic = this.taxonomyLoader.getTopicById(topicId);
      if (topic) {
        topicScores.push({
          topicId,
          topicName: topic.name,
          score: data.score,
          confidence: data.confidence,
          contributingDomains: Array.from(data.domains),
          visitCount: data.visitCount
        });
      }
    }

    return topicScores.sort((a, b) => b.score - a.score);
  }

  /**
   * Apply privacy filtering to exclude sensitive categories
   * @param topicScores Array of topic scores
   * @returns TopicScore[] Filtered topic scores
   */
  private applyPrivacyFiltering(topicScores: TopicScore[]): TopicScore[] {
    return topicScores.filter(score => {
      const topic = this.taxonomyLoader.getTopicById(score.topicId);
      return topic && !topic.isSensitive;
    });
  }

  /**
   * Select top cohorts from filtered scores
   * @param filteredScores Filtered topic scores
   * @returns CohortAssignment[] Cohort assignments
   */
  private selectTopCohorts(filteredScores: TopicScore[]): CohortAssignment[] {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + (this.COHORT_RETENTION_WEEKS * 7 * 24 * 60 * 60 * 1000));

    return filteredScores
      .slice(0, this.MAX_COHORTS)
      .map(score => ({
        topicId: score.topicId,
        topicName: score.topicName,
        confidence: score.confidence,
        assignedDate: now,
        expiryDate
      }));
  }
}

// Export singleton instance
export const cohortEngine = CohortEngine.getInstance();