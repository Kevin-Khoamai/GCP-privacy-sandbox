/**
 * Android permission manager for privacy cohort tracking
 * Handles Android-specific permissions for browser history, storage, and background processing
 */

// Android permission constants
export const ANDROID_PERMISSIONS = {
  BROWSER_HISTORY: 'android.permission.READ_BROWSER_HISTORY',
  WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
  READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
  WAKE_LOCK: 'android.permission.WAKE_LOCK',
  RECEIVE_BOOT_COMPLETED: 'android.permission.RECEIVE_BOOT_COMPLETED',
  FOREGROUND_SERVICE: 'android.permission.FOREGROUND_SERVICE',
  INTERNET: 'android.permission.INTERNET',
  ACCESS_NETWORK_STATE: 'android.permission.ACCESS_NETWORK_STATE'
} as const;

export type AndroidPermission = typeof ANDROID_PERMISSIONS[keyof typeof ANDROID_PERMISSIONS];

export interface PermissionStatus {
  permission: AndroidPermission;
  granted: boolean;
  shouldShowRationale: boolean;
  permanentlyDenied: boolean;
}

export interface PermissionRequestResult {
  granted: boolean;
  permissions: Record<AndroidPermission, boolean>;
}

// Android permission API interface
interface AndroidPermissionAPI {
  checkPermission(permission: AndroidPermission): Promise<PermissionStatus>;
  requestPermission(permission: AndroidPermission): Promise<boolean>;
  requestMultiplePermissions(permissions: AndroidPermission[]): Promise<PermissionRequestResult>;
  shouldShowRequestPermissionRationale(permission: AndroidPermission): Promise<boolean>;
  openAppSettings(): Promise<void>;
}

// Mock implementation - in real app this would be provided by native bridge
declare global {
  interface Window {
    AndroidPermissions?: AndroidPermissionAPI;
  }
}

/**
 * Android permission manager for cohort tracking
 */
export class AndroidPermissionManager {
  private permissionAPI: AndroidPermissionAPI;

  constructor() {
    if (!window.AndroidPermissions) {
      throw new Error('Android permissions API not available');
    }
    this.permissionAPI = window.AndroidPermissions;
  }

