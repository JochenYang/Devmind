/**
 * 批量操作处理器（v2.2.0）
 *
 * 功能：
 * 1. 批量记录上下文
 * 2. 批量搜索
 * 3. 智能聚合变更
 * 4. 并行处理优化
 * 5. 事务性操作
 */

import { ContextType } from '../types.js';
import { DatabaseManager } from '../database.js';

export interface BatchRecordItem {
  type: ContextType;
  content: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  language?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  session_id?: string;
  project_path?: string;
  force_remember?: boolean;
}

export interface BatchRecordOptions {
  session_id?: string;
  project_path?: string;
  autoCreateSession?: boolean;
  transaction?: boolean;
  batchSize?: number;
}

export interface BatchRecordResult {
  success: number;
  failed: number;
  context_ids: string[];
  errors: Array<{ index: number; error: string }>;
  aggregated_stats?: {
    total_files: number;
    total_lines_added: number;
    total_lines_deleted: number;
    change_types: Record<string, number>;
  };
}

export interface BatchSearchItem {
  query: string;
  project_id?: string;
  limit?: number;
  type?: string;
}

export interface BatchSearchOptions {
  parallel?: boolean;
  maxConcurrency?: number;
}

export interface BatchSearchResult {
  results: Array<{
    query: string;
    count: number;
    contexts: any[];
  }>;
  total_time: number;
}

export class BatchProcessor {
  constructor(private db: DatabaseManager) {}

  /**
   * 批量记录上下文
   */
  async batchRecordContext(
    items: BatchRecordItem[],
    options: BatchRecordOptions = {}
  ): Promise<BatchRecordResult> {
    const {
      session_id,
      project_path,
      autoCreateSession = true,
      transaction = false,
      batchSize = 50,
    } = options;

    const result: BatchRecordResult = {
      success: 0,
      failed: 0,
      context_ids: [],
      errors: [],
    };

    // 如果需要自动创建会话
    let finalSessionId = session_id;
    if (!finalSessionId && project_path && autoCreateSession) {
      // 这里需要调用 SessionManager，实际实现中会注入
      console.error('[BatchProcessor] Auto-create session requested, but SessionManager not injected');
    }

    // 分批处理
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResult = await this.processBatch(batch, i, finalSessionId, transaction);

      result.success += batchResult.success;
      result.failed += batchResult.failed;
      result.context_ids.push(...batchResult.context_ids);
      result.errors.push(...batchResult.errors);

      if (batchResult.aggregated_stats) {
        if (!result.aggregated_stats) {
          result.aggregated_stats = batchResult.aggregated_stats;
        } else {
          // 合并统计信息
          result.aggregated_stats.total_files += batchResult.aggregated_stats.total_files;
          result.aggregated_stats.total_lines_added += batchResult.aggregated_stats.total_lines_added;
          result.aggregated_stats.total_lines_deleted += batchResult.aggregated_stats.total_lines_deleted;

          // 合并变更类型统计
          Object.entries(batchResult.aggregated_stats.change_types).forEach(([type, count]) => {
            result.aggregated_stats!.change_types[type] =
              (result.aggregated_stats!.change_types[type] || 0) + count;
          });
        }
      }
    }

