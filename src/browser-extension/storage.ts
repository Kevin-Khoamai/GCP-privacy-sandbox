import { PlatformStorage, SecureStorageProvider, EncryptionProvider } from '../shared/interfaces/encryption';
import { AESEncryptionProvider } from '../shared/core/encryption-utils';
import { CrossBrowserStorage } from './browser-compatibility';

export class BrowserExtensionStorage implements PlatformStorage {
  private crossBrowserStorage: CrossBrowserStorage;

  constructor() {
    this.crossBrowserStorage = new CrossBrowserStorage();
  }

  async store(key: string, value: string): Promise<void> {
    try {
      await this.crossBrowserStorage.set(key, value);
    } catch (error) {
      throw new Error(`Failed to store data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async retrieve(key: string): Promise<string | null> {
    try {
      const result = await this.crossBrowserStorage.get(key);
      return result || null;
    } catch (error) {
      throw new Error(`Failed to retrieve data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.crossBrowserStorage.remove(key);
    } catch (error) {
      throw new Error(`Failed to remove data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.crossBrowserStorage.clear();
    } catch (error) {
      throw new Error(`Failed to clear storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export class BrowserSecureStorageProvider implements SecureStorageProvider {
  public encryption: EncryptionProvider;
  public storage: PlatformStorage;

  constructor() {
    this.encryption = new AESEncryptionProvider();
    this.storage = new BrowserExtensionStorage();
  }

  async initialize(): Promise<void> {
    // Try to retrieve existing key from storage
    const existingKey = await this.storage.retrieve('encryption_key');
    
    if (existingKey) {
      // Use existing key
      await (this.encryption as AESEncryptionProvider).initialize(existingKey);
    } else {
      // Generate new key and store it
      await (this.encryption as AESEncryptionProvider).initialize();
      const newKey = await this.encryption.generateKey();
      await this.storage.store('encryption_key', newKey);
    }
  }

  async storeEncrypted(key: string, data: any): Promise<void> {
    const serialized = JSON.stringify(data);
    const encrypted = await this.encryption.encrypt(serialized);
    await this.storage.store(key, encrypted);
  }

  async retrieveEncrypted<T>(key: string): Promise<T | null> {
    const encrypted = await this.storage.retrieve(key);
    if (!encrypted) {
      return null;
    }

    try {
      const decrypted = await this.encryption.decrypt(encrypted);
      return JSON.parse(decrypted) as T;
    } catch (error) {
      throw new Error(`Failed to decrypt data for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async removeEncrypted(key: string): Promise<void> {
    await this.storage.remove(key);
  }

  async clearAllEncrypted(): Promise<void> {
    // Get all keys first to preserve the encryption key
    const encryptionKey = await this.storage.retrieve('encryption_key');
    await this.storage.clear();
    
    // Restore encryption key
    if (encryptionKey) {
      await this.storage.store('encryption_key', encryptionKey);
    }
  }
}