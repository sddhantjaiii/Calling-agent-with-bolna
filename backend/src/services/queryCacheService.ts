/**
 * Query Cache Service
 * Provides in-memory caching for database queries with automatic invalidation
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

interface CacheInvalidationRule {
  pattern: string | RegExp;
  tables: string[];
}

class QueryCacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000; // Maximum number of cached entries
  
  /**
   * Cache invalidation rules
   * When a table is modified, all cache keys matching the patterns are cleared
   */
  private invalidationRules: CacheInvalidationRule[] = [
    // Agent queries
    { pattern: /^agents:/, tables: ['agents', 'users'] },
    
    // Contact queries
    { pattern: /^contacts:/, tables: ['contacts', 'users'] },
    
    // Campaign queries
    { pattern: /^campaigns:/, tables: ['call_campaigns', 'call_queue', 'agents'] },
    
    // Call queries
    { pattern: /^calls:/, tables: ['calls', 'agents', 'contacts', 'users'] },
    
    // Stats queries (these are expensive)
    { pattern: /^stats:/, tables: ['calls', 'contacts', 'agents', 'call_campaigns', 'credit_transactions'] },
    
    // User queries
    { pattern: /^users:/, tables: ['users', 'credit_transactions'] }
  ];

  /**
   * Generate a cache key from query parameters
   */
  generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${JSON.stringify(params[key])}`)
      .join('&');
    return `${prefix}:${sortedParams}`;
  }

  /**
   * Get cached data
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache data
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    // Enforce max cache size (simple LRU)
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Delete a specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries matching a pattern
   */
  clearPattern(pattern: string | RegExp): number {
    let cleared = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Invalidate cache when a table is modified
   * This is called after INSERT, UPDATE, DELETE operations
   */
  invalidateTable(tableName: string): void {
    const rulesToApply = this.invalidationRules.filter(rule =>
      rule.tables.includes(tableName)
    );

    for (const rule of rulesToApply) {
      this.clearPattern(rule.pattern);
    }
  }

  /**
   * Invalidate multiple tables at once
   */
  invalidateTables(tableNames: string[]): void {
    for (const tableName of tableNames) {
      this.invalidateTable(tableName);
    }
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Wrap a database query with caching
   */
  async wrapQuery<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    // Check cache first
    const cached = this.get<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Execute query
    const result = await queryFn();

    // Cache the result
    this.set(cacheKey, result, ttl);

    return result;
  }
}

// Export singleton instance
export const queryCache = new QueryCacheService();