    return result;
  }

  /**
   * 处理单个批次
   */
  private async processBatch(
    items: BatchRecordItem[],
    startIndex: number,
    sessionId?: string,
    useTransaction: boolean = false
  ): Promise<BatchRecordResult> {
    const result: BatchRecordResult = {
      success: 0,
      failed: 0,
      context_ids: [],
      errors: [],
    };

    // 如果启用事务，需要开始事务（实际实现需要数据库支持）
    if (useTransaction) {
      console.error('[BatchProcessor] Transaction support not yet implemented');
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const globalIndex = startIndex + i;

      try {
        // 使用现有的 recordContext 逻辑
        // 这里需要调用 MCP server 的方法，实际实现中会注入
        const contextId = await this.recordSingleContext(item, sessionId);

        result.success++;
        result.context_ids.push(contextId);
      } catch (error) {
        result.failed++;
        result.errors.push({
          index: globalIndex,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 如果启用事务，需要提交事务
    if (useTransaction) {
      console.error('[BatchProcessor] Transaction commit not yet implemented');
    }

    return result;
  }

  /**
   * 记录单个上下文
   */
  private async recordSingleContext(item: BatchRecordItem, sessionId?: string): Promise<string> {
    // 这里是简化实现，实际需要调用完整的上下文记录逻辑
    // 包括：自动分类、上下文增强、会话管理等

    const contextId = this.db.createContext({
      session_id: sessionId || '',
      type: item.type,
      content: item.content,
      file_path: item.file_path,
      line_start: item.line_start,
      line_end: item.line_end,
      language: item.language,
      tags: (item.tags || []).join(','),
      quality_score: 0.7, // 默认评分
      metadata: JSON.stringify(item.metadata || {}),
    });

    return contextId;
  }

  /**
   * 批量搜索
   */
  async batchSearch(
    queries: BatchSearchItem[],
    options: BatchSearchOptions = {}
  ): Promise<BatchSearchResult> {
    const { parallel = true, maxConcurrency = 5 } = options;
    const startTime = Date.now();

    let results: BatchSearchResult['results'];

    if (parallel) {
      // 并行搜索
      results = await this.parallelSearch(queries, maxConcurrency);
    } else {
      // 串行搜索
      results = await this.sequentialSearch(queries);
    }

    const totalTime = Date.now() - startTime;

    return {
      results,
      total_time: totalTime,
    };
  }

  /**
   * 并行搜索
   */
  private async parallelSearch(
    queries: BatchSearchItem[],
    maxConcurrency: number
  ): Promise<BatchSearchResult['results']> {
    const results: BatchSearchResult['results'] = [];
    const concurrencyPool: Promise<void>[] = [];
    let currentIndex = 0;

    const searchNext = async () => {
      const index = currentIndex++;
      if (index >= queries.length) return;

      const query = queries[index];
      const contexts = this.db.searchContexts(
        query.query,
        query.project_id,
        query.limit || 20
      );

      results[index] = {
        query: query.query,
        count: contexts.length,
        contexts,
      };
    };

    // 创建并发池
    for (let i = 0; i < Math.min(maxConcurrency, queries.length); i++) {
      const promise = (async () => {
        while (currentIndex < queries.length) {
          await searchNext();
        }
      })();
      concurrencyPool.push(promise);
    }

    // 等待所有搜索完成
    await Promise.all(concurrencyPool);

    return results;
  }

  /**
   * 串行搜索
   */
  private async sequentialSearch(
    queries: BatchSearchItem[]
  ): Promise<BatchSearchResult['results']> {
    const results: BatchSearchResult['results'] = [];

    for (const query of queries) {
      const contexts = this.db.searchContexts(
        query.query,
        query.project_id,
        query.limit || 20
      );

      results.push({
        query: query.query,
        count: contexts.length,
        contexts,
      });
    }

    return results;
  }

  /**
   * 智能聚合多文件变更
   */
  aggregateFileChanges(changes: Array<{
    file: string;
    type: 'add' | 'modify' | 'delete';
    content: string;
    diff?: { additions: number; deletions: number };
  }>): BatchRecordItem {
    // 按文件分组
    const filesByType = changes.reduce((acc, change) => {
      if (!acc[change.type]) {
        acc[change.type] = [];
      }
      acc[change.type].push(change);
      return acc;
    }, {} as Record<string, typeof changes>);

    // 生成汇总内容
    const summaryLines: string[] = ['## 多文件变更汇总\n'];

    Object.entries(filesByType).forEach(([type, files]) => {
      summaryLines.push(`### ${type.toUpperCase()} (${files.length} files)\n`);

      files.forEach(file => {
        summaryLines.push(`- **${file.file}**`);
        if (file.diff) {
          summaryLines.push(
            ` (+${file.diff.additions}/-${file.diff.deletions} lines)`
          );
        }
        summaryLines.push('\n');

        // 添加内容摘要
        if (file.content) {
          const preview = file.content.substring(0, 200);
          summaryLines.push(`  \`\`\`\n${preview}\n  \`\`\`\n`);
        }
      });

      summaryLines.push('\n');
    });

    // 计算总体统计
    const totalAdded = changes.reduce((sum, c) => sum + (c.diff?.additions || 0), 0);
    const totalDeleted = changes.reduce((sum, c) => sum + (c.diff?.deletions || 0), 0);

    // 确定主要变更类型
    const primaryType = Object.entries(filesByType)
      .sort((a, b) => b[1].length - a[1].length)[0][0] as ContextType;

    const aggregatedItem: BatchRecordItem = {
      type: primaryType,
      content: summaryLines.join(''),
      metadata: {
        files_changed: changes.map(c => ({
          file_path: c.file,
          change_type: c.type,
          diff_stats: c.diff,
        })),
        diff_stats: {
          additions: totalAdded,
          deletions: totalDeleted,
          changes: changes.length,
        },
        aggregation_type: 'multi_file',
        total_files: changes.length,
      },
      tags: ['multi-file', `files:${changes.length}`],
      force_remember: true, // 批量变更需要强制记忆
    };

    return aggregatedItem;
  }

  /**
   * 优化大批量记录
   */
  async optimizeLargeBatch(
    items: BatchRecordItem[],
    options: {
      maxBatchSize?: number;
      enableDeduplication?: boolean;
      enableGrouping?: boolean;
    } = {}
  ): Promise<BatchRecordItem[]> {
    const { maxBatchSize = 100, enableDeduplication = true, enableGrouping = true } = options;

    let optimizedItems = [...items];

    // 去重
    if (enableDeduplication) {
      optimizedItems = this.deduplicateItems(optimizedItems);
    }

    // 分组相似项
    if (enableGrouping) {
      optimizedItems = this.groupSimilarItems(optimizedItems);
    }

    // 如果项太多，截断到最大值
    if (optimizedItems.length > maxBatchSize) {
      // 按重要性排序
      optimizedItems = optimizedItems
        .sort((a, b) => {
          const scoreA = (a.force_remember ? 100 : 0) + (a.metadata?.priority === 'critical' ? 50 : 0);
          const scoreB = (b.force_remember ? 100 : 0) + (b.metadata?.priority === 'critical' ? 50 : 0);
          return scoreB - scoreA;
        })
        .slice(0, maxBatchSize);

      console.error(`[BatchProcessor] Truncated batch from ${items.length} to ${maxBatchSize} items`);
    }

    return optimizedItems;
  }

  /**
   * 去重项目
   */
  private deduplicateItems(items: BatchRecordItem[]): BatchRecordItem[] {
    const seen = new Set<string>();
    const deduplicated: BatchRecordItem[] = [];

    for (const item of items) {
      const key = `${item.type}:${item.content.substring(0, 100)}:${item.file_path || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }

  /**
   * 分组相似项目
   */
  private groupSimilarItems(items: BatchRecordItem[]): BatchRecordItem[] {
    // 简单的相似分组实现
    // 实际可以更复杂，使用文本相似度算法

    const grouped: Record<string, BatchRecordItem[]> = {};

    items.forEach(item => {
      // 按类型分组
      const key = item.type;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
    });

    // 对每组进行处理
    const result: BatchRecordItem[] = [];

    Object.entries(grouped).forEach(([type, groupItems]) => {
      if (groupItems.length > 1) {
        // 如果同类型项太多，尝试合并
        if (groupItems.length >= 5) {
          const aggregated = this.aggregateSimilarItems(groupItems);
          result.push(...aggregated);
        } else {
          result.push(...groupItems);
        }
      } else {
        result.push(groupItems[0]);
      }
    });

    return result;
  }

  /**
   * 聚合相似项目
   */
  private aggregateSimilarItems(items: BatchRecordItem[]): BatchRecordItem[] {
    // 如果项目类型相同且数量不多，保持原样
    if (items.length <= 3) {
      return items;
    }

    // 否则尝试聚合
    const aggregated: BatchRecordItem = {
      type: items[0].type,
      content: `## 批量${items[0].type}操作 (${items.length}项)\n\n` +
        items.map((item, index) => `${index + 1}. ${item.content.substring(0, 100)}...`).join('\n\n'),
      metadata: {
        batch_count: items.length,
        batch_type: 'similar_items',
        original_count: items.length,
      },
      tags: ['batch', `count:${items.length}`],
      force_remember: true,
    };

    return [aggregated];
  }

  /**
   * 获取批量操作统计
   */
  getBatchStats(result: BatchRecordResult | BatchSearchResult): {
    total: number;
    success: number;
    failed: number;
    success_rate: number;
    time_per_item?: number;
  } {
    const stats = {
      total: 0,
      success: 0,
      failed: 0,
      success_rate: 0,
      time_per_item: undefined as number | undefined,
    };

    if ('context_ids' in result) {
      // BatchRecordResult
      stats.total = result.success + result.failed;
      stats.success = result.success;
      stats.failed = result.failed;
    } else {
      // BatchSearchResult
      stats.total = result.results.length;
      stats.success = result.results.length;
      stats.failed = 0;
      stats.time_per_item = result.total_time / result.results.length;
    }

    stats.success_rate = stats.total > 0 ? stats.success / stats.total : 0;

    return stats;
  }
}
