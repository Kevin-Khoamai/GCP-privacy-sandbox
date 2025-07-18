import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionManager } from '../src/browser-extension/permission-manager';
import { BrowserExtensionStorage } from '../src/browser-extension/storage';
import { BrowserHistoryMonitor } from '../src/browser-extension/browsing-history-monitor';
import { getBrowserAPI, BrowserDetection } from '../src/browser-extension/browser-compatibility';

// Mock browser APIs
const mockChromeAPI = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    lastError: null,
    getManifest: vi.fn().mockReturnValue({ name: 'Test Extension' })
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn()
    }
  },
  tabs: {
    onUpdated: { addListener: vi.fn() },
    query: vi.fn()
  },
  webNavigation: {
    onCompleted: { addListener: vi.fn(), removeListener: vi.fn() }
  },
  permissions: {
    request: vi.fn(),
    contains: vi.fn(),
    remove: vi.fn(),
    onAdded: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() }
  }
};

const mockFirefoxAPI = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({}),
    onMessage: { addListener: vi.fn() },
    getBrowserInfo: vi.fn().mockResolvedValue({ name: 'Firefox' })
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined)
    }
  },
  tabs: {
    onUpdated: { addListener: vi.fn() },
    query: vi.fn().mockResolvedValue([])
  },
  webNavigation: {
    onCompleted: { addListener: vi.fn(), removeListener: vi.fn() }
  },
  permissions: {
    request: vi.fn().mockResolvedValue(true),
    contains: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true)
  }
};

