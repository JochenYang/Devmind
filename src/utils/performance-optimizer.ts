/**
 * 性能优化器（v2.2.0）
 *
 * 功能：
 * 1. 缓存管理
 * 2. 异步并发控制
 * 3. 内存优化
 * 4. 错误处理与重试机制
 * 5. 性能监控
 */

export interface PerformanceConfig {
  maxCacheSize?: number;
  cacheTTL?: number; // 毫秒
  maxConcurrent?: number;
  retryAttempts?: number;
  retryDelay?: number; // 毫秒
  enableMetrics?: boolean;
}

export interface PerformanceMetrics {
  cacheHitRate: number;
  cacheSize: number;
  averageResponseTime: number;
  totalRequests: number;
  errorRate: number;
  memoryUsage?: {
    used: number;
    total: number;
    percentage: number;
  };
}

export interface CachedItem<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

export class PerformanceOptimizer {
  private cache = new Map<string, CachedItem<any>>();
  private metrics: PerformanceMetrics;
  private config: Required<PerformanceConfig>;
  private semaphores = new Map<string, Promise<any>>();

  constructor(config: PerformanceConfig = {}) {
    this.config = {
      maxCacheSize: 1000,
      cacheTTL: 5 * 60 * 1000, // 5分钟
      maxConcurrent: 10,
      retryAttempts: 3,
      retryDelay: 1000,
      enableMetrics: true,
      ...config,
    };

    this.metrics = {
      cacheHitRate: 0,
      cacheSize: 0,
      averageResponseTime: 0,
      totalRequests: 0,
      errorRate: 0,
    };

    // 启动缓存清理定时器
    this.startCacheCleanup();
  }

  // =============================================================================
  // 缓存管理
  // =============================================================================

  /**
   * 获取缓存项
   */
  get<T>(key: string): T | undefined {
    const item = this.cache.get(key);

    if (!item) {
      this.recordCacheMiss();
      return undefined;
    }

    // 检查过期时间
    if (Date.now() - item.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      this.recordCacheMiss();
      return undefined;
    }

    // 更新访问统计
    item.accessCount++;
    item.lastAccessed = Date.now();

    this.recordCacheHit();
    return item.data;
  }

