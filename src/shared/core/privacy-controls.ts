import { PrivacyControlsUI, CohortDisplayData } from '../interfaces/privacy-controls';
import { UserDataExport, CohortAssignment, UserPreferences, Topic } from '../interfaces/common';
import { StorageLayer } from './storage-layer';
import { TaxonomyLoader } from './taxonomy-loader';

/**
 * Privacy controls implementation that provides user interface for managing cohort assignments
 * and privacy settings. Handles cohort display, toggle controls, data export, and deletion.
 */
export class PrivacyControls implements PrivacyControlsUI {
  private static instance: PrivacyControls;
  private storageLayer: StorageLayer;
  private taxonomyLoader: TaxonomyLoader;

  private constructor() {
    this.storageLayer = new StorageLayer();
    this.taxonomyLoader = TaxonomyLoader.getInstance();
  }

  /**
   * Get singleton instance of PrivacyControls
   */
  public static getInstance(): PrivacyControls {
    if (!PrivacyControls.instance) {
      PrivacyControls.instance = new PrivacyControls();
    }
    return PrivacyControls.instance;
  }

  /**
   * Initialize the privacy controls system
   */
  public async initialize(): Promise<void> {
    await this.storageLayer.initialize();
    await this.taxonomyLoader.loadTaxonomy();
  }

  /**
   * Display current cohort assignments with detailed information
   * @returns CohortDisplayData[] Array of cohort display data
   */
  public async displayCurrentCohorts(): Promise<CohortDisplayData[]> {
    await this.initialize();

    try {
      const cohorts = await this.storageLayer.getCohortData();
      const preferences = await this.storageLayer.getUserPreferences();
      const displayData: CohortDisplayData[] = [];

      for (const cohort of cohorts) {
        const topic = this.taxonomyLoader.getTopicById(cohort.topicId);
        if (!topic) continue;

        const isDisabled = preferences.disabledTopics.includes(cohort.topicId);
        
        displayData.push({
          topicName: cohort.topicName,
          description: this.generateTopicDescription(topic),
          isActive: !isDisabled && preferences.cohortsEnabled,
          assignedDate: cohort.assignedDate,
          expiryDate: cohort.expiryDate,
          canDisable: true,
          topicId: cohort.topicId // Add topicId to display data
        });
      }

      // Sort by assignment date (most recent first)
      return displayData.sort((a, b) => 
        new Date(b.assignedDate).getTime() - new Date(a.assignedDate).getTime()
      );
    } catch (error) {
      console.error('Failed to display current cohorts:', error);
      return [];
    }
  }

  /**
   * Toggle cohort status (enable/disable specific cohort)
   * @param topicId Topic ID to toggle
   * @param enabled Whether to enable or disable the cohort
   */
  public async toggleCohortStatus(topicId: number, enabled: boolean): Promise<void> {
    await this.initialize();

    try {
      const preferences = await this.storageLayer.getUserPreferences();
      
      if (enabled) {
        // Remove from disabled list
        preferences.disabledTopics = preferences.disabledTopics.filter(id => id !== topicId);
      } else {
        // Add to disabled list if not already there
        if (!preferences.disabledTopics.includes(topicId)) {
          preferences.disabledTopics.push(topicId);
        }
      }

      await this.storageLayer.storeUserPreferences(preferences);
    } catch (error) {
      console.error('Failed to toggle cohort status:', error);
      throw new Error('Failed to update cohort preferences');
    }
  }

  /**
   * Export user data for GDPR compliance
   * @returns UserDataExport Complete user data export
   */
  public async exportUserData(): Promise<UserDataExport> {
    await this.initialize();

    try {
      const cohorts = await this.storageLayer.getCohortData();
      const preferences = await this.storageLayer.getUserPreferences();

      return {
        cohorts,
        preferences,
        exportDate: new Date(),
        version: '1.0'
      };
    } catch (error) {
      console.error('Failed to export user data:', error);
      throw new Error('Failed to export user data');
    }
  }

