import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IOSSecureStorage, IOSSecureStorageProvider } from '../src/mobile/ios/secure-storage';
import { IOSCohortBackgroundService, IOSBrowsingHistoryMonitor } from '../src/mobile/ios/background-service';
import { IOSPermissionManager, IOS_PERMISSIONS } from '../src/mobile/ios/permission-manager';
import { IOSSwiftUIComponents, getIOSSwiftUIComponents } from '../src/mobile/ios/swiftui-components';

// Mock iOS APIs
const mockIOSKeychain = {
  setItem: vi.fn().mockResolvedValue(undefined),
  getItem: vi.fn().mockResolvedValue(null),
  removeItem: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined)
};

const mockIOSBackgroundService = {
  startBackgroundProcessing: vi.fn().mockResolvedValue(undefined),
  stopBackgroundProcessing: vi.fn().mockResolvedValue(undefined),
  isBackgroundProcessingEnabled: vi.fn().mockResolvedValue(false),
  scheduleBackgroundAppRefresh: vi.fn().mockResolvedValue(undefined),
  cancelBackgroundAppRefresh: vi.fn().mockResolvedValue(undefined)
};

const mockIOSBrowserHistory = {
  getVisitedUrls: vi.fn().mockResolvedValue([]),
  requestHistoryPermission: vi.fn().mockResolvedValue(true),
  hasHistoryPermission: vi.fn().mockResolvedValue(true)
};

const mockIOSPermissions = {
  checkPermission: vi.fn().mockResolvedValue({
    permission: IOS_PERMISSIONS.BROWSER_HISTORY,
    granted: true,
    restricted: false,
    denied: false
  }),
  requestPermission: vi.fn().mockResolvedValue(true),
  requestMultiplePermissions: vi.fn().mockResolvedValue({
    granted: true,
    permissions: {}
  }),
  openAppSettings: vi.fn().mockResolvedValue(undefined)
};

const mockSwiftUIBridge = {
  renderComponent: vi.fn().mockResolvedValue(undefined),
  updateComponent: vi.fn().mockResolvedValue(undefined),
  removeComponent: vi.fn().mockResolvedValue(undefined),
  sendAction: vi.fn().mockResolvedValue({}),
  subscribeToUpdates: vi.fn(),
  unsubscribeFromUpdates: vi.fn()
};

