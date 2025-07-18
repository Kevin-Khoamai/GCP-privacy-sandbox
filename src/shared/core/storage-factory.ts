import { SecureStorageProvider } from '../interfaces/encryption';

// Platform detection
export type Platform = 'browser' | 'android' | 'ios';

export function detectPlatform(): Platform {
  // Check if we're in a browser extension environment
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return 'browser';
  }
  
  // Check for mobile platforms
  if (typeof window !== 'undefined') {
    if (window.AndroidEncryptedStorage) {
      return 'android';
    }
    if (window.IOSKeychain) {
      return 'ios';
    }
  }
  
  // Default to browser for web environments
  return 'browser';
}

export async function createSecureStorageProvider(platform?: Platform): Promise<SecureStorageProvider> {
  const targetPlatform = platform || detectPlatform();
  
  switch (targetPlatform) {
    case 'browser': {
      const { BrowserSecureStorageProvider } = await import('../../browser-extension/storage');
      const provider = new BrowserSecureStorageProvider();
      await provider.initialize();
      return provider;
    }
    
    case 'android': {
      const { AndroidSecureStorageProvider } = await import('../../mobile/android/secure-storage');
      const provider = new AndroidSecureStorageProvider();
      await provider.initialize();
      return provider;
    }
    
    case 'ios': {
      const { IOSSecureStorageProvider } = await import('../../mobile/ios/secure-storage');
      const provider = new IOSSecureStorageProvider();
      await provider.initialize();
      return provider;
    }
    
    default:
      throw new Error(`Unsupported platform: ${targetPlatform}`);
  }
}

// Singleton instance for global access
let globalStorageProvider: SecureStorageProvider | null = null;

export async function getSecureStorageProvider(): Promise<SecureStorageProvider> {
  if (!globalStorageProvider) {
    globalStorageProvider = await createSecureStorageProvider();
  }
  return globalStorageProvider;
}

export function resetStorageProvider(): void {
  globalStorageProvider = null;
}