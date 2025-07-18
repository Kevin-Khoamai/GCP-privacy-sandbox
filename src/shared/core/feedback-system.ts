/**
 * User feedback collection system for privacy cohort tracker
 * Collects privacy-safe feedback for system improvements
 */

export enum FeedbackType {
  BUG_REPORT = 'bug_report',
  FEATURE_REQUEST = 'feature_request',
  PRIVACY_CONCERN = 'privacy_concern',
  USABILITY_ISSUE = 'usability_issue',
  GENERAL_FEEDBACK = 'general_feedback'
}

export enum FeedbackSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface FeedbackData {
  id: string;
  type: FeedbackType;
  severity: FeedbackSeverity;
  title: string;
  description: string;
  category?: string;
  component?: string;
  userAgent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  attachments?: FeedbackAttachment[];
}

export interface FeedbackAttachment {
  id: string;
  name: string;
  type: 'screenshot' | 'log' | 'data_export';
  size: number;
  data: string; // Base64 encoded
}

export interface FeedbackSubmissionResult {
  success: boolean;
  feedbackId?: string;
  error?: string;
  estimatedProcessingTime?: string;
}

export interface FeedbackProvider {
  submitFeedback(feedback: FeedbackData): Promise<FeedbackSubmissionResult>;
  getFeedbackStatus(feedbackId: string): Promise<FeedbackStatus>;
  getFeedbackHistory(): Promise<FeedbackData[]>;
}

export interface FeedbackStatus {
  id: string;
  status: 'submitted' | 'processing' | 'reviewed' | 'resolved' | 'closed';
  lastUpdated: Date;
  response?: string;
}

/**
 * Privacy-safe feedback templates for common scenarios
 */
export class FeedbackTemplates {
  /**
   * Bug report template
   */
  static bugReport(component: string, description: string): Partial<FeedbackData> {
    return {
      type: FeedbackType.BUG_REPORT,
      severity: FeedbackSeverity.MEDIUM,
      title: `Issue with ${component}`,
      description,
      component,
      category: 'bug'
    };
  }

  /**
   * Privacy concern template
   */
  static privacyConcern(concern: string): Partial<FeedbackData> {
    return {
      type: FeedbackType.PRIVACY_CONCERN,
      severity: FeedbackSeverity.HIGH,
      title: 'Privacy Concern',
      description: concern,
      category: 'privacy'
    };
  }

  /**
   * Feature request template
   */
  static featureRequest(feature: string, justification: string): Partial<FeedbackData> {
    return {
      type: FeedbackType.FEATURE_REQUEST,
      severity: FeedbackSeverity.LOW,
      title: `Feature Request: ${feature}`,
      description: justification,
      category: 'enhancement'
    };
  }

  /**
   * Usability issue template
   */
  static usabilityIssue(area: string, issue: string): Partial<FeedbackData> {
    return {
      type: FeedbackType.USABILITY_ISSUE,
      severity: FeedbackSeverity.MEDIUM,
      title: `Usability Issue in ${area}`,
      description: issue,
      component: area,
      category: 'usability'
    };
  }
}

/**
 * Privacy-safe diagnostic data collector
 */
export class DiagnosticDataCollector {
  /**
   * Collect system information (privacy-safe)
   */
  static collectSystemInfo(): Record<string, any> {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screenResolution: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Collect browser extension information
   */
  static collectExtensionInfo(): Record<string, any> {
    const info: Record<string, any> = {
      extensionVersion: '1.0.0', // This would come from manifest
      browserSupport: {
        notifications: typeof chrome !== 'undefined' && !!chrome.notifications,
        storage: typeof chrome !== 'undefined' && !!chrome.storage,
        webNavigation: typeof chrome !== 'undefined' && !!chrome.webNavigation,
        permissions: typeof chrome !== 'undefined' && !!chrome.permissions
      }
    };

    // Add browser-specific info
    if (typeof chrome !== 'undefined') {
      info.browserType = 'chromium';
    } else if (typeof browser !== 'undefined') {
      info.browserType = 'firefox';
    } else {
      info.browserType = 'unknown';
    }

    return info;
  }

  /**
   * Collect privacy-safe error logs
   */
  static collectErrorLogs(maxEntries = 10): Record<string, any>[] {
    // This would integrate with the error logging system
    return [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Sample log entry (actual logs would be privacy-filtered)',
        component: 'diagnostic-collector'
      }
    ];
  }