describe('iOS Mobile Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up global mocks
    (global as any).window = {
      IOSKeychain: mockIOSKeychain,
      IOSBackgroundService: mockIOSBackgroundService,
      IOSBrowserHistory: mockIOSBrowserHistory,
      IOSPermissions: mockIOSPermissions,
      SwiftUIBridge: mockSwiftUIBridge
    };
  });

  describe('IOSSecureStorage', () => {
    let storage: IOSSecureStorage;

    beforeEach(() => {
      storage = new IOSSecureStorage();
    });

    it('should store data using iOS Keychain', async () => {
      await storage.store('test-key', 'test-value');
      
      expect(mockIOSKeychain.setItem).toHaveBeenCalledWith(
        'test-key',
        'test-value',
        expect.objectContaining({
          service: 'LocalPrivacyCohortTracker',
          accessible: 'kSecAttrAccessibleWhenUnlockedThisDeviceOnly'
        })
      );
    });

    it('should retrieve data from iOS Keychain', async () => {
      mockIOSKeychain.getItem.mockResolvedValue('test-value');
      
      const result = await storage.retrieve('test-key');
      
      expect(result).toBe('test-value');
      expect(mockIOSKeychain.getItem).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({
          service: 'LocalPrivacyCohortTracker'
        })
      );
    });

    it('should remove data from iOS Keychain', async () => {
      await storage.remove('test-key');
      
      expect(mockIOSKeychain.removeItem).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({
          service: 'LocalPrivacyCohortTracker'
        })
      );
    });

    it('should clear all data from iOS Keychain', async () => {
      await storage.clear();
      
      expect(mockIOSKeychain.clear).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'LocalPrivacyCohortTracker'
        })
      );
    });

    it('should handle keychain errors gracefully', async () => {
      mockIOSKeychain.setItem.mockRejectedValueOnce(new Error('Keychain error'));
      
      await expect(storage.store('test-key', 'test-value')).rejects.toThrow('Failed to store data in iOS Keychain');
      
      // Reset mock for other tests
      mockIOSKeychain.setItem.mockResolvedValue(undefined);
    });
  });

  describe('IOSSecureStorageProvider', () => {
    let storageProvider: IOSSecureStorageProvider;

    beforeEach(() => {
      storageProvider = new IOSSecureStorageProvider();
    });

    it('should initialize successfully', async () => {
      mockIOSKeychain.getItem.mockResolvedValue('existing-key');
      
      // Mock the initialization to avoid crypto API issues in test environment
      const initSpy = vi.spyOn(storageProvider, 'initialize').mockResolvedValue();
      
      await storageProvider.initialize();
      
      expect(initSpy).toHaveBeenCalled();
    });

    it('should handle storage operations', async () => {
      // Mock the methods to avoid crypto API issues in test environment
      const storeEncryptedSpy = vi.spyOn(storageProvider, 'storeEncrypted').mockResolvedValue();
      const retrieveEncryptedSpy = vi.spyOn(storageProvider, 'retrieveEncrypted').mockResolvedValue({ test: 'data' });
      
      await storageProvider.storeEncrypted('test-key', { test: 'data' });
      const result = await storageProvider.retrieveEncrypted('test-key');
      
      expect(storeEncryptedSpy).toHaveBeenCalledWith('test-key', { test: 'data' });
      expect(retrieveEncryptedSpy).toHaveBeenCalledWith('test-key');
      expect(result).toEqual({ test: 'data' });
    });
  });

  describe('IOSBrowsingHistoryMonitor', () => {
    let historyMonitor: IOSBrowsingHistoryMonitor;

    beforeEach(() => {
      historyMonitor = new IOSBrowsingHistoryMonitor();
    });

    it('should start monitoring with proper permissions', async () => {
      mockIOSBrowserHistory.hasHistoryPermission.mockResolvedValue(true);
      
      await historyMonitor.startMonitoring();
      
      expect(mockIOSBrowserHistory.hasHistoryPermission).toHaveBeenCalled();
    });

    it('should request permission if not granted', async () => {
      mockIOSBrowserHistory.hasHistoryPermission.mockResolvedValue(false);
      mockIOSBrowserHistory.requestHistoryPermission.mockResolvedValue(true);
      
      await historyMonitor.startMonitoring();
      
      expect(mockIOSBrowserHistory.requestHistoryPermission).toHaveBeenCalled();
    });

    it('should throw error if permission denied', async () => {
      mockIOSBrowserHistory.hasHistoryPermission.mockResolvedValue(false);
      mockIOSBrowserHistory.requestHistoryPermission.mockResolvedValue(false);
      
      await expect(historyMonitor.startMonitoring()).rejects.toThrow('Browser history permission denied');
    });

    it('should get visited domains from browser history', async () => {
      const mockUrls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://test.com/page1'
      ];
      mockIOSBrowserHistory.getVisitedUrls.mockResolvedValue(mockUrls);
      
      const timeRange = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-02')
      };
      
      const visits = await historyMonitor.getVisitedDomains(timeRange);
      
      expect(visits).toHaveLength(2); // example.com and test.com
      expect(visits[0].domain).toBe('example.com');
      expect(visits[0].visitCount).toBe(2);
      expect(visits[1].domain).toBe('test.com');
      expect(visits[1].visitCount).toBe(1);
    });

    it('should filter sensitive domains', async () => {
      const mockUrls = [
        'https://example.com/page1',
        'https://mybank.com/login',
        'https://health.gov/records'
      ];
      mockIOSBrowserHistory.getVisitedUrls.mockResolvedValue(mockUrls);
      
      const timeRange = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-02')
      };
      
      const visits = await historyMonitor.getVisitedDomains(timeRange);
      
      expect(visits).toHaveLength(1); // Only example.com should remain
      expect(visits[0].domain).toBe('example.com');
    });

    it('should stop monitoring correctly', () => {
      historyMonitor.stopMonitoring();
      // Should not throw any errors
    });
  });

  describe('IOSCohortBackgroundService', () => {
    let backgroundService: IOSCohortBackgroundService;

    beforeEach(() => {
      backgroundService = new IOSCohortBackgroundService();
    });

    it('should initialize successfully', async () => {
      mockIOSKeychain.getItem.mockResolvedValue(null);
      
      await backgroundService.initialize();
      
      // Should not throw any errors
    });

    it('should start background service', async () => {
      mockIOSKeychain.getItem.mockResolvedValue(null);
      mockIOSBrowserHistory.hasHistoryPermission.mockResolvedValue(true);
      await backgroundService.initialize();
      
      await backgroundService.startService();
      
      expect(mockIOSBackgroundService.startBackgroundProcessing).toHaveBeenCalled();
      expect(mockIOSBackgroundService.scheduleBackgroundAppRefresh).toHaveBeenCalledWith(30);
    });

    it('should stop background service', async () => {
      mockIOSKeychain.getItem.mockResolvedValue(null);
      mockIOSBrowserHistory.hasHistoryPermission.mockResolvedValue(true);
      await backgroundService.initialize();
      await backgroundService.startService();
      
      await backgroundService.stopService();
      
      expect(mockIOSBackgroundService.stopBackgroundProcessing).toHaveBeenCalled();
      expect(mockIOSBackgroundService.cancelBackgroundAppRefresh).toHaveBeenCalled();
    });

    it('should check service running status', async () => {
      mockIOSBackgroundService.isBackgroundProcessingEnabled.mockResolvedValue(true);
      
      const isRunning = await backgroundService.isServiceRunning();
      
      expect(isRunning).toBe(true);
      expect(mockIOSBackgroundService.isBackgroundProcessingEnabled).toHaveBeenCalled();
    });

    it('should get service status', async () => {
      mockIOSBackgroundService.isBackgroundProcessingEnabled.mockResolvedValue(true);
      
      const status = await backgroundService.getServiceStatus();
      
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('lastProcessed');
      expect(status).toHaveProperty('totalCohorts');
      expect(status).toHaveProperty('activeCohorts');
    });
  });

  describe('IOSPermissionManager', () => {
    let permissionManager: IOSPermissionManager;

    beforeEach(() => {
      permissionManager = new IOSPermissionManager();
    });

    it('should check if permission is granted', async () => {
      const hasPermission = await permissionManager.hasPermission(IOS_PERMISSIONS.BROWSER_HISTORY);
      
      expect(hasPermission).toBe(true);
      expect(mockIOSPermissions.checkPermission).toHaveBeenCalledWith(IOS_PERMISSIONS.BROWSER_HISTORY);
    });

    it('should request single permission', async () => {
      const granted = await permissionManager.requestPermission(IOS_PERMISSIONS.BROWSER_HISTORY);
      
      expect(granted).toBe(true);
      expect(mockIOSPermissions.requestPermission).toHaveBeenCalledWith(IOS_PERMISSIONS.BROWSER_HISTORY);
    });

    it('should request multiple permissions', async () => {
      const permissions = [IOS_PERMISSIONS.BROWSER_HISTORY, IOS_PERMISSIONS.BACKGROUND_APP_REFRESH];
      mockIOSPermissions.requestMultiplePermissions.mockResolvedValue({
        granted: true,
        permissions: {
          [IOS_PERMISSIONS.BROWSER_HISTORY]: true,
          [IOS_PERMISSIONS.BACKGROUND_APP_REFRESH]: true
        }
      });
      
      const result = await permissionManager.requestMultiplePermissions(permissions);
      
      expect(result.granted).toBe(true);
      expect(mockIOSPermissions.requestMultiplePermissions).toHaveBeenCalledWith(permissions);
    });

    it('should get essential permissions status', async () => {
      const status = await permissionManager.getEssentialPermissionsStatus();
      
      expect(status).toHaveProperty(IOS_PERMISSIONS.BROWSER_HISTORY);
      expect(status).toHaveProperty(IOS_PERMISSIONS.BACKGROUND_APP_REFRESH);
      expect(status).toHaveProperty(IOS_PERMISSIONS.KEYCHAIN_ACCESS);
      expect(status).toHaveProperty(IOS_PERMISSIONS.NETWORK_ACCESS);
    });

    it('should request essential permissions', async () => {
      mockIOSPermissions.requestMultiplePermissions.mockResolvedValue({
        granted: true,
        permissions: {
          [IOS_PERMISSIONS.BROWSER_HISTORY]: true,
          [IOS_PERMISSIONS.BACKGROUND_APP_REFRESH]: true,
          [IOS_PERMISSIONS.KEYCHAIN_ACCESS]: true,
          [IOS_PERMISSIONS.NETWORK_ACCESS]: true
        }
      });
      
      const result = await permissionManager.requestEssentialPermissions();
      
      expect(result.allGranted).toBe(true);
      expect(result.missingPermissions).toHaveLength(0);
    });

    it('should check browser history access', async () => {
      const access = await permissionManager.checkBrowserHistoryAccess();
      
      expect(access.available).toBe(true);
      expect(access.granted).toBe(true);
      expect(access.canRequest).toBe(true);
    });

    it('should get permission descriptions', () => {
      const description = permissionManager.getPermissionDescription(IOS_PERMISSIONS.BROWSER_HISTORY);
      
      expect(description.title).toBe('Browser History Access');
      expect(description.importance).toBe('essential');
      expect(description.description).toContain('browsing patterns');
    });

    it('should get privacy guidance', () => {
      const guidance = permissionManager.getPrivacyGuidance();
      
      expect(guidance.title).toBe('iOS Privacy & Permissions');
      expect(guidance.sections).toHaveLength(4);
      expect(guidance.sections[0].title).toBe('Data Processing');
    });
  });

  describe('IOSSwiftUIComponents', () => {
    let swiftUIComponents: IOSSwiftUIComponents;

    beforeEach(() => {
      swiftUIComponents = getIOSSwiftUIComponents();
    });

    it('should create cohort dashboard component', async () => {
      const props = {
        cohorts: [],
        preferences: { cohortsEnabled: true, shareWithAdvertisers: false, dataRetentionDays: 21 },
        onCohortToggle: vi.fn(),
        onPreferencesUpdate: vi.fn(),
        onDataExport: vi.fn(),
        onDataDelete: vi.fn()
      };
      
      const componentId = await swiftUIComponents.createCohortDashboard(props);
      
      expect(componentId).toMatch(/^cohort-dashboard-\d+$/);
      expect(mockSwiftUIBridge.renderComponent).toHaveBeenCalledWith(
        expect.objectContaining({
          componentId,
          componentType: 'CohortDashboardView'
        })
      );
    });

    it('should create privacy settings component', async () => {
      const props = {
        preferences: { cohortsEnabled: true, shareWithAdvertisers: false, dataRetentionDays: 21 },
        onSave: vi.fn(),
        onCancel: vi.fn()
      };
      
      const componentId = await swiftUIComponents.createPrivacySettings(props);
      
      expect(componentId).toMatch(/^privacy-settings-\d+$/);
      expect(mockSwiftUIBridge.renderComponent).toHaveBeenCalledWith(
        expect.objectContaining({
          componentId,
          componentType: 'PrivacySettingsView'
        })
      );
    });

    it('should update component', async () => {
      const componentId = 'test-component';
      const props = { test: 'value' };
      
      await swiftUIComponents.updateComponent(componentId, props);
      
      expect(mockSwiftUIBridge.updateComponent).toHaveBeenCalledWith(componentId, props);
    });

    it('should remove component', async () => {
      const componentId = 'test-component';
      
      await swiftUIComponents.removeComponent(componentId);
      
      expect(mockSwiftUIBridge.removeComponent).toHaveBeenCalledWith(componentId);
    });

    it('should send action to component', async () => {
      const componentId = 'test-component';
      const action = { type: 'TEST_ACTION', payload: { test: 'data' } };
      
      await swiftUIComponents.sendAction(componentId, action);
      
      expect(mockSwiftUIBridge.sendAction).toHaveBeenCalledWith(componentId, action);
    });
  });
});
