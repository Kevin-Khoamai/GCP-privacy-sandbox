import { describe, it, expect, beforeEach } from 'vitest';
import { AESEncryptionProvider } from '../src/shared/core/encryption-utils';

// Mock crypto API for testing environment
let mockKeyCounter = 0;
let mockRandomCounter = 0;

const mockCrypto = {
  subtle: {
    generateKey: async (algorithm: any, extractable: boolean, keyUsages: string[]) => {
      return { type: 'secret', algorithm: 'AES-GCM', id: ++mockKeyCounter } as CryptoKey;
    },
    encrypt: async (algorithm: any, key: CryptoKey, data: ArrayBuffer) => {
      // Simple mock - just return the data with some padding for the tag
      const result = new Uint8Array(data.byteLength + 16);
      result.set(new Uint8Array(data));
      // Add mock tag with key-specific data
      const keyId = (key as any).id || 1;
      result.set(new Uint8Array(16).fill(0xAB + keyId), data.byteLength);
      return result.buffer;
    },
    decrypt: async (algorithm: any, key: CryptoKey, data: ArrayBuffer) => {
      // Simple mock - remove the last 16 bytes (tag)
      const dataArray = new Uint8Array(data);
      return dataArray.slice(0, -16).buffer;
    },
    exportKey: async (format: string, key: CryptoKey) => {
      // Return a mock 32-byte key with key-specific data
      const keyId = (key as any).id || 1;
      return new Uint8Array(32).fill(0x42 + keyId).buffer;
    },
    importKey: async (format: string, keyData: ArrayBuffer, algorithm: any, extractable: boolean, keyUsages: string[]) => {
      if (algorithm === 'PBKDF2') {
        // For PBKDF2, create a key based on the password data
        const dataArray = new Uint8Array(keyData);
        const passwordHash = Array.from(dataArray).reduce((a, b) => a + b, 0);
        return { type: 'secret', algorithm: 'PBKDF2', passwordHash } as CryptoKey;
      } else {
        // For AES-GCM, create key with data-specific ID
        const dataArray = new Uint8Array(keyData);
        const keyId = dataArray[0] || 1;
        return { type: 'secret', algorithm: 'AES-GCM', id: keyId } as CryptoKey;
      }
    },
    deriveKey: async (algorithm: any, baseKey: CryptoKey, derivedKeyType: any, extractable: boolean, keyUsages: string[]) => {
      // Create derived key with password hash + salt hash
      const passwordHash = (baseKey as any).passwordHash || 1;
      const saltHash = algorithm.salt ? Array.from(new Uint8Array(algorithm.salt)).reduce((a, b) => a + b, 0) : 0;
      return { type: 'secret', algorithm: 'AES-GCM', id: passwordHash + saltHash } as CryptoKey;
    }
  },
  getRandomValues: (array: Uint8Array) => {
    // Fill with semi-random values that change each call
    for (let i = 0; i < array.length; i++) {
      array[i] = (i + mockRandomCounter) % 256;
    }
    mockRandomCounter++;
    return array;
  }
};

// Mock global crypto
Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true
});

// Mock btoa/atob for Node.js environment
global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');

