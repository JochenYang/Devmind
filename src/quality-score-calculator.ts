import { Context, QualityMetrics } from './types.js';

/**
 * 增强的多维度质量评分计算器
 * 
 * 特性:
 * 1. 时间衰减 - 新内容评分更高
 * 2. 使用频率 - 常用内容评分更高
 * 3. 内容质量 - 基于现有quality_score
 * 4. 多维度加权 - 综合评估
 */
export class QualityScoreCalculator {
  
  /**
   * 计算多维度质量评分
   */
  calculateQualityMetrics(context: Context): QualityMetrics {
    const metadata = context.metadata ? JSON.parse(context.metadata) : {};
    const existingMetrics = metadata.quality_metrics || {};
    
    // 1. 时间新鲜度 (时间衰减)
    const freshness = this.calculateFreshness(context.created_at, existingMetrics.last_accessed);
    
    // 2. 相关性 (基于使用频率)
    const relevance = this.calculateRelevance(
      existingMetrics.reference_count || 0,
      existingMetrics.search_count || 0
    );
    
    // 3. 完整性 (基于内容)
    const completeness = this.calculateCompleteness(context);
    
    // 4. 准确性 (基于验证)
    const accuracy = this.calculateAccuracy(existingMetrics.user_rating, context.quality_score);
    
    // 5. 实用性 (综合评估)
    const usefulness = this.calculateUsefulness(relevance, freshness, accuracy);
    
    // 6. 综合评分 (加权平均)
    const overall = this.calculateOverall({
      relevance,
      freshness,
      completeness,
      accuracy,
      usefulness
    });
    
    return {
      overall,
      relevance,
      freshness,
      completeness,
      accuracy,
      usefulness,
      reference_count: existingMetrics.reference_count || 0,
      search_count: existingMetrics.search_count || 0,
      last_accessed: existingMetrics.last_accessed || context.created_at,
      user_rating: existingMetrics.user_rating
    };
  }
  
  /**
   * 计算时间新鲜度 (时间衰减算法)
   * 
   * 规则:
   * - 7天内: 1.0
   * - 30天内: 0.8
   * - 90天内: 0.5
   * - 180天内: 0.3
   * - 180天+: 0.1
   */
  private calculateFreshness(createdAt: string, lastAccessed?: string): number {
    const referenceDate = lastAccessed || createdAt;
    const daysSinceUpdate = this.getDaysSince(referenceDate);
    
    if (daysSinceUpdate <= 7) return 1.0;
    if (daysSinceUpdate <= 30) return 0.8;
    if (daysSinceUpdate <= 90) return 0.5;
    if (daysSinceUpdate <= 180) return 0.3;
    return 0.1;
  }
  
  /**
   * 计算相关性 (基于使用频率)
   * 
   * 公式: log(1 + references * 2 + searches) / log(100) * 0.5 + 0.5
   * 确保范围在 [0.5, 1.0]
   */
  private calculateRelevance(referenceCount: number, searchCount: number): number {
    if (referenceCount === 0 && searchCount === 0) return 0.5;
    
    // 引用次数权重更高
    const weightedUsage = referenceCount * 2 + searchCount;
    
    // 对数缩放,避免极端值
    const score = Math.log(1 + weightedUsage) / Math.log(100);
    
    // 归一化到 [0.5, 1.0] 范围
    return Math.min(0.5 + score * 0.5, 1.0);
  }
  
  /**
   * 计算完整性 (基于内容丰富度)
   */
  private calculateCompleteness(context: Context): number {
    let score = 0.5;
    
    // 内容长度
    const contentLength = context.content.length;
    if (contentLength > 100) score += 0.1;
    if (contentLength > 300) score += 0.1;
    if (contentLength > 1000) score += 0.1;
    
    // 有文件路径
    if (context.file_path) score += 0.1;
    
    // 有代码行号
    if (context.line_start && context.line_end) score += 0.05;
    
    // 有标签
    if (context.tags && context.tags.length > 0) score += 0.05;
    
    // 有语言标识
    if (context.language) score += 0.05;
    
    return Math.min(score, 1.0);
  }
  
  /**
   * 计算准确性 (基于验证)
   */
  private calculateAccuracy(userRating?: number, qualityScore?: number): number {
    // 优先使用用户评分
    if (userRating !== undefined) {
      return Math.max(0, Math.min(userRating, 1));
    }
    
    // 否则使用原有质量评分
    if (qualityScore !== undefined) {
      return qualityScore;
    }
    
    // 默认中等准确性
    return 0.6;
  }
  
  /**
   * 计算实用性 (综合评估)
   */
  private calculateUsefulness(relevance: number, freshness: number, accuracy: number): number {
    // 加权平均: 相关性40%, 新鲜度30%, 准确性30%
    return relevance * 0.4 + freshness * 0.3 + accuracy * 0.3;
  }
  
  /**
   * 计算综合评分 (多维度加权)
   */
  private calculateOverall(metrics: Omit<QualityMetrics, 'overall' | 'reference_count' | 'search_count' | 'last_accessed' | 'user_rating'>): number {
    // 权重配置 (可根据场景调整)
    const weights = {
      relevance: 0.30,    // 相关性 (最重要)
      freshness: 0.25,    // 新鲜度
      accuracy: 0.20,     // 准确性
      usefulness: 0.15,   // 实用性
      completeness: 0.10  // 完整性
    };
    
    return (
      metrics.relevance * weights.relevance +
      metrics.freshness * weights.freshness +
      metrics.accuracy * weights.accuracy +
      metrics.usefulness * weights.usefulness +
      metrics.completeness * weights.completeness
    );
  }
  
  /**
   * 计算距离现在的天数
   */
  private getDaysSince(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
  
  /**
   * 更新context的质量评分 (返回更新后的metadata)
   */
  updateContextQualityMetrics(context: Context): string {
    const metrics = this.calculateQualityMetrics(context);
    const metadata = context.metadata ? JSON.parse(context.metadata) : {};
    
    metadata.quality_metrics = metrics;
    
    return JSON.stringify(metadata);
  }
}
