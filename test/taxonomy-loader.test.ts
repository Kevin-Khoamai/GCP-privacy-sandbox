import { describe, it, expect, beforeEach } from 'vitest';
import { TaxonomyLoader } from '../src/shared/core/taxonomy-loader';

describe('TaxonomyLoader', () => {
  let taxonomyLoader: TaxonomyLoader;

  beforeEach(() => {
    taxonomyLoader = TaxonomyLoader.getInstance();
    taxonomyLoader.clearCache(); // Clear cache before each test
  });

  describe('loadTaxonomy', () => {
    it('should load taxonomy successfully', async () => {
      const taxonomy = await taxonomyLoader.loadTaxonomy();
      
      expect(taxonomy).toBeDefined();
      expect(taxonomy.topics).toBeInstanceOf(Array);
      expect(taxonomy.topics.length).toBeGreaterThan(0);
      expect(taxonomy.domainMappings).toBeInstanceOf(Map);
    });

    it('should cache taxonomy after first load', async () => {
      const taxonomy1 = await taxonomyLoader.loadTaxonomy();
      const taxonomy2 = await taxonomyLoader.loadTaxonomy();
      
      expect(taxonomy1).toBe(taxonomy2); // Should be the same object reference
    });

    it('should validate topic structure', async () => {
      const taxonomy = await taxonomyLoader.loadTaxonomy();
      
      for (const topic of taxonomy.topics) {
        expect(topic.id).toBeTypeOf('number');
        expect(topic.id).toBeGreaterThan(0);
        expect(topic.name).toBeTypeOf('string');
        expect(topic.name.length).toBeGreaterThan(0);
        expect(topic.level).toBeTypeOf('number');
        expect(topic.level).toBeGreaterThanOrEqual(0);
        expect(topic.isSensitive).toBeTypeOf('boolean');
        expect(topic.description).toBeTypeOf('string');
        expect(topic.description.length).toBeGreaterThan(0);
        
        if (topic.parentId !== undefined) {
          expect(topic.parentId).toBeTypeOf('number');
          expect(topic.parentId).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('getTopicById', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return topic for valid ID', () => {
      const topic = taxonomyLoader.getTopicById(1);
      expect(topic).toBeDefined();
      expect(topic?.id).toBe(1);
      expect(topic?.name).toBe('Arts & Entertainment');
    });

    it('should return undefined for invalid ID', () => {
      const topic = taxonomyLoader.getTopicById(99999);
      expect(topic).toBeUndefined();
    });
  });

  describe('getTopicByName', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return topic for valid name', () => {
      const topic = taxonomyLoader.getTopicByName('Arts & Entertainment');
      expect(topic).toBeDefined();
      expect(topic?.id).toBe(1);
      expect(topic?.name).toBe('Arts & Entertainment');
    });

    it('should be case insensitive', () => {
      const topic = taxonomyLoader.getTopicByName('arts & entertainment');
      expect(topic).toBeDefined();
      expect(topic?.id).toBe(1);
    });

    it('should return undefined for invalid name', () => {
      const topic = taxonomyLoader.getTopicByName('Non-existent Topic');
      expect(topic).toBeUndefined();
    });
  });

  describe('getChildTopics', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return child topics for parent', () => {
      const children = taxonomyLoader.getChildTopics(1); // Arts & Entertainment
      expect(children.length).toBeGreaterThan(0);
      
      for (const child of children) {
        expect(child.parentId).toBe(1);
        expect(child.level).toBe(1);
      }
    });

    it('should return empty array for topic with no children', () => {
      const children = taxonomyLoader.getChildTopics(3); // Action Movies (leaf node)
      expect(children).toEqual([]);
    });

    it('should return empty array for non-existent topic', () => {
      const children = taxonomyLoader.getChildTopics(99999);
      expect(children).toEqual([]);
    });
  });

  describe('getParentTopic', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return parent topic for child', () => {
      const parent = taxonomyLoader.getParentTopic(2); // Movies
      expect(parent).toBeDefined();
      expect(parent?.id).toBe(1);
      expect(parent?.name).toBe('Arts & Entertainment');
    });

    it('should return undefined for root topic', () => {
      const parent = taxonomyLoader.getParentTopic(1); // Arts & Entertainment (root)
      expect(parent).toBeUndefined();
    });

    it('should return undefined for non-existent topic', () => {
      const parent = taxonomyLoader.getParentTopic(99999);
      expect(parent).toBeUndefined();
    });
  });

  describe('getAncestorTopics', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return ancestor chain', () => {
      const ancestors = taxonomyLoader.getAncestorTopics(3); // Action Movies
      expect(ancestors.length).toBe(2);
      expect(ancestors[0].id).toBe(2); // Movies (immediate parent)
      expect(ancestors[1].id).toBe(1); // Arts & Entertainment (grandparent)
    });

    it('should return empty array for root topic', () => {
      const ancestors = taxonomyLoader.getAncestorTopics(1); // Arts & Entertainment
      expect(ancestors).toEqual([]);
    });
  });

  describe('getDescendantTopics', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return all descendants', () => {
      const descendants = taxonomyLoader.getDescendantTopics(1); // Arts & Entertainment
      expect(descendants.length).toBeGreaterThan(0);
      
      // Should include direct children and their children
      const movieTopics = descendants.filter(t => t.parentId === 2); // Children of Movies
      expect(movieTopics.length).toBeGreaterThan(0);
    });

    it('should return empty array for leaf topic', () => {
      const descendants = taxonomyLoader.getDescendantTopics(3); // Action Movies
      expect(descendants).toEqual([]);
    });
  });

  describe('getRootTopics', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return all root topics', () => {
      const rootTopics = taxonomyLoader.getRootTopics();
      expect(rootTopics.length).toBeGreaterThan(0);
      
      for (const topic of rootTopics) {
        expect(topic.parentId).toBeUndefined();
        expect(topic.level).toBe(0);
      }
    });
  });

  describe('searchTopics', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should find topics by name keyword', () => {
      const results = taxonomyLoader.searchTopics('Music');
      expect(results.length).toBeGreaterThan(0);
      
      const musicTopic = results.find(t => t.name === 'Music');
      expect(musicTopic).toBeDefined();
    });

    it('should find topics by description keyword', () => {
      const results = taxonomyLoader.searchTopics('film');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should be case insensitive', () => {
      const results = taxonomyLoader.searchTopics('music');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-matching keyword', () => {
      const results = taxonomyLoader.searchTopics('xyz123nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('getTopicsByLevel', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return topics at specified level', () => {
      const level0Topics = taxonomyLoader.getTopicsByLevel(0);
      expect(level0Topics.length).toBeGreaterThan(0);
      
      for (const topic of level0Topics) {
        expect(topic.level).toBe(0);
        expect(topic.parentId).toBeUndefined();
      }
    });

    it('should return empty array for non-existent level', () => {
      const results = taxonomyLoader.getTopicsByLevel(999);
      expect(results).toEqual([]);
    });
  });

  describe('isSensitiveTopic', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return false for non-sensitive topics', () => {
      const isSensitive = taxonomyLoader.isSensitiveTopic(1); // Arts & Entertainment
      expect(isSensitive).toBe(false);
    });

    it('should return false for non-existent topic', () => {
      const isSensitive = taxonomyLoader.isSensitiveTopic(99999);
      expect(isSensitive).toBe(false);
    });
  });

  describe('getNonSensitiveTopics', () => {
    beforeEach(async () => {
      await taxonomyLoader.loadTaxonomy();
    });

    it('should return only non-sensitive topics', () => {
      const nonSensitiveTopics = taxonomyLoader.getNonSensitiveTopics();
      expect(nonSensitiveTopics.length).toBeGreaterThan(0);
      
      for (const topic of nonSensitiveTopics) {
        expect(topic.isSensitive).toBe(false);
      }
    });
  });

  describe('clearCache', () => {
    it('should clear cached data', async () => {
      await taxonomyLoader.loadTaxonomy();
      
      // Verify data is loaded
      expect(taxonomyLoader.getTopicById(1)).toBeDefined();
      
      taxonomyLoader.clearCache();
      
      // After clearing cache, should need to reload
      expect(taxonomyLoader.getTopicById(1)).toBeUndefined();
    });
  });
});