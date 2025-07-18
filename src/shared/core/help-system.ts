/**
 * Contextual help system for privacy cohort tracker
 * Provides user guidance and educational content
 */

export enum HelpTopicCategory {
  GETTING_STARTED = 'getting_started',
  PRIVACY_CONTROLS = 'privacy_controls',
  COHORT_MANAGEMENT = 'cohort_management',
  DATA_EXPORT = 'data_export',
  TROUBLESHOOTING = 'troubleshooting',
  PRIVACY_POLICY = 'privacy_policy'
}

export enum HelpContentType {
  ARTICLE = 'article',
  VIDEO = 'video',
  INTERACTIVE_GUIDE = 'interactive_guide',
  FAQ = 'faq',
  QUICK_TIP = 'quick_tip'
}

export interface HelpTopic {
  id: string;
  title: string;
  category: HelpTopicCategory;
  contentType: HelpContentType;
  description: string;
  content: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedReadTime: number; // minutes
  lastUpdated: Date;
  relatedTopics: string[];
  contextualTriggers?: string[]; // UI elements that should show this help
}

export interface HelpSearchResult {
  topic: HelpTopic;
  relevanceScore: number;
  matchedTerms: string[];
}

export interface ContextualHelpSuggestion {
  topic: HelpTopic;
  reason: string;
  priority: number;
}

/**
 * Help content database with privacy-focused topics
 */
