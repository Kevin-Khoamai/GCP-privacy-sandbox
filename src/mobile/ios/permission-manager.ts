/**
 * iOS permission manager for privacy cohort tracking
 * Handles iOS-specific permissions for browser history, background processing, and data access
 */

// iOS permission constants
export const IOS_PERMISSIONS = {
  BROWSER_HISTORY: 'com.apple.developer.web-browser.history',
  BACKGROUND_APP_REFRESH: 'com.apple.developer.background-app-refresh',
  KEYCHAIN_ACCESS: 'com.apple.developer.keychain-access-groups',
  NETWORK_ACCESS: 'com.apple.developer.networking.networkextension'
} as const;

export type IOSPermission = typeof IOS_PERMISSIONS[keyof typeof IOS_PERMISSIONS];

export interface IOSPermissionStatus {
  permission: IOSPermission;
  granted: boolean;
  restricted: boolean;
  denied: boolean;
}

export interface IOSPermissionRequestResult {
  granted: boolean;
  permissions: Record<IOSPermission, boolean>;
}

// iOS permission API interface
interface IOSPermissionAPI {
  checkPermission(permission: IOSPermission): Promise<IOSPermissionStatus>;
  requestPermission(permission: IOSPermission): Promise<boolean>;
  requestMultiplePermissions(permissions: IOSPermission[]): Promise<IOSPermissionRequestResult>;
  openAppSettings(): Promise<void>;
}

// Mock implementation - in real app this would be provided by native bridge
declare global {
  interface Window {
    IOSPermissions?: IOSPermissionAPI;
  }
}

/**
 * iOS permission manager for cohort tracking
 */
export class IOSPermissionManager {
  private permissionAPI: IOSPermissionAPI;

  constructor() {
    if (!window.IOSPermissions) {
      throw new Error('iOS permissions API not available');
    }
    this.permissionAPI = window.IOSPermissions;
  }

  /**
   * Check if a specific permission is granted
   */
  async hasPermission(permission: IOSPermission): Promise<boolean> {
    try {
      const status = await this.permissionAPI.checkPermission(permission);
      return status.granted;
    } catch (error) {
      console.error(`Failed to check permission ${permission}:`, error);
      return false;
    }
  }

  /**
   * Request a specific permission
   */
  async requestPermission(permission: IOSPermission): Promise<boolean> {
    try {
      return await this.permissionAPI.requestPermission(permission);
    } catch (error) {
      console.error(`Failed to request permission ${permission}:`, error);
      return false;
    }
  }

  /**
   * Request multiple permissions at once
   */
  async requestMultiplePermissions(permissions: IOSPermission[]): Promise<IOSPermissionRequestResult> {
    try {
      return await this.permissionAPI.requestMultiplePermissions(permissions);
    } catch (error) {
      console.error('Failed to request multiple permissions:', error);
      return {
        granted: false,
        permissions: permissions.reduce((acc, perm) => ({ ...acc, [perm]: false }), {} as Record<IOSPermission, boolean>)
      };
    }
  }

  /**
   * Open app settings for manual permission management
   */
  async openAppSettings(): Promise<void> {
    try {
      await this.permissionAPI.openAppSettings();
    } catch (error) {
      console.error('Failed to open app settings:', error);
    }
  }

  /**
   * Get status of all essential permissions for cohort tracking
   */
  async getEssentialPermissionsStatus(): Promise<Record<string, IOSPermissionStatus>> {
    const essentialPermissions: IOSPermission[] = [
      IOS_PERMISSIONS.BROWSER_HISTORY,
      IOS_PERMISSIONS.BACKGROUND_APP_REFRESH,
      IOS_PERMISSIONS.KEYCHAIN_ACCESS,
      IOS_PERMISSIONS.NETWORK_ACCESS
    ];

    const statuses: Record<string, IOSPermissionStatus> = {};

    for (const permission of essentialPermissions) {
      try {
        statuses[permission] = await this.permissionAPI.checkPermission(permission);
      } catch (error) {
        console.error(`Failed to check permission ${permission}:`, error);
        statuses[permission] = {
          permission,
          granted: false,
          restricted: false,
          denied: true
        };
      }
    }

    return statuses;
  }

  /**
   * Request all essential permissions for cohort tracking
   */
  async requestEssentialPermissions(): Promise<{
    allGranted: boolean;
    results: IOSPermissionRequestResult;
    missingPermissions: IOSPermission[];
  }> {
    const essentialPermissions: IOSPermission[] = [
      IOS_PERMISSIONS.BROWSER_HISTORY,
      IOS_PERMISSIONS.BACKGROUND_APP_REFRESH,
      IOS_PERMISSIONS.KEYCHAIN_ACCESS,
      IOS_PERMISSIONS.NETWORK_ACCESS
    ];

    const results = await this.requestMultiplePermissions(essentialPermissions);
    const missingPermissions = essentialPermissions.filter(perm => !results.permissions[perm]);
    
    return {
      allGranted: results.granted && missingPermissions.length === 0,
      results,
      missingPermissions
    };
  }

