/**
 * Cross-browser permission manager for browser extensions
 * Handles dynamic permission requests and management across different browsers
 */

import { getBrowserAPI, BrowserDetection } from './browser-compatibility';

export interface PermissionRequest {
  permissions?: string[];
  origins?: string[];
}

export interface PermissionStatus {
  granted: boolean;
  permissions: string[];
  origins: string[];
}

/**
 * Cross-browser permission manager
 */
export class PermissionManager {
  private browserAPI: any;

  constructor() {
    this.browserAPI = getBrowserAPI();
    if (!this.browserAPI) {
      throw new Error('Browser API not available');
    }
  }

  /**
   * Request permissions dynamically
   */
  async requestPermissions(request: PermissionRequest): Promise<boolean> {
    if (!this.browserAPI.permissions) {
      console.warn('Permissions API not available in this browser');
      return false;
    }

    try {
      const granted = await this.browserAPI.permissions.request(request);
      console.log('Permission request result:', granted, 'for:', request);
      return granted;
    } catch (error) {
      console.error('Failed to request permissions:', error);
      return false;
    }
  }

  /**
   * Check if permissions are currently granted
   */
  async hasPermissions(request: PermissionRequest): Promise<boolean> {
    if (!this.browserAPI.permissions) {
      // If permissions API is not available, assume permissions are granted
      // (they would be declared in manifest)
      return true;
    }

    try {
      return await this.browserAPI.permissions.contains(request);
    } catch (error) {
      console.error('Failed to check permissions:', error);
      return false;
    }
  }

  /**
   * Remove permissions
   */
  async removePermissions(request: PermissionRequest): Promise<boolean> {
    if (!this.browserAPI.permissions) {
      console.warn('Permissions API not available in this browser');
      return false;
    }

    try {
      return await this.browserAPI.permissions.remove(request);
    } catch (error) {
      console.error('Failed to remove permissions:', error);
      return false;
    }
  }

  /**
   * Get current permission status
   */
  async getPermissionStatus(): Promise<PermissionStatus> {
    const commonPermissions = ['storage', 'tabs', 'webNavigation', 'activeTab'];
    const commonOrigins = ['<all_urls>'];

    const status: PermissionStatus = {
      granted: false,
      permissions: [],
      origins: []
    };

    // Check each permission individually
    for (const permission of commonPermissions) {
      const hasPermission = await this.hasPermissions({ permissions: [permission] });
      if (hasPermission) {
        status.permissions.push(permission);
      }
    }

    // Check origins
    for (const origin of commonOrigins) {
      const hasOrigin = await this.hasPermissions({ origins: [origin] });
      if (hasOrigin) {
        status.origins.push(origin);
      }
    }

    status.granted = status.permissions.length > 0;
    return status;
  }

  /**
   * Request essential permissions for cohort tracking
   */
  async requestEssentialPermissions(): Promise<boolean> {
    const essentialPermissions: PermissionRequest = {
      permissions: ['storage', 'tabs'],
      origins: []
    };

    // For Chrome/Edge, we might need host permissions
    if (BrowserDetection.supportsManifestV3()) {
      essentialPermissions.origins = ['<all_urls>'];
    }

    return await this.requestPermissions(essentialPermissions);
  }

  /**
   * Request optional permissions for enhanced functionality
   */
  async requestOptionalPermissions(): Promise<boolean> {
    const optionalPermissions: PermissionRequest = {
      permissions: ['webNavigation'],
      origins: []
    };

    return await this.requestPermissions(optionalPermissions);
  }

  /**
   * Handle permission changes (for browsers that support it)
   */
  onPermissionsChanged(callback: (permissions: PermissionStatus) => void): void {
    if (BrowserDetection.isChrome() && chrome.permissions && chrome.permissions.onAdded) {
      chrome.permissions.onAdded.addListener(async () => {
        const status = await this.getPermissionStatus();
        callback(status);
      });

      chrome.permissions.onRemoved.addListener(async () => {
        const status = await this.getPermissionStatus();
        callback(status);
      });
    }
  }

  /**
   * Get browser-specific permission requirements
   */
  getBrowserSpecificRequirements(): PermissionRequest {
    const browserName = BrowserDetection.getBrowserName();

    switch (browserName) {
      case 'chrome':
      case 'edge':
        return {
          permissions: ['storage', 'tabs', 'webNavigation', 'activeTab'],
          origins: ['<all_urls>']
        };

      case 'firefox':
        return {
          permissions: ['storage', 'tabs', 'webNavigation', 'activeTab', '<all_urls>'],
          origins: []
        };

      case 'safari':
        return {
          permissions: ['storage', 'tabs'],
          origins: ['<all_urls>']
        };

      default:
        return {
          permissions: ['storage', 'tabs'],
          origins: []
        };
    }
  }

  /**
   * Validate that required permissions are available
   */
  async validatePermissions(): Promise<{ valid: boolean; missing: PermissionRequest }> {
    const required = this.getBrowserSpecificRequirements();
    const missing: PermissionRequest = { permissions: [], origins: [] };

    // Check permissions
    if (required.permissions) {
      for (const permission of required.permissions) {
        const hasPermission = await this.hasPermissions({ permissions: [permission] });
        if (!hasPermission) {
          missing.permissions!.push(permission);
        }
      }
    }

    // Check origins
    if (required.origins) {
      for (const origin of required.origins) {
        const hasOrigin = await this.hasPermissions({ origins: [origin] });
        if (!hasOrigin) {
          missing.origins!.push(origin);
        }
      }
    }

    const valid = (missing.permissions?.length || 0) === 0 && (missing.origins?.length || 0) === 0;
    return { valid, missing };
  }
}