export class HelpContentDatabase {
  private static topics: HelpTopic[] = [
    {
      id: 'getting-started-overview',
      title: 'Getting Started with Privacy Cohort Tracker',
      category: HelpTopicCategory.GETTING_STARTED,
      contentType: HelpContentType.ARTICLE,
      description: 'Learn the basics of how privacy cohort tracking works and protects your data.',
      content: `
# Getting Started with Privacy Cohort Tracker

## What is Privacy Cohort Tracking?

Privacy cohort tracking is a privacy-preserving alternative to traditional online tracking. Instead of tracking you individually, it groups you with other users who have similar interests, creating "cohorts" that protect your individual privacy while still enabling relevant advertising.

## How It Works

1. **Local Processing**: All analysis happens on your device - your browsing data never leaves your computer
2. **Cohort Assignment**: You're assigned to interest groups based on your browsing patterns
3. **Privacy Protection**: Sensitive sites (banking, health, etc.) are automatically excluded
4. **User Control**: You can view, modify, or delete your cohorts at any time

## Key Privacy Benefits

- No individual tracking
- Data stays on your device
- Transparent cohort assignments
- Full user control
- Automatic sensitive site filtering

## Next Steps

- Review your privacy settings
- Explore your current cohorts
- Learn about data export options
      `,
      tags: ['privacy', 'cohorts', 'getting-started', 'overview'],
      difficulty: 'beginner',
      estimatedReadTime: 3,
      lastUpdated: new Date('2025-01-18'),
      relatedTopics: ['privacy-controls-overview', 'cohort-management-basics'],
      contextualTriggers: ['first-launch', 'onboarding']
    },
    {
      id: 'privacy-controls-overview',
      title: 'Understanding Your Privacy Controls',
      category: HelpTopicCategory.PRIVACY_CONTROLS,
      contentType: HelpContentType.ARTICLE,
      description: 'Learn about all the privacy controls available to you.',
      content: `
# Understanding Your Privacy Controls

## Available Controls

### Cohort Sharing
- **Enable/Disable**: Turn cohort sharing on or off completely
- **Selective Sharing**: Choose which cohorts to share with websites
- **Advertiser Restrictions**: Block specific advertisers from accessing your cohorts

### Data Retention
- **Retention Period**: Set how long cohort data is kept (7-30 days)
- **Automatic Cleanup**: Old cohorts are automatically removed
- **Manual Deletion**: Delete specific cohorts or all data anytime

### Site Filtering
- **Sensitive Sites**: Banking, health, and government sites are automatically excluded
- **Custom Filters**: Add your own sites to exclude
- **Category Blocking**: Block entire categories of sites

## Recommended Settings

For maximum privacy:
- Set retention to 7 days
- Enable selective sharing only
- Review cohorts weekly
- Use custom filters for personal sites

## Privacy Guarantees

- Your browsing history never leaves your device
- Cohorts are anonymous and aggregated
- You can delete all data instantly
- No cross-device tracking
      `,
      tags: ['privacy', 'controls', 'settings', 'data-retention'],
      difficulty: 'beginner',
      estimatedReadTime: 4,
      lastUpdated: new Date('2025-01-18'),
      relatedTopics: ['cohort-management-basics', 'data-export-guide'],
      contextualTriggers: ['privacy-settings', 'settings-page']
    },
    {
      id: 'cohort-management-basics',
      title: 'Managing Your Interest Cohorts',
      category: HelpTopicCategory.COHORT_MANAGEMENT,
      contentType: HelpContentType.INTERACTIVE_GUIDE,
      description: 'Learn how to view, edit, and control your interest cohorts.',
      content: `
# Managing Your Interest Cohorts

## Viewing Your Cohorts

Your cohorts are displayed in the main dashboard with:
- **Cohort Name**: The interest category (e.g., "Sports Enthusiasts")
- **Confidence Score**: How strongly you match this cohort (0-100%)
- **Expiration Date**: When this cohort assignment expires
- **Status**: Active, expiring, or inactive

## Cohort Actions

### Individual Cohort Management
- **Toggle On/Off**: Enable or disable specific cohorts
- **View Details**: See what sites contributed to this cohort
- **Delete**: Remove a cohort immediately
- **Extend/Shorten**: Modify expiration date

### Bulk Actions
- **Select Multiple**: Use checkboxes to select multiple cohorts
- **Bulk Delete**: Remove multiple cohorts at once
- **Bulk Toggle**: Enable/disable multiple cohorts
- **Export Selection**: Export specific cohorts

## Understanding Cohort Quality

### High Quality Cohorts (80-100%)
- Based on consistent browsing patterns
- More likely to be relevant for advertising
- Recommended to keep active

### Medium Quality Cohorts (50-79%)
- Based on moderate interest signals
- May be less accurate
- Review periodically

### Low Quality Cohorts (0-49%)
- Based on limited data
- May not be relevant
- Consider disabling or deleting

## Best Practices

1. **Regular Review**: Check your cohorts weekly
2. **Quality Focus**: Keep high-quality cohorts, remove low-quality ones
3. **Privacy First**: When in doubt, disable or delete
4. **Feedback**: Use the feedback system to report incorrect cohorts
      `,
      tags: ['cohorts', 'management', 'dashboard', 'controls'],
      difficulty: 'intermediate',
      estimatedReadTime: 5,
      lastUpdated: new Date('2025-01-18'),
      relatedTopics: ['privacy-controls-overview', 'data-export-guide'],
      contextualTriggers: ['cohort-dashboard', 'cohort-list']
    },
    {
      id: 'troubleshooting-common-issues',
      title: 'Troubleshooting Common Issues',
      category: HelpTopicCategory.TROUBLESHOOTING,
      contentType: HelpContentType.FAQ,
      description: 'Solutions to frequently encountered problems.',
      content: `
# Troubleshooting Common Issues

## Cohorts Not Updating

**Problem**: New cohorts aren't being assigned or existing ones aren't updating.

**Solutions**:
1. Check if cohort tracking is enabled in settings
2. Ensure you're browsing sites that aren't in the sensitive filter
3. Wait 24-48 hours for new cohorts to appear
4. Clear browser cache and restart the extension

## Privacy Settings Not Saving

**Problem**: Changes to privacy settings don't persist.

**Solutions**:
1. Check browser permissions for storage access
2. Disable other privacy extensions temporarily
3. Clear extension storage and reconfigure
4. Update to the latest extension version

## Notifications Not Appearing

**Problem**: Not receiving notifications about cohort changes or privacy events.

**Solutions**:
1. Check browser notification permissions
2. Verify notification settings in extension options
3. Check if "Do Not Disturb" mode is enabled
4. Test with a manual notification trigger

## Data Export Failing

**Problem**: Unable to export cohort data or privacy settings.

**Solutions**:
1. Check available disk space
2. Disable popup blockers
3. Try a different export format (JSON vs CSV)
4. Clear browser downloads folder

## Extension Not Loading

**Problem**: Extension doesn't appear or function properly.

**Solutions**:
1. Check if extension is enabled in browser settings
2. Update browser to latest version
3. Reinstall the extension
4. Check for conflicting extensions

## Performance Issues

**Problem**: Browser becomes slow when extension is active.

**Solutions**:
1. Reduce cohort processing frequency in settings
2. Clear old cohort data
3. Disable background processing temporarily
4. Check system resources and close other applications

## Getting Additional Help

If these solutions don't resolve your issue:
1. Use the feedback system to report the problem
2. Include system information and error logs
3. Check for extension updates
4. Contact support through the help menu
      `,
      tags: ['troubleshooting', 'problems', 'solutions', 'support'],
      difficulty: 'intermediate',
      estimatedReadTime: 6,
      lastUpdated: new Date('2025-01-18'),
      relatedTopics: ['getting-started-overview', 'privacy-controls-overview'],
      contextualTriggers: ['error-occurred', 'help-menu']
    }
  ];

