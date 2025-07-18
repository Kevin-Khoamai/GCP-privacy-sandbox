import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getBrowserAPI, BrowserDetection, CrossBrowserStorage, CrossBrowserMessaging } from '../src/browser-extension/browser-compatibility';

// Mock browser APIs
const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn()
    },
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
    onUpdated: {
      addListener: vi.fn()
    },
    query: vi.fn()
  },
  webNavigation: {
    onCompleted: {
      addListener: vi.fn()
    }
  }
};

const mockBrowser = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({}),
    onMessage: {
      addListener: vi.fn()
    },
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
    onUpdated: {
      addListener: vi.fn()
    },
    query: vi.fn().mockResolvedValue([])
  },
  webNavigation: {
    onCompleted: {
      addListener: vi.fn()
    }
  }
};

describe('Browser Extension Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear global browser objects
    delete (global as any).chrome;
    delete (global as any).browser;
  });

  describe('Cross-Browser Compatibility', () => {
    it('should detect Chrome environment', () => {
      (global as any).chrome = mockChrome;
      
      expect(BrowserDetection.isChrome()).toBe(true);
      expect(BrowserDetection.isFirefox()).toBe(false);
      expect(BrowserDetection.getBrowserName()).toBe('chrome');
      expect(BrowserDetection.supportsManifestV3()).toBe(true);
    });

    it('should detect Firefox environment', () => {
      (global as any).browser = mockBrowser;
      
      expect(BrowserDetection.isFirefox()).toBe(true);
      expect(BrowserDetection.isChrome()).toBe(false);
      expect(BrowserDetection.getBrowserName()).toBe('firefox');
      expect(BrowserDetection.supportsManifestV3()).toBe(false);
    });

    it('should get Chrome browser API', () => {
      (global as any).chrome = mockChrome;
      
      const api = getBrowserAPI();
      expect(api).toBeTruthy();
      expect(api?.runtime).toBeTruthy();
      expect(api?.storage).toBeTruthy();
      expect(api?.tabs).toBeTruthy();
    });

    it('should get Firefox browser API', () => {
      (global as any).browser = mockBrowser;
      
      const api = getBrowserAPI();
      expect(api).toBeTruthy();
      expect(api?.runtime).toBeTruthy();
      expect(api?.storage).toBeTruthy();
      expect(api?.tabs).toBeTruthy();
    });
  });

  describe('Cross-Browser Storage', () => {
    it('should work with Chrome storage API', async () => {
      (global as any).chrome = mockChrome;
      mockChrome.storage.local.get.mockImplementation((key, callback) => {
        callback({ [key]: 'test-value' });
      });
      mockChrome.storage.local.set.mockImplementation((items, callback) => {
        callback();
      });

      const storage = new CrossBrowserStorage();
      
      await storage.set('test-key', 'test-value');
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        { 'test-key': 'test-value' },
        expect.any(Function)
      );

      const value = await storage.get('test-key');
      expect(value).toBe('test-value');
    });

    it('should work with Firefox storage API', async () => {
      (global as any).browser = mockBrowser;
      mockBrowser.storage.local.get.mockResolvedValue({ 'test-key': 'test-value' });

      const storage = new CrossBrowserStorage();
      
      await storage.set('test-key', 'test-value');
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({ 'test-key': 'test-value' });

      const value = await storage.get('test-key');
      expect(value).toBe('test-value');
    });
  });

  describe('Cross-Browser Messaging', () => {
    it('should send messages in Chrome', async () => {
      (global as any).chrome = mockChrome;
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true });
      });

      const messaging = new CrossBrowserMessaging();
      const response = await messaging.sendMessage({ type: 'TEST' });
      
      expect(response).toEqual({ success: true });
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'TEST' },
        expect.any(Function)
      );
    });

    it('should send messages in Firefox', async () => {
      (global as any).browser = mockBrowser;
      mockBrowser.runtime.sendMessage.mockResolvedValue({ success: true });

      const messaging = new CrossBrowserMessaging();
      const response = await messaging.sendMessage({ type: 'TEST' });
      
      expect(response).toEqual({ success: true });
      expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'TEST' });
    });

    it('should add message listeners', () => {
      (global as any).chrome = mockChrome;

      const messaging = new CrossBrowserMessaging();
      const callback = vi.fn();
      
      messaging.addMessageListener(callback);
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalledWith(callback);
    });
  });

  describe('Manifest Validation', () => {
    it('should have valid Chrome manifest structure', () => {
      const fs = require('fs');
      const path = require('path');
      
      const manifestPath = path.join(__dirname, '../src/browser-extension/manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      expect(manifest.manifest_version).toBe(3);
      expect(manifest.name).toBe('Local Privacy Cohort Tracker');
      expect(manifest.permissions).toContain('storage');
      expect(manifest.permissions).toContain('tabs');
      expect(manifest.permissions).toContain('webNavigation');
      expect(manifest.background.service_worker).toBe('background.js');
      expect(manifest.content_scripts).toHaveLength(1);
      expect(manifest.action.default_popup).toBe('popup.html');
    });

    it('should have valid Firefox manifest structure', () => {
      const fs = require('fs');
      const path = require('path');
      
      const manifestPath = path.join(__dirname, '../src/browser-extension/manifest-firefox.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      expect(manifest.manifest_version).toBe(2);
      expect(manifest.name).toBe('Local Privacy Cohort Tracker');
      expect(manifest.permissions).toContain('storage');
      expect(manifest.permissions).toContain('tabs');
      expect(manifest.permissions).toContain('webNavigation');
      expect(manifest.background.scripts).toContain('background.js');
      expect(manifest.content_scripts).toHaveLength(1);
      expect(manifest.browser_action.default_popup).toBe('popup.html');
      expect(manifest.applications.gecko.id).toBeTruthy();
    });
  });
});