describe('Browser-Specific APIs Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).chrome;
    delete (global as any).browser;
  });

  describe('Permission Manager', () => {
    it('should handle Chrome permissions API', async () => {
      (global as any).chrome = mockChromeAPI;
      mockChromeAPI.permissions.request.mockImplementation((permissions, callback) => {
        callback(true);
      });
      mockChromeAPI.permissions.contains.mockImplementation((permissions, callback) => {
        callback(true);
      });

      const permissionManager = new PermissionManager();
      
      const granted = await permissionManager.requestPermissions({
        permissions: ['storage', 'tabs']
      });
      
      expect(granted).toBe(true);
      expect(mockChromeAPI.permissions.request).toHaveBeenCalledWith(
        { permissions: ['storage', 'tabs'] },
        expect.any(Function)
      );
    });

    it('should handle Firefox permissions API', async () => {
      (global as any).browser = mockFirefoxAPI;

      const permissionManager = new PermissionManager();
      
      const granted = await permissionManager.requestPermissions({
        permissions: ['storage', 'tabs']
      });
      
      expect(granted).toBe(true);
      expect(mockFirefoxAPI.permissions.request).toHaveBeenCalledWith({
        permissions: ['storage', 'tabs']
      });
    });

    it('should validate browser-specific permission requirements', async () => {
      (global as any).chrome = mockChromeAPI;
      mockChromeAPI.permissions.contains.mockImplementation((permissions, callback) => {
        callback(true);
      });

      const permissionManager = new PermissionManager();
      const requirements = permissionManager.getBrowserSpecificRequirements();
      
      expect(requirements.permissions).toContain('storage');
      expect(requirements.permissions).toContain('tabs');
      expect(requirements.permissions).toContain('webNavigation');
      expect(requirements.origins).toContain('<all_urls>');

      const validation = await permissionManager.validatePermissions();
      expect(validation.valid).toBe(true);
    });

    it('should get current permission status', async () => {
      (global as any).chrome = mockChromeAPI;
      mockChromeAPI.permissions.contains.mockImplementation((permissions, callback) => {
        callback(true);
      });

      const permissionManager = new PermissionManager();
      const status = await permissionManager.getPermissionStatus();
      
      expect(status.granted).toBe(true);
      expect(status.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('Cross-Browser Storage Integration', () => {
    it('should work with Chrome storage through compatibility layer', async () => {
      (global as any).chrome = mockChromeAPI;
      mockChromeAPI.storage.local.get.mockImplementation((key, callback) => {
        callback({ [key]: 'test-value' });
      });
      mockChromeAPI.storage.local.set.mockImplementation((items, callback) => {
        callback();
      });

      const storage = new BrowserExtensionStorage();
      
      await storage.store('test-key', 'test-value');
      const value = await storage.retrieve('test-key');
      
      expect(value).toBe('test-value');
    });

    it('should work with Firefox storage through compatibility layer', async () => {
      (global as any).browser = mockFirefoxAPI;
      mockFirefoxAPI.storage.local.get.mockResolvedValue({ 'test-key': 'test-value' });

      const storage = new BrowserExtensionStorage();
      
      await storage.store('test-key', 'test-value');
      const value = await storage.retrieve('test-key');
      
      expect(value).toBe('test-value');
      expect(mockFirefoxAPI.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('WebNavigation API Integration', () => {
    it('should start monitoring with Chrome webNavigation API', () => {
      (global as any).chrome = mockChromeAPI;

      const monitor = new BrowserHistoryMonitor();
      monitor.startMonitoring();
      
      expect(mockChromeAPI.webNavigation.onCompleted.addListener).toHaveBeenCalled();
    });

    it('should start monitoring with Firefox webNavigation API', () => {
      (global as any).browser = mockFirefoxAPI;

      const monitor = new BrowserHistoryMonitor();
      monitor.startMonitoring();
      
      expect(mockFirefoxAPI.webNavigation.onCompleted.addListener).toHaveBeenCalled();
    });

    it('should stop monitoring correctly', () => {
      (global as any).chrome = mockChromeAPI;

      const monitor = new BrowserHistoryMonitor();
      monitor.startMonitoring();
      monitor.stopMonitoring();
      
      expect(mockChromeAPI.webNavigation.onCompleted.removeListener).toHaveBeenCalled();
    });
  });

  describe('Browser Detection and API Selection', () => {
    it('should correctly identify Chrome environment', () => {
      (global as any).chrome = mockChromeAPI;
      
      expect(BrowserDetection.isChrome()).toBe(true);
      expect(BrowserDetection.getBrowserName()).toBe('chrome');
      expect(BrowserDetection.supportsManifestV3()).toBe(true);
      
      const api = getBrowserAPI();
      expect(api).toBeTruthy();
      expect(api?.permissions).toBeTruthy();
    });

    it('should correctly identify Firefox environment', () => {
      (global as any).browser = mockFirefoxAPI;
      
      expect(BrowserDetection.isFirefox()).toBe(true);
      expect(BrowserDetection.getBrowserName()).toBe('firefox');
      expect(BrowserDetection.supportsManifestV3()).toBe(false);
      
      const api = getBrowserAPI();
      expect(api).toBeTruthy();
      expect(api?.permissions).toBeTruthy();
    });

    it('should handle missing browser APIs gracefully', () => {
      // No browser APIs available
      
      expect(BrowserDetection.getBrowserName()).toBe('unknown');
      expect(getBrowserAPI()).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle Chrome API errors gracefully', async () => {
      (global as any).chrome = mockChromeAPI;
      mockChromeAPI.runtime.lastError = { message: 'Test error' };
      mockChromeAPI.storage.local.get.mockImplementation((key, callback) => {
        callback({});
      });

      const storage = new BrowserExtensionStorage();
      
      await expect(storage.retrieve('test-key')).rejects.toThrow('Test error');
    });

    it('should handle permission request failures', async () => {
      (global as any).chrome = mockChromeAPI;
      mockChromeAPI.permissions.request.mockImplementation((permissions, callback) => {
        callback(false);
      });

      const permissionManager = new PermissionManager();
      const granted = await permissionManager.requestPermissions({
        permissions: ['storage']
      });
      
      expect(granted).toBe(false);
    });
  });
});
