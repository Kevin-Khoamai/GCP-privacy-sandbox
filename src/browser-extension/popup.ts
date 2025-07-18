import { privacyControls } from '../shared/core/privacy-controls';
import { CohortDisplayData } from '../shared/interfaces/privacy-controls';
import { UserPreferences } from '../shared/interfaces/common';

/**
 * Browser extension popup controller
 * Manages the cohort management dashboard UI and user interactions
 */
class PopupController {
  private isInitialized = false;
  private currentCohorts: CohortDisplayData[] = [];
  private currentPreferences: UserPreferences | null = null;

  constructor() {
    this.bindEventListeners();
  }

  /**
   * Initialize the popup when DOM is loaded
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.showLoadingState();
      await this.loadData();
      this.renderUI();
      this.showMainContent();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      this.showErrorState(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Load cohort and preference data
   */
  private async loadData(): Promise<void> {
    try {
      // Load cohorts and preferences in parallel
      const [cohorts, preferences, stats] = await Promise.all([
        privacyControls.displayCurrentCohorts(),
        privacyControls.getPrivacySettings(),
        privacyControls.getCohortStatistics()
      ]);

      this.currentCohorts = cohorts;
      this.currentPreferences = preferences;
      
      // Update statistics
      this.updateStatistics(stats);
      this.updateStatusIndicator(preferences.cohortsEnabled);
    } catch (error) {
      throw new Error(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Render the main UI components
   */
  private renderUI(): void {
    this.renderGlobalControls();
    this.renderCohortsList();
  }

  /**
   * Render global controls section
   */
  private renderGlobalControls(): void {
    const globalToggle = document.getElementById('globalToggle') as HTMLInputElement;
    if (globalToggle && this.currentPreferences) {
      globalToggle.checked = this.currentPreferences.cohortsEnabled;
    }
  }

  /**
   * Render cohorts list
   */
  private renderCohortsList(): void {
    const container = document.getElementById('cohortsContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (!container || !emptyState) return;

    if (this.currentCohorts.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = this.currentCohorts.map(cohort => this.createCohortItemHTML(cohort)).join('');
    
    // Bind toggle event listeners
    this.bindCohortToggleListeners();
  }

  /**
   * Create HTML for a cohort item
   */
  private createCohortItemHTML(cohort: CohortDisplayData): string {
    const assignedDate = new Date(cohort.assignedDate).toLocaleDateString();
    const expiryDate = new Date(cohort.expiryDate).toLocaleDateString();
    const isExpiringSoon = new Date(cohort.expiryDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
    
    return `
      <div class="cohort-item ${!cohort.isActive ? 'disabled' : ''}">
        <div class="cohort-info">
          <div class="cohort-name">${this.escapeHtml(cohort.topicName)}</div>
          <div class="cohort-description">${this.escapeHtml(cohort.description)}</div>
          <div class="cohort-meta">
            Assigned: ${assignedDate} • Expires: ${expiryDate}
            ${isExpiringSoon ? ' • <strong>Expiring Soon</strong>' : ''}
          </div>
        </div>
        <div class="cohort-toggle">
          <label class="toggle-switch">
            <input type="checkbox" 
                   data-topic-id="${cohort.topicId}"
                   data-topic-name="${this.escapeHtml(cohort.topicName)}" 
                   ${cohort.isActive ? 'checked' : ''} 
                   ${!cohort.canDisable ? 'disabled' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  }

  /**
   * Update statistics display
   */
  private updateStatistics(stats: {
    totalCohorts: number;
    activeCohorts: number;
    disabledCohorts: number;
    expiringCohorts: number;
  }): void {
    const elements = {
      totalCohorts: document.getElementById('totalCohorts'),
      activeCohorts: document.getElementById('activeCohorts'),
      expiringCohorts: document.getElementById('expiringCohorts')
    };

    if (elements.totalCohorts) elements.totalCohorts.textContent = stats.totalCohorts.toString();
    if (elements.activeCohorts) elements.activeCohorts.textContent = stats.activeCohorts.toString();
    if (elements.expiringCohorts) elements.expiringCohorts.textContent = stats.expiringCohorts.toString();
  }

  /**
   * Update status indicator
   */
  private updateStatusIndicator(isEnabled: boolean): void {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (statusDot && statusText) {
      statusDot.className = `status-dot ${isEnabled ? '' : 'inactive'}`;
      statusText.textContent = isEnabled ? 'Active' : 'Inactive';
    }
  }

  /**
   * Bind event listeners
   */
  private bindEventListeners(): void {
    document.addEventListener('DOMContentLoaded', () => this.initialize());

    // Global toggle
    document.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.id === 'globalToggle') {
        await this.handleGlobalToggle(target.checked);
      }
    });

    // Help button
    document.getElementById('helpButton')?.addEventListener('click', () => {
      this.showHelpModal();
    });

    // Settings button
    document.getElementById('settingsButton')?.addEventListener('click', () => {
      this.showSettingsModal();
    });

    // Export button
    document.getElementById('exportButton')?.addEventListener('click', () => {
      this.handleDataExport();
    });

    // Retry button
    document.getElementById('retryButton')?.addEventListener('click', () => {
      this.initialize();
    });

    // Modal close buttons
    document.getElementById('closeHelpModal')?.addEventListener('click', () => {
      this.hideModal('helpModal');
    });

    document.getElementById('closeSettingsModal')?.addEventListener('click', () => {
      this.hideModal('settingsModal');
    });

    // Settings modal actions
    document.getElementById('saveSettingsButton')?.addEventListener('click', () => {
      this.handleSaveSettings();
    });

    document.getElementById('deleteAllDataButton')?.addEventListener('click', () => {
      this.handleDeleteAllData();
    });

    // Close modals when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('modal')) {
        this.hideModal(target.id);
      }
    });
  }

  /**
   * Bind cohort toggle event listeners
   */
  private bindCohortToggleListeners(): void {
    const toggles = document.querySelectorAll('.cohort-toggle input[type="checkbox"]');
    toggles.forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        const topicIdStr = target.dataset.topicId;
        if (topicIdStr) {
          const topicId = parseInt(topicIdStr);
          await this.handleCohortToggle(topicId, target.checked);
        }
      });
    });
  }

  /**
   * Handle global toggle change
   */
  private async handleGlobalToggle(enabled: boolean): Promise<void> {
    try {
      if (this.currentPreferences) {
        this.currentPreferences.cohortsEnabled = enabled;
        await privacyControls.updatePrivacySettings(this.currentPreferences);
        this.updateStatusIndicator(enabled);
        
        // Refresh cohorts display
        await this.loadData();
        this.renderCohortsList();
      }
    } catch (error) {
      console.error('Failed to update global toggle:', error);
      // Revert toggle state
      const globalToggle = document.getElementById('globalToggle') as HTMLInputElement;
      if (globalToggle) {
        globalToggle.checked = !enabled;
      }
    }
  }

  /**
   * Handle individual cohort toggle
   */
  private async handleCohortToggle(topicId: number, enabled: boolean): Promise<void> {
    try {
      await privacyControls.toggleCohortStatus(topicId, enabled);
      
      // Refresh cohorts display to reflect changes
      await this.loadData();
      this.renderCohortsList();
      
      this.showTemporaryMessage(
        enabled ? 'Cohort enabled' : 'Cohort disabled'
      );
      
    } catch (error) {
      console.error('Failed to toggle cohort:', error);
      this.showTemporaryMessage('Failed to update cohort', 'error');
      
      // Revert toggle state
      const toggle = document.querySelector(`input[data-topic-id="${topicId}"]`) as HTMLInputElement;
      if (toggle) {
        toggle.checked = !enabled;
      }
    }
  }

  /**
   * Show help modal
   */
  private showHelpModal(): void {
    const modal = document.getElementById('helpModal');
    const content = document.getElementById('helpContent');
    
    if (modal && content) {
      content.textContent = privacyControls.showDataUsageExplanation();
      modal.classList.remove('hidden');
    }
  }

  /**
   * Show settings modal
   */
  private showSettingsModal(): void {
    const modal = document.getElementById('settingsModal');
    
    if (modal && this.currentPreferences) {
      // Populate current settings
      const shareToggle = document.getElementById('shareWithAdvertisers') as HTMLInputElement;
      const retentionSelect = document.getElementById('dataRetentionDays') as HTMLSelectElement;
      
      if (shareToggle) shareToggle.checked = this.currentPreferences.shareWithAdvertisers;
      if (retentionSelect) retentionSelect.value = this.currentPreferences.dataRetentionDays.toString();
      
      modal.classList.remove('hidden');
    }
  }

  /**
   * Hide modal
   */
  private hideModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  /**
   * Handle settings save
   */
  private async handleSaveSettings(): Promise<void> {
    try {
      if (!this.currentPreferences) return;

      const shareToggle = document.getElementById('shareWithAdvertisers') as HTMLInputElement;
      const retentionSelect = document.getElementById('dataRetentionDays') as HTMLSelectElement;
      
      if (shareToggle) this.currentPreferences.shareWithAdvertisers = shareToggle.checked;
      if (retentionSelect) this.currentPreferences.dataRetentionDays = parseInt(retentionSelect.value);
      
      await privacyControls.updatePrivacySettings(this.currentPreferences);
      this.hideModal('settingsModal');
      
      // Show success feedback
      this.showTemporaryMessage('Settings saved successfully');
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showTemporaryMessage('Failed to save settings', 'error');
    }
  }

  /**
   * Handle delete all data
   */
  private async handleDeleteAllData(): Promise<void> {
    if (!confirm('Are you sure you want to delete all your cohort data? This action cannot be undone.')) {
      return;
    }

    try {
      await privacyControls.deleteAllData();
      this.hideModal('settingsModal');
      
      // Refresh the UI
      await this.initialize();
      this.showTemporaryMessage('All data deleted successfully');
      
    } catch (error) {
      console.error('Failed to delete data:', error);
      this.showTemporaryMessage('Failed to delete data', 'error');
    }
  }

  /**
   * Handle data export
   */
  private async handleDataExport(): Promise<void> {
    try {
      const exportData = await privacyControls.exportUserData();
      
      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `privacy-cohort-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      this.showTemporaryMessage('Data exported successfully');
      
    } catch (error) {
      console.error('Failed to export data:', error);
      this.showTemporaryMessage('Failed to export data', 'error');
    }
  }

  /**
   * Show temporary message
   */
  private showTemporaryMessage(message: string, type: 'success' | 'error' = 'success'): void {
    // Create temporary message element
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-weight: 500;
      z-index: 2000;
      background: ${type === 'success' ? '#28a745' : '#dc3545'};
    `;
    
    document.body.appendChild(messageEl);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.parentNode.removeChild(messageEl);
      }
    }, 3000);
  }

  /**
   * Show loading state
   */
  private showLoadingState(): void {
    this.hideAllStates();
    document.getElementById('loadingState')?.classList.remove('hidden');
  }

  /**
   * Show error state
   */
  private showErrorState(message: string): void {
    this.hideAllStates();
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');
    
    if (errorState && errorMessage) {
      errorMessage.textContent = message;
      errorState.classList.remove('hidden');
    }
    
    // Update status indicator
    this.updateStatusIndicator(false);
    const statusDot = document.getElementById('statusDot');
    if (statusDot) {
      statusDot.classList.add('error');
    }
  }

  /**
   * Show main content
   */
  private showMainContent(): void {
    this.hideAllStates();
    document.getElementById('mainContent')?.classList.remove('hidden');
  }

  /**
   * Hide all state containers
   */
  private hideAllStates(): void {
    document.getElementById('loadingState')?.classList.add('hidden');
    document.getElementById('errorState')?.classList.add('hidden');
    document.getElementById('mainContent')?.classList.add('hidden');
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup controller
new PopupController();