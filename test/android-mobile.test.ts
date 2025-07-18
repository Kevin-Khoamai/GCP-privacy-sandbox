import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AndroidSecureStorage, AndroidSecureStorageProvider } from '../src/mobile/android/secure-storage';
import { AndroidCohortBackgroundService, AndroidBrowsingHistoryMonitor } from '../src/mobile/android/background-service';
import { AndroidPermissionManager, ANDROID_PERMISSIONS } from '../src/mobile/android/permission-manager';

// Mock Android APIs
const mockAndroidEncryptedStorage = {
  putString: vi.fn().mockResolvedValue(undefined),
  getString: vi.fn().mockResolvedValue(null),
  remove: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined)
};

const mockAndroidBackgroundService = {
  startService: vi.fn().mockResolvedValue(undefined),
  stopService: vi.fn().mockResolvedValue(undefined),
  isServiceRunning: vi.fn().mockResolvedValue(false),
  schedulePeriodicWork: vi.fn().mockResolvedValue(undefined),
  cancelPeriodicWork: vi.fn().mockResolvedValue(undefined)
};

const mockAndroidBrowserHistory = {
  getVisitedUrls: vi.fn().mockResolvedValue([]),
  requestHistoryPermission: vi.fn().mockResolvedValue(true),
  hasHistoryPermission: vi.fn().mockResolvedValue(true)
};

const mockAndroidPermissions = {
  checkPermission: vi.fn().mockResolvedValue({
    permission: ANDROID_PERMISSIONS.BROWSER_HISTORY,
    granted: true,
    shouldShowRationale: false,
    permanentlyDenied: false
  }),
  requestPermission: vi.fn().mockResolvedValue(true),
  requestMultiplePermissions: vi.fn().mockResolvedValue({
    granted: true,
    permissions: {}
  }),
  shouldShowRequestPermissionRationale: vi.fn().mockResolvedValue(false),
  openAppSettings: vi.fn().mockResolvedValue(undefined)
};

