import { TimeRange } from './common';

export interface APIRequestContext {
  domain: string;
  apiKey: string;
  requestType: 'advertising' | 'measurement';
  timestamp: Date;
}

export interface MetricsData {
  cohortId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  aggregationLevel: 'high' | 'medium' | 'low';
}

export interface ExternalAPIInterface {
  getCohortIds(requestContext: APIRequestContext): Promise<string[]>;
  getAggregatedMetrics(cohortIds: string[], timeRange: TimeRange): Promise<MetricsData>;
  validateAPIKey(apiKey: string): Promise<boolean>;
}