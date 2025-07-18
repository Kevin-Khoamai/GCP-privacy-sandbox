/**
 * iOS SwiftUI components for privacy cohort tracking
 * TypeScript interfaces and bridge for SwiftUI components
 */

import { CohortDisplayData } from '../../shared/interfaces/privacy-controls';
import { UserPreferences } from '../../shared/interfaces/common';

// SwiftUI component interfaces for native bridge communication
export interface SwiftUIComponent {
  componentId: string;
  componentType: string;
  props: Record<string, any>;
}

export interface SwiftUIViewState {
  isLoading: boolean;
  error: string | null;
  data: any;
}

export interface SwiftUIAction {
  type: string;
  payload?: any;
}

// Native SwiftUI bridge interface
interface SwiftUIBridge {
  renderComponent(component: SwiftUIComponent): Promise<void>;
  updateComponent(componentId: string, props: Record<string, any>): Promise<void>;
  removeComponent(componentId: string): Promise<void>;
  sendAction(componentId: string, action: SwiftUIAction): Promise<any>;
  subscribeToUpdates(componentId: string, callback: (state: SwiftUIViewState) => void): void;
  unsubscribeFromUpdates(componentId: string): void;
}

// Mock implementation - in real app this would be provided by native bridge
declare global {
  interface Window {
    SwiftUIBridge?: SwiftUIBridge;
  }
}

/**
 * SwiftUI component manager for iOS
 */
export class SwiftUIComponentManager {
  private bridge: SwiftUIBridge;
  private components = new Map<string, SwiftUIComponent>();
  private subscriptions = new Map<string, (state: SwiftUIViewState) => void>();

  constructor() {
    if (!window.SwiftUIBridge) {
      throw new Error('SwiftUI bridge not available');
    }
    this.bridge = window.SwiftUIBridge;
  }

  /**
   * Render a SwiftUI component
   */
  async renderComponent(component: SwiftUIComponent): Promise<void> {
    try {
      await this.bridge.renderComponent(component);
      this.components.set(component.componentId, component);
    } catch (error) {
      console.error(`Failed to render SwiftUI component ${component.componentId}:`, error);
      throw error;
    }
  }