  static getAllTopics(): HelpTopic[] {
    return [...this.topics];
  }

  static getTopicById(id: string): HelpTopic | null {
    return this.topics.find(topic => topic.id === id) || null;
  }

  static getTopicsByCategory(category: HelpTopicCategory): HelpTopic[] {
    return this.topics.filter(topic => topic.category === category);
  }

  static searchTopics(query: string): HelpSearchResult[] {
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);
    const results: HelpSearchResult[] = [];

    this.topics.forEach(topic => {
      let relevanceScore = 0;
      const matchedTerms: string[] = [];

      // Search in title (highest weight)
      searchTerms.forEach(term => {
        if (topic.title.toLowerCase().includes(term)) {
          relevanceScore += 10;
          matchedTerms.push(term);
        }
      });

      // Search in description (medium weight)
      searchTerms.forEach(term => {
        if (topic.description.toLowerCase().includes(term)) {
          relevanceScore += 5;
          if (!matchedTerms.includes(term)) matchedTerms.push(term);
        }
      });

      // Search in tags (medium weight)
      searchTerms.forEach(term => {
        if (topic.tags.some(tag => tag.includes(term))) {
          relevanceScore += 5;
          if (!matchedTerms.includes(term)) matchedTerms.push(term);
        }
      });

      // Search in content (low weight)
      searchTerms.forEach(term => {
        if (topic.content.toLowerCase().includes(term)) {
          relevanceScore += 1;
          if (!matchedTerms.includes(term)) matchedTerms.push(term);
        }
      });

      if (relevanceScore > 0) {
        results.push({
          topic,
          relevanceScore,
          matchedTerms
        });
      }
    });

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

/**
 * Contextual help system that provides relevant guidance
 */
export class ContextualHelpSystem {
  private currentContext: string[] = [];
  private userLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
  private viewedTopics = new Set<string>();

  /**
   * Set current UI context for contextual suggestions
   */
  setContext(context: string[]): void {
    this.currentContext = context;
  }

  /**
   * Set user experience level
   */
  setUserLevel(level: 'beginner' | 'intermediate' | 'advanced'): void {
    this.userLevel = level;
  }

  /**
   * Mark a topic as viewed
   */
  markTopicViewed(topicId: string): void {
    this.viewedTopics.add(topicId);
  }

