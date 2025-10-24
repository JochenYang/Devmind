import { Context } from "./types.js";

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export class LRUCache<K, V> {
  private cache: Map<string, CacheEntry<V>>;
  private maxSize: number;
  private defaultTTL: number;

  constructor(options: { max: number; ttl: number }) {
    this.cache = new Map();
    this.maxSize = options.max;
    this.defaultTTL = options.ttl;
  }

  /**
   * 获取缓存值
   */
  get(key: K): V | undefined {
    const keyStr = this.serializeKey(key);
    const entry = this.cache.get(keyStr);

    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(keyStr);
      return undefined;
    }

    // LRU: 移到最后（重新插入）
    this.cache.delete(keyStr);
    this.cache.set(keyStr, entry);

    return entry.value;
  }

  /**
   * 设置缓存值
   */
  set(key: K, value: V, ttl?: number): void {
    const keyStr = this.serializeKey(key);

    // 如果已存在，先删除
    if (this.cache.has(keyStr)) {
      this.cache.delete(keyStr);
    }

    // 如果达到最大容量，删除最旧的（第一个）
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    // 添加新条目
    this.cache.set(keyStr, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 序列化键
   */
  private serializeKey(key: K): string {
    if (typeof key === "string") {
      return key;
    }
    return JSON.stringify(key);
  }
}

/**
 * 搜索结果缓存
 */
export interface SearchCacheKey {
  query: string;
  project_id?: string;
  session_id?: string;
  file_path?: string;
  limit?: number;
  similarity_threshold?: number;
}

export class SearchCache {
  private cache: LRUCache<SearchCacheKey, Context[]>;

  constructor() {
    // 缓存最近 100 个查询，TTL 5 分钟
    this.cache = new LRUCache<SearchCacheKey, Context[]>({
      max: 100,
      ttl: 5 * 60 * 1000,
    });
  }

  /**
   * 获取缓存的搜索结果
   */
  get(key: SearchCacheKey): Context[] | undefined {
    return this.cache.get(key);
  }

  /**
   * 缓存搜索结果
   */
  set(key: SearchCacheKey, results: Context[]): void {
    this.cache.set(key, results);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: 100,
    };
  }
}
