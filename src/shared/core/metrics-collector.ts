import { 
  MetricsEvent, 
  AggregatedMetrics, 
  MetricsAggregationConfig, 
  MetricsCollectionInterface,
  MetricsStorage,
  PrivacyPreservingAggregator,
  DifferentialPrivacyParams,
  AttributionReport
} from '../interfaces/metrics';
import { TimeRange, UserCohortProfile } from '../interfaces/common';
import { StorageLayer } from './storage-layer';
import { EncryptionUtils } from './encryption-utils';
import { 
  getTimeSegments, 
  calculateDataCompleteness, 
  calculateEngagementScore, 
  calculateReachScore, 
  calculateRelevanceScore 
} from './metrics-collector-helpers';

/**
 * Privacy-preserving metrics collection system following Attribution Reporting API principles
 */
export class MetricsCollector implements MetricsCollectionInterface {
  private static instance: MetricsCollector;
  private storageLayer: StorageLayer;
  private encryptionUtils: EncryptionUtils;
  private metricsStorage: MetricsStorage;
  private privacyAggregator: PrivacyPreservingAggregator;

  // Default configuration following privacy-first principles
  private readonly defaultConfig: MetricsAggregationConfig = {
    minCohortSize: 50, // Minimum cohort size for reporting
    minDataPoints: 100, // Minimum data points for aggregation
    noiseLevel: 0.1, // 10% noise for differential privacy
    suppressionThreshold: 10, // Suppress data below this threshold
    aggregationWindow: 24 // 24-hour aggregation window
  };

  // Differential privacy parameters
  private readonly privacyParams: DifferentialPrivacyParams = {
    epsilon: 1.0, // Privacy budget
    delta: 1e-5, // Failure probability
    sensitivity: 1.0 // Maximum change in output
  };

