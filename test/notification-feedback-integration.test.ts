import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  NotificationSystem, 
  NotificationType, 
  NotificationPriority,
  PrivacyNotificationTemplates,
  NotificationProvider,
  NotificationOptions,
  NotificationEvent
} from '../src/shared/core/notification-system';
import { 
  FeedbackSystem, 
  FeedbackType, 
  FeedbackSeverity,
  FeedbackTemplates,
  FeedbackProvider,
  FeedbackData,
  FeedbackSubmissionResult
} from '../src/shared/core/feedback-system';
import { 
  ContextualHelpSystem, 
  HelpTopicCategory,
  HelpContentDatabase 
} from '../src/shared/core/help-system';
import { 
  ErrorReportingSystem,
  PrivacyContextSanitizer 
} from '../src/shared/core/error-reporting';
import { ErrorSeverity } from '../src/shared/core/error-handler';

// Mock notification provider
class MockNotificationProvider implements NotificationProvider {
  private notifications = new Map<string, NotificationOptions>();
  private eventCallback?: (event: NotificationEvent) => void;

  async show(notification: NotificationOptions): Promise<string> {
    const id = notification.id || `mock-${Date.now()}`;
    this.notifications.set(id, { ...notification, id });
    
    // Simulate shown event
    setTimeout(() => {
      this.eventCallback?.({
        notificationId: id,
        action: 'shown',
        timestamp: new Date()
      });
    }, 10);
    
    return id;
  }

  async update(id: string, updates: Partial<NotificationOptions>): Promise<boolean> {
    const existing = this.notifications.get(id);
    if (!existing) return false;
    
    this.notifications.set(id, { ...existing, ...updates });
    return true;
  }

  async dismiss(id: string): Promise<boolean> {
    const success = this.notifications.delete(id);
    if (success) {
      this.eventCallback?.({
        notificationId: id,
        action: 'dismissed',
        timestamp: new Date()
      });
    }
    return success;
  }

  async dismissAll(): Promise<void> {
    this.notifications.clear();
  }

  async getActive(): Promise<NotificationOptions[]> {
    return Array.from(this.notifications.values());
  }

  onEvent(callback: (event: NotificationEvent) => void): void {
    this.eventCallback = callback;
  }

  // Test helper methods
  simulateClick(id: string): void {
    this.eventCallback?.({
      notificationId: id,
      action: 'clicked',
      timestamp: new Date()
    });
  }

  simulateActionClick(id: string, actionId: string): void {
    this.eventCallback?.({
      notificationId: id,
      action: 'action_clicked',
      actionId,
      timestamp: new Date()
    });
  }
}

// Mock feedback provider
class MockFeedbackProvider implements FeedbackProvider {
  private feedbacks: FeedbackData[] = [];

  async submitFeedback(feedback: FeedbackData): Promise<FeedbackSubmissionResult> {
    this.feedbacks.push(feedback);
    return {
      success: true,
      feedbackId: feedback.id,
      estimatedProcessingTime: '2-3 business days'
    };
  }

  async getFeedbackStatus(feedbackId: string) {
    return {
      id: feedbackId,
      status: 'submitted' as const,
      lastUpdated: new Date()
    };
  }

  async getFeedbackHistory(): Promise<FeedbackData[]> {
    return [...this.feedbacks];
  }

  // Test helper
  getSubmittedFeedbacks(): FeedbackData[] {
    return [...this.feedbacks];
  }
}