  /**
   * Get contextual help suggestions based on current context
   */
  getContextualSuggestions(): ContextualHelpSuggestion[] {
    const suggestions: ContextualHelpSuggestion[] = [];
    const topics = HelpContentDatabase.getAllTopics();

    topics.forEach(topic => {
      let priority = 0;
      let reason = '';

      // Check if topic matches current context
      if (topic.contextualTriggers) {
        const contextMatches = topic.contextualTriggers.filter(trigger => 
          this.currentContext.includes(trigger)
        );
        
        if (contextMatches.length > 0) {
          priority += contextMatches.length * 10;
          reason = `Relevant to current context: ${contextMatches.join(', ')}`;
        }
      }

      // Boost priority for user's skill level
      if (topic.difficulty === this.userLevel) {
        priority += 5;
        reason += reason ? ' | ' : '';
        reason += `Matches your experience level (${this.userLevel})`;
      }

      // Reduce priority for already viewed topics
      if (this.viewedTopics.has(topic.id)) {
        priority -= 3;
      }

      // Boost priority for getting started topics for beginners
      if (this.userLevel === 'beginner' && topic.category === HelpTopicCategory.GETTING_STARTED) {
        priority += 7;
        reason += reason ? ' | ' : '';
        reason += 'Recommended for new users';
      }

      if (priority > 0) {
        suggestions.push({
          topic,
          reason: reason || 'General recommendation',
          priority
        });
      }
    });

    return suggestions.sort((a, b) => b.priority - a.priority).slice(0, 5);
  }

  /**
   * Get help topics for a specific category
   */
  getTopicsForCategory(category: HelpTopicCategory): HelpTopic[] {
    return HelpContentDatabase.getTopicsByCategory(category)
      .filter(topic => {
        // Filter by user level if not beginner
        if (this.userLevel === 'beginner') return true;
        return topic.difficulty === this.userLevel || topic.difficulty === 'beginner';
      })
      .sort((a, b) => {
        // Sort by difficulty and then by last updated
        const difficultyOrder = { 'beginner': 0, 'intermediate': 1, 'advanced': 2 };
        const aDiff = difficultyOrder[a.difficulty];
        const bDiff = difficultyOrder[b.difficulty];
        
        if (aDiff !== bDiff) return aDiff - bDiff;
        return b.lastUpdated.getTime() - a.lastUpdated.getTime();
      });
  }

  /**
   * Search help topics
   */
  searchHelp(query: string): HelpSearchResult[] {
    return HelpContentDatabase.searchTopics(query);
  }

  /**
   * Get related topics for a given topic
   */
  getRelatedTopics(topicId: string): HelpTopic[] {
    const topic = HelpContentDatabase.getTopicById(topicId);
    if (!topic || !topic.relatedTopics) return [];

    return topic.relatedTopics
      .map(id => HelpContentDatabase.getTopicById(id))
      .filter((t): t is HelpTopic => t !== null);
  }

  /**
   * Get quick tips for current context
   */
  getQuickTips(): HelpTopic[] {
    return HelpContentDatabase.getAllTopics()
      .filter(topic => topic.contentType === HelpContentType.QUICK_TIP)
      .filter(topic => {
        if (!topic.contextualTriggers) return false;
        return topic.contextualTriggers.some(trigger => 
          this.currentContext.includes(trigger)
        );
      })
      .slice(0, 3);
  }

  /**
   * Get user progress statistics
   */
  getUserProgress(): {
    topicsViewed: number;
    totalTopics: number;
    completionPercentage: number;
    recommendedNext: HelpTopic[];
  } {
    const totalTopics = HelpContentDatabase.getAllTopics().length;
    const topicsViewed = this.viewedTopics.size;
    const completionPercentage = Math.round((topicsViewed / totalTopics) * 100);
    
    const suggestions = this.getContextualSuggestions();
    const recommendedNext = suggestions.slice(0, 3).map(s => s.topic);

    return {
      topicsViewed,
      totalTopics,
      completionPercentage,
      recommendedNext
    };
  }
}
