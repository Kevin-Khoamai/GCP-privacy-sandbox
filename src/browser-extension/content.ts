/**
 * Browser extension content script
 * Handles page-level interactions and cohort data exposure for advertising
 */

// Cross-browser compatibility layer
const browserAPI = (() => {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return chrome;
  } else if (typeof browser !== 'undefined' && browser.runtime) {
    return browser;
  }
  return null;
})();

class ContentScriptController {
  private isInitialized = false;
  private cohortIds: string[] = [];
  private lastUpdateTime = 0;
  private readonly UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.initialize();
  }

  /**
   * Initialize content script functionality
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized || !browserAPI) {
      return;
    }

    try {
      // Load current cohort IDs
      await this.loadCohortIds();

      // Set up periodic updates
      this.setupPeriodicUpdates();

      // Expose cohort API to page if enabled
      await this.setupCohortAPI();

      this.isInitialized = true;
      console.log('Privacy Cohort Tracker: Content script initialized');
    } catch (error) {
      console.error('Privacy Cohort Tracker: Failed to initialize content script:', error);
    }
  }

  /**
   * Load current cohort IDs from background script
   */
  private async loadCohortIds(): Promise<void> {
    if (!browserAPI) return;

    try {
      const response = await this.sendMessageToBackground({
        type: 'GET_ACTIVE_COHORTS'
      });

      if (response && response.cohortIds) {
        this.cohortIds = response.cohortIds;
        this.lastUpdateTime = Date.now();
      }
    } catch (error) {
      console.warn('Privacy Cohort Tracker: Failed to load cohort IDs:', error);
    }
  }

  /**
   * Set up periodic cohort updates
   */
  private setupPeriodicUpdates(): void {
    setInterval(async () => {
      if (Date.now() - this.lastUpdateTime > this.UPDATE_INTERVAL) {
        await this.loadCohortIds();
      }
    }, this.UPDATE_INTERVAL);
  }

  /**
   * Set up cohort API for page access (if user has enabled sharing)
   */
  private async setupCohortAPI(): Promise<void> {
    if (!browserAPI) return;

    try {
      // Check if user has enabled sharing with advertisers
      const response = await this.sendMessageToBackground({
        type: 'GET_SHARING_PREFERENCES'
      });

      if (response && response.shareWithAdvertisers) {
        this.exposeCohortAPI();
      }
    } catch (error) {
      console.warn('Privacy Cohort Tracker: Failed to check sharing preferences:', error);
    }
  }

  /**
   * Expose cohort API to the page
   */
  private exposeCohortAPI(): void {
    // Create a privacy-safe API that pages can access
    const cohortAPI = {
      /**
       * Get current cohort IDs (anonymized)
       */
      getCohortIds: (): string[] => {
        return [...this.cohortIds]; // Return copy to prevent mutation
      },

      /**
       * Check if cohort tracking is enabled
       */
      isEnabled: (): boolean => {
        return this.cohortIds.length > 0;
      },

      /**
       * Get API version
       */
      getVersion: (): string => {
        return '1.0.0';
      }
    };

    // Inject API into page context safely
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        if (window.privacyCohortAPI) return; // Already injected

        window.privacyCohortAPI = {
          getCohortIds: function() {
            return ${JSON.stringify(this.cohortIds)};
          },
          isEnabled: function() {
            return ${this.cohortIds.length > 0};
          },
          getVersion: function() {
            return '1.0.0';
          }
        };

        // Dispatch event to notify page that API is ready
        window.dispatchEvent(new CustomEvent('privacyCohortAPIReady', {
          detail: { version: '1.0.0' }
        }));
      })();
    `;

    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  /**
   * Send message to background script with cross-browser compatibility
   */
  private async sendMessageToBackground(message: any): Promise<any> {
    if (!browserAPI) {
      throw new Error('Browser API not available');
    }

    return new Promise((resolve, reject) => {
      const callback = (response: any) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve(response);
        }
      };

      if (browserAPI.runtime.sendMessage.length === 2) {
        // Chrome-style API
        browserAPI.runtime.sendMessage(message, callback);
      } else {
        // Firefox-style API (returns Promise)
        browserAPI.runtime.sendMessage(message)
          .then(resolve)
          .catch(reject);
      }
    });
  }
}

// Initialize content script when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentScriptController();
  });
} else {
  new ContentScriptController();
}