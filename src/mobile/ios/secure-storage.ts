import { PlatformStorage, SecureStorageProvider, EncryptionProvider } from '../../shared/interfaces/encryption';
import { AESEncryptionProvider } from '../../shared/core/encryption-utils';

// Mock iOS Keychain interface
// In a real implementation, this would use React Native Keychain or Cordova plugins
interface IOSKeychain {
  setItem(key: string, value: string, options?: KeychainOptions): Promise<void>;
  getItem(key: string, options?: KeychainOptions): Promise<string | null>;
  removeItem(key: string, options?: KeychainOptions): Promise<void>;
  clear(options?: KeychainOptions): Promise<void>;
}

interface KeychainOptions {
  accessGroup?: string;
  accessible?: string;
  service?: string;
}

// Mock implementation - in real app this would be provided by native bridge
declare global {
  interface Window {
    IOSKeychain?: IOSKeychain;
  }
}

export class IOSSecureStorage implements PlatformStorage {
  private keychain: IOSKeychain;
  private options: KeychainOptions;

  constructor() {
    if (!window.IOSKeychain) {
      throw new Error('iOS Keychain not available');
    }
    this.keychain = window.IOSKeychain;
    this.options = {
      service: 'LocalPrivacyCohortTracker',
      accessible: 'kSecAttrAccessibleWhenUnlockedThisDeviceOnly'
    };
  }

  async store(key: string, value: string): Promise<void> {
    try {
      await this.keychain.setItem(key, value, this.options);
    } catch (error) {
      throw new Error(`Failed to store data in iOS Keychain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async retrieve(key: string): Promise<string | null> {
    try {
      return await this.keychain.getItem(key, this.options);
    } catch (error) {
      throw new Error(`Failed to retrieve data from iOS Keychain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.keychain.removeItem(key, this.options);
    } catch (error) {
      throw new Error(`Failed to remove data from iOS Keychain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.keychain.clear(this.options);
    } catch (error) {
      throw new Error(`Failed to clear iOS Keychain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export class IOSSecureStorageProvider implements SecureStorageProvider {
  public encryption: EncryptionProvider;
  public storage: PlatformStorage;

  constructor() {
    this.encryption = new AESEncryptionProvider();
    this.storage = new IOSSecureStorage();
  }

  async initialize(): Promise<void> {
    // iOS Keychain provides hardware-backed security, but we add
    // an additional encryption layer for cross-platform consistency
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
      throw new Error(`Failed to decrypt iOS data for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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