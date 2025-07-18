/**
 * Helper functions for the metrics collector
 * These functions support the implementation of privacy-preserving metrics collection
 */

import { TimeRange } from '../interfaces/common';
import { AggregatedMetrics } from '../interfaces/metrics';

/**
 * Get time segments based on aggregation level
 * @param timeRange - The overall time range
 * @param aggregationLevel - Level of aggregation (hourly, daily, weekly)
 * @returns Array of time segments
 */
export function getTimeSegments(
  timeRange: TimeRange,
  aggregationLevel: 'hourly' | 'daily' | 'weekly'
): TimeRange[] {
  const segments: TimeRange[] = [];
  const startTime = new Date(timeRange.startDate);
  const endTime = new Date(timeRange.endDate);
  
  let currentSegmentStart = new Date(startTime);
  
  while (currentSegmentStart < endTime) {
    let currentSegmentEnd: Date;
    
    switch (aggregationLevel) {
      case 'hourly':
        currentSegmentEnd = new Date(currentSegmentStart);
        currentSegmentEnd.setHours(currentSegmentEnd.getHours() + 1);
        break;
      case 'daily':
        currentSegmentEnd = new Date(currentSegmentStart);
        currentSegmentEnd.setDate(currentSegmentEnd.getDate() + 1);
        break;
      case 'weekly':
        currentSegmentEnd = new Date(currentSegmentStart);
        currentSegmentEnd.setDate(currentSegmentEnd.getDate() + 7);
        break;
    }
    
    // Ensure we don't go beyond the overall end time
    if (currentSegmentEnd > endTime) {
      currentSegmentEnd = new Date(endTime);
    }
    
    segments.push({
      startDate: new Date(currentSegmentStart),
      endDate: new Date(currentSegmentEnd)
    });
    
    // Move to next segment
    currentSegmentStart = new Date(currentSegmentEnd);
  }
  
  return segments;
}

/**
 * Calculate data completeness based on time segments
 * @param metric - The aggregated metrics
 * @param timeSegments - Array of time segments
 * @returns Completeness score (0-1)
 */
export function calculateDataCompleteness(
  metric: AggregatedMetrics,
  timeSegments: TimeRange[]
): number {
  // Simple implementation - in a real system this would analyze data distribution
  // across time segments to determine completeness
  
  if (timeSegments.length === 0) return 0;
  
  // For now, we'll use a simple ratio of data points to expected data points
  const expectedPointsPerSegment = 10; // Arbitrary baseline
  const expectedTotalPoints = timeSegments.length * expectedPointsPerSegment;
  
  return Math.min(1, metric.dataPoints / expectedTotalPoints);
}

/**
 * Calculate engagement score based on metrics
 * @param metric - The aggregated metrics
 * @returns Engagement score (0-100)
 */
export function calculateEngagementScore(metric: AggregatedMetrics): number {
  if (!metric.privacyThresholdMet) return 0;
  
  // Engagement is primarily based on click-through rate
  // with a small factor for conversion rate
  const ctrFactor = 0.8;
  const conversionFactor = 0.2;
  
  // Normalize CTR (10% is considered excellent)
  const normalizedCTR = Math.min(metric.clickThroughRate / 10, 1);
  
  // Normalize conversion rate (20% is considered excellent)
  const normalizedConversion = Math.min(metric.conversionRate / 20, 1);
  
  return (normalizedCTR * ctrFactor + normalizedConversion * conversionFactor) * 100;
}

/**
 * Calculate reach score based on metrics
 * @param metric - The aggregated metrics
 * @returns Reach score (0-100)
 */
export function calculateReachScore(metric: AggregatedMetrics): number {
  if (!metric.privacyThresholdMet) return 0;
  
  // Reach is based on impression volume
  // 1000 impressions is considered a baseline (score of 50)
  // 10000 impressions is considered excellent (score of 100)
  
  if (metric.impressions <= 0) return 0;
  
  if (metric.impressions < 1000) {
    return (metric.impressions / 1000) * 50;
  }
  
  if (metric.impressions >= 10000) {
    return 100;
  }
  
  // Scale from 50 to 100 for impressions between 1000 and 10000
  return 50 + ((metric.impressions - 1000) / 9000) * 50;
}

/**
 * Calculate relevance score based on metrics
 * @param metric - The aggregated metrics
 * @returns Relevance score (0-100)
 */
export function calculateRelevanceScore(metric: AggregatedMetrics): number {
  if (!metric.privacyThresholdMet) return 0;
  
  // Relevance is primarily based on conversion rate
  // with a small factor for click-through rate
  const conversionFactor = 0.7;
  const ctrFactor = 0.3;
  
  // Normalize conversion rate (20% is considered excellent)
  const normalizedConversion = Math.min(metric.conversionRate / 20, 1);
  
  // Normalize CTR (10% is considered excellent)
  const normalizedCTR = Math.min(metric.clickThroughRate / 10, 1);
  
  return (normalizedConversion * conversionFactor + normalizedCTR * ctrFactor) * 100;
}