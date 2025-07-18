// Encryption interfaces for cross-platform secure storage

export interface EncryptionProvider {
  encrypt(data: string): Promise<string>;
  decrypt(encryptedData: string): Promise<string>;
  generateKey(): Promise<string>;
  deriveKey(password: string, salt: string): Promise<string>;
}

export interface PlatformStorage {
  store(key: string, value: string): Promise<void>;
  retrieve(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface SecureStorageProvider {
  encryption: EncryptionProvider;
  storage: PlatformStorage;
  initialize(): Promise<void>;
}

export interface EncryptionConfig {
  algorithm: 'AES-256-GCM';
  keyLength: 256;
  ivLength: 12;
  tagLength: 16;
}

export interface EncryptedData {
  data: string;
  iv: string;
  tag: string;
  timestamp: number;
}