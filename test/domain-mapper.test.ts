import { describe, it, expect, beforeEach } from 'vitest';
import { DomainMapper } from '../src/shared/core/domain-mapper';

describe('DomainMapper', () => {
  let domainMapper: DomainMapper;

  beforeEach(async () => {
    domainMapper = DomainMapper.getInstance();
    domainMapper.clearMappings();
    await domainMapper.initialize();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const mapper = DomainMapper.getInstance();
      await mapper.initialize();
      
      // Should have predefined mappings loaded
      const mappings = mapper.getAllDomainMappings();
      expect(mappings.size).toBeGreaterThan(0);
    });

    it('should not reinitialize if already initialized', async () => {
      const mapper = DomainMapper.getInstance();
      await mapper.initialize();
      const mappings1 = mapper.getAllDomainMappings();
      
      await mapper.initialize(); // Second call
      const mappings2 = mapper.getAllDomainMappings();
      
      expect(mappings1.size).toBe(mappings2.size);
    });
  });

  describe('classifyDomain', () => {
    it('should classify known domains with high confidence', async () => {
      const result = await domainMapper.classifyDomain('netflix.com');
      
      expect(result.domain).toBe('netflix.com');
      expect(result.topicIds).toContain(2); // Movies
      expect(result.topicIds).toContain(10); // Television
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.source).toBe('manual');
    });

    it('should handle domains with protocols and www', async () => {
      const result = await domainMapper.classifyDomain('https://www.netflix.com');
      
      expect(result.domain).toBe('netflix.com');
      expect(result.topicIds).toContain(2);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should handle subdomains by finding parent domain', async () => {
      const result = await domainMapper.classifyDomain('news.google.com');
      
      expect(result.domain).toBe('news.google.com');
      expect(result.topicIds).toContain(15); // Technology
      expect(result.confidence).toBeGreaterThan(0.7); // Reduced confidence for subdomain
      expect(result.source).toBe('manual');
    });

    it('should use keyword matching for unknown domains', async () => {
      const result = await domainMapper.classifyDomain('unknowngaming.com');
      
      expect(result.domain).toBe('unknowngaming.com');
      expect(result.topicIds).toContain(11); // Gaming
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.source).toBe('keyword');
      expect(result.matchedKeywords).toContain('gaming');
    });

    it('should return empty result for unclassifiable domains', async () => {
      const result = await domainMapper.classifyDomain('randomxyz123.com');
      
      expect(result.domain).toBe('randomxyz123.com');
      expect(result.topicIds).toEqual([]);
      expect(result.confidence).toBe(0);
      expect(result.source).toBe('keyword');
    });

    it('should handle domains with paths and parameters', async () => {
      const result = await domainMapper.classifyDomain('netflix.com/browse/genre/123?param=value');
      
      expect(result.domain).toBe('netflix.com');
      expect(result.topicIds).toContain(2);
    });
  });

  describe('addDomainMapping', () => {
    it('should add manual domain mapping', () => {
      domainMapper.addDomainMapping('example.com', [1, 2], 0.8);
      
      const mapping = domainMapper.getDomainMapping('example.com');
      expect(mapping).toBeDefined();
      expect(mapping?.topicIds).toEqual([1, 2]);
      expect(mapping?.confidence).toBe(0.8);
      expect(mapping?.source).toBe('manual');
    });

    it('should normalize domain when adding mapping', () => {
      domainMapper.addDomainMapping('https://www.Example.COM/path', [1], 0.9);
      
      const mapping = domainMapper.getDomainMapping('example.com');
      expect(mapping).toBeDefined();
      expect(mapping?.domain).toBe('example.com');
    });

    it('should clamp confidence values between 0 and 1', () => {
      domainMapper.addDomainMapping('example1.com', [1], -0.5);
      domainMapper.addDomainMapping('example2.com', [1], 1.5);
      
      const mapping1 = domainMapper.getDomainMapping('example1.com');
      const mapping2 = domainMapper.getDomainMapping('example2.com');
      
      expect(mapping1?.confidence).toBe(0);
      expect(mapping2?.confidence).toBe(1);
    });

    it('should throw error for invalid topic IDs', () => {
      expect(() => {
        domainMapper.addDomainMapping('example.com', [99999], 0.8);
      }).toThrow('Invalid topic ID: 99999');
    });
  });

  describe('removeDomainMapping', () => {
    it('should remove existing domain mapping', () => {
      domainMapper.addDomainMapping('example.com', [1], 0.8);
      expect(domainMapper.getDomainMapping('example.com')).toBeDefined();
      
      const removed = domainMapper.removeDomainMapping('example.com');
      expect(removed).toBe(true);
      expect(domainMapper.getDomainMapping('example.com')).toBeUndefined();
    });

    it('should return false for non-existent domain', () => {
      const removed = domainMapper.removeDomainMapping('nonexistent.com');
      expect(removed).toBe(false);
    });
  });

  describe('classifyDomains', () => {
    it('should classify multiple domains', async () => {
      const domains = ['netflix.com', 'spotify.com', 'unknown.com'];
      const results = await domainMapper.classifyDomains(domains);
      
      expect(results).toHaveLength(3);
      expect(results[0].domain).toBe('netflix.com');
      expect(results[0].topicIds.length).toBeGreaterThan(0);
      expect(results[1].domain).toBe('spotify.com');
      expect(results[1].topicIds.length).toBeGreaterThan(0);
      expect(results[2].domain).toBe('unknown.com');
    });

    it('should handle errors gracefully in batch processing', async () => {
      const domains = ['netflix.com', 'invalid..domain', 'spotify.com'];
      const results = await domainMapper.classifyDomains(domains);
      
      expect(results).toHaveLength(3);
      // Should still process valid domains even if one fails
      expect(results[0].topicIds.length).toBeGreaterThan(0);
      expect(results[2].topicIds.length).toBeGreaterThan(0);
    });
  });

  describe('getDomainsForTopic', () => {
    it('should return domains mapped to a specific topic', () => {
      const domains = domainMapper.getDomainsForTopic(2); // Movies
      
      expect(domains.length).toBeGreaterThan(0);
      expect(domains).toContain('netflix.com');
      expect(domains).toContain('imdb.com');
    });

    it('should return empty array for topic with no domains', () => {
      const domains = domainMapper.getDomainsForTopic(99999);
      expect(domains).toEqual([]);
    });
  });

  describe('keyword matching', () => {
    it('should match multiple keywords in domain', async () => {
      const result = await domainMapper.classifyDomain('musicgaming.com');
      
      expect(result.topicIds.length).toBeGreaterThan(0);
      expect(result.matchedKeywords).toContain('music');
      expect(result.matchedKeywords).toContain('gaming');
      expect(result.source).toBe('keyword');
    });

    it('should prioritize better keyword matches', async () => {
      const result = await domainMapper.classifyDomain('moviestreaming.com');
      
      expect(result.topicIds).toContain(2); // Movies should be included
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should limit results to top 3 topics', async () => {
      const result = await domainMapper.classifyDomain('sportsmoviegamingmusic.com');
      
      expect(result.topicIds.length).toBeLessThanOrEqual(3);
    });
  });

  describe('domain normalization', () => {
    it('should normalize various domain formats', async () => {
      const testCases = [
        'https://www.example.com',
        'http://example.com/',
        'EXAMPLE.COM',
        'example.com:8080',
        'www.example.com/path?param=value'
      ];

      for (const domain of testCases) {
        const result = await domainMapper.classifyDomain(domain);
        expect(result.domain).toBe('example.com');
      }
    });
  });

  describe('predefined mappings', () => {
    it('should have entertainment domain mappings', () => {
      const netflixMapping = domainMapper.getDomainMapping('netflix.com');
      const youtubeMapping = domainMapper.getDomainMapping('youtube.com');
      
      expect(netflixMapping).toBeDefined();
      expect(netflixMapping?.topicIds).toContain(2); // Movies
      expect(youtubeMapping).toBeDefined();
      expect(youtubeMapping?.topicIds).toContain(1); // Arts & Entertainment
    });

    it('should have technology domain mappings', () => {
      const appleMapping = domainMapper.getDomainMapping('apple.com');
      const googleMapping = domainMapper.getDomainMapping('google.com');
      
      expect(appleMapping).toBeDefined();
      expect(appleMapping?.topicIds).toContain(15); // Technology
      expect(googleMapping).toBeDefined();
      expect(googleMapping?.topicIds).toContain(15); // Technology
    });

    it('should have sports domain mappings', () => {
      const espnMapping = domainMapper.getDomainMapping('espn.com');
      const nflMapping = domainMapper.getDomainMapping('nfl.com');
      
      expect(espnMapping).toBeDefined();
      expect(espnMapping?.topicIds).toContain(29); // Sports
      expect(nflMapping).toBeDefined();
      expect(nflMapping?.topicIds).toContain(31); // NFL
    });

    it('should have business domain mappings', () => {
      const bloombergMapping = domainMapper.getDomainMapping('bloomberg.com');
      const coinbaseMapping = domainMapper.getDomainMapping('coinbase.com');
      
      expect(bloombergMapping).toBeDefined();
      expect(bloombergMapping?.topicIds).toContain(21); // Business & Finance
      expect(coinbaseMapping).toBeDefined();
      expect(coinbaseMapping?.topicIds).toContain(24); // Cryptocurrency
    });
  });

  describe('confidence scoring', () => {
    it('should have high confidence for exact matches', async () => {
      const result = await domainMapper.classifyDomain('netflix.com');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should have reduced confidence for subdomain matches', async () => {
      const result = await domainMapper.classifyDomain('news.google.com');
      expect(result.confidence).toBeLessThan(0.9);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should have lower confidence for keyword matches', async () => {
      const result = await domainMapper.classifyDomain('unknowngaming.com');
      expect(result.confidence).toBeLessThan(0.8);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('clearMappings', () => {
    it('should clear all mappings and reset initialization', () => {
      const mappings = domainMapper.getAllDomainMappings();
      expect(mappings.size).toBeGreaterThan(0);
      
      domainMapper.clearMappings();
      const clearedMappings = domainMapper.getAllDomainMappings();
      expect(clearedMappings.size).toBe(0);
    });
  });
});