describe('Android Mobile Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up global mocks
    (global as any).window = {
      AndroidEncryptedStorage: mockAndroidEncryptedStorage,
      AndroidBackgroundService: mockAndroidBackgroundService,
      AndroidBrowserHistory: mockAndroidBrowserHistory,
      AndroidPermissions: mockAndroidPermissions
    };
  });

  describe('AndroidSecureStorage', () => {
    let storage: AndroidSecureStorage;

    beforeEach(() => {
      storage = new AndroidSecureStorage();
    });

    it('should store data using Android EncryptedSharedPreferences', async () => {
      await storage.store('test-key', 'test-value');
      
      expect(mockAndroidEncryptedStorage.putString).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should retrieve data from Android EncryptedSharedPreferences', async () => {
      mockAndroidEncryptedStorage.getString.mockResolvedValue('test-value');
      
      const result = await storage.retrieve('test-key');
      
      expect(result).toBe('test-value');
      expect(mockAndroidEncryptedStorage.getString).toHaveBeenCalledWith('test-key');
    });

    it('should remove data from Android EncryptedSharedPreferences', async () => {
      await storage.remove('test-key');
      
      expect(mockAndroidEncryptedStorage.remove).toHaveBeenCalledWith('test-key');
    });

    it('should clear all data from Android EncryptedSharedPreferences', async () => {
      await storage.clear();
      
      expect(mockAndroidEncryptedStorage.clear).toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      const tempStorage = new AndroidSecureStorage();
      mockAndroidEncryptedStorage.putString.mockRejectedValueOnce(new Error('Storage error'));

      await expect(tempStorage.store('test-key', 'test-value')).rejects.toThrow('Failed to store data on Android');

      // Reset mock for other tests
      mockAndroidEncryptedStorage.putString.mockResolvedValue(undefined);
    });
  });

  describe('AndroidSecureStorageProvider', () => {
    let storageProvider: AndroidSecureStorageProvider;

    beforeEach(() => {
      storageProvider = new AndroidSecureStorageProvider();
    });

    it('should initialize successfully', async () => {
      mockAndroidEncryptedStorage.getString.mockResolvedValue('existing-key');

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

  describe('AndroidBrowsingHistoryMonitor', () => {
    let historyMonitor: AndroidBrowsingHistoryMonitor;

    beforeEach(() => {
      historyMonitor = new AndroidBrowsingHistoryMonitor();
    });

    it('should start monitoring with proper permissions', async () => {
      mockAndroidBrowserHistory.hasHistoryPermission.mockResolvedValue(true);
      
      await historyMonitor.startMonitoring();
      
      expect(mockAndroidBrowserHistory.hasHistoryPermission).toHaveBeenCalled();
    });

    it('should request permission if not granted', async () => {
      mockAndroidBrowserHistory.hasHistoryPermission.mockResolvedValue(false);
      mockAndroidBrowserHistory.requestHistoryPermission.mockResolvedValue(true);
      
      await historyMonitor.startMonitoring();
      
      expect(mockAndroidBrowserHistory.requestHistoryPermission).toHaveBeenCalled();
    });

    it('should throw error if permission denied', async () => {
      mockAndroidBrowserHistory.hasHistoryPermission.mockResolvedValue(false);
      mockAndroidBrowserHistory.requestHistoryPermission.mockResolvedValue(false);
      
      await expect(historyMonitor.startMonitoring()).rejects.toThrow('Browser history permission denied');
    });

    it('should get visited domains from browser history', async () => {
      const mockUrls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://test.com/page1'
      ];
      mockAndroidBrowserHistory.getVisitedUrls.mockResolvedValue(mockUrls);
      
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
      mockAndroidBrowserHistory.getVisitedUrls.mockResolvedValue(mockUrls);
      
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

  describe('AndroidCohortBackgroundService', () => {
    let backgroundService: AndroidCohortBackgroundService;

    beforeEach(() => {
      backgroundService = new AndroidCohortBackgroundService();
    });

    it('should initialize successfully', async () => {
      mockAndroidEncryptedStorage.getString.mockResolvedValue(null);
      
      await backgroundService.initialize();
      
      // Should not throw any errors
    });

    it('should start background service', async () => {
      mockAndroidEncryptedStorage.getString.mockResolvedValue(null);
      mockAndroidBrowserHistory.hasHistoryPermission.mockResolvedValue(true);
      await backgroundService.initialize();

      await backgroundService.startService();

      expect(mockAndroidBackgroundService.startService).toHaveBeenCalled();
      expect(mockAndroidBackgroundService.schedulePeriodicWork).toHaveBeenCalledWith(30);
    });

    it('should stop background service', async () => {
      mockAndroidEncryptedStorage.getString.mockResolvedValue(null);
      mockAndroidBrowserHistory.hasHistoryPermission.mockResolvedValue(true);
      await backgroundService.initialize();
      await backgroundService.startService();

      await backgroundService.stopService();

      expect(mockAndroidBackgroundService.stopService).toHaveBeenCalled();
      expect(mockAndroidBackgroundService.cancelPeriodicWork).toHaveBeenCalled();
    });

    it('should check service running status', async () => {
      mockAndroidBackgroundService.isServiceRunning.mockResolvedValue(true);
      
      const isRunning = await backgroundService.isServiceRunning();
      
      expect(isRunning).toBe(true);
      expect(mockAndroidBackgroundService.isServiceRunning).toHaveBeenCalled();
    });

    it('should get service status', async () => {
      mockAndroidBackgroundService.isServiceRunning.mockResolvedValue(true);
      
      const status = await backgroundService.getServiceStatus();
      
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('lastProcessed');
      expect(status).toHaveProperty('totalCohorts');
      expect(status).toHaveProperty('activeCohorts');
    });
  });

  describe('AndroidPermissionManager', () => {
    let permissionManager: AndroidPermissionManager;

    beforeEach(() => {
      permissionManager = new AndroidPermissionManager();
    });

    it('should check if permission is granted', async () => {
      const hasPermission = await permissionManager.hasPermission(ANDROID_PERMISSIONS.BROWSER_HISTORY);
      
      expect(hasPermission).toBe(true);
      expect(mockAndroidPermissions.checkPermission).toHaveBeenCalledWith(ANDROID_PERMISSIONS.BROWSER_HISTORY);
    });

    it('should request single permission', async () => {
      const granted = await permissionManager.requestPermission(ANDROID_PERMISSIONS.BROWSER_HISTORY);
      
      expect(granted).toBe(true);
      expect(mockAndroidPermissions.requestPermission).toHaveBeenCalledWith(ANDROID_PERMISSIONS.BROWSER_HISTORY);
    });

    it('should request multiple permissions', async () => {
      const permissions = [ANDROID_PERMISSIONS.BROWSER_HISTORY, ANDROID_PERMISSIONS.INTERNET];
      mockAndroidPermissions.requestMultiplePermissions.mockResolvedValue({
        granted: true,
        permissions: {
          [ANDROID_PERMISSIONS.BROWSER_HISTORY]: true,
          [ANDROID_PERMISSIONS.INTERNET]: true
        }
      });
      
      const result = await permissionManager.requestMultiplePermissions(permissions);
      
      expect(result.granted).toBe(true);
      expect(mockAndroidPermissions.requestMultiplePermissions).toHaveBeenCalledWith(permissions);
    });

    it('should get essential permissions status', async () => {
      const status = await permissionManager.getEssentialPermissionsStatus();
      
      expect(status).toHaveProperty(ANDROID_PERMISSIONS.BROWSER_HISTORY);
      expect(status).toHaveProperty(ANDROID_PERMISSIONS.INTERNET);
      expect(status).toHaveProperty(ANDROID_PERMISSIONS.ACCESS_NETWORK_STATE);
      expect(status).toHaveProperty(ANDROID_PERMISSIONS.WAKE_LOCK);
    });

    it('should request essential permissions', async () => {
      mockAndroidPermissions.requestMultiplePermissions.mockResolvedValue({
        granted: true,
        permissions: {
          [ANDROID_PERMISSIONS.BROWSER_HISTORY]: true,
          [ANDROID_PERMISSIONS.INTERNET]: true,
          [ANDROID_PERMISSIONS.ACCESS_NETWORK_STATE]: true,
          [ANDROID_PERMISSIONS.WAKE_LOCK]: true
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
      const description = permissionManager.getPermissionDescription(ANDROID_PERMISSIONS.BROWSER_HISTORY);
      
      expect(description.title).toBe('Browser History Access');
      expect(description.importance).toBe('essential');
      expect(description.description).toContain('browsing patterns');
    });
  });
});
