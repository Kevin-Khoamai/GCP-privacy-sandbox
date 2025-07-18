import { Topic, TopicTaxonomy } from '../interfaces/common';
import taxonomyData from '../data/topic-taxonomy.json';

/**
 * Interface for the raw taxonomy data structure from JSON
 */
interface RawTaxonomyData {
  version: string;
  lastUpdated: string;
  description: string;
  topics: Topic[];
}

/**
 * Taxonomy loader with validation and caching mechanisms
 * Provides hierarchical topic lookup and parent-child relationship support
 */
export class TaxonomyLoader {
  private static instance: TaxonomyLoader;
  private cachedTaxonomy: TopicTaxonomy | null = null;
  private topicMap: Map<number, Topic> = new Map();
  private childrenMap: Map<number, number[]> = new Map();
  private nameToIdMap: Map<string, number> = new Map();

  private constructor() {}

  /**
   * Get singleton instance of TaxonomyLoader
   */
  public static getInstance(): TaxonomyLoader {
    if (!TaxonomyLoader.instance) {
      TaxonomyLoader.instance = new TaxonomyLoader();
    }
    return TaxonomyLoader.instance;
  }

  /**
   * Load and validate the topic taxonomy
   * @returns Promise<TopicTaxonomy> The loaded and validated taxonomy
   * @throws Error if validation fails
   */
  public async loadTaxonomy(): Promise<TopicTaxonomy> {
    if (this.cachedTaxonomy) {
      return this.cachedTaxonomy;
    }

    try {
      const rawData = taxonomyData as RawTaxonomyData;
      
      // Validate the raw data structure
      this.validateRawData(rawData);
      
      // Build the taxonomy with validation
      const validatedTopics = this.validateAndProcessTopics(rawData.topics);
      
      // Build lookup maps for efficient access
      this.buildLookupMaps(validatedTopics);
      
      // Create the taxonomy object
      this.cachedTaxonomy = {
        topics: validatedTopics,
        domainMappings: new Map() // Will be populated by domain mapping system
      };

      return this.cachedTaxonomy;
    } catch (error) {
      throw new Error(`Failed to load taxonomy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a topic by ID
   * @param topicId The topic ID to lookup
   * @returns Topic | undefined The topic if found
   */
  public getTopicById(topicId: number): Topic | undefined {
    return this.topicMap.get(topicId);
  }

  /**
   * Get a topic by name (case-insensitive)
   * @param topicName The topic name to lookup
   * @returns Topic | undefined The topic if found
   */
  public getTopicByName(topicName: string): Topic | undefined {
    const topicId = this.nameToIdMap.get(topicName.toLowerCase());
    return topicId ? this.topicMap.get(topicId) : undefined;
  }

  /**
   * Get all child topics for a given parent topic ID
   * @param parentId The parent topic ID
   * @returns Topic[] Array of child topics
   */
  public getChildTopics(parentId: number): Topic[] {
    const childIds = this.childrenMap.get(parentId) || [];
    return childIds.map(id => this.topicMap.get(id)).filter((topic): topic is Topic => topic !== undefined);
  }

  /**
   * Get the parent topic for a given topic ID
   * @param topicId The topic ID
   * @returns Topic | undefined The parent topic if it exists
   */
  public getParentTopic(topicId: number): Topic | undefined {
    const topic = this.topicMap.get(topicId);
    return topic?.parentId ? this.topicMap.get(topic.parentId) : undefined;
  }

  /**
   * Get all ancestor topics (parent, grandparent, etc.) for a given topic ID
   * @param topicId The topic ID
   * @returns Topic[] Array of ancestor topics from immediate parent to root
   */
  public getAncestorTopics(topicId: number): Topic[] {
    const ancestors: Topic[] = [];
    let currentTopic = this.getTopicById(topicId);
    
    while (currentTopic?.parentId) {
      const parent = this.getTopicById(currentTopic.parentId);
      if (parent) {
        ancestors.push(parent);
        currentTopic = parent;
      } else {
        break;
      }
    }
    
    return ancestors;
  }

  /**
   * Get all descendant topics (children, grandchildren, etc.) for a given topic ID
   * @param topicId The topic ID
   * @returns Topic[] Array of all descendant topics
   */
  public getDescendantTopics(topicId: number): Topic[] {
    const descendants: Topic[] = [];
    const childTopics = this.getChildTopics(topicId);
    
    for (const child of childTopics) {
      descendants.push(child);
      descendants.push(...this.getDescendantTopics(child.id));
    }
    
    return descendants;
  }

  /**
   * Get root topics (topics with no parent)
   * @returns Topic[] Array of root topics
   */
  public getRootTopics(): Topic[] {
    return Array.from(this.topicMap.values()).filter(topic => !topic.parentId);
  }

  /**
   * Search topics by keyword (case-insensitive, searches name and description)
   * @param keyword The search keyword
   * @returns Topic[] Array of matching topics
   */
  public searchTopics(keyword: string): Topic[] {
    const searchTerm = keyword.toLowerCase();
    return Array.from(this.topicMap.values()).filter(topic => 
      topic.name.toLowerCase().includes(searchTerm) || 
      topic.description.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Get topics by level
   * @param level The hierarchy level (0 = root, 1 = first level, etc.)
   * @returns Topic[] Array of topics at the specified level
   */
  public getTopicsByLevel(level: number): Topic[] {
    return Array.from(this.topicMap.values()).filter(topic => topic.level === level);
  }

  /**
   * Check if a topic is sensitive (should be excluded from processing)
   * @param topicId The topic ID to check
   * @returns boolean True if the topic is marked as sensitive
   */
  public isSensitiveTopic(topicId: number): boolean {
    const topic = this.topicMap.get(topicId);
    return topic?.isSensitive || false;
  }

  /**
   * Get all non-sensitive topics
   * @returns Topic[] Array of non-sensitive topics
   */
  public getNonSensitiveTopics(): Topic[] {
    return Array.from(this.topicMap.values()).filter(topic => !topic.isSensitive);
  }

  /**
   * Clear the cached taxonomy (useful for testing or reloading)
   */
  public clearCache(): void {
    this.cachedTaxonomy = null;
    this.topicMap.clear();
    this.childrenMap.clear();
    this.nameToIdMap.clear();
  }

  /**
   * Validate the raw taxonomy data structure
   * @param rawData The raw data to validate
   * @throws Error if validation fails
   */
  private validateRawData(rawData: any): void {
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('Invalid taxonomy data: must be an object');
    }

    if (!rawData.version || typeof rawData.version !== 'string') {
      throw new Error('Invalid taxonomy data: version is required and must be a string');
    }

    if (!rawData.topics || !Array.isArray(rawData.topics)) {
      throw new Error('Invalid taxonomy data: topics is required and must be an array');
    }

    if (rawData.topics.length === 0) {
      throw new Error('Invalid taxonomy data: topics array cannot be empty');
    }
  }

  /**
   * Validate and process the topics array
   * @param topics The topics array to validate
   * @returns Topic[] The validated topics
   * @throws Error if validation fails
   */
  private validateAndProcessTopics(topics: Topic[]): Topic[] {
    const validatedTopics: Topic[] = [];
    const seenIds = new Set<number>();
    const parentChildMap = new Map<number, number[]>();

    // First pass: validate individual topics and check for duplicate IDs
    for (const topic of topics) {
      this.validateTopic(topic);
      
      if (seenIds.has(topic.id)) {
        throw new Error(`Duplicate topic ID found: ${topic.id}`);
      }
      seenIds.add(topic.id);
      
      validatedTopics.push(topic);
    }

    // Second pass: validate parent-child relationships
    for (const topic of validatedTopics) {
      if (topic.parentId !== undefined) {
        if (!seenIds.has(topic.parentId)) {
          throw new Error(`Topic ${topic.id} references non-existent parent ${topic.parentId}`);
        }
        
        // Build parent-child mapping for validation
        if (!parentChildMap.has(topic.parentId)) {
          parentChildMap.set(topic.parentId, []);
        }
        parentChildMap.get(topic.parentId)!.push(topic.id);
      }
    }

    // Validate hierarchy levels
    this.validateHierarchyLevels(validatedTopics, parentChildMap);

    return validatedTopics;
  }

  /**
   * Validate an individual topic
   * @param topic The topic to validate
   * @throws Error if validation fails
   */
  private validateTopic(topic: any): void {
    if (!topic || typeof topic !== 'object') {
      throw new Error('Invalid topic: must be an object');
    }

    if (typeof topic.id !== 'number' || topic.id <= 0) {
      throw new Error(`Invalid topic ID: must be a positive number, got ${topic.id}`);
    }

    if (!topic.name || typeof topic.name !== 'string' || topic.name.trim().length === 0) {
      throw new Error(`Invalid topic name for ID ${topic.id}: must be a non-empty string`);
    }

    if (typeof topic.level !== 'number' || topic.level < 0) {
      throw new Error(`Invalid topic level for ID ${topic.id}: must be a non-negative number`);
    }

    if (typeof topic.isSensitive !== 'boolean') {
      throw new Error(`Invalid isSensitive flag for ID ${topic.id}: must be a boolean`);
    }

    if (!topic.description || typeof topic.description !== 'string') {
      throw new Error(`Invalid topic description for ID ${topic.id}: must be a non-empty string`);
    }

    if (topic.parentId !== undefined && (typeof topic.parentId !== 'number' || topic.parentId <= 0)) {
      throw new Error(`Invalid parent ID for topic ${topic.id}: must be a positive number or undefined`);
    }
  }

  /**
   * Validate hierarchy levels are consistent
   * @param topics The topics to validate
   * @param parentChildMap The parent-child mapping
   * @throws Error if validation fails
   */
  private validateHierarchyLevels(topics: Topic[], parentChildMap: Map<number, number[]>): void {
    const topicMap = new Map(topics.map(t => [t.id, t]));

    for (const topic of topics) {
      if (topic.parentId !== undefined) {
        const parent = topicMap.get(topic.parentId);
        if (parent && topic.level !== parent.level + 1) {
          throw new Error(
            `Invalid hierarchy level for topic ${topic.id}: ` +
            `level ${topic.level} should be ${parent.level + 1} (parent level + 1)`
          );
        }
      } else if (topic.level !== 0) {
        throw new Error(`Root topic ${topic.id} should have level 0, got ${topic.level}`);
      }
    }
  }

  /**
   * Build lookup maps for efficient topic access
   * @param topics The validated topics
   */
  private buildLookupMaps(topics: Topic[]): void {
    this.topicMap.clear();
    this.childrenMap.clear();
    this.nameToIdMap.clear();

    // Build topic map and name-to-ID map
    for (const topic of topics) {
      this.topicMap.set(topic.id, topic);
      this.nameToIdMap.set(topic.name.toLowerCase(), topic.id);
    }

    // Build children map
    for (const topic of topics) {
      if (topic.parentId !== undefined) {
        if (!this.childrenMap.has(topic.parentId)) {
          this.childrenMap.set(topic.parentId, []);
        }
        this.childrenMap.get(topic.parentId)!.push(topic.id);
      }
    }
  }
}

// Export singleton instance
export const taxonomyLoader = TaxonomyLoader.getInstance();