describe('Notification and Feedback System Integration', () => {
  let notificationProvider: MockNotificationProvider;
  let notificationSystem: NotificationSystem;
  let feedbackProvider: MockFeedbackProvider;
  let feedbackSystem: FeedbackSystem;
  let helpSystem: ContextualHelpSystem;
  let errorReporting: ErrorReportingSystem;

  beforeEach(() => {
    notificationProvider = new MockNotificationProvider();
    notificationSystem = new NotificationSystem(notificationProvider);
    feedbackProvider = new MockFeedbackProvider();
    feedbackSystem = new FeedbackSystem(feedbackProvider);
    helpSystem = new ContextualHelpSystem();
    errorReporting = new ErrorReportingSystem({}, undefined, feedbackSystem);

    // Mock DOM for screenshot functionality
    const originalCreateElement = document.createElement;
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: vi.fn().mockReturnValue({
            fillStyle: '',
            fillRect: vi.fn(),
            fillText: vi.fn(),
            font: ''
          }),
          width: 0,
          height: 0,
          toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mockdata')
        } as any;
      }
      return originalCreateElement.call(document, tagName);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Notification System', () => {
    it('should show privacy notifications with correct templates', async () => {
      const cohortNotification = PrivacyNotificationTemplates.cohortAssigned('Sports Enthusiasts', 3);
      const id = await notificationSystem.show(cohortNotification);

      expect(id).toBeTruthy();
      
      const active = await notificationSystem.getActive();
      expect(active).toHaveLength(1);
      expect(active[0].title).toBe('Interest Cohorts Updated');
      expect(active[0].type).toBe(NotificationType.INFO);
    });

    it('should handle notification events and update history', async () => {
      const notification = PrivacyNotificationTemplates.dataDeleted('cohort assignments');
      const id = await notificationSystem.show(notification);

      // Wait for shown event
      await new Promise(resolve => setTimeout(resolve, 20));

      const history = notificationSystem.getHistory(5);
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('shown');
      expect(history[0].notificationId).toBe(id);
    });

    it('should handle notification actions', async () => {
      const notification = PrivacyNotificationTemplates.consentWithdrawn();
      const id = await notificationSystem.show(notification);

      let actionEvent: NotificationEvent | null = null;
      notificationSystem.addEventListener((event) => {
        if (event.action === 'action_clicked') {
          actionEvent = event;
        }
      });

      // Simulate action click
      notificationProvider.simulateActionClick(id, 'view_details');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(actionEvent).toBeTruthy();
      expect(actionEvent?.actionId).toBe('view_details');
    });

    it('should auto-dismiss non-persistent notifications', async () => {
      const notification = {
        title: 'Test Notification',
        message: 'This should auto-dismiss',
        type: NotificationType.INFO,
        priority: NotificationPriority.LOW,
        persistent: false,
        expiresAt: new Date(Date.now() + 100) // 100ms from now
      };

      const id = await notificationSystem.show(notification);
      expect(await notificationSystem.getActive()).toHaveLength(1);

      // Wait for auto-dismissal
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(await notificationSystem.getActive()).toHaveLength(0);
    });
  });

  describe('Feedback System', () => {
    it('should submit feedback with system information', async () => {
      const result = await feedbackSystem.submitFeedback(
        FeedbackType.BUG_REPORT,
        'Test Bug Report',
        'This is a test bug report',
        {
          severity: FeedbackSeverity.HIGH,
          component: 'notification-system',
          includeSystemInfo: true,
          includeScreenshot: true
        }
      );

      expect(result.success).toBe(true);
      expect(result.feedbackId).toBeTruthy();

      const submitted = feedbackProvider.getSubmittedFeedbacks();
      expect(submitted).toHaveLength(1);
      expect(submitted[0].type).toBe(FeedbackType.BUG_REPORT);
      expect(submitted[0].metadata?.systemInfo).toBeTruthy();
      expect(submitted[0].attachments).toHaveLength(1);
    });

    it('should use feedback templates correctly', async () => {
      const template = FeedbackTemplates.privacyConcern('Data sharing without consent');
      const result = await feedbackSystem.submitQuickFeedback(template, 'Additional context');

      expect(result.success).toBe(true);

      const submitted = feedbackProvider.getSubmittedFeedbacks();
      expect(submitted).toHaveLength(1);
      expect(submitted[0].type).toBe(FeedbackType.PRIVACY_CONCERN);
      expect(submitted[0].severity).toBe(FeedbackSeverity.HIGH);
      expect(submitted[0].description).toContain('Additional context');
    });

    it('should track feedback statistics', async () => {
      // Submit multiple feedback items
      await feedbackSystem.submitFeedback(FeedbackType.BUG_REPORT, 'Bug 1', 'Description 1');
      await feedbackSystem.submitFeedback(FeedbackType.FEATURE_REQUEST, 'Feature 1', 'Description 2');
      await feedbackSystem.submitFeedback(FeedbackType.BUG_REPORT, 'Bug 2', 'Description 3');

      const stats = feedbackSystem.getFeedbackStatistics();
      expect(stats.total).toBe(3);
      expect(stats.byType[FeedbackType.BUG_REPORT]).toBe(2);
      expect(stats.byType[FeedbackType.FEATURE_REQUEST]).toBe(1);
    });
  });

  describe('Help System', () => {
    it('should provide contextual suggestions based on current context', () => {
      helpSystem.setContext(['first-launch', 'onboarding']);
      helpSystem.setUserLevel('beginner');

      const suggestions = helpSystem.getContextualSuggestions();
      expect(suggestions.length).toBeGreaterThan(0);
      
      const gettingStartedSuggestion = suggestions.find(s => 
        s.topic.category === HelpTopicCategory.GETTING_STARTED
      );
      expect(gettingStartedSuggestion).toBeTruthy();
    });

    it('should search help topics effectively', () => {
      const results = helpSystem.searchHelp('privacy settings');
      expect(results.length).toBeGreaterThan(0);
      
      const privacyResult = results.find(r => 
        r.topic.title.toLowerCase().includes('privacy')
      );
      expect(privacyResult).toBeTruthy();
      expect(privacyResult?.relevanceScore).toBeGreaterThan(0);
    });

    it('should track user progress', () => {
      helpSystem.markTopicViewed('getting-started-overview');
      helpSystem.markTopicViewed('privacy-controls-overview');

      const progress = helpSystem.getUserProgress();
      expect(progress.topicsViewed).toBe(2);
      expect(progress.completionPercentage).toBeGreaterThan(0);
      expect(progress.recommendedNext.length).toBeGreaterThan(0);
    });

    it('should get related topics', () => {
      const relatedTopics = helpSystem.getRelatedTopics('getting-started-overview');
      expect(relatedTopics.length).toBeGreaterThan(0);
      
      const privacyTopic = relatedTopics.find(t => 
        t.id === 'privacy-controls-overview'
      );
      expect(privacyTopic).toBeTruthy();
    });
  });

  describe('Error Reporting System', () => {
    it('should sanitize sensitive information from context', () => {
      const sensitiveContext = {
        userEmail: 'user@example.com',
        creditCard: '4111-1111-1111-1111',
        password: 'secret123',
        normalData: 'this is fine',
        ipAddress: '192.168.1.1'
      };

      const sanitized = PrivacyContextSanitizer.sanitizeContext(sensitiveContext);
      
      expect(sanitized.userEmail).toBe('[REDACTED]');
      expect(sanitized.creditCard).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.normalData).toBe('this is fine');
      expect(sanitized.ipAddress).toBe('[REDACTED]');
    });

    it('should report errors and submit as feedback for severe errors', async () => {
      const testError = new Error('Test error message');
      
      const reportId = await errorReporting.reportError(testError, {
        component: 'test-component',
        userAction: 'clicking button'
      }, {
        severity: ErrorSeverity.ERROR,
        userImpact: 'major',
        autoSubmit: false
      });

      expect(reportId).toBeTruthy();

      const pendingReports = errorReporting.getPendingReports();
      expect(pendingReports).toHaveLength(1);
      expect(pendingReports[0].message).toBe('Test error message');

      // Check if feedback was also submitted
      const submittedFeedbacks = feedbackProvider.getSubmittedFeedbacks();
      expect(submittedFeedbacks.length).toBeGreaterThan(0);
      
      const errorFeedback = submittedFeedbacks.find(f => 
        f.type === FeedbackType.BUG_REPORT && f.description.includes('Test error message')
      );
      expect(errorFeedback).toBeTruthy();
    });

    it('should generate anonymous user IDs consistently', () => {
      const id1 = PrivacyContextSanitizer.generateAnonymousUserId();
      const id2 = PrivacyContextSanitizer.generateAnonymousUserId();
      
      expect(id1).toBe(id2); // Should be consistent for same browser
      expect(id1).toMatch(/^anon_[a-z0-9]+$/);
    });

    it('should respect session limits for error reporting', async () => {
      const limitedReporting = new ErrorReportingSystem({
        maxReportsPerSession: 2
      });

      // Submit 3 errors, only 2 should be accepted
      const report1 = await limitedReporting.reportError(new Error('Error 1'));
      const report2 = await limitedReporting.reportError(new Error('Error 2'));
      const report3 = await limitedReporting.reportError(new Error('Error 3'));

      expect(report1).toBeTruthy();
      expect(report2).toBeTruthy();
      expect(report3).toBeNull(); // Should be rejected due to limit

      const stats = limitedReporting.getStatistics();
      expect(stats.reportsThisSession).toBe(2);
      expect(stats.canReportMore).toBe(false);
    });
  });

  describe('Integration Flows', () => {
    it('should handle complete privacy incident flow', async () => {
      // 1. Show privacy alert notification
      const securityNotification = PrivacyNotificationTemplates.securityIssue('Unauthorized access attempt detected');
      const notificationId = await notificationSystem.show(securityNotification);

      expect(await notificationSystem.getActive()).toHaveLength(1);

      // 2. User clicks "Learn More" action
      let learnMoreClicked = false;
      notificationSystem.addEventListener((event) => {
        if (event.action === 'action_clicked' && event.actionId === 'learn_more') {
          learnMoreClicked = true;
        }
      });

      notificationProvider.simulateActionClick(notificationId, 'learn_more');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(learnMoreClicked).toBe(true);

      // 3. Show contextual help
      helpSystem.setContext(['security-alert', 'privacy-incident']);
      const suggestions = helpSystem.getContextualSuggestions();
      
      const securityHelp = suggestions.find(s => 
        s.topic.tags.includes('security') || s.topic.tags.includes('privacy')
      );
      expect(securityHelp).toBeTruthy();

      // 4. User submits feedback about the incident
      const feedbackResult = await feedbackSystem.submitFeedback(
        FeedbackType.PRIVACY_CONCERN,
        'Security Alert Feedback',
        'I received a security alert and want to understand what happened',
        {
          severity: FeedbackSeverity.HIGH,
          includeSystemInfo: true
        }
      );

      expect(feedbackResult.success).toBe(true);

      // 5. Verify complete flow
      const history = notificationSystem.getHistory();
      const feedbacks = feedbackProvider.getSubmittedFeedbacks();
      
      expect(history.length).toBeGreaterThan(0);
      expect(feedbacks.length).toBeGreaterThan(0);
      expect(feedbacks[feedbacks.length - 1].type).toBe(FeedbackType.PRIVACY_CONCERN);
    });

    it('should handle error reporting with user feedback integration', async () => {
      // 1. Error occurs and gets reported
      const testError = new Error('Critical system failure');
      const reportId = await errorReporting.reportError(testError, {
        userAction: 'exporting data',
        component: 'data-export'
      }, {
        severity: ErrorSeverity.CRITICAL,
        userImpact: 'critical'
      });

      expect(reportId).toBeTruthy();

      // 2. System shows error notification
      const errorNotification = PrivacyNotificationTemplates.systemError('data export', 'Please try again later');
      const notificationId = await notificationSystem.show(errorNotification);

      expect(await notificationSystem.getActive()).toHaveLength(1);

      // 3. User seeks help
      helpSystem.setContext(['error-occurred', 'data-export']);
      const helpSuggestions = helpSystem.getContextualSuggestions();
      
      const troubleshootingHelp = helpSuggestions.find(s => 
        s.topic.category === HelpTopicCategory.TROUBLESHOOTING
      );
      expect(troubleshootingHelp).toBeTruthy();

      // 4. Verify error was also submitted as feedback
      const feedbacks = feedbackProvider.getSubmittedFeedbacks();
      const errorFeedback = feedbacks.find(f => 
        f.description.includes('Critical system failure')
      );
      expect(errorFeedback).toBeTruthy();
      expect(errorFeedback?.severity).toBe(FeedbackSeverity.CRITICAL);
    });
  });
});
