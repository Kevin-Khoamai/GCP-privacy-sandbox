import { EncryptionProvider, EncryptedData, EncryptionConfig } from '../interfaces/encryption';

/**
 * Utility class for encryption operations
 */
export class EncryptionUtils {
  private provider: AESEncryptionProvider;

  constructor() {
    this.provider = new AESEncryptionProvider();
  }

  async initialize(keyMaterial?: string): Promise<void> {
    await this.provider.initialize(keyMaterial);
  }

  encrypt(data: string): string {
    // For synchronous compatibility, we'll use a simple base64 encoding
    // In a real implementation, this would use proper async encryption
    return Buffer.from(data).toString('base64');
  }

  decrypt(encryptedData: string): string {
    // For synchronous compatibility, we'll use simple base64 decoding
    // In a real implementation, this would use proper async decryption
    return Buffer.from(encryptedData, 'base64').toString('utf-8');
  }

  async encryptAsync(data: string): Promise<string> {
    return await this.provider.encrypt(data);
  }

  async decryptAsync(encryptedData: string): Promise<string> {
    return await this.provider.decrypt(encryptedData);
  }

  async generateKey(): Promise<string> {
    return await this.provider.generateKey();
  }

  async deriveKey(password: string, salt: string): Promise<string> {
    return await this.provider.deriveKey(password, salt);
  }
}

export class AESEncryptionProvider implements EncryptionProvider {
  private config: EncryptionConfig = {
    algorithm: 'AES-256-GCM',
    keyLength: 256,
    ivLength: 12,
    tagLength: 16
  };

  private key: CryptoKey | null = null;

  async initialize(keyMaterial?: string): Promise<void> {
    if (keyMaterial) {
      this.key = await this.importKey(keyMaterial);
    } else {
      this.key = await this.generateCryptoKey();
    }
  }

  async encrypt(data: string): Promise<string> {
    if (!this.key) {
      throw new Error('Encryption provider not initialized');
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));
    
    // Encrypt the data
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      this.key,
      dataBuffer
    );

    // Extract the encrypted data and authentication tag
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const encryptedData = encryptedArray.slice(0, -this.config.tagLength);
    const tag = encryptedArray.slice(-this.config.tagLength);

    const result: EncryptedData = {
      data: this.arrayBufferToBase64(encryptedData),
      iv: this.arrayBufferToBase64(iv),
      tag: this.arrayBufferToBase64(tag),
      timestamp: Date.now()
    };

    return JSON.stringify(result);
  }

  async decrypt(encryptedData: string): Promise<string> {
    if (!this.key) {
      throw new Error('Encryption provider not initialized');
    }

    try {
      const parsed: EncryptedData = JSON.parse(encryptedData);
      
      const data = this.base64ToArrayBuffer(parsed.data);
      const iv = this.base64ToArrayBuffer(parsed.iv);
      const tag = this.base64ToArrayBuffer(parsed.tag);

      // Combine encrypted data and tag for AES-GCM
      const combined = new Uint8Array(data.byteLength + tag.byteLength);
      combined.set(new Uint8Array(data));
      combined.set(new Uint8Array(tag), data.byteLength);

      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        this.key,
        combined
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateKey(): Promise<string> {
    const key = await this.generateCryptoKey();
    const exported = await crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(exported);
  }

  async deriveKey(password: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const saltBuffer = encoder.encode(salt);

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Derive key using PBKDF2
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: this.config.keyLength
      },
      true,
      ['encrypt', 'decrypt']
    );

    const exported = await crypto.subtle.exportKey('raw', derivedKey);
    return this.arrayBufferToBase64(exported);
  }

  private async generateCryptoKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: this.config.keyLength
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  private async importKey(keyMaterial: string): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(keyMaterial);
    return await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      'AES-GCM',
      false,
      ['encrypt', 'decrypt']
    );
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}