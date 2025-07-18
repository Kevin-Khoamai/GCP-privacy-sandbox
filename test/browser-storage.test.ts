import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserExtensionStorage, BrowserSecureStorageProvider } from '../src/browser-extension/storage';

// Mock chrome.storage API
const mockChromeStorage = {
  local: {
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn()
  }
};

// Mock global chrome object
Object.defineProperty(global, 'chrome', {
  value: { storage: mockChromeStorage },
  writable: true
});

// Mock crypto for the encryption provider
const mockCrypto = {
  subtle: {
    generateKey: vi.fn().mockResolvedValue({ type: 'secret', algorithm: 'AES-GCM', id: 1 }),
    encrypt: vi.fn().mockImplementation(async (algorithm, key, data) => {
      const result = new Uint8Array(data.byteLength + 16);
      result.set(new Uint8Array(data));
      result.set(new Uint8Array(16).fill(0xAB), data.byteLength);
      return result.buffer;
    }),
    decrypt: vi.fn().mockImplementation(async (algorithm, key, data) => {
      const dataArray = new Uint8Array(data);
      return dataArray.slice(0, -16).buffer;
    }),
    exportKey: vi.fn().mockResolvedValue(new Uint8Array(32).fill(0x42).buffer),
    importKey: vi.fn().mockResolvedValue({ type: 'secret', algorithm: 'AES-GCM', id: 1 })
  },
  getRandomValues: vi.fn().mockImplementation((array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = i % 256;
    }
    return array;
  })
};

Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true
});

// Mock btoa/atob
global.btoa = vi.fn().mockImplementation((str) => Buffer.from(str, 'binary').toString('base64'));
global.atob = vi.fn().mockImplementation((str) => Buffer.from(str, 'base64').toString('binary'));

describe('BrowserExtensionStorage', () => {
  let storage: BrowserExtensionStorage;

  beforeEach(() => {
    storage = new BrowserExtensionStorage();
    vi.clearAllMocks();
  });

  describe('store', () => {
    it('should store data using chrome.storage.local.set', async () => {
      mockChromeStorage.local.set.mockResolvedValue(undefined);
      
      await storage.store('test-key', 'test-value');
      
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({ 'test-key': 'test-value' });
    });

    it('should throw error when chrome.storage.local.set fails', async () => {
      const error = new Error('Storage quota exceeded');
      mockChromeStorage.local.set.mockRejectedValue(error);
      
      await expect(storage.store('test-key', 'test-value'))
        .rejects.toThrow('Failed to store data: Storage quota exceeded');
    });
  });

  describe('retrieve', () => {
    it('should retrieve data using chrome.storage.local.get', async () => {
      mockChromeStorage.local.get.mockResolvedValue({ 'test-key': 'test-value' });
      
      const result = await storage.retrieve('test-key');
      
      expect(result).toBe('test-value');
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(['test-key']);
    });

    it('should return null when key does not exist', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      
      const result = await storage.retrieve('non-existent-key');
      
      expect(result).toBeNull();
    });

    it('should throw error when chrome.storage.local.get fails', async () => {
      const error = new Error('Storage access denied');
      mockChromeStorage.local.get.mockRejectedValue(error);
      
      await expect(storage.retrieve('test-key'))
        .rejects.toThrow('Failed to retrieve data: Storage access denied');
    });
  });

  describe('remove', () => {
    it('should remove data using chrome.storage.local.remove', async () => {
      mockChromeStorage.local.remove.mockResolvedValue(undefined);
      
      await storage.remove('test-key');
      
      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith(['test-key']);
    });

    it('should throw error when chrome.storage.local.remove fails', async () => {
      const error = new Error('Remove operation failed');
      mockChromeStorage.local.remove.mockRejectedValue(error);
      
      await expect(storage.remove('test-key'))
        .rejects.toThrow('Failed to remove data: Remove operation failed');
    });
  });

  describe('clear', () => {
    it('should clear all data using chrome.storage.local.clear', async () => {
      mockChromeStorage.local.clear.mockResolvedValue(undefined);
      
      await storage.clear();
      
      expect(mockChromeStorage.local.clear).toHaveBeenCalled();
    });

    it('should throw error when chrome.storage.local.clear fails', async () => {
      const error = new Error('Clear operation failed');
      mockChromeStorage.local.clear.mockRejectedValue(error);
      
      await expect(storage.clear())
        .rejects.toThrow('Failed to clear storage: Clear operation failed');
    });
  });
});

describe('BrowserSecureStorageProvider', () => {
  let provider: BrowserSecureStorageProvider;

  beforeEach(async () => {
    provider = new BrowserSecureStorageProvider();
    vi.clearAllMocks();
    
    // Mock successful storage operations
    mockChromeStorage.local.set.mockResolvedValue(undefined);
    mockChromeStorage.local.get.mockResolvedValue({});
  });

  describe('initialization', () => {
    it('should initialize without existing key', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      
      await provider.initialize();
      
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(['encryption_key']);
      expect(mockChromeStorage.local.set).toHaveBeenCalled();
    });

    it('should initialize with existing key', async () => {
      const existingKey = 'existing-encryption-key';
      mockChromeStorage.local.get.mockResolvedValue({ encryption_key: existingKey });
      
      await provider.initialize();
      
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(['encryption_key']);
      // Should not set a new key when one exists
      expect(mockChromeStorage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('encrypted storage operations', () => {
    beforeEach(async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      await provider.initialize();
      vi.clearAllMocks();
    });

    it('should store encrypted data', async () => {
      const testData = { message: 'test data' };
      mockChromeStorage.local.set.mockResolvedValue(undefined);
      
      await provider.storeEncrypted('test-key', testData);
      
      expect(mockChromeStorage.local.set).toHaveBeenCalled();
      const setCall = mockChromeStorage.local.set.mock.calls[0][0];
      expect(setCall).toHaveProperty('test-key');
      expect(typeof setCall['test-key']).toBe('string');
    });

    it('should retrieve and decrypt data', async () => {
      const testData = { message: 'test data' };
      
      // First store the data to get properly encrypted format
      await provider.storeEncrypted('test-key', testData);
      
      // Get the encrypted data that was stored
      const storeCall = mockChromeStorage.local.set.mock.calls[0][0];
      const encryptedData = storeCall['test-key'];
      
      // Mock the retrieval
      mockChromeStorage.local.get.mockResolvedValue({ 'test-key': encryptedData });
      
      const result = await provider.retrieveEncrypted('test-key');
      
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(['test-key']);
      expect(result).toEqual(testData);
    });

    it('should return null when key does not exist', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});
      
      const result = await provider.retrieveEncrypted('non-existent-key');
      
      expect(result).toBeNull();
    });

    it('should remove encrypted data', async () => {
      mockChromeStorage.local.remove.mockResolvedValue(undefined);
      
      await provider.removeEncrypted('test-key');
      
      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith(['test-key']);
    });

    it('should clear all encrypted data while preserving encryption key', async () => {
      const encryptionKey = 'test-encryption-key';
      mockChromeStorage.local.get.mockResolvedValue({ encryption_key: encryptionKey });
      mockChromeStorage.local.clear.mockResolvedValue(undefined);
      mockChromeStorage.local.set.mockResolvedValue(undefined);
      
      await provider.clearAllEncrypted();
      
      expect(mockChromeStorage.local.clear).toHaveBeenCalled();
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({ encryption_key: encryptionKey });
    });
  });
});