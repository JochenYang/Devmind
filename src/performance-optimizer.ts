import { VectorSearchEngine } from './vector-search.js';
import { DatabaseManager } from './database.js';
import { Context } from './types.js';

/**
 * 性能优化器 - 提供向量搜索性能优化功能
 */
export class PerformanceOptimizer {
  private vectorSearch: VectorSearchEngine;
  private db: DatabaseManager;
  
  // 性能缓存
  private embeddingCache = new Map<string, number[]>();
  private searchCache = new Map<string, any>();
  private batchQueue: Context[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  
  // 配置参数
  private config = {
    batchSize: 50,
    batchDelay: 5000, // 5秒
    cacheSize: 1000,
    searchCacheTimeout: 300000, // 5分钟
  };

  constructor(vectorSearch: VectorSearchEngine, db: DatabaseManager) {
    this.vectorSearch = vectorSearch;
    this.db = db;
    this.startBatchProcessor();
  }

  /**
   * 批量处理embedding生成
   */
  private startBatchProcessor(): void {
    // 每隔指定时间处理一批embedding
    setInterval(() => {
      this.processBatch();
    }, this.config.batchDelay);
  }

  /**
   * 添加到批量队列
   */
  async queueForEmbedding(context: Context): Promise<void> {
    this.batchQueue.push(context);
    
    // 如果队列满了，立即处理
    if (this.batchQueue.length >= this.config.batchSize) {
      await this.processBatch();
    }
  }

  /**
   * 处理批量embedding生成
   */
  private async processBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0, this.config.batchSize);
    console.log(`Processing batch of ${batch.length} contexts for embedding generation`);

    const startTime = Date.now();
    let processed = 0;
    let errors = 0;

    for (const context of batch) {
      try {
        // 检查缓存
        const cacheKey = this.getContextCacheKey(context);
        let embedding = this.embeddingCache.get(cacheKey);
        
        if (!embedding) {
          embedding = await this.vectorSearch.generateEmbedding(context.content);
          this.cacheEmbedding(cacheKey, embedding);
        }
        
        // 更新数据库
        const embeddingText = JSON.stringify(embedding);
        this.db.updateContextEmbedding(context.id, embedding, embeddingText, 'v1.0');
        
        processed++;
      } catch (error) {
        console.error(`Failed to process context ${context.id}:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Batch processed: ${processed} success, ${errors} errors, ${duration}ms`);
  }

  /**
   * 智能搜索缓存
   */
  async cachedSemanticSearch(
    query: string,
    contexts: Context[],
    params: any
  ): Promise<any> {
    const cacheKey = this.getSearchCacheKey(query, params);
    
    // 检查缓存
    const cached = this.searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.config.searchCacheTimeout) {
      return cached.results;
    }

    // 执行搜索
    const results = await this.vectorSearch.searchContexts(query, contexts, params);
    
    // 缓存结果
    this.searchCache.set(cacheKey, {
      results,
      timestamp: Date.now()
    });

    // 清理过期缓存
    this.cleanupSearchCache();
    
    return results;
  }

  /**
   * 预计算常用embedding
   */
  async precomputeEmbeddings(commonQueries: string[]): Promise<void> {
    console.log(`Precomputing embeddings for ${commonQueries.length} common queries`);
    
    for (const query of commonQueries) {
      try {
        const embedding = await this.vectorSearch.generateEmbedding(query);
        this.cacheEmbedding(query, embedding);
      } catch (error) {
        console.error(`Failed to precompute embedding for "${query}":`, error);
      }
    }
  }

  /**
   * 相似度计算优化 - 使用近似算法提高速度
   */
  approximateCosineSimilarity(vec1: number[], vec2: number[]): number {
    // 对于大向量，使用采样计算近似相似度
    if (vec1.length > 512) {
      return this.sampleCosineSimilarity(vec1, vec2, 256);
    }
    
    return this.vectorSearch.cosineSimilarity(vec1, vec2);
  }

  /**
   * 采样计算余弦相似度（用于大向量的近似计算）
   */
  private sampleCosineSimilarity(vec1: number[], vec2: number[], sampleSize: number): number {
    const step = Math.floor(vec1.length / sampleSize);
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i += step) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 多级搜索：先粗筛后精排
   */
  async hierarchicalSearch(
    query: string,
    contexts: Context[],
    params: any
  ): Promise<any> {
    const totalContexts = contexts.length;
    
    // 第一轮：低精度快速筛选（保留前50%）
    const roughCandidates = await this.roughFilter(query, contexts, Math.floor(totalContexts * 0.5));
    
    // 第二轮：高精度精确排序
    const finalResults = await this.vectorSearch.searchContexts(query, roughCandidates, {
      ...params,
      similarity_threshold: params.similarity_threshold || 0.5
    });
    
    return finalResults;
  }

  /**
   * 粗筛算法 - 使用简化计算
   */
  private async roughFilter(query: string, contexts: Context[], keepCount: number): Promise<Context[]> {
    const queryEmbedding = await this.vectorSearch.generateEmbedding(query);
    
    const scored = await Promise.all(contexts.map(async (context) => {
      let embedding: number[];
      
      if (context.embedding_text) {
        embedding = JSON.parse(context.embedding_text);
      } else {
        embedding = await this.vectorSearch.generateEmbedding(context.content);
      }
      
      // 使用近似相似度计算
      const score = this.approximateCosineSimilarity(queryEmbedding, embedding);
      
      return { context, score };
    }));
    
    // 按分数排序并返回前N个
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, keepCount).map(item => item.context);
  }

  /**
   * 缓存管理
   */
  private cacheEmbedding(key: string, embedding: number[]): void {
    if (this.embeddingCache.size >= this.config.cacheSize) {
      // 删除最旧的缓存项
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey !== undefined) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(key, embedding);
  }

  private getContextCacheKey(context: Context): string {
    return `context_${context.id}_${context.content.length}`;
  }

  private getSearchCacheKey(query: string, params: any): string {
    return `search_${query}_${JSON.stringify(params)}`;
  }

  private cleanupSearchCache(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [key, value] of this.searchCache.entries()) {
      if ((now - value.timestamp) > this.config.searchCacheTimeout) {
        toDelete.push(key);
      }
    }
    
    toDelete.forEach(key => this.searchCache.delete(key));
  }

  /**
   * 性能统计
   */
  getPerformanceStats(): {
    embeddingCacheSize: number;
    searchCacheSize: number;
    batchQueueSize: number;
    config: any;
  } {
    return {
      embeddingCacheSize: this.embeddingCache.size,
      searchCacheSize: this.searchCache.size,
      batchQueueSize: this.batchQueue.length,
      config: this.config
    };
  }

  /**
   * 清理所有缓存
   */
  clearAllCaches(): void {
    this.embeddingCache.clear();
    this.searchCache.clear();
    this.batchQueue.length = 0;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
  }
}