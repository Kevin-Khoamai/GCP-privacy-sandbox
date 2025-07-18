/**
 * Configuration Manager - System-wide configuration management
 * Handles environment-specific settings, feature flags, and runtime configuration
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: SystemConfiguration;
  private environment: Environment;
  private featureFlags: Map<string, boolean> = new Map();
  private configWatchers: Map<string, ConfigWatcher[]> = new Map();

  private constructor() {
    this.environment = this.detectEnvironment();
    this.config = this.loadDefaultConfiguration();
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  public async initialize(): Promise<void> {
    try {
      // Load environment-specific configuration
      await this.loadEnvironmentConfiguration();
      
      // Load feature flags
      await this.loadFeatureFlags();
      
      // Load user preferences (if available)
      await this.loadUserPreferences();
      
      // Validate configuration
      this.validateConfiguration();
      
      console.log(`Configuration Manager initialized for ${this.environment} environment`);
    } catch (error) {
      console.error('Configuration Manager initialization failed:', error);
      throw error;
    }
  }

  private detectEnvironment(): Environment {
    // Browser extension environment detection
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime.getManifest().name.includes('dev') ? 'development' : 'production';
    }
    
    // Node.js environment detection
    if (typeof process !== 'undefined' && process.env) {
      return (process.env.NODE_ENV as Environment) || 'development';
    }
    
    // Web application environment detection
    if (typeof window !== 'undefined') {
      return window.location.hostname === 'localhost' ? 'development' : 'production';
    }
    
    return 'development';
  }

  private loadDefaultConfiguration(): SystemConfiguration {
    return {
      privacy: {
        localProcessingOnly: true,
        dataRetentionDays: 21,
        cohortRefreshIntervalHours: 168, // 1 week
        kAnonymityThreshold: 100,
        differentialPrivacyEpsilon: 0.1,
        encryptionAlgorithm: 'AES-256-GCM',
        secureStorageEnabled: true
      },
      cohorts: {
        maxCohortsPerUser: 10,
        cohortExpirationDays: 21,
        minCohortSize: 1000,
        interestCategories: [
          'technology', 'health', 'finance', 'entertainment', 
          'sports', 'travel', 'education', 'shopping'
        ],
        assignmentAlgorithm: 'k-means-privacy-preserving',
        refreshStrategy: 'incremental'
      },
      security: {
        threatDetectionEnabled: true,
        anomalyDetectionEnabled: true,
        intrusionDetectionEnabled: true,
        securityAuditingEnabled: true,
        maxFailedAttempts: 5,
        lockoutDurationMinutes: 15,
        sessionTimeoutMinutes: 60
      },
      compliance: {
        gdprEnabled: true,
        ccpaEnabled: true,
        auditLoggingEnabled: true,
        consentManagementEnabled: true,
        dataSubjectRightsEnabled: true,
        privacyByDesignEnabled: true,
        retentionPolicyEnforcement: true
      },
      performance: {
        maxMemoryUsageMB: 100,
        maxStorageUsageMB: 50,
        backgroundProcessingEnabled: true,
        batchProcessingSize: 100,
        cacheExpirationMinutes: 60,
        compressionEnabled: true
      },
      ui: {
        theme: 'auto', // 'light', 'dark', 'auto'
        language: 'en',
        notificationsEnabled: true,
        privacyDashboardEnabled: true,
        advancedControlsEnabled: false,
        tooltipsEnabled: true,
        animationsEnabled: true
      },
      api: {
        baseUrl: this.getApiBaseUrl(),
        timeout: 30000,
        retryAttempts: 3,
        rateLimitEnabled: true,
        compressionEnabled: true,
        cachingEnabled: true
      },
      logging: {
        level: this.environment === 'development' ? 'debug' : 'info',
        enableConsoleLogging: this.environment === 'development',
        enableFileLogging: false,
        enableRemoteLogging: false,
        maxLogSizeMB: 10,
        logRetentionDays: 7
      }
    };
  }

  private getApiBaseUrl(): string {
    switch (this.environment) {
      case 'development':
        return 'https://api-dev.privacy-cohort-tracker.com/v1';
      case 'staging':
        return 'https://api-staging.privacy-cohort-tracker.com/v1';
      case 'production':
        return 'https://api.privacy-cohort-tracker.com/v1';
      default:
        return 'https://api-dev.privacy-cohort-tracker.com/v1';
    }
  }

  private async loadEnvironmentConfiguration(): Promise<void> {
    try {
      // Load from environment variables
      if (typeof process !== 'undefined' && process.env) {
        this.applyEnvironmentVariables();
      }
      
      // Load from browser storage (for extensions)
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await this.loadFromBrowserStorage();
      }
      
      // Load from localStorage (for web apps)
      if (typeof localStorage !== 'undefined') {
        this.loadFromLocalStorage();
      }
    } catch (error) {
      console.warn('Failed to load environment configuration:', error);
    }
  }

  private applyEnvironmentVariables(): void {
    const env = process.env;
    
    // API Configuration
    if (env.API_BASE_URL) {
      this.config.api.baseUrl = env.API_BASE_URL;
    }
    
    // Privacy Configuration
    if (env.DATA_RETENTION_DAYS) {
      this.config.privacy.dataRetentionDays = parseInt(env.DATA_RETENTION_DAYS, 10);
    }
    
    if (env.K_ANONYMITY_THRESHOLD) {
      this.config.privacy.kAnonymityThreshold = parseInt(env.K_ANONYMITY_THRESHOLD, 10);
    }
    
    // Security Configuration
    if (env.SECURITY_AUDIT_ENABLED) {
      this.config.security.securityAuditingEnabled = env.SECURITY_AUDIT_ENABLED === 'true';
    }
    
    // Logging Configuration
    if (env.LOG_LEVEL) {
      this.config.logging.level = env.LOG_LEVEL as LogLevel;
    }
  }

  private async loadFromBrowserStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['systemConfig']);
      if (result.systemConfig) {
        this.mergeConfiguration(result.systemConfig);
      }
    } catch (error) {
      console.warn('Failed to load configuration from browser storage:', error);
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('privacy-cohort-tracker-config');
      if (stored) {
        const config = JSON.parse(stored);
        this.mergeConfiguration(config);
      }
    } catch (error) {
      console.warn('Failed to load configuration from localStorage:', error);
    }
  }

  private async loadFeatureFlags(): Promise<void> {
    // Default feature flags
    const defaultFlags = new Map([
      ['advanced-privacy-controls', false],
      ['experimental-cohort-algorithms', false],
      ['beta-ui-features', false],
      ['enhanced-security-monitoring', true],
      ['cross-device-sync', true],
      ['privacy-analytics', true],
      ['developer-tools', this.environment === 'development']
    ]);

    // Load from remote feature flag service (if available)
    try {
      const remoteFlags = await this.fetchRemoteFeatureFlags();
      for (const [flag, enabled] of Object.entries(remoteFlags)) {
        this.featureFlags.set(flag, enabled);
      }
    } catch (error) {
      console.warn('Failed to load remote feature flags, using defaults:', error);
    }

    // Apply default flags for any missing flags
    for (const [flag, enabled] of defaultFlags) {
      if (!this.featureFlags.has(flag)) {
        this.featureFlags.set(flag, enabled);
      }
    }
  }

  private async fetchRemoteFeatureFlags(): Promise<Record<string, boolean>> {
    // In a real implementation, this would fetch from a feature flag service
    // For now, return empty object
    return {};
  }

  private async loadUserPreferences(): Promise<void> {
    try {
      // Load user-specific preferences
      const preferences = await this.getUserPreferences();
      if (preferences) {
        // Apply user preferences to configuration
        if (preferences.theme) {
          this.config.ui.theme = preferences.theme;
        }
        if (preferences.language) {
          this.config.ui.language = preferences.language;
        }
        if (preferences.notificationsEnabled !== undefined) {
          this.config.ui.notificationsEnabled = preferences.notificationsEnabled;
        }
      }
    } catch (error) {
      console.warn('Failed to load user preferences:', error);
    }
  }

  private async getUserPreferences(): Promise<any> {
    // Implementation would load from user storage
    return null;
  }

  private validateConfiguration(): void {
    // Validate privacy settings
    if (this.config.privacy.dataRetentionDays < 1 || this.config.privacy.dataRetentionDays > 365) {
      throw new Error('Invalid data retention period');
    }

    if (this.config.privacy.kAnonymityThreshold < 10) {
      throw new Error('K-anonymity threshold too low');
    }

    // Validate cohort settings
    if (this.config.cohorts.maxCohortsPerUser < 1 || this.config.cohorts.maxCohortsPerUser > 50) {
      throw new Error('Invalid max cohorts per user');
    }

    // Validate performance settings
    if (this.config.performance.maxMemoryUsageMB < 10 || this.config.performance.maxMemoryUsageMB > 1000) {
      throw new Error('Invalid memory usage limit');
    }
  }

  private mergeConfiguration(newConfig: Partial<SystemConfiguration>): void {
    this.config = this.deepMerge(this.config, newConfig);
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  // Public API methods
  public get<T>(path: string): T {
    return this.getNestedValue(this.config, path);
  }

  public set(path: string, value: any): void {
    this.setNestedValue(this.config, path, value);
    this.notifyWatchers(path, value);
  }

  public isFeatureEnabled(flag: string): boolean {
    return this.featureFlags.get(flag) || false;
  }

  public enableFeature(flag: string): void {
    this.featureFlags.set(flag, true);
    this.notifyWatchers(`features.${flag}`, true);
  }

  public disableFeature(flag: string): void {
    this.featureFlags.set(flag, false);
    this.notifyWatchers(`features.${flag}`, false);
  }

  public getEnvironment(): Environment {
    return this.environment;
  }

  public getFullConfiguration(): SystemConfiguration {
    return { ...this.config };
  }

  public watch(path: string, callback: ConfigWatcher): void {
    if (!this.configWatchers.has(path)) {
      this.configWatchers.set(path, []);
    }
    this.configWatchers.get(path)!.push(callback);
  }

  public unwatch(path: string, callback: ConfigWatcher): void {
    const watchers = this.configWatchers.get(path);
    if (watchers) {
      const index = watchers.indexOf(callback);
      if (index > -1) {
        watchers.splice(index, 1);
      }
    }
  }

  private notifyWatchers(path: string, value: any): void {
    const watchers = this.configWatchers.get(path);
    if (watchers) {
      watchers.forEach(watcher => {
        try {
          watcher(value, path);
        } catch (error) {
          console.error('Configuration watcher error:', error);
        }
      });
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  public async saveConfiguration(): Promise<void> {
    try {
      // Save to browser storage
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ systemConfig: this.config });
      }
      
      // Save to localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('privacy-cohort-tracker-config', JSON.stringify(this.config));
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  }

  public resetToDefaults(): void {
    this.config = this.loadDefaultConfiguration();
    this.featureFlags.clear();
    this.loadFeatureFlags();
  }

  public getHealthStatus(): ComponentHealth {
    return {
      status: 'healthy',
      lastCheck: new Date(),
      metrics: {
        environment: this.environment,
        configKeys: Object.keys(this.config).length,
        featureFlags: this.featureFlags.size,
        watchers: this.configWatchers.size
      }
    };
  }
}

// Type definitions
export type Environment = 'development' | 'staging' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ConfigWatcher = (value: any, path: string) => void;

export interface SystemConfiguration {
  privacy: PrivacyConfiguration;
  cohorts: CohortConfiguration;
  security: SecurityConfiguration;
  compliance: ComplianceConfiguration;
  performance: PerformanceConfiguration;
  ui: UIConfiguration;
  api: APIConfiguration;
  logging: LoggingConfiguration;
}

export interface PrivacyConfiguration {
  localProcessingOnly: boolean;
  dataRetentionDays: number;
  cohortRefreshIntervalHours: number;
  kAnonymityThreshold: number;
  differentialPrivacyEpsilon: number;
  encryptionAlgorithm: string;
  secureStorageEnabled: boolean;
}

export interface CohortConfiguration {
  maxCohortsPerUser: number;
  cohortExpirationDays: number;
  minCohortSize: number;
  interestCategories: string[];
  assignmentAlgorithm: string;
  refreshStrategy: string;
}

export interface SecurityConfiguration {
  threatDetectionEnabled: boolean;
  anomalyDetectionEnabled: boolean;
  intrusionDetectionEnabled: boolean;
  securityAuditingEnabled: boolean;
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
  sessionTimeoutMinutes: number;
}

export interface ComplianceConfiguration {
  gdprEnabled: boolean;
  ccpaEnabled: boolean;
  auditLoggingEnabled: boolean;
  consentManagementEnabled: boolean;
  dataSubjectRightsEnabled: boolean;
  privacyByDesignEnabled: boolean;
  retentionPolicyEnforcement: boolean;
}

export interface PerformanceConfiguration {
  maxMemoryUsageMB: number;
  maxStorageUsageMB: number;
  backgroundProcessingEnabled: boolean;
  batchProcessingSize: number;
  cacheExpirationMinutes: number;
  compressionEnabled: boolean;
}

export interface UIConfiguration {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notificationsEnabled: boolean;
  privacyDashboardEnabled: boolean;
  advancedControlsEnabled: boolean;
  tooltipsEnabled: boolean;
  animationsEnabled: boolean;
}

export interface APIConfiguration {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  rateLimitEnabled: boolean;
  compressionEnabled: boolean;
  cachingEnabled: boolean;
}

export interface LoggingConfiguration {
  level: LogLevel;
  enableConsoleLogging: boolean;
  enableFileLogging: boolean;
  enableRemoteLogging: boolean;
  maxLogSizeMB: number;
  logRetentionDays: number;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  metrics?: Record<string, any>;
}