  /**
   * 设置缓存项
   */
  set<T>(key: string, data: T): void {
    // 如果缓存已满，清理最久未使用的项
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
    });

    this.updateMetrics();
  }

  /**
   * 缓存是否存在
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    // 检查过期时间
    if (Date.now() - item.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.updateMetrics();
    }
    return deleted;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.updateMetrics();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hitRate: this.metrics.cacheHitRate,
    };
  }

  /**
   * 清理过期缓存项
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.config.cacheTTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.error(`[PerformanceOptimizer] Cleaned ${cleaned} expired cache items`);
      this.updateMetrics();
    }
  }

  /**
   * 启动缓存清理定时器
   */
  private startCacheCleanup(): void {
    setInterval(() => this.cleanup(), this.config.cacheTTL);
  }

  /**
   * 驱逐最久未使用的缓存项
   */
  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.error(`[PerformanceOptimizer] Evicted LRU cache item: ${oldestKey}`);
    }
  }

  // =============================================================================
  // 异步并发控制
  // =============================================================================

  /**
   * 限流执行
   */
  async throttle<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // 检查是否已有相同操作的并发请求
    if (this.semaphores.has(key)) {
      return this.semaphores.get(key);
    }

    // 执行函数
    const promise = fn()
      .finally(() => {
        this.semaphores.delete(key);
      });

    this.semaphores.set(key, promise);

    return promise;
  }

  /**
   * 并发控制执行
   */
  async executeWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    maxConcurrency?: number
  ): Promise<T[]> {
    const concurrency = maxConcurrency || this.config.maxConcurrent;
    const results: T[] = [];
    let currentIndex = 0;

    const executeNext = async (): Promise<void> => {
      const index = currentIndex++;
      if (index >= tasks.length) return;

      try {
        const result = await tasks[index]();
        results[index] = result;
      } catch (error) {
        console.error(`[PerformanceOptimizer] Task ${index} failed:`, error);
        throw error;
      }

      await executeNext();
    };

    // 创建并发池
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => executeNext());

    // 等待所有任务完成
    await Promise.all(workers);

    return results;
  }

  /**
   * 异步重试机制
   */
  async retry<T>(
    fn: () => Promise<T>,
    attempts?: number,
    delay?: number
  ): Promise<T> {
    const maxAttempts = attempts || this.config.retryAttempts;
    const retryDelay = delay || this.config.retryDelay;

    let lastError: any;

    for (let i = 1; i <= maxAttempts; i++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        console.error(`[PerformanceOptimizer] Attempt ${i}/${maxAttempts} failed:`, error?.message || error);

        if (i < maxAttempts) {
          await this.sleep(retryDelay * i);
        }
      }
    }

    throw lastError;
  }

  /**
   * 异步超时控制
   */
  async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =============================================================================
  // 内存优化
  // =============================================================================

  /**
   * 获取内存使用情况
   */
  getMemoryUsage(): PerformanceMetrics['memoryUsage'] {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const { heapUsed, heapTotal } = process.memoryUsage();
      return {
        used: heapUsed,
        total: heapTotal,
        percentage: (heapUsed / heapTotal) * 100,
      };
    }
    return undefined;
  }

  /**
   * 强制垃圾回收（如果可用）
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      console.error('[PerformanceOptimizer] Garbage collection triggered');
    } else {
      console.warn('[PerformanceOptimizer] Garbage collection not available');
    }
  }

  /**
   * 分析大对象
   */
  analyzeLargeObjects(thresholdBytes: number = 1024 * 1024): Array<{ key: string; size: number }> {
    // 简化实现，实际需要更复杂的对象大小计算
    const results: Array<{ key: string; size: number }> = [];

    for (const [key, item] of this.cache.entries()) {
      const size = this.estimateObjectSize(item.data);
      if (size > thresholdBytes) {
        results.push({ key, size });
      }
    }

    return results.sort((a, b) => b.size - a.size);
  }

  /**
   * 估算对象大小
   */
  private estimateObjectSize(obj: any): number {
    try {
      return JSON.stringify(obj).length;
    } catch {
      return 0;
    }
  }

  // =============================================================================
  // 性能监控
  // =============================================================================

  /**
   * 记录缓存命中
   */
  private recordCacheHit(): void {
    if (!this.config.enableMetrics) return;
    // 更新缓存命中率的逻辑会在 updateMetrics 中处理
  }

  /**
   * 记录缓存未命中
   */
  private recordCacheMiss(): void {
    if (!this.config.enableMetrics) return;
    // 逻辑同上
  }

  /**
   * 记录响应时间
   */
  recordResponseTime(timeMs: number): void {
    if (!this.config.enableMetrics) return;

    const alpha = 0.1; // 指数移动平均
    this.metrics.averageResponseTime =
      this.metrics.averageResponseTime === 0
        ? timeMs
        : this.metrics.averageResponseTime * (1 - alpha) + timeMs * alpha;
  }

  /**
   * 记录错误
   */
  recordError(): void {
    if (!this.config.enableMetrics) return;

    const alpha = 0.1;
    const errorRate = 1 / this.metrics.totalRequests;
    this.metrics.errorRate =
      this.metrics.errorRate === 0
        ? errorRate
        : this.metrics.errorRate * (1 - alpha) + errorRate * alpha;
  }

  /**
   * 更新指标
   */
  private updateMetrics(): void {
    this.metrics.cacheSize = this.cache.size;

    // 计算缓存命中率（简化实现）
    // 实际需要更精确的计数
    const hitCount = Array.from(this.cache.values()).reduce(
      (sum, item) => sum + item.accessCount,
      0
    );
    const totalAccess = hitCount + (this.metrics.totalRequests - hitCount);
    this.metrics.cacheHitRate = totalAccess > 0 ? hitCount / totalAccess : 0;

    // 记录内存使用
    this.metrics.memoryUsage = this.getMemoryUsage();
  }

  /**
   * 获取性能指标
   */
  getMetrics(): PerformanceMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * 打印性能报告
   */
  printReport(): void {
    const metrics = this.getMetrics();
    const cacheStats = this.getCacheStats();

    console.log('\n📊 性能报告', '='.repeat(60));
    console.log(`缓存大小: ${cacheStats.size}/${cacheStats.maxSize}`);
    console.log(`缓存命中率: ${(cacheStats.hitRate * 100).toFixed(2)}%`);
    console.log(`平均响应时间: ${metrics.averageResponseTime.toFixed(2)}ms`);
    console.log(`总请求数: ${metrics.totalRequests}`);
    console.log(`错误率: ${(metrics.errorRate * 100).toFixed(2)}%`);

    if (metrics.memoryUsage) {
      console.log(`内存使用: ${(metrics.memoryUsage.used / 1024 / 1024).toFixed(2)}MB`);
      console.log(`内存占比: ${metrics.memoryUsage.percentage.toFixed(2)}%`);
    }

    // 找出访问最频繁的缓存项
    const topItems = Array.from(this.cache.entries())
      .sort((a, b) => b[1].accessCount - a[1].accessCount)
      .slice(0, 5);

    if (topItems.length > 0) {
      console.log('\n🔥 最热缓存项:');
      topItems.forEach(([key, item], i) => {
        console.log(`  ${i + 1}. ${key} (访问 ${item.accessCount} 次)`);
      });
    }
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.metrics = {
      cacheHitRate: 0,
      cacheSize: 0,
      averageResponseTime: 0,
      totalRequests: 0,
      errorRate: 0,
    };
    console.log('[PerformanceOptimizer] Metrics reset');
  }

  // =============================================================================
  // 性能优化装饰器
  // =============================================================================

  /**
   * 缓存装饰器
   */
  cached<T extends (...args: any[]) => any>(
    fn: T,
    getCacheKey?: (...args: Parameters<T>) => string
  ): T {
    return ((...args: Parameters<T>) => {
      const cacheKey = getCacheKey
        ? getCacheKey(...args)
        : `${fn.name}:${JSON.stringify(args)}`;

      const cached = this.get<ReturnType<T>>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      const startTime = Date.now();
      const result = fn(...args);
      const responseTime = Date.now() - startTime;

      // 如果是Promise，等待结果后缓存
      if (result && typeof result.then === 'function') {
        return result.then((value: any) => {
          this.set(cacheKey, value);
          this.recordResponseTime(responseTime);
          return value;
        });
      }

      // 同步函数，直接缓存
      this.set(cacheKey, result);
      this.recordResponseTime(responseTime);
      return result;
    }) as T;
  }

  /**
   * 性能监控装饰器
   */
  monitored<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: Parameters<T>) => {
      const startTime = Date.now();
      this.metrics.totalRequests++;

      try {
        const result = fn(...args);

        if (result && typeof result.then === 'function') {
          return result
            .then((value: any) => {
              this.recordResponseTime(Date.now() - startTime);
              return value;
            })
            .catch((error: any) => {
              this.recordError();
              throw error;
            });
        }

        this.recordResponseTime(Date.now() - startTime);
        return result;
      } catch (error) {
        this.recordError();
        throw error;
      }
    }) as T;
  }
}

// 单例实例
export const performanceOptimizer = new PerformanceOptimizer();
