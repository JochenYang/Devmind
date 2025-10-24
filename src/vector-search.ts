import { pipeline } from "@xenova/transformers";
import { Context, ContextSearchParams } from "./types.js";
import { QueryEnhancer } from "./utils/query-enhancer.js";

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
  private queryEnhancer: QueryEnhancer;

  constructor(config: Partial<VectorSearchConfig> = {}) {
    this.config = {
      model_name: "Xenova/all-MiniLM-L6-v2",
      dimensions: 384,
      similarity_threshold: 0.5,
      hybrid_weight: 0.7,
      cache_embeddings: true,
      ...config,
    };
    this.queryEnhancer = new QueryEnhancer();
  }

  /**
   * 初始化embedding模型
   */
  async initialize(): Promise<void> {
    if (this.embeddingPipeline) return;

    try {
      // 静默加载模型，不输出日志可能干扰MCP协议
      this.embeddingPipeline = await pipeline(
        "feature-extraction",
        this.config.model_name,
        {
          quantized: true,
          progress_callback: undefined, // 禁用进度日志
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
  async generateEmbedding(
    text: string,
    isQuery: boolean = false
  ): Promise<number[]> {
    if (!this.embeddingPipeline) {
      await this.initialize();
    }

    // 检查缓存
    const cacheKey = text.trim().toLowerCase();
    if (this.config.cache_embeddings && this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    try {
      // 🚀 查询增强：仅对查询文本进行增强，不增强存储内容
      let processedText = text;
      if (isQuery) {
        const enhancement = this.queryEnhancer.enhance(text);
        processedText = enhancement.enhanced;
        // console.log('[Query Enhanced]', { original: text, enhanced: processedText });
      }

      // 预处理文本
      const cleanText = this.preprocessText(processedText);

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
      console.error("Failed to generate embedding:", error);
      throw new Error(`Embedding generation failed: ${error}`);
    }
  }

  /**
   * 预处理文本，清理和标准化
   */
  private preprocessText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, " ") // 标准化空格
      .slice(0, 512); // 限制长度避免模型限制
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
        const tensorData = Array.isArray(output.data)
          ? output.data
          : output.data.data || output.data;

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
        const tensorData = Array.isArray(output.data)
          ? output.data
          : output.data.data || output.data;
        return this.normalizeVector([...tensorData]);
      }
    }

    // 尝试直接数组格式
    if (
      Array.isArray(output) &&
      output.length > 0 &&
      typeof output[0] === "number"
    ) {
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
    return vector.map((val) => val / norm);
  }

  /**
   * 计算余弦相似度
   */
  public cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error("Vectors must have the same dimensions");
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
      // 🚀 生成查询的embedding（启用查询增强）
      const queryEmbedding = await this.generateEmbedding(query, true);

      // 计算相似度并排序
      const resultsWithSimilarity = await Promise.all(
        contexts.map(async (context) => {
          let similarity = 0;

          // 检查是否已有embedding
          if (context.embedding_text) {
            try {
              const contextEmbedding = JSON.parse(context.embedding_text);
              similarity = this.cosineSimilarity(
                queryEmbedding,
                contextEmbedding
              );
            } catch (error) {
              console.warn("Failed to parse stored embedding:", error);
            }
          } else {
            // 动态生成embedding
            const contextEmbedding = await this.generateEmbedding(
              context.content
            );
            similarity = this.cosineSimilarity(
              queryEmbedding,
              contextEmbedding
            );

            // 可以选择存储到数据库，这里暂时跳过以避免性能问题
          }

          return {
            ...context,
            similarity,
            hybrid_score: similarity,
          };
        })
      );

      // 过滤低相似度结果
      const threshold =
        params.similarity_threshold || this.config.similarity_threshold;
      const filtered = resultsWithSimilarity.filter(
        (result) => (result.similarity || 0) >= threshold
      );

      // 按相似度排序
      filtered.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

      // 应用限制
      const limit = params.limit || 20;
      return filtered.slice(0, limit);
    } catch (error) {
      console.error("Semantic search failed:", error);
      // 失败时返回原始结果
      return contexts;
    }
  }

  /**
   * 混合搜索：结合关键词和语义搜索
   * 🚀 增强版: 整合多维度质量评分
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
      const semanticResults = await this.searchContexts(
        query,
        allContexts,
        params
      );

      // 计算混合分数
      const hybridWeight = params.hybrid_weight || this.config.hybrid_weight;
      const keywordWeight = 1 - hybridWeight;

      // 创建结果映射
      const resultMap = new Map<
        string,
        Context & { similarity?: number; hybrid_score?: number }
      >();

      // 添加关键词结果 (按位置给分)
      keywordResults.forEach((context, index) => {
        const keywordScore = Math.max(0, 1 - index / keywordResults.length);
        resultMap.set(context.id, {
          ...context,
          similarity: 0,
          hybrid_score: keywordScore * keywordWeight,
        });
      });

      // 添加或更新语义搜索结果
      semanticResults.forEach((result) => {
        const existing = resultMap.get(result.id);
        if (existing) {
          // 结合两个分数
          existing.similarity = result.similarity || 0;
          existing.hybrid_score =
            (existing.hybrid_score || 0) +
            (result.similarity || 0) * hybridWeight;
        } else {
          // 新的语义结果
          resultMap.set(result.id, {
            ...result,
            hybrid_score: (result.similarity || 0) * hybridWeight,
          });
        }
      });

      // 转换为数组
      const hybridResults = Array.from(resultMap.values());

      // 🚀 应用多维度质量评分加权
      const qualityWeightedResults =
        this.applyQualityScoreWeighting(hybridResults);

      // 🚀 文件类型权重调整：根据查询意图优化结果
      const adjustedResults = this.applyFileTypeWeights(
        query,
        qualityWeightedResults
      );

      // 最终排序
      adjustedResults.sort(
        (a, b) => (b.hybrid_score || 0) - (a.hybrid_score || 0)
      );

      // 应用限制
      const limit = params.limit || 20;
      return adjustedResults.slice(0, limit);
    } catch (error) {
      console.error("Hybrid search failed:", error);
      return keywordResults;
    }
  }

  /**
   * 🚀 应用多维度质量评分加权
   *
   * 综合考虑:
   * - 语义相似度 (50%)
   * - 质量评分相关性 (30%) - 使用频率
   * - 时间新鲜度 (20%)
   */
  private applyQualityScoreWeighting(
    results: Array<Context & { similarity?: number; hybrid_score?: number }>
  ): Array<Context & { similarity?: number; hybrid_score?: number }> {
    return results.map((context) => {
      const metadata = context.metadata ? JSON.parse(context.metadata) : {};
      const qualityMetrics = metadata.quality_metrics || {};

      // 提取多维度评分
      const relevance = qualityMetrics.relevance || 0.5;
      const freshness = qualityMetrics.freshness || 0.5;
      const usefulness = qualityMetrics.usefulness || 0.5;

      // 原始混合分数
      const baseScore = context.hybrid_score || 0;

      // 综合加权 (可调整权重)
      const finalScore =
        baseScore * 0.5 + // 语义相似度 50%
        relevance * 0.3 + // 相关性 30%
        freshness * 0.15 + // 新鲜度 15%
        usefulness * 0.05; // 实用性 5%

      return {
        ...context,
        hybrid_score: finalScore,
      };
    });
  }

  /**
   * 计算最终评分（多维度）
   * @param context 上下文对象
   * @param semanticScore 语义相似度分数
   * @param keywordScore 关键词匹配分数
   */
  calculateFinalScore(
    context: Context,
    semanticScore: number,
    keywordScore: number
  ): number {
    // 计算时间新鲜度（指数衰减）
    const ageInDays =
      (Date.now() - new Date(context.created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    const freshnessScore = Math.exp(-ageInDays / 30); // 30天半衰期

    // 综合加权
    const finalScore =
      semanticScore * 0.4 + // 语义相似度 40%
      keywordScore * 0.3 + // 关键词匹配 30%
      context.quality_score * 0.2 + // 质量评分 20%
      freshnessScore * 0.1; // 时间新鲜度 10%

    return finalScore;
  }

  /**
   * 批量生成embedding（串行）
   */
  async batchGenerateEmbeddings(
    contexts: Context[]
  ): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();

    for (const context of contexts) {
      if (!context.embedding_text) {
        try {
          const embedding = await this.generateEmbedding(context.content);
          embeddings.set(context.id, embedding);
        } catch (error) {
          console.warn(
            `Failed to generate embedding for context ${context.id}:`,
            error
          );
        }
      }
    }

    return embeddings;
  }

  /**
   * 批量生成embedding（并行）
   * @param contexts 需要生成 embedding 的上下文列表
   * @param concurrency 并发数量（默认 5）
   */
  async batchGenerateEmbeddingsParallel(
    contexts: Context[],
    concurrency: number = 5
  ): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();

    // 过滤出需要生成 embedding 的 contexts
    const contextsToProcess = contexts.filter((c) => !c.embedding_text);

    if (contextsToProcess.length === 0) {
      return embeddings;
    }

    // 分批处理
    for (let i = 0; i < contextsToProcess.length; i += concurrency) {
      const batch = contextsToProcess.slice(i, i + concurrency);

      // 并行生成当前批次的 embeddings
      const promises = batch.map(async (context) => {
        try {
          const embedding = await this.generateEmbedding(context.content);
          return { id: context.id, embedding, error: null };
        } catch (error) {
          console.warn(
            `Failed to generate embedding for context ${context.id}:`,
            error
          );
          return { id: context.id, embedding: null, error };
        }
      });

      // 等待当前批次完成
      const results = await Promise.all(promises);

      // 收集成功的结果
      results.forEach(({ id, embedding }) => {
        if (embedding) {
          embeddings.set(id, embedding);
        }
      });
    }

    return embeddings;
  }

  /**
   * 🚀 根据查询意图调整文件类型权重
   */
  private applyFileTypeWeights(
    query: string,
    results: Array<Context & { similarity?: number; hybrid_score?: number }>
  ): Array<Context & { similarity?: number; hybrid_score?: number }> {
    // 检测查询意图
    const enhancement = this.queryEnhancer.enhance(query);
    const { intent } = enhancement;

    // 如果是通用查询，不调整权重
    if (intent === "general") {
      return results;
    }

    // 获取文件类型权重提示
    const hints = this.queryEnhancer.getFileTypeHints(intent);

    // 为每个结果调整分数
    results.forEach((result) => {
      if (!result.file_path || !result.hybrid_score) return;

      let weightMultiplier = 1.0;

      // 检查文件路径是否匹配权重规则
      for (const [pattern, weight] of Object.entries(hints.weights)) {
        if (result.file_path.includes(pattern)) {
          weightMultiplier = Math.max(weightMultiplier, weight);
        }
      }

      // 应用权重调整
      if (weightMultiplier !== 1.0) {
        result.hybrid_score = result.hybrid_score * weightMultiplier;
      }
    });

    // 重新排序
    results.sort((a, b) => (b.hybrid_score || 0) - (a.hybrid_score || 0));

    return results;
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
      dimensions: this.config.dimensions,
    };
  }
}
