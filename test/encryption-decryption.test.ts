import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AESEncryptionProvider } from '../src/shared/core/encryption-utils';
import { EncryptionProvider } from '../src/shared/interfaces/encryption';

// Mock crypto API for testing environment
const mockCrypto = {
  subtle: {
    importKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    generateKey: vi.fn(),
    exportKey: vi.fn(),
    deriveBits: vi.fn(),
    deriveKey: vi.fn()
  },
  getRandomValues: vi.fn()
};

// Mock TextEncoder/TextDecoder for Node.js environment
const mockTextEncoder = {
  encode: (text: string) => new Uint8Array(Buffer.from(text, 'utf8'))
};

const mockTextDecoder = {
  decode: (buffer: Uint8Array) => Buffer.from(buffer).toString('utf8')
};

describe('Encryption/Decryption System', () => {
  let encryptionProvider: AESEncryptionProvider;

  beforeEach(() => {
    // Setup crypto mocks
    (global as any).crypto = mockCrypto;
    (global as any).TextEncoder = vi.fn().mockImplementation(() => mockTextEncoder);
    (global as any).TextDecoder = vi.fn().mockImplementation(() => mockTextDecoder);

    // Mock crypto operations
    mockCrypto.getRandomValues.mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    });

    mockCrypto.subtle.generateKey.mockResolvedValue({
      algorithm: { name: 'AES-GCM', length: 256 },
      extractable: true,
      type: 'secret',
      usages: ['encrypt', 'decrypt']
    });

    mockCrypto.subtle.importKey.mockResolvedValue({
      algorithm: { name: 'AES-GCM', length: 256 },
      extractable: false,
      type: 'secret',
      usages: ['encrypt', 'decrypt']
    });

    mockCrypto.subtle.exportKey.mockResolvedValue(new ArrayBuffer(32));

    encryptionProvider = new AESEncryptionProvider();
  });

  describe('Key Generation and Management', () => {
    it('should generate a valid encryption key', async () => {
      const key = await encryptionProvider.generateKey();
      
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
      expect(mockCrypto.subtle.generateKey).toHaveBeenCalledWith(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
    });

    it('should generate unique keys', async () => {
      const key1 = await encryptionProvider.generateKey();
      const key2 = await encryptionProvider.generateKey();
      
      expect(key1).not.toBe(key2);
    });

    it('should handle key generation failures gracefully', async () => {
      mockCrypto.subtle.generateKey.mockRejectedValueOnce(new Error('Key generation failed'));
      
      await expect(encryptionProvider.generateKey()).rejects.toThrow('Key generation failed');
    });

    it('should validate key format', async () => {
      const validKey = await encryptionProvider.generateKey();
      
      // Should be base64 encoded
      expect(() => atob(validKey)).not.toThrow();
      
      // Should decode to appropriate length
      const decoded = atob(validKey);
      expect(decoded.length).toBeGreaterThan(0);
    });
  });

  describe('Basic Encryption/Decryption', () => {
    let testKey: string;

    beforeEach(async () => {
      testKey = await encryptionProvider.generateKey();
      
      // Mock successful encryption
      mockCrypto.subtle.encrypt.mockResolvedValue(new ArrayBuffer(32));
      
      // Mock successful decryption
      mockCrypto.subtle.decrypt.mockImplementation((algorithm, key, data) => {
        // Return the original data for testing
        return Promise.resolve(new ArrayBuffer(16));
      });
    });

    it('should encrypt plain text successfully', async () => {
      const plaintext = 'Hello, World!';
      
      const encrypted = await encryptionProvider.encrypt(plaintext, testKey);
      
      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(plaintext);
      expect(mockCrypto.subtle.encrypt).toHaveBeenCalled();
    });

    it('should decrypt encrypted text successfully', async () => {
      const plaintext = 'Hello, World!';
      
      // Mock decryption to return original text
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        mockTextEncoder.encode(plaintext).buffer
      );
      
      const encrypted = await encryptionProvider.encrypt(plaintext, testKey);
      const decrypted = await encryptionProvider.decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty strings', async () => {
      const plaintext = '';
      
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        mockTextEncoder.encode(plaintext).buffer
      );
      
      const encrypted = await encryptionProvider.encrypt(plaintext, testKey);
      const decrypted = await encryptionProvider.decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', async () => {
      const plaintext = '🔒 Secure Data 中文 العربية';
      
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        mockTextEncoder.encode(plaintext).buffer
      );
      
      const encrypted = await encryptionProvider.encrypt(plaintext, testKey);
      const decrypted = await encryptionProvider.decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle large text data', async () => {
      const plaintext = 'A'.repeat(10000); // 10KB of data
      
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        mockTextEncoder.encode(plaintext).buffer
      );
      
      const encrypted = await encryptionProvider.encrypt(plaintext, testKey);
      const decrypted = await encryptionProvider.decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('JSON Object Encryption/Decryption', () => {
    let testKey: string;

    beforeEach(async () => {
      testKey = await encryptionProvider.generateKey();
    });

    it('should encrypt and decrypt JSON objects', async () => {
      const testObject = {
        userId: 'user123',
        cohorts: [1, 2, 3],
        preferences: {
          shareWithAdvertisers: false,
          dataRetentionDays: 21
        },
        timestamp: new Date().toISOString()
      };

      const jsonString = JSON.stringify(testObject);
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        mockTextEncoder.encode(jsonString).buffer
      );

      const encrypted = await encryptionProvider.encryptObject(testObject, testKey);
      const decrypted = await encryptionProvider.decryptObject(encrypted, testKey);

      expect(decrypted).toEqual(testObject);
    });

    it('should handle nested objects', async () => {
      const complexObject = {
        level1: {
          level2: {
            level3: {
              data: 'deep nested value',
              array: [1, 2, { nested: true }]
            }
          }
        }
      };

      const jsonString = JSON.stringify(complexObject);
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        mockTextEncoder.encode(jsonString).buffer
      );

      const encrypted = await encryptionProvider.encryptObject(complexObject, testKey);
      const decrypted = await encryptionProvider.decryptObject(encrypted, testKey);

      expect(decrypted).toEqual(complexObject);
    });

    it('should handle arrays', async () => {
      const testArray = [
        { id: 1, name: 'Sports' },
        { id: 2, name: 'Technology' },
        { id: 3, name: 'Travel' }
      ];

      const jsonString = JSON.stringify(testArray);
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        mockTextEncoder.encode(jsonString).buffer
      );

      const encrypted = await encryptionProvider.encryptObject(testArray, testKey);
      const decrypted = await encryptionProvider.decryptObject(encrypted, testKey);

      expect(decrypted).toEqual(testArray);
    });

    it('should handle null and undefined values', async () => {
      const testObject = {
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        zeroNumber: 0,
        falseBoolean: false
      };

      const jsonString = JSON.stringify(testObject);
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        mockTextEncoder.encode(jsonString).buffer
      );

      const encrypted = await encryptionProvider.encryptObject(testObject, testKey);
      const decrypted = await encryptionProvider.decryptObject(encrypted, testKey);

      // Note: JSON.stringify removes undefined values
      expect(decrypted).toEqual({
        nullValue: null,
        emptyString: '',
        zeroNumber: 0,
        falseBoolean: false
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    let testKey: string;

    beforeEach(async () => {
      testKey = await encryptionProvider.generateKey();
    });

    it('should handle invalid encryption keys', async () => {
      const invalidKey = 'invalid-key';
      
      mockCrypto.subtle.importKey.mockRejectedValueOnce(new Error('Invalid key format'));
      
      await expect(encryptionProvider.encrypt('test', invalidKey))
        .rejects.toThrow('Invalid key format');
    });

    it('should handle corrupted encrypted data', async () => {
      const corruptedData = 'corrupted-encrypted-data';
      
      mockCrypto.subtle.decrypt.mockRejectedValueOnce(new Error('Decryption failed'));
      
      await expect(encryptionProvider.decrypt(corruptedData, testKey))
        .rejects.toThrow('Decryption failed');
    });

    it('should handle wrong decryption key', async () => {
      const plaintext = 'secret data';
      const wrongKey = await encryptionProvider.generateKey();
      
      const encrypted = await encryptionProvider.encrypt(plaintext, testKey);
      
      mockCrypto.subtle.decrypt.mockRejectedValueOnce(new Error('Authentication failed'));
      
      await expect(encryptionProvider.decrypt(encrypted, wrongKey))
        .rejects.toThrow('Authentication failed');
    });

    it('should handle malformed base64 data', async () => {
      const malformedData = 'not-base64-data!@#$%';
      
      await expect(encryptionProvider.decrypt(malformedData, testKey))
        .rejects.toThrow();
    });

    it('should handle encryption failures', async () => {
      mockCrypto.subtle.encrypt.mockRejectedValueOnce(new Error('Encryption failed'));
      
      await expect(encryptionProvider.encrypt('test', testKey))
        .rejects.toThrow('Encryption failed');
    });

    it('should handle very long keys', async () => {
      const longKey = 'A'.repeat(1000);
      
      mockCrypto.subtle.importKey.mockRejectedValueOnce(new Error('Key too long'));
      
      await expect(encryptionProvider.encrypt('test', longKey))
        .rejects.toThrow('Key too long');
    });

    it('should handle empty key', async () => {
      const emptyKey = '';
      
      await expect(encryptionProvider.encrypt('test', emptyKey))
        .rejects.toThrow();
    });
  });

  describe('Security Properties', () => {
    let testKey: string;

    beforeEach(async () => {
      testKey = await encryptionProvider.generateKey();
    });

    it('should produce different ciphertext for same plaintext', async () => {
      const plaintext = 'same message';
      
      // Mock different random IVs
      let callCount = 0;
      mockCrypto.getRandomValues.mockImplementation((array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = (callCount * 17 + i) % 256; // Different values each call
        }
        callCount++;
        return array;
      });

      const encrypted1 = await encryptionProvider.encrypt(plaintext, testKey);
      const encrypted2 = await encryptionProvider.encrypt(plaintext, testKey);
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should use proper IV length', async () => {
      const plaintext = 'test message';
      
      let capturedIV: Uint8Array | null = null;
      mockCrypto.subtle.encrypt.mockImplementation((algorithm, key, data) => {
        capturedIV = algorithm.iv;
        return Promise.resolve(new ArrayBuffer(32));
      });
      
      await encryptionProvider.encrypt(plaintext, testKey);
      
      expect(capturedIV).toBeTruthy();
      expect(capturedIV?.length).toBe(12); // GCM IV should be 12 bytes
    });

    it('should use authenticated encryption', async () => {
      const plaintext = 'authenticated message';
      
      let capturedAlgorithm: any = null;
      mockCrypto.subtle.encrypt.mockImplementation((algorithm, key, data) => {
        capturedAlgorithm = algorithm;
        return Promise.resolve(new ArrayBuffer(32));
      });
      
      await encryptionProvider.encrypt(plaintext, testKey);
      
      expect(capturedAlgorithm.name).toBe('AES-GCM');
    });
  });

  describe('Performance Tests', () => {
    let testKey: string;

    beforeEach(async () => {
      testKey = await encryptionProvider.generateKey();
    });

    it('should encrypt small data quickly', async () => {
      const plaintext = 'small data';
      
      const startTime = Date.now();
      await encryptionProvider.encrypt(plaintext, testKey);
      const endTime = Date.now();
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle multiple concurrent encryptions', async () => {
      const plaintexts = Array.from({ length: 10 }, (_, i) => `message ${i}`);
      
      const startTime = Date.now();
      const promises = plaintexts.map(text => encryptionProvider.encrypt(text, testKey));
      await Promise.all(promises);
      const endTime = Date.now();
      
      // Should complete all encryptions within reasonable time
      expect(endTime - startTime).toBeLessThan(500);
    });

    it('should maintain performance with large objects', async () => {
      const largeObject = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: `Description for item ${i}`.repeat(10)
        }))
      };

      const jsonString = JSON.stringify(largeObject);
      mockCrypto.subtle.decrypt.mockResolvedValueOnce(
        mockTextEncoder.encode(jsonString).buffer
      );
      
      const startTime = Date.now();
      const encrypted = await encryptionProvider.encryptObject(largeObject, testKey);
      const decrypted = await encryptionProvider.decryptObject(encrypted, testKey);
      const endTime = Date.now();
      
      expect(decrypted).toEqual(largeObject);
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
