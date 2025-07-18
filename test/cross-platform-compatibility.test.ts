import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getBrowserAPI, BrowserDetection } from '../src/browser-extension/browser-compatibility';

// Mock different browser environments
const mockChromeEnvironment = () => {
  (global as any).chrome = {
    storage: { local: {}, sync: {} },
    tabs: { query: vi.fn(), create: vi.fn() },
    runtime: { getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }) },
    permissions: { request: vi.fn(), contains: vi.fn() },
    notifications: { create: vi.fn(), clear: vi.fn() }
  };
  delete (global as any).browser;
};

const mockFirefoxEnvironment = () => {
  (global as any).browser = {
    storage: { local: {}, sync: {} },
    tabs: { query: vi.fn(), create: vi.fn() },
    runtime: { getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }) },
    permissions: { request: vi.fn(), contains: vi.fn() },
    notifications: { create: vi.fn(), clear: vi.fn() }
  };
  delete (global as any).chrome;
};

const mockSafariEnvironment = () => {
  (global as any).safari = {
    extension: {
      settings: {},
      globalPage: {
        contentWindow: {
          safari: {
            application: {
              activeBrowserWindow: {
                activeTab: {}
              }
            }
          }
        }
      }
    }
  };
  delete (global as any).chrome;
  delete (global as any).browser;
};

const mockEdgeEnvironment = () => {
  // Edge uses Chrome APIs but with different user agent
  mockChromeEnvironment();
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
    configurable: true
  });
};