  /**
   * Delete all user data (complete privacy reset)
   */
  public async deleteAllData(): Promise<void> {
    await this.initialize();

    try {
      await this.storageLayer.clearAllData();
    } catch (error) {
      console.error('Failed to delete all data:', error);
      throw new Error('Failed to delete user data');
    }
  }

  /**
   * Show data usage explanation (returns explanation text)
   * @returns string Explanation of how cohort data is used
   */
  public showDataUsageExplanation(): string {
    return `
Your Privacy Cohort Tracker works entirely on your local device to protect your privacy:

• Browsing Analysis: We analyze your browsing history locally on your device to understand your interests
• Cohort Assignment: You're assigned to interest groups (cohorts) based on topics you visit frequently
• Local Processing: All analysis happens on your device - your individual browsing data never leaves your device
• Limited Sharing: Only anonymized cohort IDs (not your browsing history) are shared with advertisers
• Automatic Expiry: Cohort assignments automatically expire after 3 weeks
• User Control: You can disable any cohort or turn off the entire system at any time

Data Shared with Advertisers:
• Only cohort IDs (like "Sports", "Technology") - never specific websites you visit
• Maximum of 3 cohorts shared per week
• No personal information or individual browsing history

Your Rights:
• View all your cohort assignments
• Disable specific cohorts or the entire system
• Export all your data
• Delete all data completely
    `.trim();
  }

  /**
   * Get global privacy settings
   * @returns UserPreferences Current user preferences
   */
  public async getPrivacySettings(): Promise<UserPreferences> {
    await this.initialize();
    return await this.storageLayer.getUserPreferences();
  }

  /**
   * Update global privacy settings
   * @param preferences New privacy preferences
   */
  public async updatePrivacySettings(preferences: UserPreferences): Promise<void> {
    await this.initialize();
    await this.storageLayer.storeUserPreferences(preferences);
  }

  /**
   * Get cohort statistics for display
   * @returns Object with cohort statistics
   */
  public async getCohortStatistics(): Promise<{
    totalCohorts: number;
    activeCohorts: number;
    disabledCohorts: number;
    expiringCohorts: number;
  }> {
    await this.initialize();

    try {
      const cohorts = await this.storageLayer.getCohortData();
      const preferences = await this.storageLayer.getUserPreferences();
      const now = new Date();
      const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const totalCohorts = cohorts.length;
      const disabledCohorts = cohorts.filter(cohort => 
        preferences.disabledTopics.includes(cohort.topicId)
      ).length;
      const activeCohorts = preferences.cohortsEnabled ? totalCohorts - disabledCohorts : 0;
      const expiringCohorts = cohorts.filter(cohort => 
        new Date(cohort.expiryDate) <= oneWeekFromNow
      ).length;

      return {
        totalCohorts,
        activeCohorts,
        disabledCohorts,
        expiringCohorts
      };
    } catch (error) {
      console.error('Failed to get cohort statistics:', error);
      return {
        totalCohorts: 0,
        activeCohorts: 0,
        disabledCohorts: 0,
        expiringCohorts: 0
      };
    }
  }

  /**
   * Generate user-friendly description for a topic
   * @param topic Topic to describe
   * @returns string User-friendly description
   */
  private generateTopicDescription(topic: Topic): string {
    // Use existing description if available, otherwise generate one
    if (topic.description && topic.description.trim()) {
      return topic.description;
    }

    // Generate description based on topic name and level
    const baseDescription = `Interests related to ${topic.name.toLowerCase()}`;
    
    if (topic.level === 1) {
      return `${baseDescription} (broad category)`;
    } else if (topic.level === 2) {
      return `${baseDescription} (specific interests)`;
    } else {
      return `${baseDescription} (detailed interests)`;
    }
  }
}

// Export singleton instance
export const privacyControls = PrivacyControls.getInstance();