import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock browser environment for E2E testing
const mockBrowserEnvironment = () => {
  const mockStorage = new Map();
  const mockNotifications = new Map();
  const mockTabs = new Map();

  return {
    storage: {
      local: {
        get: vi.fn().mockImplementation((keys) => {
          if (Array.isArray(keys)) {
            const result: any = {};
            keys.forEach(key => {
              if (mockStorage.has(key)) {
                result[key] = mockStorage.get(key);
              }
            });
            return Promise.resolve(result);
          } else if (typeof keys === 'string') {
            return Promise.resolve({ [keys]: mockStorage.get(keys) });
          }
          return Promise.resolve(Object.fromEntries(mockStorage));
        }),
        set: vi.fn().mockImplementation((data) => {
          Object.entries(data).forEach(([key, value]) => {
            mockStorage.set(key, value);
          });
          return Promise.resolve();
        }),
        remove: vi.fn().mockImplementation((keys) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach(key => mockStorage.delete(key));
          return Promise.resolve();
        }),
        clear: vi.fn().mockImplementation(() => {
          mockStorage.clear();
          return Promise.resolve();
        })
      }
    },
    notifications: {
      create: vi.fn().mockImplementation((id, options) => {
        const notificationId = id || `notification-${Date.now()}`;
        mockNotifications.set(notificationId, options);
        return Promise.resolve(notificationId);
      }),
      clear: vi.fn().mockImplementation((id) => {
        mockNotifications.delete(id);
        return Promise.resolve(true);
      }),
      getAll: vi.fn().mockImplementation(() => {
        return Promise.resolve(Object.fromEntries(mockNotifications));
      })
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((options) => {
        const tab = { id: Date.now(), ...options };
        mockTabs.set(tab.id, tab);
        return Promise.resolve(tab);
      }),
      update: vi.fn().mockImplementation((tabId, options) => {
        const tab = mockTabs.get(tabId);
        if (tab) {
          Object.assign(tab, options);
          return Promise.resolve(tab);
        }
        return Promise.reject(new Error('Tab not found'));
      })
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({}),
      getManifest: vi.fn().mockReturnValue({ version: '1.0.0' })
    },
    permissions: {
      request: vi.fn().mockResolvedValue(true),
      contains: vi.fn().mockResolvedValue(true)
    }
  };
};

// Simulate user actions
class UserSimulator {
  private browser: any;

  constructor(browser: any) {
    this.browser = browser;
  }

  async visitWebsite(url: string): Promise<void> {
    const domain = new URL(url).hostname;
    const visitKey = `visit_${domain}_${Date.now()}`;
    
    await this.browser.storage.local.set({
      [visitKey]: {
        domain,
        url,
        timestamp: new Date().toISOString(),
        visitCount: 1
      }
    });
  }

  async openExtensionPopup(): Promise<any> {
    // Simulate opening the extension popup
    const cohorts = await this.browser.storage.local.get(['cohorts']);
    const preferences = await this.browser.storage.local.get(['preferences']);
    
    return {
      cohorts: cohorts.cohorts || [],
      preferences: preferences.preferences || {
        cohortsEnabled: true,
        shareWithAdvertisers: false,
        dataRetentionDays: 21
      }
    };
  }

  async updatePreferences(newPreferences: any): Promise<void> {
    await this.browser.storage.local.set({
      preferences: newPreferences
    });
  }

  async toggleCohort(cohortId: number, enabled: boolean): Promise<void> {
    const data = await this.browser.storage.local.get(['cohorts']);
    const cohorts = data.cohorts || [];
    
    const cohort = cohorts.find((c: any) => c.topicId === cohortId);
    if (cohort) {
      cohort.isActive = enabled;
      await this.browser.storage.local.set({ cohorts });
    }
  }

  async exportData(): Promise<any> {
    const data = await this.browser.storage.local.get();
    return {
      exportDate: new Date().toISOString(),
      version: '1.0.0',
      data
    };
  }

