import { DomainMapping } from '../interfaces/common';
import { TaxonomyLoader } from './taxonomy-loader';

/**
 * Domain classification result with confidence scoring
 */
export interface DomainClassificationResult {
  domain: string;
  topicIds: number[];
  confidence: number;
  source: 'manual' | 'ml' | 'keyword';
  matchedKeywords?: string[];
}

/**
 * Keyword mapping for domain classification
 */
interface KeywordMapping {
  keywords: string[];
  topicIds: number[];
  weight: number;
}

/**
 * Domain-to-topic mapping system with confidence scoring and fallback keyword matching
 */
export class DomainMapper {
  private static instance: DomainMapper;
  private taxonomyLoader: TaxonomyLoader;
  private domainMappings: Map<string, DomainMapping> = new Map();
  private keywordMappings: KeywordMapping[] = [];
  private initialized = false;

  private constructor() {
    this.taxonomyLoader = TaxonomyLoader.getInstance();
  }

  /**
   * Get singleton instance of DomainMapper
   */
  public static getInstance(): DomainMapper {
    if (!DomainMapper.instance) {
      DomainMapper.instance = new DomainMapper();
    }
    return DomainMapper.instance;
  }

  /**
   * Initialize the domain mapper with predefined mappings and keyword rules
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Ensure taxonomy is loaded
    await this.taxonomyLoader.loadTaxonomy();

    // Load predefined domain mappings
    this.loadPredefinedMappings();

    // Load keyword mappings for fallback classification
    this.loadKeywordMappings();

    this.initialized = true;
  }

  /**
   * Classify a domain and return topic assignments with confidence scores
   * @param domain The domain to classify (e.g., "example.com")
   * @returns DomainClassificationResult The classification result
   */
  public async classifyDomain(domain: string): Promise<DomainClassificationResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const normalizedDomain = this.normalizeDomain(domain);

    // First, try exact domain mapping
    const exactMapping = this.domainMappings.get(normalizedDomain);
    if (exactMapping) {
      return {
        domain: normalizedDomain,
        topicIds: exactMapping.topicIds,
        confidence: exactMapping.confidence,
        source: exactMapping.source
      };
    }

    // Try subdomain matching (e.g., "news.example.com" -> "example.com")
    const parentDomainMapping = this.findParentDomainMapping(normalizedDomain);
    if (parentDomainMapping) {
      return {
        domain: normalizedDomain,
        topicIds: parentDomainMapping.topicIds,
        confidence: parentDomainMapping.confidence * 0.8, // Reduce confidence for subdomain match
        source: parentDomainMapping.source
      };
    }

    // Fallback to keyword matching
    const keywordResult = this.classifyByKeywords(normalizedDomain);
    if (keywordResult.topicIds.length > 0) {
      return keywordResult;
    }

