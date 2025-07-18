/**
 * Cross-browser compatibility layer for browser extensions
 * Handles differences between Chrome, Firefox, and Safari APIs
 */

export interface BrowserAPI {
  runtime: {
    sendMessage: (message: any, callback?: (response: any) => void) => Promise<any> | void;
    onMessage: {
      addListener: (callback: (message: any, sender: any, sendResponse: (response: any) => void) => void) => void;
    };
    lastError?: { message: string };
  };
  storage: {
    local: {
      get: (keys?: string | string[] | null) => Promise<any>;
      set: (items: any) => Promise<void>;
      remove: (keys: string | string[]) => Promise<void>;
      clear: () => Promise<void>;
    };
  };
  tabs: {
    onUpdated: {
      addListener: (callback: (tabId: number, changeInfo: any, tab: any) => void) => void;
    };
    query: (queryInfo: any) => Promise<any[]>;
  };
  webNavigation?: {
    onCompleted: {
      addListener: (callback: (details: any) => void) => void;
    };
  };
  permissions?: {
    request: (permissions: any) => Promise<boolean>;
    contains: (permissions: any) => Promise<boolean>;
    remove: (permissions: any) => Promise<boolean>;
  };
}

/**
 * Get the appropriate browser API based on the current environment
 */
export function getBrowserAPI(): BrowserAPI | null {
  // Chrome/Edge (Manifest V3)
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return {
      runtime: {
        sendMessage: (message: any, callback?: (response: any) => void) => {
          if (callback) {
            chrome.runtime.sendMessage(message, callback);
          } else {
            return new Promise((resolve, reject) => {
              chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(response);
                }
              });
            });
          }
        },
        onMessage: chrome.runtime.onMessage,
        get lastError() { return chrome.runtime.lastError; }
      },
      storage: {
        local: {
          get: (keys) => new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(result);
              }
            });
          }),
          set: (items) => new Promise((resolve, reject) => {
            chrome.storage.local.set(items, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          }),
          remove: (keys) => new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          }),
          clear: () => new Promise((resolve, reject) => {
            chrome.storage.local.clear(() => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          })
        }
      },
      tabs: {
        onUpdated: chrome.tabs.onUpdated,
        query: (queryInfo) => new Promise((resolve, reject) => {
          chrome.tabs.query(queryInfo, (tabs) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(tabs);
            }
          });
        })
      },
      webNavigation: chrome.webNavigation,
      permissions: chrome.permissions ? {
        request: (permissions) => new Promise((resolve, reject) => {
          chrome.permissions.request(permissions, (granted) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(granted);
            }
          });
        }),
        contains: (permissions) => new Promise((resolve, reject) => {
          chrome.permissions.contains(permissions, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        }),
        remove: (permissions) => new Promise((resolve, reject) => {
          chrome.permissions.remove(permissions, (removed) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(removed);
            }
          });
        })
      } : undefined
    };
  }

  // Firefox (Manifest V2)
  if (typeof browser !== 'undefined' && browser.runtime) {
    return {
      runtime: {
        sendMessage: browser.runtime.sendMessage,
        onMessage: browser.runtime.onMessage,
        get lastError() { return browser.runtime.lastError; }
      },
      storage: {
        local: browser.storage.local
      },
      tabs: {
        onUpdated: browser.tabs.onUpdated,
        query: browser.tabs.query
      },
      webNavigation: browser.webNavigation,
      permissions: browser.permissions ? {
        request: browser.permissions.request,
        contains: browser.permissions.contains,
        remove: browser.permissions.remove
      } : undefined
    };
  }

  return null;
}

/**
 * Browser detection utilities
 */
export const BrowserDetection = {
  isChrome(): boolean {
    return typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function';
  },

  isFirefox(): boolean {
    return typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.getBrowserInfo === 'function';
  },

  isSafari(): boolean {
    return typeof safari !== 'undefined' && safari.extension;
  },

  isEdge(): boolean {
    return this.isChrome() && navigator.userAgent.includes('Edg');
  },

  getBrowserName(): string {
    if (this.isFirefox()) return 'firefox';
    if (this.isSafari()) return 'safari';
    if (this.isEdge()) return 'edge';
    if (this.isChrome()) return 'chrome';
    return 'unknown';
  },

  supportsManifestV3(): boolean {
    return this.isChrome() || this.isEdge();
  },

  supportsServiceWorker(): boolean {
    return this.supportsManifestV3();
  }
};

/**
 * Cross-browser storage wrapper with encryption support
 */
export class CrossBrowserStorage {
  private browserAPI: BrowserAPI;

  constructor() {
    const api = getBrowserAPI();
    if (!api) {
      throw new Error('Browser API not available');
    }
    this.browserAPI = api;
  }

  async get(key: string): Promise<any> {
    const result = await this.browserAPI.storage.local.get(key);
    return result[key];
  }

  async set(key: string, value: any): Promise<void> {
    await this.browserAPI.storage.local.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await this.browserAPI.storage.local.remove(key);
  }

  async clear(): Promise<void> {
    await this.browserAPI.storage.local.clear();
  }

  async getAll(): Promise<any> {
    return await this.browserAPI.storage.local.get(null);
  }
}

/**
 * Cross-browser message passing utilities
 */
export class CrossBrowserMessaging {
  private browserAPI: BrowserAPI;

  constructor() {
    const api = getBrowserAPI();
    if (!api) {
      throw new Error('Browser API not available');
    }
    this.browserAPI = api;
  }

  async sendMessage(message: any): Promise<any> {
    if (BrowserDetection.isFirefox()) {
      return await this.browserAPI.runtime.sendMessage(message);
    } else {
      return new Promise((resolve, reject) => {
        this.browserAPI.runtime.sendMessage(message, (response) => {
          if (this.browserAPI.runtime.lastError) {
            reject(new Error(this.browserAPI.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    }
  }

  addMessageListener(callback: (message: any, sender: any, sendResponse: (response: any) => void) => void): void {
    this.browserAPI.runtime.onMessage.addListener(callback);
  }
}