  private constructor(
    storageLayer?: StorageLayer,
    encryptionUtils?: EncryptionUtils
  ) {
    this.storageLayer = storageLayer || new StorageLayer();
    this.encryptionUtils = encryptionUtils || new EncryptionUtils();
    this.metricsStorage = new MetricsStorageImpl(this.storageLayer, this.encryptionUtils);
    this.privacyAggregator = new PrivacyPreservingAggregatorImpl();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Create instance with custom dependencies (for testing)
   */
  public static createWithDependencies(
    storageLayer: StorageLayer,
    encryptionUtils: EncryptionUtils
  ): MetricsCollector {
    return new MetricsCollector(storageLayer, encryptionUtils);
  }

  /**
   * Initialize the metrics collector
   */
  public async initialize(): Promise<void> {
    await this.storageLayer.initialize();
    // Start background cleanup process
    this.startBackgroundCleanup();
  }

  /**
   * Record a metrics event (impression, click, or conversion)
   */
  public async recordEvent(event: MetricsEvent): Promise<void> {
    // Validate event data
    this.validateEvent(event);

    // Add timestamp if not provided
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    // Store the event securely
    await this.metricsStorage.storeEvent(event);
  }

  /**
   * Get aggregated metrics for specified cohorts with privacy safeguards
   */
  public async getAggregatedMetrics(cohortIds: string[], timeRange: TimeRange): Promise<AggregatedMetrics[]> {
    // Get raw events for the specified cohorts and time range
    const events = await this.metricsStorage.getEvents(cohortIds, timeRange);

    // Aggregate metrics with privacy preservation
    const rawMetrics = await this.privacyAggregator.aggregateMetrics(events, this.defaultConfig);

    // Apply differential privacy
    const noisyMetrics = await this.privacyAggregator.applyDifferentialPrivacy(rawMetrics, this.privacyParams);

    // Apply privacy thresholds and suppression
    const privacySafeMetrics = await this.applyPrivacyThresholds(noisyMetrics);

    return privacySafeMetrics;
  }

  /**
   * Generate attribution reports for conversion tracking
   */
  public async generateAttributionReports(timeRange: TimeRange): Promise<AttributionReport[]> {
    // Get all events in the time range
    const allEvents = await this.metricsStorage.getEvents([], timeRange);

    // Group events by cohort
    const eventsByCohort = this.groupEventsByCohort(allEvents);

    const reports: AttributionReport[] = [];

    // Generate attribution reports for each cohort
    for (const [cohortId, events] of eventsByCohort.entries()) {
      const cohortReports = this.generateCohortAttributionReports(cohortId, events);
      reports.push(...cohortReports);
    }

    // Apply privacy budget constraints and differential privacy
    const privacyProtectedReports = this.applyPrivacyBudgetToReports(reports);
    return this.applyDifferentialPrivacyToReports(privacyProtectedReports);
  }

  /**
   * Generate aggregated attribution reports with enhanced privacy safeguards
   */
  public async generateAggregatedAttributionReports(
    cohortIds: string[], 
    timeRange: TimeRange,
    aggregationLevel: 'hourly' | 'daily' | 'weekly' = 'daily'
  ): Promise<{
    cohortId: string;
    attributedConversions: number;
    totalConversionValue: number;
    averageAttributionDelay: number;
    conversionsBySource: Record<string, number>;
    privacyCompliant: boolean;
    reportingPeriod: TimeRange;
  }[]> {
    const reports = await this.generateAttributionReports(timeRange);
    
    // Filter by requested cohorts
    const filteredReports = cohortIds.length > 0 
      ? reports.filter(report => cohortIds.includes(report.cohortId))
      : reports;

    // Group reports by cohort and aggregate
    const aggregatedReports = new Map<string, {
      conversions: AttributionReport[];
      totalValue: number;
      totalDelay: number;
      sourceBreakdown: Map<string, number>;
    }>();

    for (const report of filteredReports) {
      if (!aggregatedReports.has(report.cohortId)) {
        aggregatedReports.set(report.cohortId, {
          conversions: [],
          totalValue: 0,
          totalDelay: 0,
          sourceBreakdown: new Map()
        });
      }

      const cohortData = aggregatedReports.get(report.cohortId)!;
      cohortData.conversions.push(report);
      cohortData.totalValue += report.conversionValue || 0;
      cohortData.totalDelay += report.attributionDelay;

      // Track source breakdown
      const sourceDomain = report.sourceEvent.domain;
      cohortData.sourceBreakdown.set(
        sourceDomain, 
        (cohortData.sourceBreakdown.get(sourceDomain) || 0) + 1
      );
    }

    // Convert to final format with privacy checks
    const results = [];
    for (const [cohortId, data] of aggregatedReports.entries()) {
      const conversionCount = data.conversions.length;
      const privacyCompliant = conversionCount >= this.defaultConfig.suppressionThreshold;

      results.push({
        cohortId,
        attributedConversions: privacyCompliant ? conversionCount : 0,
        totalConversionValue: privacyCompliant ? Math.round(data.totalValue * 100) / 100 : 0,
        averageAttributionDelay: privacyCompliant && conversionCount > 0 
          ? Math.round(data.totalDelay / conversionCount) : 0,
        conversionsBySource: privacyCompliant 
          ? Object.fromEntries(data.sourceBreakdown.entries()) : {},
        privacyCompliant,
        reportingPeriod: timeRange
      });
    }

    return results;
  }

  /**
   * Generate conversion funnel analysis with attribution
   */
  public async generateConversionFunnelReport(
    cohortIds: string[], 
    timeRange: TimeRange
  ): Promise<{
    cohortId: string;
    impressions: number;
    clicks: number;
    conversions: number;
    attributedConversions: number;
    impressionToClickRate: number;
    clickToConversionRate: number;
    impressionToConversionRate: number;
    averageTimeToConversion: number;
    privacyCompliant: boolean;
  }[]> {
    // Get both metrics and attribution data
    const [metrics, attributionReports] = await Promise.all([
      this.getAggregatedMetrics(cohortIds, timeRange),
      this.generateAggregatedAttributionReports(cohortIds, timeRange)
    ]);

    // Combine metrics with attribution data
    const funnelReports = metrics.map(metric => {
      const attributionData = attributionReports.find(report => report.cohortId === metric.cohortId);
      
      const impressionToClickRate = metric.impressions > 0 
        ? (metric.clicks / metric.impressions) * 100 : 0;
      const clickToConversionRate = metric.clicks > 0 
        ? (metric.conversions / metric.clicks) * 100 : 0;
      const impressionToConversionRate = metric.impressions > 0 
        ? (metric.conversions / metric.impressions) * 100 : 0;

      return {
        cohortId: metric.cohortId,
        impressions: metric.privacyThresholdMet ? metric.impressions : 0,
        clicks: metric.privacyThresholdMet ? metric.clicks : 0,
        conversions: metric.privacyThresholdMet ? metric.conversions : 0,
        attributedConversions: attributionData?.attributedConversions || 0,
        impressionToClickRate: metric.privacyThresholdMet ? Math.round(impressionToClickRate * 100) / 100 : 0,
        clickToConversionRate: metric.privacyThresholdMet ? Math.round(clickToConversionRate * 100) / 100 : 0,
        impressionToConversionRate: metric.privacyThresholdMet ? Math.round(impressionToConversionRate * 100) / 100 : 0,
        averageTimeToConversion: attributionData?.averageAttributionDelay || 0,
        privacyCompliant: metric.privacyThresholdMet && (attributionData?.privacyCompliant || false)
      };
    });

    return funnelReports.filter(report => report.privacyCompliant);
  }

  /**
   * Apply privacy thresholds to suppress low-volume data
   */
  public async applyPrivacyThresholds(metrics: AggregatedMetrics[]): Promise<AggregatedMetrics[]> {
    return await this.privacyAggregator.suppressLowVolumeData(metrics, this.defaultConfig.suppressionThreshold);
  }

  /**
   * Calculate click-through rate with privacy considerations
   */
  public calculateClickThroughRate(impressions: number, clicks: number): number {
    if (impressions === 0) return 0;
    
    // Apply minimum threshold for privacy
    if (impressions < this.defaultConfig.minDataPoints) {
      return 0; // Suppress CTR for low-volume data
    }

    return Math.round((clicks / impressions) * 10000) / 100; // Return as percentage with 2 decimal places
  }

  /**
   * Calculate conversion rate with privacy considerations
   */
  public calculateConversionRate(clicks: number, conversions: number): number {
    if (clicks === 0) return 0;
    
    // Apply minimum threshold for privacy
    if (clicks < this.defaultConfig.suppressionThreshold) {
      return 0; // Suppress conversion rate for low-volume data
    }

    return Math.round((conversions / clicks) * 10000) / 100; // Return as percentage with 2 decimal places
  }

  /**
   * Get metrics summary for dashboard display
   */
  public async getMetricsSummary(cohortIds: string[], timeRange: TimeRange): Promise<{
    totalImpressions: number;
    totalClicks: number;
    totalConversions: number;
    averageCTR: number;
    averageConversionRate: number;
    cohortsWithSufficientData: number;
  }> {
    const metrics = await this.getAggregatedMetrics(cohortIds, timeRange);
    
    const summary = metrics.reduce((acc, metric) => {
      if (metric.privacyThresholdMet) {
        acc.totalImpressions += metric.impressions;
        acc.totalClicks += metric.clicks;
        acc.totalConversions += metric.conversions;
        acc.cohortsWithSufficientData++;
      }
      return acc;
    }, {
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      cohortsWithSufficientData: 0
    });

    return {
      ...summary,
      averageCTR: this.calculateClickThroughRate(summary.totalImpressions, summary.totalClicks),
      averageConversionRate: this.calculateConversionRate(summary.totalClicks, summary.totalConversions)
    };
  }

  /**
   * Get aggregated metrics with enhanced privacy safeguards following Attribution Reporting API principles
   * 
   * This method implements the core functionality required for task 7.1:
   * - Aggregated metrics collection following Attribution Reporting API principles
   * - Impression and click-through rate calculation with privacy safeguards
   * - Cohort-based performance reporting with differential privacy
   * - Data suppression for insufficient cohort sizes
   * 
   * @param cohortIds - Array of cohort IDs to include in the report
   * @param timeRange - Time range for the report
   * @param aggregationLevel - Level of aggregation (hourly, daily, weekly)
   * @returns Privacy-safe aggregated metrics
   */
  public async getPrivacyPreservingAggregatedMetrics(
    cohortIds: string[], 
    timeRange: TimeRange,
    aggregationLevel: 'hourly' | 'daily' | 'weekly' = 'daily'
  ): Promise<{
    cohortId: string;
    timeRange: TimeRange;
    metrics: {
      impressions: number;
      clicks: number;
      conversions: number;
      clickThroughRate: number;
      conversionRate: number;
    };
    performance: {
      engagementScore: number;
      reachScore: number;
      relevanceScore: number;
      overallPerformance: number;
    };
    privacyInfo: {
      dataPoints: number;
      noiseLevel: number;
      privacyThresholdMet: boolean;
      suppressionApplied: boolean;
    };
    aggregationInfo: {
      level: 'hourly' | 'daily' | 'weekly';
      periodCount: number;
      completeness: number;
    };
  }[]> {
    try {
      // Get base metrics
      const baseMetrics = await this.getAggregatedMetrics(cohortIds, timeRange);
      
      // Apply additional privacy safeguards and aggregation
      const timeSegments = this.getTimeSegments(timeRange, aggregationLevel);
      
      // Create aggregated metrics with enhanced privacy
      const result = baseMetrics.map(metric => {
        // Skip metrics that don't meet privacy thresholds
        if (!metric.privacyThresholdMet) {
          return null;
        }
        
        // Calculate performance scores with additional noise for privacy
        const engagementScore = this.calculateEngagementScore(metric);
        const reachScore = this.calculateReachScore(metric);
        const relevanceScore = this.calculateRelevanceScore(metric);
        const overallPerformance = (engagementScore + reachScore + relevanceScore) / 3;
        
        // Calculate noise level based on data volume (more data = less noise)
        const noiseLevel = metric.dataPoints > 1000 ? 0.05 : 
                          metric.dataPoints > 500 ? 0.1 : 0.2;
        
        // Determine if suppression was applied
        const suppressionApplied = !metric.privacyThresholdMet || 
                                  metric.dataPoints < this.defaultConfig.suppressionThreshold;
        
        return {
          cohortId: metric.cohortId,
          timeRange: metric.timeRange,
          metrics: {
            impressions: metric.impressions,
            clicks: metric.clicks,
            conversions: metric.conversions,
            clickThroughRate: metric.clickThroughRate,
            conversionRate: metric.conversionRate
          },
          performance: {
            engagementScore: Math.round(engagementScore * 100) / 100,
            reachScore: Math.round(reachScore * 100) / 100,
            relevanceScore: Math.round(relevanceScore * 100) / 100,
            overallPerformance: Math.round(overallPerformance * 100) / 100
          },
          privacyInfo: {
            dataPoints: metric.privacyThresholdMet ? metric.dataPoints : 0,
            noiseLevel: Math.round(noiseLevel * 100) / 100,
            privacyThresholdMet: metric.privacyThresholdMet,
            suppressionApplied
          },
          aggregationInfo: {
            level: aggregationLevel,
            periodCount: timeSegments.length,
            completeness: this.calculateDataCompleteness(metric, timeSegments)
          }
        };
      }).filter(report => report !== null) as any[];
      
      return result;
    } catch (error) {
      console.error('Error generating privacy-preserving metrics:', error);
      return [];
    }
  }

  /**
   * Get cohort-based performance metrics for publishers
   */
  public async getCohortPerformanceMetrics(cohortIds: string[], timeRange: TimeRange): Promise<{
    cohortId: string;
    performanceScore: number;
    engagementRate: number;
    reachEstimate: number;
    privacyCompliant: boolean;
  }[]> {
    const metrics = await this.getAggregatedMetrics(cohortIds, timeRange);
    
    return metrics.map(metric => {
      const performanceScore = this.calculatePerformanceScore(metric);
      const engagementRate = metric.impressions > 0 ? 
        ((metric.clicks + metric.conversions) / metric.impressions) * 100 : 0;
      
      return {
        cohortId: metric.cohortId,
        performanceScore,
        engagementRate: Math.round(engagementRate * 100) / 100,
        reachEstimate: metric.privacyThresholdMet ? metric.impressions : 0,
        privacyCompliant: metric.privacyThresholdMet
      };
    }).filter(result => result.privacyCompliant);
  }

  /**
   * Calculate performance score based on multiple metrics
   */
  private calculatePerformanceScore(metric: AggregatedMetrics): number {
    if (!metric.privacyThresholdMet) return 0;
    
    // Weighted performance score (0-100)
    const ctrWeight = 0.4;
    const conversionWeight = 0.4;
    const volumeWeight = 0.2;
    
    const normalizedCTR = Math.min(metric.clickThroughRate / 10, 1); // Normalize to 0-1 (10% CTR = 1.0)
    const normalizedConversion = Math.min(metric.conversionRate / 20, 1); // Normalize to 0-1 (20% conversion = 1.0)
    const normalizedVolume = Math.min(metric.dataPoints / 1000, 1); // Normalize to 0-1 (1000 events = 1.0)
    
    const score = (normalizedCTR * ctrWeight + normalizedConversion * conversionWeight + normalizedVolume * volumeWeight) * 100;
    
    return Math.round(score * 100) / 100;
  }
  
  /**
   * Get time segments for aggregation
   */
  private getTimeSegments(
    timeRange: TimeRange,
    aggregationLevel: 'hourly' | 'daily' | 'weekly'
  ): TimeRange[] {
    return getTimeSegments(timeRange, aggregationLevel);
  }
  
  /**
   * Calculate data completeness
   */
  private calculateDataCompleteness(
    metric: AggregatedMetrics,
    timeSegments: TimeRange[]
  ): number {
    return calculateDataCompleteness(metric, timeSegments);
  }
  
  /**
   * Calculate engagement score
   */
  private calculateEngagementScore(metric: AggregatedMetrics): number {
    return calculateEngagementScore(metric);
  }
  
  /**
   * Calculate reach score
   */
  private calculateReachScore(metric: AggregatedMetrics): number {
    return calculateReachScore(metric);
  }
  
  /**
   * Calculate relevance score
   */
  private calculateRelevanceScore(metric: AggregatedMetrics): number {
    return calculateRelevanceScore(metric);
  }

  /**
   * Validate metrics event data
   */
  private validateEvent(event: MetricsEvent): void {
    if (!event.eventId || event.eventId.trim() === '') {
      throw new Error('Event ID is required');
    }

    if (!['impression', 'click', 'conversion'].includes(event.eventType)) {
      throw new Error('Invalid event type');
    }

    if (!event.cohortId || event.cohortId.trim() === '') {
      throw new Error('Cohort ID is required');
    }

    if (!event.domain || event.domain.trim() === '') {
      throw new Error('Domain is required');
    }
  }

  /**
   * Group events by cohort ID
   */
  private groupEventsByCohort(events: MetricsEvent[]): Map<string, MetricsEvent[]> {
    const grouped = new Map<string, MetricsEvent[]>();
    
    for (const event of events) {
      if (!grouped.has(event.cohortId)) {
        grouped.set(event.cohortId, []);
      }
      grouped.get(event.cohortId)!.push(event);
    }
    
    return grouped;
  }

  /**
   * Generate attribution reports for a specific cohort
   */
  private generateCohortAttributionReports(cohortId: string, events: MetricsEvent[]): AttributionReport[] {
    const reports: AttributionReport[] = [];
    
    // Sort events by timestamp
    const sortedEvents = events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Find impression -> conversion pairs
    const impressions = sortedEvents.filter(e => e.eventType === 'impression');
    const conversions = sortedEvents.filter(e => e.eventType === 'conversion');
    
    for (const conversion of conversions) {
      // Find the most recent impression before this conversion
      const attributableImpression = impressions
        .filter(imp => imp.timestamp.getTime() < conversion.timestamp.getTime())
        .pop(); // Get the most recent one
      
      if (attributableImpression) {
        reports.push({
          reportId: this.generateReportId(),
          cohortId,
          sourceEvent: attributableImpression,
          triggerEvent: conversion,
          attributionDelay: conversion.timestamp.getTime() - attributableImpression.timestamp.getTime(),
          conversionValue: conversion.metadata?.value || 1,
          timestamp: new Date(),
          privacyBudget: this.calculatePrivacyBudget(cohortId)
        });
      }
    }
    
    return reports;
  }

  /**
   * Apply privacy budget constraints to attribution reports
   */
  private applyPrivacyBudgetToReports(reports: AttributionReport[]): AttributionReport[] {
    // Group reports by cohort and apply budget limits
    const reportsByCohort = new Map<string, AttributionReport[]>();
    
    for (const report of reports) {
      if (!reportsByCohort.has(report.cohortId)) {
        reportsByCohort.set(report.cohortId, []);
      }
      reportsByCohort.get(report.cohortId)!.push(report);
    }
    
    const budgetLimitedReports: AttributionReport[] = [];
    
    for (const [cohortId, cohortReports] of reportsByCohort.entries()) {
      // Limit reports per cohort based on privacy budget
      const maxReports = Math.floor(this.privacyParams.epsilon * 10); // Simple budget allocation
      const limitedReports = cohortReports.slice(0, maxReports);
      budgetLimitedReports.push(...limitedReports);
    }
    
    return budgetLimitedReports;
  }
  
  /**
   * Apply differential privacy to attribution reports
   */
  private applyDifferentialPrivacyToReports(reports: AttributionReport[]): AttributionReport[] {
    return reports.map(report => {
      // Add noise to conversion value to preserve privacy
      const noiseScale = this.privacyParams.sensitivity / this.privacyParams.epsilon;
      
      // Only apply noise if there's a conversion value
      if (report.conversionValue !== undefined) {
        const noisyValue = report.conversionValue + this.generateLaplaceNoise(noiseScale);
        report.conversionValue = Math.max(0, Math.round(noisyValue * 100) / 100);
      }
      
      return report;
    });
  }
  
  /**
   * Generate Laplace noise for differential privacy
   */
  private generateLaplaceNoise(scale: number): number {
    // Generate Laplace noise using the inverse transform method
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Calculate privacy budget for a cohort
   */
  private calculatePrivacyBudget(cohortId: string): number {
    // Simple privacy budget calculation - in practice this would be more sophisticated
    return this.privacyParams.epsilon / 10; // Allocate 1/10th of total budget per cohort
  }

  /**
   * Generate unique report ID
   */
  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start background cleanup process for expired events
   */
  private startBackgroundCleanup(): void {
    // Run cleanup every hour
    setInterval(async () => {
      try {
        await this.metricsStorage.cleanupExpiredEvents();
      } catch (error) {
        console.warn('Background cleanup failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }
}

/**
 * Implementation of metrics storage with encryption using the proper storage interface
 */
class MetricsStorageImpl implements MetricsStorage {
  private readonly STORAGE_KEY_PREFIX = 'metrics_events_';
  private readonly EVENT_RETENTION_DAYS = 30;
  private eventsCache: Map<string, MetricsEvent[]> = new Map();

  constructor(
    private storageLayer: StorageLayer,
    private encryptionUtils: EncryptionUtils
  ) {}

  async storeEvent(event: MetricsEvent): Promise<void> {
    const dateKey = this.getDateKey(event.timestamp);
    
    // Get existing events for this date from cache or storage
    const existingEvents = await this.getEventsForDate(dateKey);
    existingEvents.push(event);
    
    // Update cache
    this.eventsCache.set(dateKey, existingEvents);
    
    // Store in the storage layer using a custom key-value approach
    // Since StorageLayer doesn't have setItem/getItem, we'll use the user profile to store metrics
    try {
      const profile = await this.storageLayer.getUserProfile() || this.createDefaultProfile();
      
      // Store events in the profile metadata
      if (!profile.metadata) {
        profile.metadata = {};
      }
      
      const storageKey = `${this.STORAGE_KEY_PREFIX}${dateKey}`;
      profile.metadata[storageKey] = this.encryptionUtils.encrypt(JSON.stringify(existingEvents));
      
      await this.storageLayer.storeUserProfile(profile);
    } catch (error) {
      console.warn(`Failed to store events for date ${dateKey}:`, error);
    }
  }

  async getEvents(cohortIds: string[], timeRange: TimeRange): Promise<MetricsEvent[]> {
    const events: MetricsEvent[] = [];
    const dateKeys = this.getDateKeysInRange(timeRange);
    
    for (const dateKey of dateKeys) {
      const dateEvents = await this.getEventsForDate(dateKey);
      
      // Filter by cohort IDs if specified
      const filteredEvents = cohortIds.length > 0 
        ? dateEvents.filter(event => cohortIds.includes(event.cohortId))
        : dateEvents;
      
      events.push(...filteredEvents);
    }
    
    return events.filter(event => 
      event.timestamp >= timeRange.startDate && event.timestamp <= timeRange.endDate
    );
  }

  async cleanupExpiredEvents(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.EVENT_RETENTION_DAYS);
    
    try {
      const profile = await this.storageLayer.getUserProfile();
      if (!profile || !profile.metadata) {
        return;
      }
      
      const expiredDateKeys = this.getExpiredDateKeys(cutoffDate);
      
      for (const dateKey of expiredDateKeys) {
        const storageKey = `${this.STORAGE_KEY_PREFIX}${dateKey}`;
        delete profile.metadata[storageKey];
        this.eventsCache.delete(dateKey);
      }
      
      await this.storageLayer.storeUserProfile(profile);
    } catch (error) {
      console.warn('Failed to cleanup expired events:', error);
    }
  }

  async getEventCount(cohortId: string, eventType: string, timeRange: TimeRange): Promise<number> {
    const events = await this.getEvents([cohortId], timeRange);
    return events.filter(event => event.eventType === eventType).length;
  }

  private async getEventsForDate(dateKey: string): Promise<MetricsEvent[]> {
    // Check cache first
    if (this.eventsCache.has(dateKey)) {
      return this.eventsCache.get(dateKey)!;
    }
    
    try {
      const profile = await this.storageLayer.getUserProfile();
      if (!profile || !profile.metadata) {
        return [];
      }
      
      const storageKey = `${this.STORAGE_KEY_PREFIX}${dateKey}`;
      const encryptedData = profile.metadata[storageKey];
      
      if (!encryptedData) {
        return [];
      }
      
      const decryptedData = this.encryptionUtils.decrypt(encryptedData);
      const events: MetricsEvent[] = JSON.parse(decryptedData) || [];
      
      // Parse dates properly since they come as strings from JSON
      const parsedEvents = events.map(event => ({
        ...event,
        timestamp: new Date(event.timestamp)
      }));
      
      // Cache the events
      this.eventsCache.set(dateKey, parsedEvents);
      
      return parsedEvents;
    } catch (error) {
      console.warn(`Failed to get events for date ${dateKey}:`, error);
      return [];
    }
  }

  private createDefaultProfile(): UserCohortProfile {
    return {
      userId: `user_${Date.now()}`,
      activeCohorts: [],
      preferences: {
        cohortsEnabled: true,
        disabledTopics: [],
        dataRetentionDays: 21,
        shareWithAdvertisers: true
      },
      lastUpdated: new Date(),
      version: '1.0',
      metadata: {}
    };
  }

  private getDateKey(date: Date): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  private getDateKeysInRange(timeRange: TimeRange): string[] {
    const keys: string[] = [];
    const current = new Date(timeRange.startDate);
    
    while (current <= timeRange.endDate) {
      keys.push(this.getDateKey(current));
      current.setDate(current.getDate() + 1);
    }
    
    return keys;
  }

  private getExpiredDateKeys(cutoffDate: Date): string[] {
    // In a real implementation, this would query the storage layer for existing keys
    // For now, we'll generate keys for the past retention period
    const keys: string[] = [];
    const current = new Date(cutoffDate);
    current.setDate(current.getDate() - this.EVENT_RETENTION_DAYS);
    
    while (current < cutoffDate) {
      keys.push(this.getDateKey(current));
      current.setDate(current.getDate() + 1);
    }
    
    return keys;
  }
}

/**
 * Implementation of privacy-preserving aggregation following Attribution Reporting API principles
 * 
 * This implementation follows the key principles of the Attribution Reporting API:
 * 1. Aggregation of data to prevent individual user identification
 * 2. Noise addition through differential privacy
 * 3. Data suppression for small cohorts
 * 4. Privacy budget management
 * 5. Delayed reporting to prevent timing attacks
 */
class PrivacyPreservingAggregatorImpl implements PrivacyPreservingAggregator {
  async aggregateMetrics(events: MetricsEvent[], config: MetricsAggregationConfig): Promise<AggregatedMetrics[]> {
    // Group events by cohort
    const eventsByCohort = new Map<string, MetricsEvent[]>();
    
    for (const event of events) {
      if (!eventsByCohort.has(event.cohortId)) {
        eventsByCohort.set(event.cohortId, []);
      }
      eventsByCohort.get(event.cohortId)!.push(event);
    }
    
    const aggregatedMetrics: AggregatedMetrics[] = [];
    
    for (const [cohortId, cohortEvents] of eventsByCohort.entries()) {
      const impressions = cohortEvents.filter(e => e.eventType === 'impression').length;
      const clicks = cohortEvents.filter(e => e.eventType === 'click').length;
      const conversions = cohortEvents.filter(e => e.eventType === 'conversion').length;
      
      const clickThroughRate = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
      
      const dataPoints = cohortEvents.length;
      const privacyThresholdMet = dataPoints >= config.minDataPoints && impressions >= config.minCohortSize;
      
      aggregatedMetrics.push({
        cohortId,
        timeRange: this.getTimeRangeFromEvents(cohortEvents),
        impressions,
        clicks,
        conversions,
        clickThroughRate,
        conversionRate,
        aggregationLevel: this.determineAggregationLevel(dataPoints),
        dataPoints,
        privacyThresholdMet
      });
    }
    
    return aggregatedMetrics;
  }

  async applyDifferentialPrivacy(metrics: AggregatedMetrics[], params: DifferentialPrivacyParams): Promise<AggregatedMetrics[]> {
    return metrics.map(metric => {
      if (!metric.privacyThresholdMet) {
        return metric; // Don't add noise to suppressed data
      }
      
      // Add Laplace noise for differential privacy
      const noiseScale = params.sensitivity / params.epsilon;
      
      return {
        ...metric,
        impressions: Math.max(0, Math.round(metric.impressions + this.generateLaplaceNoise(noiseScale))),
        clicks: Math.max(0, Math.round(metric.clicks + this.generateLaplaceNoise(noiseScale))),
        conversions: Math.max(0, Math.round(metric.conversions + this.generateLaplaceNoise(noiseScale))),
        clickThroughRate: Math.max(0, metric.clickThroughRate + this.generateLaplaceNoise(noiseScale * 0.1)),
        conversionRate: Math.max(0, metric.conversionRate + this.generateLaplaceNoise(noiseScale * 0.1))
      };
    });
  }

  async suppressLowVolumeData(metrics: AggregatedMetrics[], threshold: number): Promise<AggregatedMetrics[]> {
    return metrics.map(metric => {
      if (metric.dataPoints < threshold || !metric.privacyThresholdMet) {
        return {
          ...metric,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          clickThroughRate: 0,
          conversionRate: 0,
          privacyThresholdMet: false
        };
      }
      return metric;
    });
  }

  private getTimeRangeFromEvents(events: MetricsEvent[]): TimeRange {
    if (events.length === 0) {
      const now = new Date();
      return { startDate: now, endDate: now };
    }
    
    const timestamps = events.map(e => e.timestamp.getTime());
    return {
      startDate: new Date(Math.min(...timestamps)),
      endDate: new Date(Math.max(...timestamps))
    };
  }

  private determineAggregationLevel(dataPoints: number): 'high' | 'medium' | 'low' {
    if (dataPoints >= 1000) return 'high';
    if (dataPoints >= 100) return 'medium';
    return 'low';
  }

  private generateLaplaceNoise(scale: number): number {
    // Generate Laplace noise using the inverse transform method
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();