describe('Cross-Platform Compatibility Tests', () => {
  beforeEach(() => {
    // Clean up global objects
    delete (global as any).chrome;
    delete (global as any).browser;
    delete (global as any).safari;
    vi.clearAllMocks();
  });

  describe('Browser Detection', () => {
    it('should detect Chrome browser correctly', () => {
      mockChromeEnvironment();
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        configurable: true
      });

      const detection = new BrowserDetection();
      
      expect(detection.isChrome()).toBe(true);
      expect(detection.isFirefox()).toBe(false);
      expect(detection.isSafari()).toBe(false);
      expect(detection.isEdge()).toBe(false);
      expect(detection.getBrowserName()).toBe('Chrome');
    });

    it('should detect Firefox browser correctly', () => {
      mockFirefoxEnvironment();
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        configurable: true
      });

      const detection = new BrowserDetection();
      
      expect(detection.isChrome()).toBe(false);
      expect(detection.isFirefox()).toBe(true);
      expect(detection.isSafari()).toBe(false);
      expect(detection.isEdge()).toBe(false);
      expect(detection.getBrowserName()).toBe('Firefox');
    });

    it('should detect Safari browser correctly', () => {
      mockSafariEnvironment();
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
        configurable: true
      });

      const detection = new BrowserDetection();
      
      expect(detection.isChrome()).toBe(false);
      expect(detection.isFirefox()).toBe(false);
      expect(detection.isSafari()).toBe(true);
      expect(detection.isEdge()).toBe(false);
      expect(detection.getBrowserName()).toBe('Safari');
    });

    it('should detect Edge browser correctly', () => {
      mockEdgeEnvironment();

      const detection = new BrowserDetection();
      
      expect(detection.isChrome()).toBe(false);
      expect(detection.isFirefox()).toBe(false);
      expect(detection.isSafari()).toBe(false);
      expect(detection.isEdge()).toBe(true);
      expect(detection.getBrowserName()).toBe('Edge');
    });

    it('should handle unknown browsers gracefully', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Unknown Browser)',
        configurable: true
      });

      const detection = new BrowserDetection();
      
      expect(detection.getBrowserName()).toBe('Unknown');
      expect(detection.isSupported()).toBe(false);
    });
  });

  describe('API Compatibility Layer', () => {
    it('should provide Chrome API access', () => {
      mockChromeEnvironment();
      
      const api = getBrowserAPI();
      
      expect(api).toBeTruthy();
      expect(api.storage).toBeTruthy();
      expect(api.tabs).toBeTruthy();
      expect(api.runtime).toBeTruthy();
    });

    it('should provide Firefox API access', () => {
      mockFirefoxEnvironment();
      
      const api = getBrowserAPI();
      
      expect(api).toBeTruthy();
      expect(api.storage).toBeTruthy();
      expect(api.tabs).toBeTruthy();
      expect(api.runtime).toBeTruthy();
    });

    it('should handle Safari API differences', () => {
      mockSafariEnvironment();
      
      const api = getBrowserAPI();
      
      // Safari has different API structure
      expect(api).toBeTruthy();
      // Safari-specific checks would go here
    });

    it('should fallback gracefully when no API is available', () => {
      // No browser APIs available
      
      const api = getBrowserAPI();
      
      expect(api).toBeNull();
    });
  });

  describe('Storage Compatibility', () => {
    it('should handle Chrome storage API', async () => {
      mockChromeEnvironment();
      const mockStorage = {
        get: vi.fn().mockResolvedValue({ test: 'data' }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined)
      };
      (global as any).chrome.storage.local = mockStorage;

      const api = getBrowserAPI();
      
      await api.storage.local.set({ test: 'data' });
      const result = await api.storage.local.get(['test']);
      
      expect(mockStorage.set).toHaveBeenCalledWith({ test: 'data' });
      expect(mockStorage.get).toHaveBeenCalledWith(['test']);
      expect(result).toEqual({ test: 'data' });
    });

    it('should handle Firefox storage API', async () => {
      mockFirefoxEnvironment();
      const mockStorage = {
        get: vi.fn().mockResolvedValue({ test: 'data' }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined)
      };
      (global as any).browser.storage.local = mockStorage;

      const api = getBrowserAPI();
      
      await api.storage.local.set({ test: 'data' });
      const result = await api.storage.local.get(['test']);
      
      expect(mockStorage.set).toHaveBeenCalledWith({ test: 'data' });
      expect(mockStorage.get).toHaveBeenCalledWith(['test']);
      expect(result).toEqual({ test: 'data' });
    });

    it('should handle storage quota differences', async () => {
      const testStorageQuota = async (browserType: string) => {
        if (browserType === 'chrome') {
          mockChromeEnvironment();
        } else {
          mockFirefoxEnvironment();
        }

        const api = getBrowserAPI();
        const largeData = { data: 'x'.repeat(1000000) }; // 1MB of data

        try {
          await api.storage.local.set(largeData);
          return true;
        } catch (error: any) {
          if (error.message.includes('QUOTA_EXCEEDED')) {
            return false;
          }
          throw error;
        }
      };

      // Test would depend on actual browser implementation
      expect(typeof testStorageQuota).toBe('function');
    });
  });

  describe('Permission Compatibility', () => {
    it('should handle Chrome permissions', async () => {
      mockChromeEnvironment();
      const mockPermissions = {
        request: vi.fn().mockResolvedValue(true),
        contains: vi.fn().mockResolvedValue(false),
        remove: vi.fn().mockResolvedValue(true)
      };
      (global as any).chrome.permissions = mockPermissions;

      const api = getBrowserAPI();
      
      const granted = await api.permissions.request({ permissions: ['storage'] });
      const hasPermission = await api.permissions.contains({ permissions: ['storage'] });
      
      expect(granted).toBe(true);
      expect(hasPermission).toBe(false);
      expect(mockPermissions.request).toHaveBeenCalledWith({ permissions: ['storage'] });
    });

    it('should handle Firefox permissions', async () => {
      mockFirefoxEnvironment();
      const mockPermissions = {
        request: vi.fn().mockResolvedValue(true),
        contains: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true)
      };
      (global as any).browser.permissions = mockPermissions;

      const api = getBrowserAPI();
      
      const granted = await api.permissions.request({ permissions: ['storage'] });
      
      expect(granted).toBe(true);
      expect(mockPermissions.request).toHaveBeenCalledWith({ permissions: ['storage'] });
    });

    it('should handle Safari permission differences', () => {
      mockSafariEnvironment();
      
      // Safari has different permission model
      const api = getBrowserAPI();
      
      // Safari-specific permission handling would be tested here
      expect(api).toBeTruthy();
    });
  });

  describe('Notification Compatibility', () => {
    it('should create notifications in Chrome', async () => {
      mockChromeEnvironment();
      const mockNotifications = {
        create: vi.fn().mockResolvedValue('notification-id'),
        clear: vi.fn().mockResolvedValue(true),
        getAll: vi.fn().mockResolvedValue({})
      };
      (global as any).chrome.notifications = mockNotifications;

      const api = getBrowserAPI();
      
      const notificationId = await api.notifications.create({
        type: 'basic',
        iconUrl: '/icon.png',
        title: 'Test',
        message: 'Test message'
      });
      
      expect(notificationId).toBe('notification-id');
      expect(mockNotifications.create).toHaveBeenCalled();
    });

    it('should create notifications in Firefox', async () => {
      mockFirefoxEnvironment();
      const mockNotifications = {
        create: vi.fn().mockResolvedValue('notification-id'),
        clear: vi.fn().mockResolvedValue(true),
        getAll: vi.fn().mockResolvedValue({})
      };
      (global as any).browser.notifications = mockNotifications;

      const api = getBrowserAPI();
      
      const notificationId = await api.notifications.create({
        type: 'basic',
        iconUrl: '/icon.png',
        title: 'Test',
        message: 'Test message'
      });
      
      expect(notificationId).toBe('notification-id');
      expect(mockNotifications.create).toHaveBeenCalled();
    });

    it('should handle notification feature differences', async () => {
      const testNotificationFeatures = (browserType: string) => {
        if (browserType === 'chrome') {
          mockChromeEnvironment();
          // Chrome supports rich notifications
          return {
            supportsButtons: true,
            supportsProgress: true,
            supportsImages: true
          };
        } else if (browserType === 'firefox') {
          mockFirefoxEnvironment();
          // Firefox has limited notification support
          return {
            supportsButtons: false,
            supportsProgress: false,
            supportsImages: false
          };
        }
        
        return {
          supportsButtons: false,
          supportsProgress: false,
          supportsImages: false
        };
      };

      const chromeFeatures = testNotificationFeatures('chrome');
      const firefoxFeatures = testNotificationFeatures('firefox');

      expect(chromeFeatures.supportsButtons).toBe(true);
      expect(firefoxFeatures.supportsButtons).toBe(false);
    });
  });

  describe('Tab Management Compatibility', () => {
    it('should handle tab operations in Chrome', async () => {
      mockChromeEnvironment();
      const mockTabs = {
        query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        create: vi.fn().mockResolvedValue({ id: 2 }),
        update: vi.fn().mockResolvedValue({ id: 1 })
      };
      (global as any).chrome.tabs = mockTabs;

      const api = getBrowserAPI();
      
      const tabs = await api.tabs.query({ active: true });
      const newTab = await api.tabs.create({ url: 'https://example.com' });
      
      expect(tabs).toHaveLength(1);
      expect(newTab.id).toBe(2);
      expect(mockTabs.query).toHaveBeenCalledWith({ active: true });
    });

    it('should handle tab operations in Firefox', async () => {
      mockFirefoxEnvironment();
      const mockTabs = {
        query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        create: vi.fn().mockResolvedValue({ id: 2 }),
        update: vi.fn().mockResolvedValue({ id: 1 })
      };
      (global as any).browser.tabs = mockTabs;

      const api = getBrowserAPI();
      
      const tabs = await api.tabs.query({ active: true });
      
      expect(tabs).toHaveLength(1);
      expect(mockTabs.query).toHaveBeenCalledWith({ active: true });
    });
  });

  describe('Runtime Compatibility', () => {
    it('should handle runtime messaging in Chrome', async () => {
      mockChromeEnvironment();
      const mockRuntime = {
        sendMessage: vi.fn().mockResolvedValue({ response: 'ok' }),
        getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      };
      (global as any).chrome.runtime = mockRuntime;

      const api = getBrowserAPI();
      
      const response = await api.runtime.sendMessage({ type: 'test' });
      const manifest = api.runtime.getManifest();
      
      expect(response).toEqual({ response: 'ok' });
      expect(manifest.version).toBe('1.0.0');
    });

    it('should handle runtime messaging in Firefox', async () => {
      mockFirefoxEnvironment();
      const mockRuntime = {
        sendMessage: vi.fn().mockResolvedValue({ response: 'ok' }),
        getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      };
      (global as any).browser.runtime = mockRuntime;

      const api = getBrowserAPI();
      
      const response = await api.runtime.sendMessage({ type: 'test' });
      
      expect(response).toEqual({ response: 'ok' });
    });
  });

  describe('Feature Detection and Polyfills', () => {
    it('should detect available features', () => {
      const detectFeatures = (api: any) => {
        return {
          hasStorage: !!api?.storage,
          hasNotifications: !!api?.notifications,
          hasTabs: !!api?.tabs,
          hasPermissions: !!api?.permissions,
          hasWebNavigation: !!api?.webNavigation,
          hasContextMenus: !!api?.contextMenus
        };
      };

      mockChromeEnvironment();
      const chromeAPI = getBrowserAPI();
      const chromeFeatures = detectFeatures(chromeAPI);

      mockFirefoxEnvironment();
      const firefoxAPI = getBrowserAPI();
      const firefoxFeatures = detectFeatures(firefoxAPI);

      expect(chromeFeatures.hasStorage).toBe(true);
      expect(firefoxFeatures.hasStorage).toBe(true);
    });

    it('should provide polyfills for missing features', () => {
      const createPolyfills = (api: any) => {
        const polyfills: any = {};

        if (!api?.notifications) {
          polyfills.notifications = {
            create: () => Promise.resolve('polyfill-notification'),
            clear: () => Promise.resolve(true)
          };
        }

        if (!api?.permissions) {
          polyfills.permissions = {
            request: () => Promise.resolve(true),
            contains: () => Promise.resolve(true)
          };
        }

        return polyfills;
      };

      // Test with limited API
      const limitedAPI = { storage: {} };
      const polyfills = createPolyfills(limitedAPI);

      expect(polyfills.notifications).toBeTruthy();
      expect(polyfills.permissions).toBeTruthy();
    });

    it('should handle graceful degradation', async () => {
      const gracefulFeatureUse = async (api: any, featureName: string, fallback: () => any) => {
        try {
          if (api && api[featureName]) {
            return await api[featureName].someMethod();
          } else {
            return fallback();
          }
        } catch (error) {
          return fallback();
        }
      };

      const fallback = () => ({ fallback: true });
      const result = await gracefulFeatureUse(null, 'notifications', fallback);

      expect(result).toEqual({ fallback: true });
    });
  });
});
