import { EncryptionProvider } from '../interfaces/encryption';

/**
 * Advanced Encryption Provider with Enhanced Security Features
 * Implements AES-256-GCM with key derivation, secure key management, and data classification
 */
export class AdvancedEncryptionProvider implements EncryptionProvider {
  private static instance: AdvancedEncryptionProvider;
  private keyCache: Map<string, CryptoKey> = new Map();
  private readonly ALGORITHM = 'AES-GCM';
  private readonly KEY_LENGTH = 256;
  private readonly IV_LENGTH = 12; // 96 bits for GCM
  private readonly TAG_LENGTH = 128; // 128 bits for authentication tag
  private readonly SALT_LENGTH = 32; // 256 bits for key derivation salt

  // Data classification levels
  private readonly DATA_CLASSIFICATIONS = {
    PUBLIC: 0,
    INTERNAL: 1,
    CONFIDENTIAL: 2,
    RESTRICTED: 3,
    TOP_SECRET: 4
  };

  private constructor() {}

  public static getInstance(): AdvancedEncryptionProvider {
    if (!AdvancedEncryptionProvider.instance) {
      AdvancedEncryptionProvider.instance = new AdvancedEncryptionProvider();
    }
    return AdvancedEncryptionProvider.instance;
  }

  public async generateKey(): Promise<string> {
    try {
      const key = await crypto.subtle.generateKey(
        {
          name: this.ALGORITHM,
          length: this.KEY_LENGTH
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );

      const keyData = await crypto.subtle.exportKey('raw', key);
      return this.arrayBufferToBase64(keyData);
    } catch (error) {
      throw new Error(`Key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async deriveKey(password: string, salt?: Uint8Array): Promise<string> {
    try {
      // Generate salt if not provided
      if (!salt) {
        salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
      }

      // Import password as key material
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      // Derive key using PBKDF2
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000, // OWASP recommended minimum
          hash: 'SHA-256'
        },
        keyMaterial,
        {
          name: this.ALGORITHM,
          length: this.KEY_LENGTH
        },
        true,
        ['encrypt', 'decrypt']
      );

      const keyData = await crypto.subtle.exportKey('raw', derivedKey);
      const saltBase64 = this.arrayBufferToBase64(salt);
      const keyBase64 = this.arrayBufferToBase64(keyData);

      // Return salt and key combined
      return `${saltBase64}:${keyBase64}`;
    } catch (error) {
      throw new Error(`Key derivation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async encrypt(plaintext: string, keyString: string, classification: keyof typeof AdvancedEncryptionProvider.prototype.DATA_CLASSIFICATIONS = 'CONFIDENTIAL'): Promise<string> {
    try {
      const key = await this.importKey(keyString);
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
      const plaintextBytes = new TextEncoder().encode(plaintext);

      // Add metadata for classification and integrity
      const metadata = {
        classification: this.DATA_CLASSIFICATIONS[classification],
        timestamp: Date.now(),
        version: '2.0'
      };
      const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));

      // Combine metadata and plaintext
      const combinedData = new Uint8Array(metadataBytes.length + plaintextBytes.length + 4);
      const metadataLengthBytes = new Uint32Array([metadataBytes.length]);
      combinedData.set(new Uint8Array(metadataLengthBytes.buffer), 0);
      combinedData.set(metadataBytes, 4);
      combinedData.set(plaintextBytes, 4 + metadataBytes.length);

      const ciphertext = await crypto.subtle.encrypt(
        {
          name: this.ALGORITHM,
          iv: iv,
          tagLength: this.TAG_LENGTH
        },
        key,
        combinedData
      );

      // Combine IV and ciphertext
      const result = new Uint8Array(iv.length + ciphertext.byteLength);
      result.set(iv, 0);
      result.set(new Uint8Array(ciphertext), iv.length);

      return this.arrayBufferToBase64(result);
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async decrypt(ciphertext: string, keyString: string): Promise<string> {
    try {
      const key = await this.importKey(keyString);
      const ciphertextBytes = this.base64ToArrayBuffer(ciphertext);

      // Extract IV and encrypted data
      const iv = ciphertextBytes.slice(0, this.IV_LENGTH);
      const encryptedData = ciphertextBytes.slice(this.IV_LENGTH);

      const decryptedData = await crypto.subtle.decrypt(
        {
          name: this.ALGORITHM,
          iv: iv,
          tagLength: this.TAG_LENGTH
        },
        key,
        encryptedData
      );

      // Extract metadata and plaintext
      const combinedData = new Uint8Array(decryptedData);
      const metadataLength = new Uint32Array(combinedData.slice(0, 4).buffer)[0];
      const metadataBytes = combinedData.slice(4, 4 + metadataLength);
      const plaintextBytes = combinedData.slice(4 + metadataLength);

      // Validate metadata
      const metadata = JSON.parse(new TextDecoder().decode(metadataBytes));
      this.validateMetadata(metadata);

      return new TextDecoder().decode(plaintextBytes);
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async encryptObject(obj: any, keyString: string, classification: keyof typeof AdvancedEncryptionProvider.prototype.DATA_CLASSIFICATIONS = 'CONFIDENTIAL'): Promise<string> {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString, keyString, classification);
  }

  public async decryptObject<T>(ciphertext: string, keyString: string): Promise<T> {
    const jsonString = await this.decrypt(ciphertext, keyString);
    return JSON.parse(jsonString);
  }

  // Advanced encryption for highly sensitive data
  public async encryptSensitiveData(data: string, keyString: string, additionalData?: string): Promise<string> {
    try {
      const key = await this.importKey(keyString);
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
      const plaintextBytes = new TextEncoder().encode(data);

      // Use additional authenticated data if provided
      const encryptOptions: AesGcmParams = {
        name: this.ALGORITHM,
        iv: iv,
        tagLength: this.TAG_LENGTH
      };

      if (additionalData) {
        encryptOptions.additionalData = new TextEncoder().encode(additionalData);
      }

      const ciphertext = await crypto.subtle.encrypt(encryptOptions, key, plaintextBytes);

      // Combine IV, additional data length, additional data, and ciphertext
      const additionalDataBytes = additionalData ? new TextEncoder().encode(additionalData) : new Uint8Array(0);
      const result = new Uint8Array(
        iv.length + 4 + additionalDataBytes.length + ciphertext.byteLength
      );

      let offset = 0;
      result.set(iv, offset);
      offset += iv.length;

      // Store additional data length
      const additionalDataLength = new Uint32Array([additionalDataBytes.length]);
      result.set(new Uint8Array(additionalDataLength.buffer), offset);
      offset += 4;

      // Store additional data
      result.set(additionalDataBytes, offset);
      offset += additionalDataBytes.length;

      // Store ciphertext
      result.set(new Uint8Array(ciphertext), offset);

      return this.arrayBufferToBase64(result);
    } catch (error) {
      throw new Error(`Sensitive data encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async decryptSensitiveData(ciphertext: string, keyString: string): Promise<{ data: string; additionalData?: string }> {
    try {
      const key = await this.importKey(keyString);
      const ciphertextBytes = this.base64ToArrayBuffer(ciphertext);

      let offset = 0;

      // Extract IV
      const iv = ciphertextBytes.slice(offset, offset + this.IV_LENGTH);
      offset += this.IV_LENGTH;

      // Extract additional data length
      const additionalDataLength = new Uint32Array(
        ciphertextBytes.slice(offset, offset + 4).buffer
      )[0];
      offset += 4;

      // Extract additional data
      const additionalDataBytes = ciphertextBytes.slice(offset, offset + additionalDataLength);
      const additionalData = additionalDataLength > 0 
        ? new TextDecoder().decode(additionalDataBytes) 
        : undefined;
      offset += additionalDataLength;

      // Extract encrypted data
      const encryptedData = ciphertextBytes.slice(offset);

      const decryptOptions: AesGcmParams = {
        name: this.ALGORITHM,
        iv: iv,
        tagLength: this.TAG_LENGTH
      };

      if (additionalData) {
        decryptOptions.additionalData = additionalDataBytes;
      }

      const decryptedData = await crypto.subtle.decrypt(decryptOptions, key, encryptedData);
      const data = new TextDecoder().decode(decryptedData);

      return { data, additionalData };
    } catch (error) {
      throw new Error(`Sensitive data decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Key rotation functionality
  public async rotateKey(oldKeyString: string, newKeyString: string, encryptedData: string): Promise<string> {
    try {
      // Decrypt with old key
      const plaintext = await this.decrypt(encryptedData, oldKeyString);
      
      // Re-encrypt with new key
      return await this.encrypt(plaintext, newKeyString);
    } catch (error) {
      throw new Error(`Key rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Secure key storage and retrieval
  public async storeKeySecurely(keyId: string, keyString: string, masterKey: string): Promise<void> {
    try {
      const encryptedKey = await this.encrypt(keyString, masterKey, 'TOP_SECRET');
      
      // In a real implementation, this would use secure key storage
      // For now, we'll use a secure in-memory cache
      const key = await this.importKey(keyString);
      this.keyCache.set(keyId, key);
      
      // Store encrypted key metadata
      localStorage.setItem(`key_${keyId}`, JSON.stringify({
        encryptedKey,
        created: Date.now(),
        classification: 'TOP_SECRET'
      }));
    } catch (error) {
      throw new Error(`Secure key storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async retrieveKeySecurely(keyId: string, masterKey: string): Promise<string> {
    try {
      // Check cache first
      if (this.keyCache.has(keyId)) {
        const key = this.keyCache.get(keyId)!;
        const keyData = await crypto.subtle.exportKey('raw', key);
        return this.arrayBufferToBase64(keyData);
      }

      // Retrieve from storage
      const keyMetadata = localStorage.getItem(`key_${keyId}`);
      if (!keyMetadata) {
        throw new Error(`Key ${keyId} not found`);
      }

      const { encryptedKey } = JSON.parse(keyMetadata);
      const keyString = await this.decrypt(encryptedKey, masterKey);
      
      // Cache for future use
      const key = await this.importKey(keyString);
      this.keyCache.set(keyId, key);
      
      return keyString;
    } catch (error) {
      throw new Error(`Secure key retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Data integrity verification
  public async generateHMAC(data: string, keyString: string): Promise<string> {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        this.base64ToArrayBuffer(keyString),
        {
          name: 'HMAC',
          hash: 'SHA-256'
        },
        false,
        ['sign']
      );

      const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
      return this.arrayBufferToBase64(signature);
    } catch (error) {
      throw new Error(`HMAC generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async verifyHMAC(data: string, signature: string, keyString: string): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        this.base64ToArrayBuffer(keyString),
        {
          name: 'HMAC',
          hash: 'SHA-256'
        },
        false,
        ['verify']
      );

      return await crypto.subtle.verify(
        'HMAC',
        key,
        this.base64ToArrayBuffer(signature),
        new TextEncoder().encode(data)
      );
    } catch (error) {
      throw new Error(`HMAC verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Helper methods
  private async importKey(keyString: string): Promise<CryptoKey> {
    try {
      let keyData: ArrayBuffer;

      // Handle derived keys (salt:key format)
      if (keyString.includes(':')) {
        const [, keyBase64] = keyString.split(':');
        keyData = this.base64ToArrayBuffer(keyBase64);
      } else {
        keyData = this.base64ToArrayBuffer(keyString);
      }

      return await crypto.subtle.importKey(
        'raw',
        keyData,
        {
          name: this.ALGORITHM,
          length: this.KEY_LENGTH
        },
        false,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      throw new Error(`Key import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateMetadata(metadata: any): void {
    if (!metadata.classification && metadata.classification !== 0) {
      throw new Error('Invalid metadata: missing classification');
    }

    if (!metadata.timestamp) {
      throw new Error('Invalid metadata: missing timestamp');
    }

    if (!metadata.version) {
      throw new Error('Invalid metadata: missing version');
    }

    // Check if data is too old (older than 1 year)
    const maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
    if (Date.now() - metadata.timestamp > maxAge) {
      throw new Error('Encrypted data has expired');
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Secure memory cleanup
  public clearKeyCache(): void {
    this.keyCache.clear();
  }

  public removeKeyFromCache(keyId: string): void {
    this.keyCache.delete(keyId);
  }

  // Security audit methods
  public getEncryptionMetrics(): {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    tagLength: number;
    cachedKeys: number;
  } {
    return {
      algorithm: this.ALGORITHM,
      keyLength: this.KEY_LENGTH,
      ivLength: this.IV_LENGTH,
      tagLength: this.TAG_LENGTH,
      cachedKeys: this.keyCache.size
    };
  }
}
