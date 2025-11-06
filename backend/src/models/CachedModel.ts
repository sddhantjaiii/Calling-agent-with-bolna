/**
 * Cached Model Base Class
 * Extends BaseModel with automatic query caching and invalidation
 */

import { BaseModel, BaseModelInterface } from './BaseModel';
import { queryCache } from '../services/queryCacheService';

export abstract class CachedModel<T extends BaseModelInterface> extends BaseModel<T> {
  /**
   * Table name - must be overridden by child classes
   */
  protected abstract tableName: string;

  /**
   * Cache TTL for different query types (in milliseconds)
   */
  protected cacheTTL = {
    findById: 5 * 60 * 1000,      // 5 minutes
    findAll: 2 * 60 * 1000,       // 2 minutes
    stats: 1 * 60 * 1000,         // 1 minute (stats change frequently)
    list: 2 * 60 * 1000           // 2 minutes
  };

  /**
   * Execute query with automatic caching
   */
  protected async cachedQuery<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    return queryCache.wrapQuery(cacheKey, queryFn, ttl);
  }

  /**
   * Execute query and invalidate cache for this table
   */
  protected async queryWithInvalidation<T>(
    query: string,
    params?: any[]
  ): Promise<T> {
    const result = await this.query(query, params);
    queryCache.invalidateTable(this.tableName);
    return result as T;
  }

  /**
   * Invalidate all cache entries for this table
   */
  protected invalidateCache(): void {
    queryCache.invalidateTable(this.tableName);
  }

  /**
   * Invalidate specific cache key
   */
  protected invalidateCacheKey(key: string): void {
    queryCache.delete(key);
  }

  /**
   * Generate cache key with table prefix
   */
  protected generateCacheKey(operation: string, params: Record<string, any>): string {
    return queryCache.generateKey(`${this.tableName}:${operation}`, params);
  }
}