  /**
   * Check if browser history permission is available and granted
   */
  async checkBrowserHistoryAccess(): Promise<{
    available: boolean;
    granted: boolean;
    canRequest: boolean;
    restricted: boolean;
  }> {
    try {
      const status = await this.permissionAPI.checkPermission(IOS_PERMISSIONS.BROWSER_HISTORY);
      
      return {
        available: true,
        granted: status.granted,
        canRequest: !status.denied && !status.restricted,
        restricted: status.restricted
      };
    } catch (error) {
      console.error('Failed to check browser history access:', error);
      return {
        available: false,
        granted: false,
        canRequest: false,
        restricted: false
      };
    }
  }

  /**
   * Request browser history permission with user-friendly messaging
   */
  async requestBrowserHistoryPermission(): Promise<{
    granted: boolean;
    shouldShowSettings: boolean;
    message: string;
  }> {
    try {
      const access = await this.checkBrowserHistoryAccess();
      
      if (access.granted) {
        return {
          granted: true,
          shouldShowSettings: false,
          message: 'Browser history access already granted'
        };
      }

      if (access.restricted) {
        return {
          granted: false,
          shouldShowSettings: true,
          message: 'Browser history access is restricted by device policy. Please check device settings.'
        };
      }

      if (!access.canRequest) {
        return {
          granted: false,
          shouldShowSettings: true,
          message: 'Browser history permission was denied. Please enable it in app settings.'
        };
      }

      const granted = await this.requestPermission(IOS_PERMISSIONS.BROWSER_HISTORY);
      
      if (granted) {
        return {
          granted: true,
          shouldShowSettings: false,
          message: 'Browser history access granted successfully'
        };
      } else {
        return {
          granted: false,
          shouldShowSettings: false,
          message: 'Browser history permission denied. Some features may not work properly.'
        };
      }
    } catch (error) {
      console.error('Failed to request browser history permission:', error);
      return {
        granted: false,
        shouldShowSettings: false,
        message: 'Failed to request browser history permission'
      };
    }
  }

  /**
   * Check background app refresh permission
   */
  async checkBackgroundAppRefresh(): Promise<{
    granted: boolean;
    restricted: boolean;
    canRequest: boolean;
  }> {
    try {
      const status = await this.permissionAPI.checkPermission(IOS_PERMISSIONS.BACKGROUND_APP_REFRESH);
      
      return {
        granted: status.granted,
        restricted: status.restricted,
        canRequest: !status.denied && !status.restricted
      };
    } catch (error) {
      console.error('Failed to check background app refresh:', error);
      return {
        granted: false,
        restricted: false,
        canRequest: false
      };
    }
  }

  /**
   * Get user-friendly permission descriptions
   */
  getPermissionDescription(permission: IOSPermission): {
    title: string;
    description: string;
    importance: 'essential' | 'recommended' | 'optional';
  } {
    switch (permission) {
      case IOS_PERMISSIONS.BROWSER_HISTORY:
        return {
          title: 'Browser History Access',
          description: 'Allows the app to analyze your browsing patterns to assign relevant interest cohorts while maintaining privacy.',
          importance: 'essential'
        };
      
      case IOS_PERMISSIONS.BACKGROUND_APP_REFRESH:
        return {
          title: 'Background App Refresh',
          description: 'Enables the app to process cohorts in the background for optimal performance and up-to-date interest profiles.',
          importance: 'recommended'
        };
      
      case IOS_PERMISSIONS.KEYCHAIN_ACCESS:
        return {
          title: 'Keychain Access',
          description: 'Securely stores your privacy settings and cohort data using iOS Keychain Services.',
          importance: 'essential'
        };
      
      case IOS_PERMISSIONS.NETWORK_ACCESS:
        return {
          title: 'Network Access',
          description: 'Required for downloading cohort definitions and privacy-preserving data processing.',
          importance: 'essential'
        };
      
      default:
        return {
          title: 'Unknown Permission',
          description: 'This permission is required for app functionality.',
          importance: 'optional'
        };
    }
  }

  /**
   * Get iOS-specific privacy guidance
   */
  getPrivacyGuidance(): {
    title: string;
    sections: Array<{
      title: string;
      content: string;
    }>;
  } {
    return {
      title: 'iOS Privacy & Permissions',
      sections: [
        {
          title: 'Data Processing',
          content: 'All cohort processing happens locally on your device. No personal browsing data is sent to external servers.'
        },
        {
          title: 'Keychain Security',
          content: 'Your privacy settings and cohort data are protected using iOS Keychain Services with hardware-backed encryption.'
        },
        {
          title: 'Background Processing',
          content: 'Background app refresh allows the app to update your interest cohorts periodically while respecting iOS power management.'
        },
        {
          title: 'Permission Management',
          content: 'You can revoke any permission at any time through iOS Settings > Privacy & Security or the app settings.'
        }
      ]
    };
  }
}