describe('AESEncryptionProvider', () => {
  let encryptionProvider: AESEncryptionProvider;

  beforeEach(async () => {
    encryptionProvider = new AESEncryptionProvider();
    await encryptionProvider.initialize();
  });

  describe('initialization', () => {
    it('should initialize without errors', async () => {
      const provider = new AESEncryptionProvider();
      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('should initialize with existing key material', async () => {
      const provider = new AESEncryptionProvider();
      const keyMaterial = 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI='; // Base64 encoded 32 bytes
      await expect(provider.initialize(keyMaterial)).resolves.not.toThrow();
    });

    it('should throw error when encrypting without initialization', async () => {
      const provider = new AESEncryptionProvider();
      await expect(provider.encrypt('test data')).rejects.toThrow('Encryption provider not initialized');
    });
  });

  describe('encryption and decryption', () => {
    it('should encrypt and decrypt data successfully', async () => {
      const originalData = 'This is test data for encryption';
      
      const encrypted = await encryptionProvider.encrypt(originalData);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      
      const decrypted = await encryptionProvider.decrypt(encrypted);
      expect(decrypted).toBe(originalData);
    });

    it('should produce different encrypted output for same input', async () => {
      const data = 'Same input data';
      
      const encrypted1 = await encryptionProvider.encrypt(data);
      const encrypted2 = await encryptionProvider.encrypt(data);
      
      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same original data
      const decrypted1 = await encryptionProvider.decrypt(encrypted1);
      const decrypted2 = await encryptionProvider.decrypt(encrypted2);
      
      expect(decrypted1).toBe(data);
      expect(decrypted2).toBe(data);
    });

    it('should handle empty string encryption', async () => {
      const emptyData = '';
      
      const encrypted = await encryptionProvider.encrypt(emptyData);
      const decrypted = await encryptionProvider.decrypt(encrypted);
      
      expect(decrypted).toBe(emptyData);
    });

    it('should handle unicode characters', async () => {
      const unicodeData = '🔒 Secure data with émojis and spëcial chars 中文';
      
      const encrypted = await encryptionProvider.encrypt(unicodeData);
      const decrypted = await encryptionProvider.decrypt(encrypted);
      
      expect(decrypted).toBe(unicodeData);
    });

    it('should handle large data', async () => {
      const largeData = 'x'.repeat(10000);
      
      const encrypted = await encryptionProvider.encrypt(largeData);
      const decrypted = await encryptionProvider.decrypt(encrypted);
      
      expect(decrypted).toBe(largeData);
    });
  });

  describe('encrypted data format', () => {
    it('should produce valid JSON with required fields', async () => {
      const data = 'test data';
      const encrypted = await encryptionProvider.encrypt(data);
      
      const parsed = JSON.parse(encrypted);
      expect(parsed).toHaveProperty('data');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('tag');
      expect(parsed).toHaveProperty('timestamp');
      
      expect(typeof parsed.data).toBe('string');
      expect(typeof parsed.iv).toBe('string');
      expect(typeof parsed.tag).toBe('string');
      expect(typeof parsed.timestamp).toBe('number');
    });

    it('should include timestamp in encrypted data', async () => {
      const beforeTime = Date.now();
      const encrypted = await encryptionProvider.encrypt('test');
      const afterTime = Date.now();
      
      const parsed = JSON.parse(encrypted);
      expect(parsed.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(parsed.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('key generation and derivation', () => {
    it('should generate a key', async () => {
      const key = await encryptionProvider.generateKey();
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('should derive key from password and salt', async () => {
      const password = 'test-password';
      const salt = 'test-salt';
      
      const derivedKey = await encryptionProvider.deriveKey(password, salt);
      expect(derivedKey).toBeDefined();
      expect(typeof derivedKey).toBe('string');
      expect(derivedKey.length).toBeGreaterThan(0);
    });

    it('should produce same derived key for same password and salt', async () => {
      const password = 'test-password';
      const salt = 'test-salt';
      
      const key1 = await encryptionProvider.deriveKey(password, salt);
      const key2 = await encryptionProvider.deriveKey(password, salt);
      
      expect(key1).toBe(key2);
    });

    it('should produce different derived keys for different passwords', async () => {
      const salt = 'test-salt';
      
      const key1 = await encryptionProvider.deriveKey('password1', salt);
      const key2 = await encryptionProvider.deriveKey('password2', salt);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('error handling', () => {
    it('should throw error when decrypting invalid data', async () => {
      await expect(encryptionProvider.decrypt('invalid-encrypted-data'))
        .rejects.toThrow('Decryption failed');
    });

    it('should throw error when decrypting malformed JSON', async () => {
      await expect(encryptionProvider.decrypt('not-json'))
        .rejects.toThrow('Decryption failed');
    });

    it('should throw error when decrypting without initialization', async () => {
      const provider = new AESEncryptionProvider();
      await expect(provider.decrypt('some-data'))
        .rejects.toThrow('Encryption provider not initialized');
    });
  });
});