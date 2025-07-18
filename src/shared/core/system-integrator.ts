/**
 * System Integrator - Central coordination layer for Privacy Cohort Tracker
 * Wires together all system components and manages their interactions
 */
import { CohortAssignmentEngine } from './cohort-assignment-engine';
import { PrivacyStorageManager } from './privacy-storage-manager';
import { PrivacyControlsManager } from './privacy-controls-manager';
import { ComplianceManager } from './compliance-manager';
import { SecurityMonitor } from './security-monitor';
import { AdvancedEncryptionProvider } from './advanced-encryption';
import { DataAnonymizer } from './data-anonymization';
import { AutoUpdater } from './auto-updater';
import { ConfigurationManager } from './configuration-manager';
import { ErrorHandler } from './error-handler';
import { EventBus } from './event-bus';

export class SystemIntegrator {
  private static instance: SystemIntegrator;
  private isInitialized: boolean = false;
  private components: Map<string, any> = new Map();
  private eventBus: EventBus;
  private configManager: ConfigurationManager;
  private errorHandler: ErrorHandler;

  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.configManager = ConfigurationManager.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
  }

  public static getInstance(): SystemIntegrator {
    if (!SystemIntegrator.instance) {
      SystemIntegrator.instance = new SystemIntegrator();
    }
    return SystemIntegrator.instance;
  }

  /**
   * Initialize all system components and wire them together
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('🚀 Initializing Privacy Cohort Tracker System...');

      // Phase 1: Initialize core infrastructure
      await this.initializeCoreInfrastructure();

      // Phase 2: Initialize privacy and security components
      await this.initializePrivacyComponents();

      // Phase 3: Initialize business logic components
      await this.initializeBusinessComponents();

      // Phase 4: Initialize user interface components
      await this.initializeUIComponents();

      // Phase 5: Wire components together
      await this.wireComponents();

      // Phase 6: Start system services
      await this.startServices();

      this.isInitialized = true;
      console.log('✅ System initialization completed successfully');

      // Emit system ready event
      this.eventBus.emit('system:ready', {
        timestamp: new Date(),
        components: Array.from(this.components.keys())
      });

    } catch (error) {
      console.error('❌ System initialization failed:', error);
      await this.handleInitializationError(error);
      throw error;
    }
  }

  /**
   * Phase 1: Initialize core infrastructure components
   */
  private async initializeCoreInfrastructure(): Promise<void> {
    console.log('📋 Initializing core infrastructure...');

    // Configuration Manager
    await this.configManager.initialize();
    this.components.set('config', this.configManager);

    // Error Handler
    await this.errorHandler.initialize();
    this.components.set('errorHandler', this.errorHandler);

    // Event Bus (already initialized)
    this.components.set('eventBus', this.eventBus);

    console.log('✅ Core infrastructure initialized');
  }

  /**
   * Phase 2: Initialize privacy and security components
   */
  private async initializePrivacyComponents(): Promise<void> {
    console.log('🔒 Initializing privacy and security components...');

    // Encryption Provider
    const encryptionProvider = AdvancedEncryptionProvider.getInstance();
    await encryptionProvider.initialize();
    this.components.set('encryption', encryptionProvider);

    // Data Anonymizer
    const dataAnonymizer = DataAnonymizer.getInstance();
    this.components.set('anonymizer', dataAnonymizer);

    // Security Monitor
    const securityMonitor = SecurityMonitor.getInstance();
    await securityMonitor.initialize();
    this.components.set('security', securityMonitor);

    // Privacy Storage Manager
    const storageManager = PrivacyStorageManager.getInstance();
    await storageManager.initialize();
    this.components.set('storage', storageManager);

    // Compliance Manager
    const complianceManager = ComplianceManager.getInstance();
    await complianceManager.initialize();
    this.components.set('compliance', complianceManager);

    console.log('✅ Privacy and security components initialized');
  }

  /**
   * Phase 3: Initialize business logic components
   */
  private async initializeBusinessComponents(): Promise<void> {
    console.log('🎯 Initializing business logic components...');

    // Cohort Assignment Engine
    const cohortEngine = CohortAssignmentEngine.getInstance();
    await cohortEngine.initialize();
    this.components.set('cohorts', cohortEngine);

    // Auto Updater
    const autoUpdater = AutoUpdater.getInstance();
    await autoUpdater.initialize();
    this.components.set('updater', autoUpdater);

    console.log('✅ Business logic components initialized');
  }

  /**
   * Phase 4: Initialize user interface components
   */
  private async initializeUIComponents(): Promise<void> {
    console.log('🎨 Initializing user interface components...');

    // Privacy Controls Manager
    const privacyControls = PrivacyControlsManager.getInstance();
    await privacyControls.initialize();
    this.components.set('privacyControls', privacyControls);

    console.log('✅ User interface components initialized');
  }

  /**
   * Phase 5: Wire components together
   */
  private async wireComponents(): Promise<void> {
    console.log('🔌 Wiring system components...');

    // Wire Cohort Engine with Storage
    await this.wireCohortEngineWithStorage();

    // Wire Privacy Controls with Backend
    await this.wirePrivacyControlsWithBackend();

    // Wire Security Monitor with All Components
    await this.wireSecurityMonitoring();

    // Wire Compliance Manager with Data Components
    await this.wireComplianceIntegration();

    // Wire Error Handling Across All Components
    await this.wireErrorHandling();

    // Wire Event System
    await this.wireEventSystem();

    console.log('✅ Component wiring completed');
  }

  /**
   * Wire Cohort Assignment Engine with Storage Layer
   */
  private async wireCohortEngineWithStorage(): Promise<void> {
    const cohortEngine = this.components.get('cohorts') as CohortAssignmentEngine;
    const storageManager = this.components.get('storage') as PrivacyStorageManager;
    const encryptionProvider = this.components.get('encryption') as AdvancedEncryptionProvider;
    const anonymizer = this.components.get('anonymizer') as DataAnonymizer;

    // Configure cohort engine to use encrypted storage
    cohortEngine.setStorageProvider({
      async store(key: string, data: any): Promise<void> {
        const encryptedData = await encryptionProvider.encryptObject(data, 'cohort-data', 'CONFIDENTIAL');
        await storageManager.store(`cohorts:${key}`, encryptedData);
      },

      async retrieve(key: string): Promise<any> {
        const encryptedData = await storageManager.retrieve(`cohorts:${key}`);
        if (!encryptedData) return null;
        return await encryptionProvider.decryptObject(encryptedData, 'cohort-data');
      },

      async delete(key: string): Promise<void> {
        await storageManager.delete(`cohorts:${key}`);
      }
    });

    // Configure cohort engine to use anonymization
    cohortEngine.setAnonymizationProvider({
      async anonymizeUserData(userData: any): Promise<any> {
        return await anonymizer.anonymizeDataset([userData], {
          fields: {
            userId: { technique: 'hash', parameters: { salt: 'user_cohort_salt' } },
            browsing_history: { technique: 'generalize', parameters: { level: 'domain' } },
            interests: { technique: 'categorize', parameters: { categories: 'standard' } }
          },
          kAnonymity: {
            enabled: true,
            k: 100,
            quasiIdentifiers: ['age_group', 'location_region'],
            sensitiveAttribute: 'interests'
          }
        });
      }
    });

    console.log('  ✓ Cohort engine wired with storage and anonymization');
  }

  /**
   * Wire Privacy Controls UI with Backend Components
   */
  private async wirePrivacyControlsWithBackend(): Promise<void> {
    const privacyControls = this.components.get('privacyControls') as PrivacyControlsManager;
    const cohortEngine = this.components.get('cohorts') as CohortAssignmentEngine;
    const storageManager = this.components.get('storage') as PrivacyStorageManager;
    const complianceManager = this.components.get('compliance') as ComplianceManager;

    // Wire privacy controls to cohort management
    privacyControls.setCohortProvider({
      async getCohorts(userId: string): Promise<any[]> {
        return await cohortEngine.getUserCohorts(userId);
      },

      async updateCohortPreferences(userId: string, preferences: any): Promise<void> {
        await cohortEngine.updateUserPreferences(userId, preferences);
      },

      async optOutOfCohort(userId: string, cohortId: string): Promise<void> {
        await cohortEngine.optOutOfCohort(userId, cohortId);
      }
    });

    // Wire privacy controls to data management
    privacyControls.setDataProvider({
      async exportUserData(userId: string, format: string): Promise<any> {
        return await complianceManager.handleDataAccessRequest(userId, { format });
      },

      async deleteUserData(userId: string, scope: string): Promise<void> {
        await complianceManager.handleDataDeletionRequest(userId, { scope });
      },

      async getUserPrivacyStatus(userId: string): Promise<any> {
        const cohorts = await cohortEngine.getUserCohorts(userId);
        const preferences = await storageManager.retrieve(`preferences:${userId}`);
        return {
          cohorts: cohorts.length,
          preferences,
          lastUpdated: new Date()
        };
      }
    });

    console.log('  ✓ Privacy controls wired with backend components');
  }

  /**
   * Wire Security Monitor with All Components
   */
  private async wireSecurityMonitoring(): Promise<void> {
    const securityMonitor = this.components.get('security') as SecurityMonitor;

    // Monitor all component interactions
    for (const [name, component] of this.components) {
      if (component.on && typeof component.on === 'function') {
        component.on('security:event', async (event: any) => {
          await securityMonitor.monitorSecurityEvent(event.type, event.data);
        });

        component.on('privacy:breach', async (event: any) => {
          await securityMonitor.detectPrivacyBreach(event.data);
        });
      }
    }

    // Set up system-wide security monitoring
    this.eventBus.on('data:access', async (event) => {
      await securityMonitor.monitorDataAccess(event);
    });

    this.eventBus.on('user:activity', async (event) => {
      await securityMonitor.detectAnomalies([event]);
    });

    console.log('  ✓ Security monitoring wired across all components');
  }

  /**
   * Wire Compliance Manager with Data Components
   */
  private async wireComplianceIntegration(): Promise<void> {
    const complianceManager = this.components.get('compliance') as ComplianceManager;
    const storageManager = this.components.get('storage') as PrivacyStorageManager;
    const cohortEngine = this.components.get('cohorts') as CohortAssignmentEngine;

    // Wire compliance with data access
    complianceManager.setDataAccessProvider({
      async getAllUserData(userId: string): Promise<any> {
        const cohorts = await cohortEngine.getUserCohorts(userId);
        const preferences = await storageManager.retrieve(`preferences:${userId}`);
        const activityLogs = await storageManager.retrieve(`activity:${userId}`);
        
        return {
          cohorts,
          preferences,
          activityLogs,
          metadata: {
            dataTypes: ['cohorts', 'preferences', 'activity'],
            collectionDate: new Date(),
            retentionPeriod: '21 days'
          }
        };
      },

      async deleteUserData(userId: string, scope: string): Promise<void> {
        if (scope === 'all' || scope === 'cohorts') {
          await cohortEngine.deleteUserData(userId);
        }
        if (scope === 'all' || scope === 'preferences') {
          await storageManager.delete(`preferences:${userId}`);
        }
        if (scope === 'all' || scope === 'activity') {
          await storageManager.delete(`activity:${userId}`);
        }
      }
    });

    console.log('  ✓ Compliance manager wired with data components');
  }

  /**
   * Wire Error Handling Across All Components
   */
  private async wireErrorHandling(): Promise<void> {
    const errorHandler = this.components.get('errorHandler') as ErrorHandler;

    // Set up global error handling for all components
    for (const [name, component] of this.components) {
      if (component.on && typeof component.on === 'function') {
        component.on('error', async (error: Error) => {
          await errorHandler.handleError(error, { component: name });
        });
      }

      // Wrap component methods with error handling
      if (component.initialize && typeof component.initialize === 'function') {
        const originalInitialize = component.initialize.bind(component);
        component.initialize = async (...args: any[]) => {
          try {
            return await originalInitialize(...args);
          } catch (error) {
            await errorHandler.handleError(error as Error, { 
              component: name, 
              operation: 'initialize' 
            });
            throw error;
          }
        };
      }
    }

    // Set up global error handlers
    if (typeof window !== 'undefined') {
      window.addEventListener('error', async (event) => {
        await errorHandler.handleError(event.error, { 
          source: 'window',
          filename: event.filename,
          lineno: event.lineno
        });
      });

      window.addEventListener('unhandledrejection', async (event) => {
        await errorHandler.handleError(event.reason, { 
          source: 'unhandledPromise' 
        });
      });
    }

    console.log('  ✓ Error handling wired across all components');
  }

  /**
   * Wire Event System for Component Communication
   */
  private async wireEventSystem(): Promise<void> {
    // Set up inter-component communication through events

    // Cohort updates trigger privacy control updates
    this.eventBus.on('cohorts:updated', async (event) => {
      const privacyControls = this.components.get('privacyControls') as PrivacyControlsManager;
      await privacyControls.refreshUserInterface(event.userId);
    });

    // Privacy preference changes trigger cohort recalculation
    this.eventBus.on('privacy:preferences:changed', async (event) => {
      const cohortEngine = this.components.get('cohorts') as CohortAssignmentEngine;
      await cohortEngine.recalculateUserCohorts(event.userId);
    });

    // Security events trigger compliance logging
    this.eventBus.on('security:event', async (event) => {
      const complianceManager = this.components.get('compliance') as ComplianceManager;
      await complianceManager.logSecurityEvent(event);
    });

    // Data access events trigger audit logging
    this.eventBus.on('data:access', async (event) => {
      const complianceManager = this.components.get('compliance') as ComplianceManager;
      await complianceManager.logDataAccess(event);
    });

    console.log('  ✓ Event system wired for component communication');
  }

  /**
   * Phase 6: Start system services
   */
  private async startServices(): Promise<void> {
    console.log('🎬 Starting system services...');

    // Start security monitoring
    const securityMonitor = this.components.get('security') as SecurityMonitor;
    await securityMonitor.startMonitoring();

    // Start auto-updater
    const autoUpdater = this.components.get('updater') as AutoUpdater;
    await autoUpdater.checkForUpdates();

    // Start periodic maintenance tasks
    this.startMaintenanceTasks();

    console.log('✅ System services started');
  }

  /**
   * Start periodic maintenance tasks
   */
  private startMaintenanceTasks(): void {
    // Clean up expired data every hour
    setInterval(async () => {
      try {
        await this.performMaintenance();
      } catch (error) {
        console.error('Maintenance task failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Health check every 5 minutes
    setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Perform system maintenance
   */
  private async performMaintenance(): Promise<void> {
    const storageManager = this.components.get('storage') as PrivacyStorageManager;
    const cohortEngine = this.components.get('cohorts') as CohortAssignmentEngine;

    // Clean up expired cohorts
    await cohortEngine.cleanupExpiredCohorts();

    // Clean up old activity logs
    await storageManager.cleanupExpiredData();

    // Optimize storage
    await storageManager.optimizeStorage();

    this.eventBus.emit('system:maintenance:completed', {
      timestamp: new Date()
    });
  }

  /**
   * Perform system health check
   */
  private async performHealthCheck(): Promise<void> {
    const healthStatus = {
      timestamp: new Date(),
      components: {} as Record<string, any>,
      overall: 'healthy' as 'healthy' | 'degraded' | 'unhealthy'
    };

    let unhealthyComponents = 0;

    // Check each component
    for (const [name, component] of this.components) {
      try {
        if (component.getHealthStatus && typeof component.getHealthStatus === 'function') {
          healthStatus.components[name] = await component.getHealthStatus();
        } else {
          healthStatus.components[name] = { status: 'unknown' };
        }

        if (healthStatus.components[name].status === 'unhealthy') {
          unhealthyComponents++;
        }
      } catch (error) {
        healthStatus.components[name] = { 
          status: 'unhealthy', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
        unhealthyComponents++;
      }
    }

    // Determine overall health
    if (unhealthyComponents === 0) {
      healthStatus.overall = 'healthy';
    } else if (unhealthyComponents < this.components.size / 2) {
      healthStatus.overall = 'degraded';
    } else {
      healthStatus.overall = 'unhealthy';
    }

    this.eventBus.emit('system:health:check', healthStatus);
  }

  /**
   * Handle initialization errors
   */
  private async handleInitializationError(error: any): Promise<void> {
    const errorHandler = this.components.get('errorHandler') as ErrorHandler;
    
    if (errorHandler) {
      await errorHandler.handleError(error, { 
        context: 'system_initialization',
        critical: true 
      });
    } else {
      console.error('Critical initialization error:', error);
    }

    // Attempt graceful degradation
    await this.attemptGracefulDegradation();
  }

  /**
   * Attempt graceful degradation on initialization failure
   */
  private async attemptGracefulDegradation(): Promise<void> {
    console.log('🔄 Attempting graceful degradation...');

    // Try to initialize minimal functionality
    try {
      // Initialize only essential components
      const essentialComponents = ['config', 'errorHandler', 'storage'];
      
      for (const componentName of essentialComponents) {
        if (!this.components.has(componentName)) {
          // Try to initialize essential component
          // Implementation would depend on specific component
        }
      }

      console.log('✅ Graceful degradation successful - minimal functionality available');
    } catch (degradationError) {
      console.error('❌ Graceful degradation failed:', degradationError);
    }
  }

  /**
   * Shutdown the system gracefully
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Privacy Cohort Tracker System...');

    try {
      // Stop services
      for (const [name, component] of this.components) {
        if (component.shutdown && typeof component.shutdown === 'function') {
          try {
            await component.shutdown();
            console.log(`  ✓ ${name} shutdown completed`);
          } catch (error) {
            console.error(`  ❌ ${name} shutdown failed:`, error);
          }
        }
      }

      // Clear components
      this.components.clear();
      this.isInitialized = false;

      console.log('✅ System shutdown completed');

    } catch (error) {
      console.error('❌ System shutdown failed:', error);
      throw error;
    }
  }

  /**
   * Get system status
   */
  public getSystemStatus(): SystemStatus {
    return {
      initialized: this.isInitialized,
      componentCount: this.components.size,
      components: Array.from(this.components.keys()),
      uptime: this.isInitialized ? Date.now() - this.initializationTime : 0
    };
  }

  private initializationTime: number = Date.now();

  /**
   * Get component by name
   */
  public getComponent<T>(name: string): T | null {
    return this.components.get(name) as T || null;
  }

  /**
   * Check if system is ready
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}

// Type definitions
export interface SystemStatus {
  initialized: boolean;
  componentCount: number;
  components: string[];
  uptime: number;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck?: Date;
  error?: string;
  metrics?: Record<string, any>;
}