    // No classification found
    return {
      domain: normalizedDomain,
      topicIds: [],
      confidence: 0,
      source: 'keyword',
      matchedKeywords: []
    };
  }

  /**
   * Add a manual domain mapping
   * @param domain The domain to map
   * @param topicIds The topic IDs to assign
   * @param confidence The confidence score (0-1)
   */
  public addDomainMapping(domain: string, topicIds: number[], confidence: number = 1.0): void {
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Validate topic IDs exist
    for (const topicId of topicIds) {
      if (!this.taxonomyLoader.getTopicById(topicId)) {
        throw new Error(`Invalid topic ID: ${topicId}`);
      }
    }

    const mapping: DomainMapping = {
      domain: normalizedDomain,
      topicIds,
      confidence: Math.max(0, Math.min(1, confidence)), // Clamp between 0 and 1
      lastUpdated: new Date(),
      source: 'manual'
    };

    this.domainMappings.set(normalizedDomain, mapping);
  }

  /**
   * Remove a domain mapping
   * @param domain The domain to remove
   * @returns boolean True if the mapping was removed
   */
  public removeDomainMapping(domain: string): boolean {
    const normalizedDomain = this.normalizeDomain(domain);
    return this.domainMappings.delete(normalizedDomain);
  }

  /**
   * Get all domain mappings
   * @returns Map<string, DomainMapping> All domain mappings
   */
  public getAllDomainMappings(): Map<string, DomainMapping> {
    return new Map(this.domainMappings);
  }

  /**
   * Get domain mapping for a specific domain
   * @param domain The domain to lookup
   * @returns DomainMapping | undefined The mapping if found
   */
  public getDomainMapping(domain: string): DomainMapping | undefined {
    const normalizedDomain = this.normalizeDomain(domain);
    return this.domainMappings.get(normalizedDomain);
  }

  /**
   * Batch classify multiple domains
   * @param domains Array of domains to classify
   * @returns Promise<DomainClassificationResult[]> Array of classification results
   */
  public async classifyDomains(domains: string[]): Promise<DomainClassificationResult[]> {
    const results: DomainClassificationResult[] = [];
    
    for (const domain of domains) {
      try {
        const result = await this.classifyDomain(domain);
        results.push(result);
      } catch (error) {
        // Add failed classification with zero confidence
        results.push({
          domain: this.normalizeDomain(domain),
          topicIds: [],
          confidence: 0,
          source: 'keyword',
          matchedKeywords: []
        });
      }
    }

    return results;
  }

  /**
   * Get domains mapped to a specific topic
   * @param topicId The topic ID to search for
   * @returns string[] Array of domains mapped to the topic
   */
  public getDomainsForTopic(topicId: number): string[] {
    const domains: string[] = [];
    
    for (const [domain, mapping] of this.domainMappings) {
      if (mapping.topicIds.includes(topicId)) {
        domains.push(domain);
      }
    }

    return domains;
  }

  /**
   * Clear all domain mappings (useful for testing)
   */
  public clearMappings(): void {
    this.domainMappings.clear();
    this.initialized = false;
  }

  /**
   * Normalize domain name (remove protocol, www, etc.)
   * @param domain The domain to normalize
   * @returns string The normalized domain
   */
  private normalizeDomain(domain: string): string {
    let normalized = domain.toLowerCase().trim();
    
    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, '');
    
    // Remove www prefix
    normalized = normalized.replace(/^www\./, '');
    
    // Remove trailing slash and path
    normalized = normalized.split('/')[0];
    
    // Remove port number
    normalized = normalized.split(':')[0];
    
    return normalized;
  }

  /**
   * Find parent domain mapping for subdomains
   * @param domain The domain to check
   * @returns DomainMapping | undefined The parent domain mapping if found
   */
  private findParentDomainMapping(domain: string): DomainMapping | undefined {
    const parts = domain.split('.');
    
    // Try progressively shorter domain names
    for (let i = 1; i < parts.length; i++) {
      const parentDomain = parts.slice(i).join('.');
      const mapping = this.domainMappings.get(parentDomain);
      if (mapping) {
        return mapping;
      }
    }
    
    return undefined;
  }

  /**
   * Classify domain using keyword matching
   * @param domain The domain to classify
   * @returns DomainClassificationResult The classification result
   */
  private classifyByKeywords(domain: string): DomainClassificationResult {
    const matchedMappings: { mapping: KeywordMapping; matchedKeywords: string[] }[] = [];
    
    for (const mapping of this.keywordMappings) {
      const matchedKeywords = mapping.keywords.filter(keyword => 
        domain.includes(keyword.toLowerCase())
      );
      
      if (matchedKeywords.length > 0) {
        matchedMappings.push({ mapping, matchedKeywords });
      }
    }

    if (matchedMappings.length === 0) {
      return {
        domain,
        topicIds: [],
        confidence: 0,
        source: 'keyword',
        matchedKeywords: []
      };
    }

    // Calculate weighted score for each topic
    const topicScores = new Map<number, number>();
    const allMatchedKeywords = new Set<string>();

    for (const { mapping, matchedKeywords } of matchedMappings) {
      const score = (matchedKeywords.length / mapping.keywords.length) * mapping.weight;
      
      for (const topicId of mapping.topicIds) {
        const currentScore = topicScores.get(topicId) || 0;
        topicScores.set(topicId, currentScore + score);
      }

      matchedKeywords.forEach(keyword => allMatchedKeywords.add(keyword));
    }

    // Get top scoring topics (limit to top 3)
    const sortedTopics = Array.from(topicScores.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    const topicIds = sortedTopics.map(([topicId]) => topicId);
    const maxScore = sortedTopics[0]?.[1] || 0;
    
    // Normalize confidence to 0-1 range (keyword matching has lower confidence)
    const confidence = Math.min(0.7, maxScore / 2); // Cap at 0.7 for keyword matching

    return {
      domain,
      topicIds,
      confidence,
      source: 'keyword',
      matchedKeywords: Array.from(allMatchedKeywords)
    };
  }

  /**
   * Load predefined domain mappings
   */
  private loadPredefinedMappings(): void {
    // Entertainment domains
    this.addDomainMapping('netflix.com', [2, 10], 0.95); // Movies, Television
    this.addDomainMapping('youtube.com', [1, 6], 0.9); // Arts & Entertainment, Music
    this.addDomainMapping('spotify.com', [6, 8], 0.95); // Music, Pop Music
    this.addDomainMapping('imdb.com', [2], 0.95); // Movies
    this.addDomainMapping('hulu.com', [2, 10], 0.95); // Movies, Television
    this.addDomainMapping('disney.com', [2, 4], 0.9); // Movies, Comedy Movies
    
    // Gaming domains
    this.addDomainMapping('steam.com', [11, 13], 0.95); // Gaming, PC Gaming
    this.addDomainMapping('xbox.com', [11, 12], 0.95); // Gaming, Console Gaming
    this.addDomainMapping('playstation.com', [11, 12], 0.95); // Gaming, Console Gaming
    this.addDomainMapping('nintendo.com', [11, 12], 0.95); // Gaming, Console Gaming
    this.addDomainMapping('twitch.tv', [11], 0.9); // Gaming
    
    // Technology domains
    this.addDomainMapping('apple.com', [15, 16, 17], 0.95); // Technology, Consumer Electronics, Smartphones
    this.addDomainMapping('google.com', [15, 20], 0.9); // Technology, Software
    this.addDomainMapping('microsoft.com', [15, 20], 0.95); // Technology, Software
    this.addDomainMapping('amazon.com', [16, 28], 0.8); // Consumer Electronics, E-commerce
    this.addDomainMapping('samsung.com', [16, 17], 0.95); // Consumer Electronics, Smartphones
    
    // Sports domains
    this.addDomainMapping('espn.com', [29], 0.95); // Sports
    this.addDomainMapping('nfl.com', [30, 31], 0.95); // Football, NFL
    this.addDomainMapping('nba.com', [33, 34], 0.95); // Basketball, NBA
    this.addDomainMapping('mlb.com', [36, 37], 0.95); // Baseball, MLB
    this.addDomainMapping('fifa.com', [35], 0.95); // Soccer
    
    // Business & Finance domains
    this.addDomainMapping('bloomberg.com', [21, 22, 23], 0.95); // Business & Finance, Investing, Stock Market
    this.addDomainMapping('cnbc.com', [21, 22], 0.9); // Business & Finance, Investing
    this.addDomainMapping('marketwatch.com', [22, 23], 0.95); // Investing, Stock Market
    this.addDomainMapping('coinbase.com', [24], 0.95); // Cryptocurrency
    this.addDomainMapping('robinhood.com', [22, 23], 0.9); // Investing, Stock Market
    
    // Health & Fitness domains
    this.addDomainMapping('webmd.com', [38], 0.8); // Health & Fitness
    this.addDomainMapping('myfitnesspal.com', [38, 39, 43], 0.95); // Health & Fitness, Exercise, Nutrition
    this.addDomainMapping('nike.com', [38, 39], 0.9); // Health & Fitness, Exercise
    this.addDomainMapping('peloton.com', [39, 41], 0.95); // Exercise, Cardio
    
    // Travel domains
    this.addDomainMapping('booking.com', [46], 0.95); // Travel
    this.addDomainMapping('expedia.com', [46], 0.95); // Travel
    this.addDomainMapping('airbnb.com', [46], 0.9); // Travel
    this.addDomainMapping('tripadvisor.com', [46], 0.9); // Travel
  }

  /**
   * Load keyword mappings for fallback classification
   */
  private loadKeywordMappings(): void {
    this.keywordMappings = [
      // Entertainment keywords
      {
        keywords: ['movie', 'film', 'cinema', 'theater', 'dvd', 'bluray'],
        topicIds: [2], // Movies
        weight: 1.0
      },
      {
        keywords: ['music', 'song', 'album', 'artist', 'band', 'concert'],
        topicIds: [6], // Music
        weight: 1.0
      },
      {
        keywords: ['tv', 'television', 'show', 'series', 'episode', 'streaming'],
        topicIds: [10], // Television
        weight: 1.0
      },
      {
        keywords: ['game', 'gaming', 'gamer', 'play', 'console', 'pc'],
        topicIds: [11], // Gaming
        weight: 1.0
      },
      
      // Technology keywords
      {
        keywords: ['tech', 'technology', 'software', 'app', 'digital'],
        topicIds: [15], // Technology
        weight: 1.0
      },
      {
        keywords: ['phone', 'smartphone', 'mobile', 'iphone', 'android'],
        topicIds: [17], // Smartphones
        weight: 1.0
      },
      {
        keywords: ['laptop', 'computer', 'pc', 'desktop'],
        topicIds: [18], // Laptops
        weight: 1.0
      },
      
      // Sports keywords
      {
        keywords: ['sport', 'sports', 'athletic', 'team', 'player', 'game'],
        topicIds: [29], // Sports
        weight: 1.0
      },
      {
        keywords: ['football', 'nfl', 'quarterback', 'touchdown'],
        topicIds: [30, 31], // Football, NFL
        weight: 1.0
      },
      {
        keywords: ['basketball', 'nba', 'dunk', 'court'],
        topicIds: [33, 34], // Basketball, NBA
        weight: 1.0
      },
      
      // Business keywords
      {
        keywords: ['business', 'finance', 'money', 'financial', 'economy'],
        topicIds: [21], // Business & Finance
        weight: 1.0
      },
      {
        keywords: ['invest', 'investment', 'stock', 'trading', 'market'],
        topicIds: [22, 23], // Investing, Stock Market
        weight: 1.0
      },
      {
        keywords: ['crypto', 'cryptocurrency', 'bitcoin', 'blockchain'],
        topicIds: [24], // Cryptocurrency
        weight: 1.0
      },
      
      // Health keywords
      {
        keywords: ['health', 'fitness', 'wellness', 'medical', 'doctor'],
        topicIds: [38], // Health & Fitness
        weight: 1.0
      },
      {
        keywords: ['exercise', 'workout', 'gym', 'training', 'fitness'],
        topicIds: [39], // Exercise
        weight: 1.0
      },
      {
        keywords: ['nutrition', 'diet', 'food', 'healthy', 'eating'],
        topicIds: [43], // Nutrition
        weight: 1.0
      },
      
      // Travel keywords
      {
        keywords: ['travel', 'trip', 'vacation', 'hotel', 'flight', 'tourism'],
        topicIds: [46], // Travel
        weight: 1.0
      }
    ];
  }
}

// Export singleton instance
export const domainMapper = DomainMapper.getInstance();