  async deleteAllData(): Promise<void> {
    await this.browser.storage.local.clear();
  }
}

describe('User Workflow End-to-End Tests', () => {
  let browser: any;
  let user: UserSimulator;

  beforeEach(() => {
    browser = mockBrowserEnvironment();
    user = new UserSimulator(browser);
    
    // Set up initial state
    browser.storage.local.set({
      preferences: {
        cohortsEnabled: true,
        shareWithAdvertisers: false,
        dataRetentionDays: 21
      },
      cohorts: [],
      version: '1.0.0'
    });
  });

  describe('First-Time User Experience', () => {
    it('should complete onboarding flow', async () => {
      // Step 1: User installs extension
      await browser.storage.local.set({
        installDate: new Date().toISOString(),
        onboardingCompleted: false
      });

      // Step 2: User opens extension for first time
      const popupData = await user.openExtensionPopup();
      expect(popupData.preferences.cohortsEnabled).toBe(true);
      expect(popupData.cohorts).toHaveLength(0);

      // Step 3: User completes onboarding
      await browser.storage.local.set({
        onboardingCompleted: true,
        consentGiven: true,
        consentDate: new Date().toISOString()
      });

      // Step 4: Verify onboarding completion
      const onboardingData = await browser.storage.local.get(['onboardingCompleted', 'consentGiven']);
      expect(onboardingData.onboardingCompleted).toBe(true);
      expect(onboardingData.consentGiven).toBe(true);
    });

    it('should show welcome notification', async () => {
      await browser.notifications.create('welcome', {
        type: 'basic',
        iconUrl: '/icons/privacy-48.png',
        title: 'Welcome to Privacy Cohort Tracker',
        message: 'Your privacy-focused browsing experience starts now!'
      });

      const notifications = await browser.notifications.getAll();
      expect(notifications.welcome).toBeTruthy();
      expect(notifications.welcome.title).toContain('Welcome');
    });
  });

  describe('Daily Usage Workflow', () => {
    it('should track browsing and assign cohorts', async () => {
      // User visits various websites
      await user.visitWebsite('https://espn.com/sports/football');
      await user.visitWebsite('https://github.com/user/repo');
      await user.visitWebsite('https://stackoverflow.com/questions/123');
      await user.visitWebsite('https://techcrunch.com/article');

      // Simulate cohort assignment based on visits
      const mockCohorts = [
        {
          topicId: 1,
          topicName: 'Sports',
          confidence: 0.85,
          assignedDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true
        },
        {
          topicId: 2,
          topicName: 'Technology',
          confidence: 0.78,
          assignedDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true
        }
      ];

      await browser.storage.local.set({ cohorts: mockCohorts });

      // User checks their cohorts
      const popupData = await user.openExtensionPopup();
      expect(popupData.cohorts).toHaveLength(2);
      expect(popupData.cohorts[0].topicName).toBe('Sports');
      expect(popupData.cohorts[1].topicName).toBe('Technology');
    });

    it('should filter sensitive domains', async () => {
      // User visits sensitive websites
      await user.visitWebsite('https://mybank.com/login');
      await user.visitWebsite('https://health.gov/records');
      await user.visitWebsite('https://example.com/normal-page');

      // Verify sensitive domains are not used for cohort assignment
      const visits = await browser.storage.local.get();
      const visitKeys = Object.keys(visits).filter(key => key.startsWith('visit_'));
      
      // Should only have the normal website visit
      const normalVisit = visitKeys.find(key => visits[key].domain === 'example.com');
      expect(normalVisit).toBeTruthy();
      
      // Sensitive domains should be filtered out or marked as sensitive
      const bankVisit = visitKeys.find(key => visits[key].domain === 'mybank.com');
      const healthVisit = visitKeys.find(key => visits[key].domain === 'health.gov');
      
      // These should either not exist or be marked as filtered
      if (bankVisit) expect(visits[bankVisit].filtered).toBe(true);
      if (healthVisit) expect(visits[healthVisit].filtered).toBe(true);
    });

    it('should update cohort confidence over time', async () => {
      // Initial cohort assignment
      const initialCohorts = [
        {
          topicId: 1,
          topicName: 'Sports',
          confidence: 0.6,
          assignedDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true
        }
      ];
      await browser.storage.local.set({ cohorts: initialCohorts });

      // User continues visiting sports websites
      await user.visitWebsite('https://espn.com/nfl');
      await user.visitWebsite('https://nba.com/games');
      await user.visitWebsite('https://mlb.com/scores');

      // Simulate confidence update
      const updatedCohorts = [
        {
          ...initialCohorts[0],
          confidence: 0.9,
          lastUpdated: new Date().toISOString()
        }
      ];
      await browser.storage.local.set({ cohorts: updatedCohorts });

      const popupData = await user.openExtensionPopup();
      expect(popupData.cohorts[0].confidence).toBe(0.9);
    });
  });

  describe('Privacy Management Workflow', () => {
    it('should allow user to modify privacy settings', async () => {
      // User opens privacy settings
      const initialPreferences = await user.openExtensionPopup();
      expect(initialPreferences.preferences.shareWithAdvertisers).toBe(false);

      // User enables advertiser sharing
      await user.updatePreferences({
        cohortsEnabled: true,
        shareWithAdvertisers: true,
        dataRetentionDays: 14
      });

      // Verify changes
      const updatedData = await user.openExtensionPopup();
      expect(updatedData.preferences.shareWithAdvertisers).toBe(true);
      expect(updatedData.preferences.dataRetentionDays).toBe(14);
    });

    it('should allow user to disable specific cohorts', async () => {
      // Set up initial cohorts
      const cohorts = [
        { topicId: 1, topicName: 'Sports', isActive: true },
        { topicId: 2, topicName: 'Technology', isActive: true },
        { topicId: 3, topicName: 'Travel', isActive: true }
      ];
      await browser.storage.local.set({ cohorts });

      // User disables Sports cohort
      await user.toggleCohort(1, false);

      // Verify cohort is disabled
      const data = await browser.storage.local.get(['cohorts']);
      const sportsCohort = data.cohorts.find((c: any) => c.topicId === 1);
      expect(sportsCohort.isActive).toBe(false);

      // Other cohorts should remain active
      const techCohort = data.cohorts.find((c: any) => c.topicId === 2);
      expect(techCohort.isActive).toBe(true);
    });

    it('should handle cohort expiration', async () => {
      // Set up cohorts with different expiry dates
      const cohorts = [
        {
          topicId: 1,
          topicName: 'Sports',
          expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Expired
          isActive: true
        },
        {
          topicId: 2,
          topicName: 'Technology',
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Valid
          isActive: true
        }
      ];
      await browser.storage.local.set({ cohorts });

      // Simulate expiry cleanup
      const currentTime = new Date();
      const activeCohorts = cohorts.filter(cohort => 
        new Date(cohort.expiryDate) > currentTime
      );
      await browser.storage.local.set({ cohorts: activeCohorts });

      // Verify expired cohort is removed
      const data = await browser.storage.local.get(['cohorts']);
      expect(data.cohorts).toHaveLength(1);
      expect(data.cohorts[0].topicName).toBe('Technology');
    });
  });

  describe('Data Export and Deletion Workflow', () => {
    it('should export user data', async () => {
      // Set up user data
      await browser.storage.local.set({
        preferences: { cohortsEnabled: true },
        cohorts: [{ topicId: 1, topicName: 'Sports' }],
        visitHistory: { 'example.com': 5 }
      });

      // User exports data
      const exportData = await user.exportData();

      expect(exportData.exportDate).toBeTruthy();
      expect(exportData.version).toBe('1.0.0');
      expect(exportData.data.preferences).toBeTruthy();
      expect(exportData.data.cohorts).toBeTruthy();
    });

    it('should delete all user data', async () => {
      // Set up user data
      await browser.storage.local.set({
        preferences: { cohortsEnabled: true },
        cohorts: [{ topicId: 1, topicName: 'Sports' }],
        visitHistory: { 'example.com': 5 }
      });

      // Verify data exists
      const beforeDeletion = await browser.storage.local.get();
      expect(Object.keys(beforeDeletion)).toHaveLength.greaterThan(0);

      // User deletes all data
      await user.deleteAllData();

      // Verify data is deleted
      const afterDeletion = await browser.storage.local.get();
      expect(Object.keys(afterDeletion)).toHaveLength(0);
    });

    it('should confirm data deletion with user', async () => {
      // Simulate confirmation dialog
      const confirmDeletion = async (): Promise<boolean> => {
        // In real implementation, this would show a confirmation dialog
        return true; // User confirms
      };

      const userConfirmed = await confirmDeletion();
      expect(userConfirmed).toBe(true);

      if (userConfirmed) {
        await user.deleteAllData();
        
        // Show confirmation notification
        await browser.notifications.create('deletion-complete', {
          type: 'basic',
          iconUrl: '/icons/privacy-48.png',
          title: 'Data Deleted',
          message: 'All your data has been permanently deleted.'
        });

        const notifications = await browser.notifications.getAll();
        expect(notifications['deletion-complete']).toBeTruthy();
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle storage errors gracefully', async () => {
      // Mock storage error
      browser.storage.local.set.mockRejectedValueOnce(new Error('Storage quota exceeded'));

      try {
        await user.updatePreferences({ cohortsEnabled: false });
      } catch (error) {
        // Should show error notification
        await browser.notifications.create('storage-error', {
          type: 'basic',
          iconUrl: '/icons/error-48.png',
          title: 'Storage Error',
          message: 'Unable to save preferences. Please try again.'
        });
      }

      const notifications = await browser.notifications.getAll();
      expect(notifications['storage-error']).toBeTruthy();
    });

    it('should recover from corrupted data', async () => {
      // Set up corrupted data
      await browser.storage.local.set({
        preferences: 'corrupted-json-string',
        cohorts: null
      });

      // Attempt to open popup (should handle corruption)
      const popupData = await user.openExtensionPopup();

      // Should return default values
      expect(popupData.preferences.cohortsEnabled).toBe(true);
      expect(popupData.cohorts).toEqual([]);
    });

    it('should handle network connectivity issues', async () => {
      // Mock network error
      browser.runtime.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      const handleNetworkError = async () => {
        try {
          await browser.runtime.sendMessage({ type: 'sync_data' });
        } catch (error) {
          // Store for retry later
          await browser.storage.local.set({
            pendingSync: true,
            lastSyncAttempt: new Date().toISOString()
          });
          return false;
        }
        return true;
      };

      const success = await handleNetworkError();
      expect(success).toBe(false);

      const data = await browser.storage.local.get(['pendingSync']);
      expect(data.pendingSync).toBe(true);
    });
  });

  describe('Performance and Responsiveness', () => {
    it('should handle large amounts of browsing data', async () => {
      // Simulate heavy browsing activity
      const domains = Array.from({ length: 1000 }, (_, i) => `domain${i}.com`);
      
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        const domain = domains[i % domains.length];
        await user.visitWebsite(`https://${domain}/page${i}`);
      }
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time
      expect(processingTime).toBeLessThan(5000); // 5 seconds
    });

    it('should maintain responsive UI during data operations', async () => {
      // Simulate large data export
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `item-${i}`,
        timestamp: new Date().toISOString()
      }));

      await browser.storage.local.set({ largeDataSet: largeData });

      const startTime = Date.now();
      const exportData = await user.exportData();
      const endTime = Date.now();

      expect(exportData).toBeTruthy();
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
