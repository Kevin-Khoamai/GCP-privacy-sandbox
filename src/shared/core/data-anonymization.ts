/**
 * Data Anonymization and Pseudonymization Utilities
 * Implements privacy-preserving data transformation techniques
 */
export class DataAnonymizer {
  private static instance: DataAnonymizer;
  private pseudonymMap: Map<string, string> = new Map();
  private saltCache: Map<string, string> = new Map();

  // K-anonymity and L-diversity parameters
  private readonly DEFAULT_K_VALUE = 5;
  private readonly DEFAULT_L_VALUE = 3;

  private constructor() {}

  public static getInstance(): DataAnonymizer {
    if (!DataAnonymizer.instance) {
      DataAnonymizer.instance = new DataAnonymizer();
    }
    return DataAnonymizer.instance;
  }

  // Pseudonymization methods
  public async pseudonymizeUserId(userId: string, salt?: string): Promise<string> {
    try {
      // Use cached pseudonym if available
      if (this.pseudonymMap.has(userId)) {
        return this.pseudonymMap.get(userId)!;
      }

      // Generate or retrieve salt
      if (!salt) {
        salt = this.saltCache.get('user_id_salt') || await this.generateSalt();
        this.saltCache.set('user_id_salt', salt);
      }

      // Create pseudonym using HMAC-SHA256
      const pseudonym = await this.createPseudonym(userId, salt);
      this.pseudonymMap.set(userId, pseudonym);

      return pseudonym;
    } catch (error) {
      throw new Error(`User ID pseudonymization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async pseudonymizeDomain(domain: string, preserveStructure: boolean = true): Promise<string> {
    try {
      if (preserveStructure) {
        // Preserve domain structure for analysis while anonymizing
        const parts = domain.split('.');
        const pseudonymizedParts = await Promise.all(
          parts.map(async (part, index) => {
            // Keep TLD for analysis purposes
            if (index === parts.length - 1 && part.length <= 3) {
              return part;
            }
            return await this.createPseudonym(part, 'domain_salt');
          })
        );
        return pseudonymizedParts.join('.');
      } else {
        // Complete pseudonymization
        return await this.createPseudonym(domain, 'domain_salt');
      }
    } catch (error) {
      throw new Error(`Domain pseudonymization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async pseudonymizeIPAddress(ipAddress: string, preserveSubnet: boolean = true): Promise<string> {
    try {
      if (preserveSubnet && this.isIPv4(ipAddress)) {
        // Preserve subnet for geographic analysis
        const parts = ipAddress.split('.');
        const preservedParts = parts.slice(0, 2); // Keep first two octets
        const pseudonymizedParts = await Promise.all(
          parts.slice(2).map(part => this.createPseudonym(part, 'ip_salt'))
        );
        return [...preservedParts, ...pseudonymizedParts].join('.');
      } else {
        // Complete pseudonymization
        return await this.createPseudonym(ipAddress, 'ip_salt');
      }
    } catch (error) {
      throw new Error(`IP address pseudonymization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Anonymization methods
  public anonymizeDataset<T extends Record<string, any>>(
    dataset: T[],
    config: AnonymizationConfig
  ): AnonymizedDataset<T> {
    try {
      const anonymizedData = dataset.map(record => this.anonymizeRecord(record, config));
      
      // Apply k-anonymity if required
      if (config.kAnonymity && config.kAnonymity.enabled) {
        return this.applyKAnonymity(anonymizedData, config.kAnonymity);
      }

      return {
        data: anonymizedData,
        metadata: {
          originalCount: dataset.length,
          anonymizedCount: anonymizedData.length,
          suppressedCount: 0,
          kValue: 1,
          lValue: 1,
          techniques: this.getAppliedTechniques(config)
        }
      };
    } catch (error) {
      throw new Error(`Dataset anonymization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private anonymizeRecord<T extends Record<string, any>>(
    record: T,
    config: AnonymizationConfig
  ): Partial<T> {
    const anonymizedRecord: Partial<T> = {};

    for (const [field, value] of Object.entries(record)) {
      const fieldConfig = config.fields[field];
      
      if (!fieldConfig) {
        // Field not in config, include as-is (might want to warn)
        anonymizedRecord[field as keyof T] = value;
        continue;
      }

      switch (fieldConfig.technique) {
        case 'suppress':
          // Field is completely removed
          break;

        case 'generalize':
          anonymizedRecord[field as keyof T] = this.generalizeValue(value, fieldConfig.parameters);
          break;

        case 'mask':
          anonymizedRecord[field as keyof T] = this.maskValue(value, fieldConfig.parameters);
          break;

        case 'noise':
          anonymizedRecord[field as keyof T] = this.addNoise(value, fieldConfig.parameters);
          break;

        case 'categorize':
          anonymizedRecord[field as keyof T] = this.categorizeValue(value, fieldConfig.parameters);
          break;

        case 'hash':
          anonymizedRecord[field as keyof T] = this.hashValue(value, fieldConfig.parameters);
          break;

        default:
          anonymizedRecord[field as keyof T] = value;
      }
    }

    return anonymizedRecord;
  }

  // K-anonymity implementation
  private applyKAnonymity<T>(
    dataset: Partial<T>[],
    config: KAnonymityConfig
  ): AnonymizedDataset<T> {
    const kValue = config.k || this.DEFAULT_K_VALUE;
    const quasiIdentifiers = config.quasiIdentifiers;

    // Group records by quasi-identifier combinations
    const groups = new Map<string, Partial<T>[]>();
    
    for (const record of dataset) {
      const key = this.createQuasiIdentifierKey(record, quasiIdentifiers);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }

    // Filter groups that don't meet k-anonymity requirement
    const validGroups: Partial<T>[] = [];
    let suppressedCount = 0;

    for (const [key, group] of groups) {
      if (group.length >= kValue) {
        validGroups.push(...group);
      } else {
        suppressedCount += group.length;
      }
    }

    return {
      data: validGroups,
      metadata: {
        originalCount: dataset.length,
        anonymizedCount: validGroups.length,
        suppressedCount,
        kValue,
        lValue: this.calculateLDiversity(validGroups, config.sensitiveAttribute),
        techniques: ['k-anonymity']
      }
    };
  }

  // Differential privacy
  public addDifferentialPrivacy(
    value: number,
    epsilon: number = 1.0,
    sensitivity: number = 1.0
  ): number {
    try {
      // Laplace mechanism for differential privacy
      const scale = sensitivity / epsilon;
      const noise = this.generateLaplaceNoise(scale);
      return value + noise;
    } catch (error) {
      throw new Error(`Differential privacy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Data masking techniques
  private generalizeValue(value: any, parameters: any): any {
    if (typeof value === 'number') {
      const range = parameters.range || 10;
      return Math.floor(value / range) * range;
    }
    
    if (typeof value === 'string' && parameters.type === 'date') {
      const date = new Date(value);
      if (parameters.precision === 'month') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (parameters.precision === 'year') {
        return date.getFullYear().toString();
      }
    }

    return value;
  }

  private maskValue(value: any, parameters: any): any {
    if (typeof value === 'string') {
      const maskChar = parameters.maskChar || '*';
      const preserveLength = parameters.preserveLength !== false;
      const preserveStart = parameters.preserveStart || 0;
      const preserveEnd = parameters.preserveEnd || 0;

      if (preserveLength) {
        const start = value.substring(0, preserveStart);
        const end = value.substring(value.length - preserveEnd);
        const middle = maskChar.repeat(Math.max(0, value.length - preserveStart - preserveEnd));
        return start + middle + end;
      } else {
        return maskChar.repeat(parameters.length || 8);
      }
    }

    return value;
  }

  private addNoise(value: any, parameters: any): any {
    if (typeof value === 'number') {
      const noiseLevel = parameters.noiseLevel || 0.1;
      const noise = (Math.random() - 0.5) * 2 * noiseLevel * value;
      return Math.round((value + noise) * 100) / 100; // Round to 2 decimal places
    }

    return value;
  }

  private categorizeValue(value: any, parameters: any): any {
    if (typeof value === 'number') {
      const ranges = parameters.ranges || [];
      for (const range of ranges) {
        if (value >= range.min && value < range.max) {
          return range.label;
        }
      }
      return 'Other';
    }

    if (typeof value === 'string' && parameters.categories) {
      return parameters.categories[value] || 'Other';
    }

    return value;
  }

  private async hashValue(value: any, parameters: any): Promise<string> {
    const salt = parameters.salt || 'default_salt';
    return await this.createPseudonym(String(value), salt);
  }

  // Utility methods
  private async createPseudonym(value: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value + salt);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Return first 16 characters for readability
    return hashHex.substring(0, 16);
  }

  private async generateSalt(): Promise<string> {
    const saltArray = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(saltArray, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private isIPv4(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Regex.test(ip);
  }

  private createQuasiIdentifierKey(record: any, quasiIdentifiers: string[]): string {
    return quasiIdentifiers
      .map(field => String(record[field] || ''))
      .join('|');
  }

  private calculateLDiversity(dataset: any[], sensitiveAttribute?: string): number {
    if (!sensitiveAttribute) return 1;

    const sensitiveValues = new Set();
    for (const record of dataset) {
      if (record[sensitiveAttribute] !== undefined) {
        sensitiveValues.add(record[sensitiveAttribute]);
      }
    }

    return sensitiveValues.size;
  }

  private generateLaplaceNoise(scale: number): number {
    // Generate Laplace noise using inverse transform sampling
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  private getAppliedTechniques(config: AnonymizationConfig): string[] {
    const techniques = new Set<string>();
    
    for (const fieldConfig of Object.values(config.fields)) {
      techniques.add(fieldConfig.technique);
    }

    if (config.kAnonymity?.enabled) {
      techniques.add('k-anonymity');
    }

    return Array.from(techniques);
  }

  // Public utility methods
  public clearPseudonymCache(): void {
    this.pseudonymMap.clear();
  }

  public clearSaltCache(): void {
    this.saltCache.clear();
  }

  public getPseudonymizationStats(): {
    cachedPseudonyms: number;
    cachedSalts: number;
  } {
    return {
      cachedPseudonyms: this.pseudonymMap.size,
      cachedSalts: this.saltCache.size
    };
  }
}

// Type definitions
export interface AnonymizationConfig {
  fields: {
    [fieldName: string]: {
      technique: 'suppress' | 'generalize' | 'mask' | 'noise' | 'categorize' | 'hash';
      parameters?: any;
    };
  };
  kAnonymity?: KAnonymityConfig;
}

export interface KAnonymityConfig {
  enabled: boolean;
  k?: number;
  quasiIdentifiers: string[];
  sensitiveAttribute?: string;
}

export interface AnonymizedDataset<T> {
  data: Partial<T>[];
  metadata: {
    originalCount: number;
    anonymizedCount: number;
    suppressedCount: number;
    kValue: number;
    lValue: number;
    techniques: string[];
  };
}

// Predefined anonymization configurations
export const ANONYMIZATION_PRESETS = {
  COHORT_DATA: {
    fields: {
      userId: { technique: 'hash' as const, parameters: { salt: 'user_salt' } },
      domain: { technique: 'hash' as const, parameters: { salt: 'domain_salt' } },
      timestamp: { technique: 'generalize' as const, parameters: { type: 'date', precision: 'hour' } },
      ipAddress: { technique: 'mask' as const, parameters: { preserveStart: 2, preserveEnd: 0 } },
      userAgent: { technique: 'suppress' as const }
    },
    kAnonymity: {
      enabled: true,
      k: 5,
      quasiIdentifiers: ['domain', 'timestamp'],
      sensitiveAttribute: 'cohortId'
    }
  },

  ANALYTICS_DATA: {
    fields: {
      userId: { technique: 'hash' as const, parameters: { salt: 'analytics_salt' } },
      sessionId: { technique: 'hash' as const, parameters: { salt: 'session_salt' } },
      timestamp: { technique: 'generalize' as const, parameters: { type: 'date', precision: 'hour' } },
      pageViews: { technique: 'noise' as const, parameters: { noiseLevel: 0.1 } },
      duration: { technique: 'categorize' as const, parameters: {
        ranges: [
          { min: 0, max: 30, label: 'short' },
          { min: 30, max: 300, label: 'medium' },
          { min: 300, max: Infinity, label: 'long' }
        ]
      }}
    }
  },

  MINIMAL_ANONYMIZATION: {
    fields: {
      userId: { technique: 'hash' as const, parameters: { salt: 'minimal_salt' } },
      timestamp: { technique: 'generalize' as const, parameters: { type: 'date', precision: 'day' } }
    }
  }
};