  /**
   * Update component props
   */
  async updateComponent(componentId: string, props: Record<string, any>): Promise<void> {
    try {
      await this.bridge.updateComponent(componentId, props);
      
      const component = this.components.get(componentId);
      if (component) {
        component.props = { ...component.props, ...props };
      }
    } catch (error) {
      console.error(`Failed to update SwiftUI component ${componentId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a component
   */
  async removeComponent(componentId: string): Promise<void> {
    try {
      await this.bridge.removeComponent(componentId);
      this.components.delete(componentId);
      this.subscriptions.delete(componentId);
    } catch (error) {
      console.error(`Failed to remove SwiftUI component ${componentId}:`, error);
      throw error;
    }
  }

  /**
   * Send action to component
   */
  async sendAction(componentId: string, action: SwiftUIAction): Promise<any> {
    try {
      return await this.bridge.sendAction(componentId, action);
    } catch (error) {
      console.error(`Failed to send action to SwiftUI component ${componentId}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to component updates
   */
  subscribeToUpdates(componentId: string, callback: (state: SwiftUIViewState) => void): void {
    this.subscriptions.set(componentId, callback);
    this.bridge.subscribeToUpdates(componentId, callback);
  }

  /**
   * Unsubscribe from component updates
   */
  unsubscribeFromUpdates(componentId: string): void {
    this.bridge.unsubscribeFromUpdates(componentId);
    this.subscriptions.delete(componentId);
  }
}

/**
 * iOS-specific SwiftUI component definitions
 */
export class IOSSwiftUIComponents {
  private componentManager: SwiftUIComponentManager;

  constructor() {
    this.componentManager = new SwiftUIComponentManager();
  }

  /**
   * Create cohort dashboard component
   */
  async createCohortDashboard(props: {
    cohorts: CohortDisplayData[];
    preferences: UserPreferences;
    onCohortToggle: (topicId: number, enabled: boolean) => void;
    onPreferencesUpdate: (preferences: UserPreferences) => void;
    onDataExport: () => void;
    onDataDelete: () => void;
  }): Promise<string> {
    const componentId = `cohort-dashboard-${Date.now()}`;
    
    const component: SwiftUIComponent = {
      componentId,
      componentType: 'CohortDashboardView',
      props: {
        cohorts: props.cohorts,
        preferences: props.preferences,
        title: 'Privacy Cohort Tracker',
        subtitle: 'Manage your interest-based cohorts'
      }
    };

    await this.componentManager.renderComponent(component);

    // Set up action handlers
    this.componentManager.subscribeToUpdates(componentId, (state) => {
      if (state.error) {
        console.error('CohortDashboard error:', state.error);
      }
    });

    return componentId;
  }

  /**
   * Create privacy settings component
   */
  async createPrivacySettings(props: {
    preferences: UserPreferences;
    onSave: (preferences: UserPreferences) => void;
    onCancel: () => void;
  }): Promise<string> {
    const componentId = `privacy-settings-${Date.now()}`;
    
    const component: SwiftUIComponent = {
      componentId,
      componentType: 'PrivacySettingsView',
      props: {
        preferences: props.preferences,
        title: 'Privacy Settings',
        sections: [
          {
            title: 'Cohort Sharing',
            items: [
              {
                key: 'shareWithAdvertisers',
                title: 'Share cohorts with advertisers',
                description: 'Allow websites to access your cohort IDs for relevant advertising',
                type: 'toggle',
                value: props.preferences.shareWithAdvertisers
              }
            ]
          },
          {
            title: 'Data Retention',
            items: [
              {
                key: 'dataRetentionDays',
                title: 'Data retention period',
                description: 'How long to keep cohort assignments',
                type: 'picker',
                value: props.preferences.dataRetentionDays,
                options: [
                  { value: 7, label: '1 week' },
                  { value: 14, label: '2 weeks' },
                  { value: 21, label: '3 weeks (recommended)' },
                  { value: 30, label: '1 month' }
                ]
              }
            ]
          }
        ]
      }
    };

    await this.componentManager.renderComponent(component);
    return componentId;
  }

  /**
   * Create permission request component
   */
  async createPermissionRequest(props: {
    permissions: Array<{
      title: string;
      description: string;
      importance: 'essential' | 'recommended' | 'optional';
      granted: boolean;
    }>;
    onRequestPermissions: () => void;
    onOpenSettings: () => void;
    onSkip: () => void;
  }): Promise<string> {
    const componentId = `permission-request-${Date.now()}`;
    
    const component: SwiftUIComponent = {
      componentId,
      componentType: 'PermissionRequestView',
      props: {
        title: 'Privacy Permissions',
        subtitle: 'We need these permissions to provide privacy-preserving cohort tracking',
        permissions: props.permissions,
        primaryButtonTitle: 'Grant Permissions',
        secondaryButtonTitle: 'Open Settings',
        skipButtonTitle: 'Skip for Now'
      }
    };

    await this.componentManager.renderComponent(component);
    return componentId;
  }

  /**
   * Create cohort statistics component
   */
  async createCohortStatistics(props: {
    totalCohorts: number;
    activeCohorts: number;
    expiringCohorts: number;
    lastUpdated: Date | null;
  }): Promise<string> {
    const componentId = `cohort-statistics-${Date.now()}`;
    
    const component: SwiftUIComponent = {
      componentId,
      componentType: 'CohortStatisticsView',
      props: {
        statistics: [
          {
            title: 'Total Cohorts',
            value: props.totalCohorts,
            color: 'blue',
            icon: 'chart.bar.fill'
          },
          {
            title: 'Active',
            value: props.activeCohorts,
            color: 'green',
            icon: 'checkmark.circle.fill'
          },
          {
            title: 'Expiring Soon',
            value: props.expiringCohorts,
            color: 'orange',
            icon: 'clock.fill'
          }
        ],
        lastUpdated: props.lastUpdated?.toISOString() || null
      }
    };

    await this.componentManager.renderComponent(component);
    return componentId;
  }

  /**
   * Create data export component
   */
  async createDataExport(props: {
    onExport: (format: 'json' | 'csv') => void;
    onShare: (data: string) => void;
    onCancel: () => void;
  }): Promise<string> {
    const componentId = `data-export-${Date.now()}`;
    
    const component: SwiftUIComponent = {
      componentId,
      componentType: 'DataExportView',
      props: {
        title: 'Export Your Data',
        subtitle: 'Export your cohort data and privacy settings',
        formats: [
          {
            type: 'json',
            title: 'JSON Format',
            description: 'Machine-readable format for developers',
            icon: 'doc.text.fill'
          },
          {
            type: 'csv',
            title: 'CSV Format',
            description: 'Spreadsheet-compatible format',
            icon: 'tablecells.fill'
          }
        ]
      }
    };

    await this.componentManager.renderComponent(component);
    return componentId;
  }

  /**
   * Update component with new data
   */
  async updateComponent(componentId: string, props: Record<string, any>): Promise<void> {
    await this.componentManager.updateComponent(componentId, props);
  }

  /**
   * Remove component
   */
  async removeComponent(componentId: string): Promise<void> {
    await this.componentManager.removeComponent(componentId);
  }

  /**
   * Send action to component
   */
  async sendAction(componentId: string, action: SwiftUIAction): Promise<any> {
    return await this.componentManager.sendAction(componentId, action);
  }

  /**
   * Subscribe to component updates
   */
  subscribeToUpdates(componentId: string, callback: (state: SwiftUIViewState) => void): void {
    this.componentManager.subscribeToUpdates(componentId, callback);
  }

  /**
   * Unsubscribe from component updates
   */
  unsubscribeFromUpdates(componentId: string): void {
    this.componentManager.unsubscribeFromUpdates(componentId);
  }
}

// Export lazy singleton instance
let _iosSwiftUIComponents: IOSSwiftUIComponents | null = null;

export function getIOSSwiftUIComponents(): IOSSwiftUIComponents {
  if (!_iosSwiftUIComponents) {
    _iosSwiftUIComponents = new IOSSwiftUIComponents();
  }
  return _iosSwiftUIComponents;
}
