import { TimeRange } from './common';

export interface DomainVisit {
  domain: string;
  timestamp: Date;
  visitCount: number;
}

export interface BrowsingHistoryMonitor {
  onPageVisit(url: string, timestamp: Date): void;
  getDomainVisits(timeRange: TimeRange): DomainVisit[];
  startMonitoring(): void;
  stopMonitoring(): void;
}