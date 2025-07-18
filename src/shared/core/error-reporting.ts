/**
 * Privacy-safe error reporting system
 * Collects and reports errors while protecting user privacy
 */

import { ErrorSeverity } from './error-handler';
import { FeedbackSystem, FeedbackType, FeedbackSeverity } from './feedback-system';

export interface ErrorReport {
  id: string;
  timestamp: Date;
  errorType: string;
  message: string;
  component: string;
  severity: ErrorSeverity;
  stackTrace?: string;
  userAgent: string;
  url?: string;
  userId?: string; // Anonymous user ID
  sessionId: string;
  buildVersion: string;
  privacySafeContext: Record<string, any>;
  reproductionSteps?: string[];
  userImpact: 'none' | 'minor' | 'major' | 'critical';
}

export interface ErrorReportingConfig {
  enabled: boolean;
  autoReport: boolean;
  includeStackTrace: boolean;
  includeUserAgent: boolean;
  includeUrl: boolean;
  maxReportsPerSession: number;
  reportingEndpoint?: string;
  privacyLevel: 'minimal' | 'standard' | 'detailed';
}

export interface ErrorReportingProvider {
  submitReport(report: ErrorReport): Promise<boolean>;
  getReportStatus(reportId: string): Promise<'pending' | 'processed' | 'resolved'>;
}

/**
 * Privacy-safe context sanitizer
 */
export class PrivacyContextSanitizer {
  private static readonly SENSITIVE_PATTERNS = [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
    /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, // SSN patterns
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, // IP addresses
    /\b[A-Za-z0-9]{20,}\b/g, // Long tokens/keys
  ];

  private static readonly SENSITIVE_KEYS = [
    'password', 'token', 'key', 'secret', 'auth', 'credential',
    'email', 'phone', 'ssn', 'credit', 'card', 'account'
  ];

  /**
   * Sanitize context data to remove sensitive information
   */
  static sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      
      // Skip sensitive keys entirely
      if (this.SENSITIVE_KEYS.some(sensitiveKey => lowerKey.includes(sensitiveKey))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeContext(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize string content
   */
  private static sanitizeString(str: string): string {
    let sanitized = str;
    
    // Apply sensitive pattern replacements
    this.SENSITIVE_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    // Truncate very long strings
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500) + '...[TRUNCATED]';
    }

    return sanitized;
  }

  /**
   * Sanitize URL to remove sensitive parameters
   */
  static sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Remove sensitive query parameters
      const sensitiveParams = ['token', 'key', 'auth', 'session', 'password', 'email'];
      sensitiveParams.forEach(param => {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, '[REDACTED]');
        }
      });

      // Remove hash if it looks like a token
      if (urlObj.hash && urlObj.hash.length > 20) {
        urlObj.hash = '#[REDACTED]';
      }

      return urlObj.toString();
    } catch {
      return '[INVALID_URL]';
    }
  }

  /**
   * Generate anonymous user ID
   */
  static generateAnonymousUserId(): string {
    // Create a hash-based anonymous ID that's consistent per browser but not personally identifiable
    const browserFingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset()
    ].join('|');

    // Simple hash function (in production, use a proper crypto hash)
    let hash = 0;
    for (let i = 0; i < browserFingerprint.length; i++) {
      const char = browserFingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `anon_${Math.abs(hash).toString(36)}`;
  }
}

/**
 * Main error reporting system
 */
export class ErrorReportingSystem {
  private config: ErrorReportingConfig;
  private provider?: ErrorReportingProvider;
  private feedbackSystem?: FeedbackSystem;
  private sessionId: string;
  private reportsThisSession = 0;
  private reportQueue: ErrorReport[] = [];

  constructor(
    config: Partial<ErrorReportingConfig> = {},
    provider?: ErrorReportingProvider,
    feedbackSystem?: FeedbackSystem
  ) {
    this.config = {
      enabled: true,
      autoReport: false,
      includeStackTrace: false,
      includeUserAgent: true,
      includeUrl: false,
      maxReportsPerSession: 10,
      privacyLevel: 'standard',
      ...config
    };
    
    this.provider = provider;
    this.feedbackSystem = feedbackSystem;
    this.sessionId = this.generateSessionId();
  }

