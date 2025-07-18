// Metrics and attribution interfaces for privacy-preserving measurement

import { TimeRange } from './common';

export interface MetricsEvent {
  eventId: string;
  eventType: 'impression' | 'click' | 'conversion';
  cohortId: string;
  timestamp: Date;
  domain: string;
  metadata?: Record<string, any>;
}

export interface AggregatedMetrics {
  cohortId: string;
  timeRange: TimeRange;
  impressions: number;
  clicks: number;
  conversions: number;
  clickThroughRate: number;
  conversionRate: number;
  aggregationLevel: 'high' | 'medium' | 'low';
  dataPoints: number;
  privacyThresholdMet: boolean;
}

export interface MetricsAggregationConfig {
  minCohortSize: number;
  minDataPoints: number;
  noiseLevel: number;
  suppressionThreshold: number;
  aggregationWindow: number; // in hours
}

export interface AttributionReport {
  reportId: string;
  cohortId: string;
  sourceEvent: MetricsEvent;
  triggerEvent: MetricsEvent;
  attributionDelay: number; // in milliseconds
  conversionValue?: number;
  timestamp: Date;
  privacyBudget: number;
}

export interface DifferentialPrivacyParams {
  epsilon: number; // Privacy budget
  delta: number; // Failure probability
  sensitivity: number; // Maximum change in output
}

export interface MetricsCollectionInterface {
  recordEvent(event: MetricsEvent): Promise<void>;
  getAggregatedMetrics(cohortIds: string[], timeRange: TimeRange): Promise<AggregatedMetrics[]>;
  generateAttributionReports(timeRange: TimeRange): Promise<AttributionReport[]>;
  applyPrivacyThresholds(metrics: AggregatedMetrics[]): Promise<AggregatedMetrics[]>;
  calculateClickThroughRate(impressions: number, clicks: number): number;
  calculateConversionRate(clicks: number, conversions: number): number;
}

export interface MetricsStorage {
  storeEvent(event: MetricsEvent): Promise<void>;
  getEvents(cohortIds: string[], timeRange: TimeRange): Promise<MetricsEvent[]>;
  cleanupExpiredEvents(): Promise<void>;
  getEventCount(cohortId: string, eventType: string, timeRange: TimeRange): Promise<number>;
}

export interface PrivacyPreservingAggregator {
  aggregateMetrics(events: MetricsEvent[], config: MetricsAggregationConfig): Promise<AggregatedMetrics[]>;
  applyDifferentialPrivacy(metrics: AggregatedMetrics[], params: DifferentialPrivacyParams): Promise<AggregatedMetrics[]>;
  suppressLowVolumeData(metrics: AggregatedMetrics[], threshold: number): Promise<AggregatedMetrics[]>;
}