  /**
   * Check if a specific permission is granted
   */
  async hasPermission(permission: AndroidPermission): Promise<boolean> {
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
  async requestPermission(permission: AndroidPermission): Promise<boolean> {
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
  async requestMultiplePermissions(permissions: AndroidPermission[]): Promise<PermissionRequestResult> {
    try {
      return await this.permissionAPI.requestMultiplePermissions(permissions);
    } catch (error) {
      console.error('Failed to request multiple permissions:', error);
      return {
        granted: false,
        permissions: permissions.reduce((acc, perm) => ({ ...acc, [perm]: false }), {} as Record<AndroidPermission, boolean>)
      };
    }
  }

  /**
   * Check if we should show permission rationale
   */
  async shouldShowRationale(permission: AndroidPermission): Promise<boolean> {
    try {
      return await this.permissionAPI.shouldShowRequestPermissionRationale(permission);
    } catch (error) {
      console.error(`Failed to check rationale for ${permission}:`, error);
      return false;
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
  async getEssentialPermissionsStatus(): Promise<Record<string, PermissionStatus>> {
    const essentialPermissions: AndroidPermission[] = [
      ANDROID_PERMISSIONS.BROWSER_HISTORY,
      ANDROID_PERMISSIONS.INTERNET,
      ANDROID_PERMISSIONS.ACCESS_NETWORK_STATE,
      ANDROID_PERMISSIONS.WAKE_LOCK
    ];

    const statuses: Record<string, PermissionStatus> = {};

    for (const permission of essentialPermissions) {
      try {
        statuses[permission] = await this.permissionAPI.checkPermission(permission);
      } catch (error) {
        console.error(`Failed to check permission ${permission}:`, error);
        statuses[permission] = {
          permission,
          granted: false,
          shouldShowRationale: false,
          permanentlyDenied: false
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
    results: PermissionRequestResult;
    missingPermissions: AndroidPermission[];
  }> {
    const essentialPermissions: AndroidPermission[] = [
      ANDROID_PERMISSIONS.BROWSER_HISTORY,
      ANDROID_PERMISSIONS.INTERNET,
      ANDROID_PERMISSIONS.ACCESS_NETWORK_STATE,
      ANDROID_PERMISSIONS.WAKE_LOCK
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
   * Request optional permissions for enhanced functionality
   */
  async requestOptionalPermissions(): Promise<{
    results: PermissionRequestResult;
    grantedPermissions: AndroidPermission[];
  }> {
    const optionalPermissions: AndroidPermission[] = [
      ANDROID_PERMISSIONS.FOREGROUND_SERVICE,
      ANDROID_PERMISSIONS.RECEIVE_BOOT_COMPLETED,
      ANDROID_PERMISSIONS.WRITE_EXTERNAL_STORAGE
    ];

    const results = await this.requestMultiplePermissions(optionalPermissions);
    const grantedPermissions = optionalPermissions.filter(perm => results.permissions[perm]);
    
    return {
      results,
      grantedPermissions
    };
  }

  /**
   * Check if browser history permission is available and granted
   */
  async checkBrowserHistoryAccess(): Promise<{
    available: boolean;
    granted: boolean;
    canRequest: boolean;
    shouldShowRationale: boolean;
  }> {
    try {
      const status = await this.permissionAPI.checkPermission(ANDROID_PERMISSIONS.BROWSER_HISTORY);
      const shouldShowRationale = await this.shouldShowRationale(ANDROID_PERMISSIONS.BROWSER_HISTORY);
      
      return {
        available: true,
        granted: status.granted,
        canRequest: !status.permanentlyDenied,
        shouldShowRationale
      };
    } catch (error) {
      console.error('Failed to check browser history access:', error);
      return {
        available: false,
        granted: false,
        canRequest: false,
        shouldShowRationale: false
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

      if (!access.canRequest) {
        return {
          granted: false,
          shouldShowSettings: true,
          message: 'Browser history permission was permanently denied. Please enable it in app settings.'
        };
      }

      const granted = await this.requestPermission(ANDROID_PERMISSIONS.BROWSER_HISTORY);
      
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
   * Get user-friendly permission descriptions
   */
  getPermissionDescription(permission: AndroidPermission): {
    title: string;
    description: string;
    importance: 'essential' | 'recommended' | 'optional';
  } {
    switch (permission) {
      case ANDROID_PERMISSIONS.BROWSER_HISTORY:
        return {
          title: 'Browser History Access',
          description: 'Allows the app to analyze your browsing patterns to assign relevant interest cohorts while maintaining privacy.',
          importance: 'essential'
        };
      
      case ANDROID_PERMISSIONS.INTERNET:
        return {
          title: 'Internet Access',
          description: 'Required for downloading cohort definitions and privacy-preserving data processing.',
          importance: 'essential'
        };
      
      case ANDROID_PERMISSIONS.ACCESS_NETWORK_STATE:
        return {
          title: 'Network State Access',
          description: 'Allows the app to check network connectivity for optimal data processing.',
          importance: 'essential'
        };
      
      case ANDROID_PERMISSIONS.WAKE_LOCK:
        return {
          title: 'Wake Lock',
          description: 'Prevents the device from sleeping during cohort processing to ensure data consistency.',
          importance: 'recommended'
        };
      
      case ANDROID_PERMISSIONS.FOREGROUND_SERVICE:
        return {
          title: 'Background Processing',
          description: 'Allows the app to process cohorts in the background for better performance.',
          importance: 'recommended'
        };
      
      case ANDROID_PERMISSIONS.RECEIVE_BOOT_COMPLETED:
        return {
          title: 'Auto-start',
          description: 'Allows the app to start automatically when the device boots up.',
          importance: 'optional'
        };
      
      case ANDROID_PERMISSIONS.WRITE_EXTERNAL_STORAGE:
        return {
          title: 'Storage Access',
          description: 'Allows the app to export your privacy data for backup purposes.',
          importance: 'optional'
        };
      
      default:
        return {
          title: 'Unknown Permission',
          description: 'This permission is required for app functionality.',
          importance: 'optional'
        };
    }
  }
}
