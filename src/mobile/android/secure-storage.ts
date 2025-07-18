import { PlatformStorage, SecureStorageProvider, EncryptionProvider } from '../../shared/interfaces/encryption';
import { AESEncryptionProvider } from '../../shared/core/encryption-utils';

// Mock Android EncryptedSharedPreferences interface
// In a real implementation, this would use React Native or Cordova plugins
interface AndroidEncryptedSharedPreferences {
  putString(key: string, value: string): Promise<void>;
  getString(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Mock implementation - in real app this would be provided by native bridge
declare global {
  interface Window {
    AndroidEncryptedStorage?: AndroidEncryptedSharedPreferences;
  }
}

export class AndroidSecureStorage implements PlatformStorage {
  private storage: AndroidEncryptedSharedPreferences;

  constructor() {
    // In a real implementation, this would be injected by the native bridge
    if (!window.AndroidEncryptedStorage) {
      throw new Error('Android EncryptedSharedPreferences not available');
    }
    this.storage = window.AndroidEncryptedStorage;
  }

  async store(key: string, value: string): Promise<void> {
    try {
      await this.storage.putString(key, value);
    } catch (error) {
      throw new Error(`Failed to store data on Android: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async retrieve(key: string): Promise<string | null> {
    try {
      return await this.storage.getString(key);
    } catch (error) {
      throw new Error(`Failed to retrieve data on Android: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch (error) {
      throw new Error(`Failed to remove data on Android: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.storage.clear();
    } catch (error) {
      throw new Error(`Failed to clear Android storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export class AndroidSecureStorageProvider implements SecureStorageProvider {
  public encryption: EncryptionProvider;
  public storage: PlatformStorage;

  constructor() {
    this.encryption = new AESEncryptionProvider();
    this.storage = new AndroidSecureStorage();
  }

  async initialize(): Promise<void> {
    // Android EncryptedSharedPreferences handles encryption at the storage level,
    // but we add an additional layer for cross-platform consistency
    const existingKey = await this.storage.retrieve('app_encryption_key');
    
    if (existingKey) {
      await (this.encryption as AESEncryptionProvider).initialize(existingKey);
    } else {
      await (this.encryption as AESEncryptionProvider).initialize();
      const newKey = await this.encryption.generateKey();
      await this.storage.store('app_encryption_key', newKey);
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
      throw new Error(`Failed to decrypt Android data for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async removeEncrypted(key: string): Promise<void> {
    await this.storage.remove(key);
  }

  async clearAllEncrypted(): Promise<void> {
    const encryptionKey = await this.storage.retrieve('app_encryption_key');
    await this.storage.clear();
    
    if (encryptionKey) {
      await this.storage.store('app_encryption_key', encryptionKey);
    }
  }
}