  /**
   * Report an error with privacy-safe diagnostics
   */
  async reportError(
    error: Error,
    context: Record<string, any> = {},
    options: {
      component?: string;
      severity?: ErrorSeverity;
      userImpact?: 'none' | 'minor' | 'major' | 'critical';
      reproductionSteps?: string[];
      autoSubmit?: boolean;
    } = {}
  ): Promise<string | null> {
    if (!this.config.enabled || this.reportsThisSession >= this.config.maxReportsPerSession) {
      return null;
    }

    const reportId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const report: ErrorReport = {
      id: reportId,
      timestamp: new Date(),
      errorType: error.constructor.name,
      message: error.message,
      component: options.component || 'unknown',
      severity: options.severity || ErrorSeverity.ERROR,
      stackTrace: this.config.includeStackTrace ? error.stack : undefined,
      userAgent: this.config.includeUserAgent ? navigator.userAgent : 'redacted',
      url: this.config.includeUrl ? PrivacyContextSanitizer.sanitizeUrl(window.location.href) : undefined,
      userId: PrivacyContextSanitizer.generateAnonymousUserId(),
      sessionId: this.sessionId,
      buildVersion: this.getBuildVersion(),
      privacySafeContext: this.sanitizeContextByPrivacyLevel(context),
      reproductionSteps: options.reproductionSteps,
      userImpact: options.userImpact || 'minor'
    };

    this.reportQueue.push(report);
    this.reportsThisSession++;

    // Auto-submit if configured and provider is available
    if ((this.config.autoReport || options.autoSubmit) && this.provider) {
      try {
        await this.provider.submitReport(report);
        console.log(`Error report ${reportId} submitted automatically`);
      } catch (submitError) {
        console.error('Failed to auto-submit error report:', submitError);
      }
    }

    // Also submit as feedback if feedback system is available and error is severe
    if (this.feedbackSystem && this.isSevereError(report.severity)) {
      try {
        await this.feedbackSystem.submitFeedback(
          FeedbackType.BUG_REPORT,
          `Error in ${report.component}`,
          `An error occurred: ${report.message}`,
          {
            severity: this.mapErrorSeverityToFeedbackSeverity(report.severity),
            component: report.component,
            includeSystemInfo: true,
            includeLogs: true
          }
        );
      } catch (feedbackError) {
        console.error('Failed to submit error as feedback:', feedbackError);
      }
    }

    return reportId;
  }

  /**
   * Get pending error reports
   */
  getPendingReports(): ErrorReport[] {
    return [...this.reportQueue];
  }

  /**
   * Submit a specific error report
   */
  async submitReport(reportId: string): Promise<boolean> {
    const report = this.reportQueue.find(r => r.id === reportId);
    if (!report || !this.provider) {
      return false;
    }

    try {
      const success = await this.provider.submitReport(report);
      if (success) {
        // Remove from queue
        this.reportQueue = this.reportQueue.filter(r => r.id !== reportId);
      }
      return success;
    } catch (error) {
      console.error('Failed to submit error report:', error);
      return false;
    }
  }

  /**
   * Submit all pending reports
   */
  async submitAllReports(): Promise<{ submitted: number; failed: number }> {
    if (!this.provider) {
      return { submitted: 0, failed: this.reportQueue.length };
    }

    let submitted = 0;
    let failed = 0;

    const reports = [...this.reportQueue];
    for (const report of reports) {
      try {
        const success = await this.provider.submitReport(report);
        if (success) {
          submitted++;
          this.reportQueue = this.reportQueue.filter(r => r.id !== report.id);
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to submit report ${report.id}:`, error);
        failed++;
      }
    }

    return { submitted, failed };
  }

  /**
   * Clear all pending reports
   */
  clearReports(): void {
    this.reportQueue = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ErrorReportingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get error reporting statistics
   */
  getStatistics(): {
    reportsThisSession: number;
    pendingReports: number;
    maxReportsPerSession: number;
    canReportMore: boolean;
  } {
    return {
      reportsThisSession: this.reportsThisSession,
      pendingReports: this.reportQueue.length,
      maxReportsPerSession: this.config.maxReportsPerSession,
      canReportMore: this.reportsThisSession < this.config.maxReportsPerSession
    };
  }

  /**
   * Sanitize context based on privacy level
   */
  private sanitizeContextByPrivacyLevel(context: Record<string, any>): Record<string, any> {
    const sanitized = PrivacyContextSanitizer.sanitizeContext(context);

    switch (this.config.privacyLevel) {
      case 'minimal':
        // Only include error-specific context
        return {
          errorContext: sanitized.errorContext || {},
          timestamp: sanitized.timestamp
        };
      
      case 'standard':
        // Include most context but remove detailed user data
        const { userPreferences, personalData, ...standardContext } = sanitized;
        return standardContext;
      
      case 'detailed':
        // Include all sanitized context
        return sanitized;
      
      default:
        return sanitized;
    }
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get build version
   */
  private getBuildVersion(): string {
    // In a real implementation, this would come from the build process
    return '1.0.0';
  }

  /**
   * Check if error severity is severe enough to warrant feedback submission
   */
  private isSevereError(severity: ErrorSeverity): boolean {
    return severity === ErrorSeverity.ERROR || severity === ErrorSeverity.CRITICAL;
  }

  /**
   * Map error severity to feedback severity
   */
  private mapErrorSeverityToFeedbackSeverity(errorSeverity: ErrorSeverity): FeedbackSeverity {
    switch (errorSeverity) {
      case ErrorSeverity.DEBUG: return FeedbackSeverity.LOW;
      case ErrorSeverity.INFO: return FeedbackSeverity.LOW;
      case ErrorSeverity.WARNING: return FeedbackSeverity.MEDIUM;
      case ErrorSeverity.ERROR: return FeedbackSeverity.HIGH;
      case ErrorSeverity.CRITICAL: return FeedbackSeverity.CRITICAL;
      default: return FeedbackSeverity.MEDIUM;
    }
  }
}
