import { pipeline } from '@xenova/transformers';
import { Context, ContextSearchParams } from './types.js';

export interface VectorSearchConfig {
  model_name: string;
  dimensions: number;
  similarity_threshold: number;
  hybrid_weight: number; // 0-1: 0=pure keyword, 1=pure semantic
  cache_embeddings: boolean;
}

export class VectorSearchEngine {
  private embeddingPipeline: any = null;
  private config: VectorSearchConfig;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(config: Partial<VectorSearchConfig> = {}) {
    this.config = {
      model_name: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      similarity_threshold: 0.5,
      hybrid_weight: 0.7,
      cache_embeddings: true,
      ...config
    };
  }

  /**
   * 初始化embedding模型
   */
  async initialize(): Promise<void> {
    if (this.embeddingPipeline) return;

    try {
      // 静默加载模型，不输出日志可能干扰MCP协议
      this.embeddingPipeline = await pipeline(
        'feature-extraction', 
        this.config.model_name,
        { 
          quantized: true,
          progress_callback: undefined // 禁用进度日志
        }
      );
    } catch (error) {
      // 静默失败，不抛出错误
      this.embeddingPipeline = null;
    }
  }

  /**
   * 生成文本的embedding向量
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingPipeline) {
      await this.initialize();
    }

    // 检查缓存
    const cacheKey = text.trim().toLowerCase();
    if (this.config.cache_embeddings && this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    try {
      // 预处理文本
      const cleanText = this.preprocessText(text);
      
      // 生成embedding
      const output = await this.embeddingPipeline!(cleanText);
      
      // 提取embedding向量 (通常是最后一个维度的平均值)
      const embedding = this.extractEmbedding(output);
      
      // 缓存结果
      if (this.config.cache_embeddings) {
        this.embeddingCache.set(cacheKey, embedding);
      }
      
      return embedding;
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw new Error(`Embedding generation failed: ${error}`);
    }
  }

  /**
   * 预处理文本，清理和标准化
   */
  private preprocessText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')  // 标准化空格
      .slice(0, 512);        // 限制长度避免模型限制
  }

  /**
   * 从模型输出中提取embedding向量
   */
  private extractEmbedding(output: any): number[] {
    // Transformers.js 返回的是Tensor对象
    if (output && output.dims && output.data) {
      const dims = output.dims;
      
      // 对于sentence transformer模型，输出形状通常是 [batch_size, seq_len, hidden_size]
      if (dims.length === 3) {
        const [batchSize, seqLen, hiddenSize] = dims;
        
        // 提取数据 - Transformers.js返回Float32Array格式的tensor数据
        const tensorData = Array.from(output.data as Float32Array);
        
        // 平均池化：对每个批次和序列位置求平均
        const embedding: number[] = new Array(hiddenSize).fill(0);
        
        for (let b = 0; b < batchSize; b++) {
          for (let s = 0; s < seqLen; s++) {
            for (let h = 0; h < hiddenSize; h++) {
              const idx = b * seqLen * hiddenSize + s * hiddenSize + h;
              embedding[h] += tensorData[idx];
            }
          }
        }
        
        // 取平均值
        for (let i = 0; i < hiddenSize; i++) {
          embedding[i] = embedding[i] / (batchSize * seqLen);
        }
        
        return this.normalizeVector(embedding);
      }
      
      // 对于2D输出 [seq_len, hidden_size]
      if (dims.length === 2) {
        const [seqLen, hiddenSize] = dims;
        const tensorData = Array.isArray(output.data) ? output.data : output.data.data || output.data;
        
        const embedding: number[] = new Array(hiddenSize).fill(0);
        
        for (let s = 0; s < seqLen; s++) {
          for (let h = 0; h < hiddenSize; h++) {
            const idx = s * hiddenSize + h;
            embedding[h] += tensorData[idx];
          }
        }
        
        // 平均池化
        for (let i = 0; i < hiddenSize; i++) {
          embedding[i] = embedding[i] / seqLen;
        }
        
        return this.normalizeVector(embedding);
      }
      
      // 对于1D输出（已经池化的结果）
      if (dims.length === 1) {
        const tensorData = Array.isArray(output.data) ? output.data : output.data.data || output.data;
        return this.normalizeVector([...tensorData]);
      }
    }
    
    // 尝试直接数组格式
    if (Array.isArray(output) && output.length > 0 && typeof output[0] === 'number') {
      return this.normalizeVector([...output]);
    }
    
    
    throw new Error(`Unable to extract embedding from output format`);
  }

  /**
   * 向量归一化
   */
  private normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return vector;
    return vector.map(val => val / norm);
  }

  /**
   * 计算余弦相似度
   */
  public cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 对上下文进行语义搜索
   */
  async searchContexts(
    query: string, 
    contexts: Context[], 
    params: ContextSearchParams
  ): Promise<Array<Context & { similarity?: number; hybrid_score?: number }>> {
    if (!params.use_semantic_search || contexts.length === 0) {
      return contexts;
    }

    try {
      // 生成查询的embedding
      const queryEmbedding = await this.generateEmbedding(query);
      
      // 计算相似度并排序
      const resultsWithSimilarity = await Promise.all(
        contexts.map(async (context) => {
          let similarity = 0;
          
          // 检查是否已有embedding
          if (context.embedding_text) {
            try {
              const contextEmbedding = JSON.parse(context.embedding_text);
              similarity = this.cosineSimilarity(queryEmbedding, contextEmbedding);
            } catch (error) {
              console.warn('Failed to parse stored embedding:', error);
            }
          } else {
            // 动态生成embedding
            const contextEmbedding = await this.generateEmbedding(context.content);
            similarity = this.cosineSimilarity(queryEmbedding, contextEmbedding);
            
            // 可以选择存储到数据库，这里暂时跳过以避免性能问题
          }
          
          return {
            ...context,
            similarity,
            hybrid_score: similarity
          };
        })
      );
      
      // 过滤低相似度结果
      const threshold = params.similarity_threshold || this.config.similarity_threshold;
      const filtered = resultsWithSimilarity.filter(
        result => (result.similarity || 0) >= threshold
      );
      
      // 按相似度排序
      filtered.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
      
      // 应用限制
      const limit = params.limit || 20;
      return filtered.slice(0, limit);
      
    } catch (error) {
      console.error('Semantic search failed:', error);
      // 失败时返回原始结果
      return contexts;
    }
  }

  /**
   * 混合搜索：结合关键词和语义搜索
   */
  async hybridSearch(
    query: string,
    keywordResults: Context[],
    allContexts: Context[],
    params: ContextSearchParams
  ): Promise<Array<Context & { similarity?: number; hybrid_score?: number }>> {
    if (!params.use_semantic_search) {
      return keywordResults;
    }

    try {
      // 获取语义搜索结果
      const semanticResults = await this.searchContexts(query, allContexts, params);
      
      // 计算混合分数
      const hybridWeight = params.hybrid_weight || this.config.hybrid_weight;
      const keywordWeight = 1 - hybridWeight;
      
      // 创建结果映射
      const resultMap = new Map<string, Context & { similarity?: number; hybrid_score?: number }>();
      
      // 添加关键词结果 (按位置给分)
      keywordResults.forEach((context, index) => {
        const keywordScore = Math.max(0, 1 - (index / keywordResults.length));
        resultMap.set(context.id, {
          ...context,
          similarity: 0,
          hybrid_score: keywordScore * keywordWeight
        });
      });
      
      // 添加或更新语义搜索结果
      semanticResults.forEach((result) => {
        const existing = resultMap.get(result.id);
        if (existing) {
          // 结合两个分数
          existing.similarity = result.similarity || 0;
          existing.hybrid_score = (existing.hybrid_score || 0) + 
                                  (result.similarity || 0) * hybridWeight;
        } else {
          // 新的语义结果
          resultMap.set(result.id, {
            ...result,
            hybrid_score: (result.similarity || 0) * hybridWeight
          });
        }
      });
      
      // 转换为数组并排序
      const hybridResults = Array.from(resultMap.values());
      hybridResults.sort((a, b) => (b.hybrid_score || 0) - (a.hybrid_score || 0));
      
      // 应用限制
      const limit = params.limit || 20;
      return hybridResults.slice(0, limit);
      
    } catch (error) {
      console.error('Hybrid search failed:', error);
      return keywordResults;
    }
  }

  /**
   * 批量生成embedding
   */
  async batchGenerateEmbeddings(contexts: Context[]): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();
    
    for (const context of contexts) {
      if (!context.embedding_text) {
        try {
          const embedding = await this.generateEmbedding(context.content);
          embeddings.set(context.id, embedding);
        } catch (error) {
          console.warn(`Failed to generate embedding for context ${context.id}:`, error);
        }
      }
    }
    
    return embeddings;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; model: string; dimensions: number } {
    return {
      size: this.embeddingCache.size,
      model: this.config.model_name,
      dimensions: this.config.dimensions
    };
  }
}