  /**
   * Create privacy-safe screenshot (blurred sensitive areas)
   */
  static async createPrivacyScreenshot(): Promise<FeedbackAttachment | null> {
    try {
      // This would capture and blur sensitive information
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return null;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      // Fill with placeholder for demo
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#333';
      ctx.font = '16px Arial';
      ctx.fillText('Privacy-safe screenshot would be generated here', 50, 50);
      
      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      
      return {
        id: `screenshot-${Date.now()}`,
        name: 'privacy-screenshot.png',
        type: 'screenshot',
        size: base64Data.length,
        data: base64Data
      };
    } catch (error) {
      console.error('Failed to create privacy screenshot:', error);
      return null;
    }
  }
}

/**
 * Main feedback collection system
 */
export class FeedbackSystem {
  private provider: FeedbackProvider;
  private feedbackHistory: FeedbackData[] = [];
  private readonly MAX_HISTORY = 50;

  constructor(provider: FeedbackProvider) {
    this.provider = provider;
  }

  /**
   * Submit user feedback
   */
  async submitFeedback(
    type: FeedbackType,
    title: string,
    description: string,
    options: {
      severity?: FeedbackSeverity;
      category?: string;
      component?: string;
      includeSystemInfo?: boolean;
      includeScreenshot?: boolean;
      includeLogs?: boolean;
    } = {}
  ): Promise<FeedbackSubmissionResult> {
    const feedbackId = `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const feedback: FeedbackData = {
      id: feedbackId,
      type,
      severity: options.severity || FeedbackSeverity.MEDIUM,
      title,
      description,
      category: options.category,
      component: options.component,
      timestamp: new Date(),
      metadata: {},
      attachments: []
    };

    // Add system information if requested
    if (options.includeSystemInfo) {
      feedback.metadata!.systemInfo = DiagnosticDataCollector.collectSystemInfo();
      feedback.metadata!.extensionInfo = DiagnosticDataCollector.collectExtensionInfo();
    }

    // Add screenshot if requested
    if (options.includeScreenshot) {
      const screenshot = await DiagnosticDataCollector.createPrivacyScreenshot();
      if (screenshot) {
        feedback.attachments!.push(screenshot);
      }
    }

    // Add logs if requested
    if (options.includeLogs) {
      const logs = DiagnosticDataCollector.collectErrorLogs();
      feedback.metadata!.errorLogs = logs;
    }

    try {
      const result = await this.provider.submitFeedback(feedback);
      
      if (result.success) {
        // Add to local history
        this.feedbackHistory.unshift(feedback);
        if (this.feedbackHistory.length > this.MAX_HISTORY) {
          this.feedbackHistory = this.feedbackHistory.slice(0, this.MAX_HISTORY);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      return {
        success: false,
        error: 'Failed to submit feedback. Please try again later.'
      };
    }
  }

  /**
   * Submit quick feedback for common scenarios
   */
  async submitQuickFeedback(
    template: Partial<FeedbackData>,
    additionalInfo?: string
  ): Promise<FeedbackSubmissionResult> {
    const description = additionalInfo 
      ? `${template.description}\n\nAdditional information: ${additionalInfo}`
      : template.description || '';

    return this.submitFeedback(
      template.type || FeedbackType.GENERAL_FEEDBACK,
      template.title || 'Quick Feedback',
      description,
      {
        severity: template.severity,
        category: template.category,
        component: template.component,
        includeSystemInfo: true
      }
    );
  }

  /**
   * Get feedback status
   */
  async getFeedbackStatus(feedbackId: string): Promise<FeedbackStatus | null> {
    try {
      return await this.provider.getFeedbackStatus(feedbackId);
    } catch (error) {
      console.error('Failed to get feedback status:', error);
      return null;
    }
  }

  /**
   * Get local feedback history
   */
  getFeedbackHistory(): FeedbackData[] {
    return [...this.feedbackHistory];
  }

  /**
   * Get feedback statistics
   */
  getFeedbackStatistics(): {
    total: number;
    byType: Record<FeedbackType, number>;
    bySeverity: Record<FeedbackSeverity, number>;
    recent: number; // Last 7 days
  } {
    const stats = {
      total: this.feedbackHistory.length,
      byType: {} as Record<FeedbackType, number>,
      bySeverity: {} as Record<FeedbackSeverity, number>,
      recent: 0
    };

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Initialize counters
    Object.values(FeedbackType).forEach(type => {
      stats.byType[type] = 0;
    });
    Object.values(FeedbackSeverity).forEach(severity => {
      stats.bySeverity[severity] = 0;
    });

    // Count feedback
    this.feedbackHistory.forEach(feedback => {
      stats.byType[feedback.type]++;
      stats.bySeverity[feedback.severity]++;
      
      if (feedback.timestamp > sevenDaysAgo) {
        stats.recent++;
      }
    });

    return stats;
  }

  /**
   * Clear feedback history
   */
  clearHistory(): void {
    this.feedbackHistory = [];
  }
}
