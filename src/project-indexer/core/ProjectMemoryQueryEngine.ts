/**
 * DevMind MCP 项目记忆查询引擎
 *
 * 提供强大的项目记忆查询功能，包括：
 * 1. 时间点查询 - 查询特定时间点的项目状态
 * 2. 差异查询 - 比较两个时间点的变化
 * 3. 演变分析 - 分析项目的发展轨迹
 * 4. 智能问答 - 基于记忆的智能问答
 */

import { DatabaseManager } from '../../database.js';
import { VectorSearchEngine } from '../../vector-search.js';
import { Context, ContextType } from '../../types.js';

/**
 * 查询类型
 */
export enum QueryType {
  TIME_POINT = 'time_point',      // 时间点查询
  DIFF = 'diff',                   // 差异查询
  EVOLUTION = 'evolution',         // 演变分析
  QUESTION = 'question',           // 智能问答
  RELATED = 'related',             // 相关记忆查询
  SUMMARY = 'summary'              // 摘要生成
}

/**
 * 查询选项
 */
export interface QueryOptions {
  type: QueryType;
  timePoint?: string | Date;       // 时间点（用于TIME_POINT查询）
  fromTime?: string | Date;        // 开始时间（用于DIFF查询）
  toTime?: string | Date;           // 结束时间（用于DIFF查询）
  question?: string;                // 问题（用于QUESTION查询）
  contextId?: string;               // 上下文ID（用于RELATED查询）
  limit?: number;                   // 返回结果数量限制
  includeCode?: boolean;            // 是否包含代码片段
  includeDocumentation?: boolean;   // 是否包含文档
  similarityThreshold?: number;     // 相似度阈值（0-1）
}

/**
 * 查询结果
 */
export interface QueryResult {
  queryId: string;
  type: QueryType;
  timestamp: Date;
  results: QueryResultItem[];
  metadata: {
    totalFound: number;
    returnedCount: number;
    processingTime: number;
    confidence: number;
  };
}

/**
 * 查询结果项
 */
export interface QueryResultItem {
  id: string;
  type: 'context' | 'memory' | 'insight';
  title: string;
  content: string;
  relevance: number;
  timestamp: Date;
  source?: string;
  tags?: string[];
  highlights?: string[];
}

/**
 * 项目演变阶段
 */
export interface EvolutionPhase {
  phase: string;
  startTime: Date;
  endTime?: Date;
  description: string;
  keyChanges: string[];
  metrics: {
    filesAdded: number;
    filesModified: number;
    filesDeleted: number;
    contextsCreated: number;
  };
}

/**
 * 差异分析结果
 */
export interface DiffAnalysis {
  fromTime: Date;
  toTime: Date;
  summary: string;
  changes: {
    added: DiffItem[];
    modified: DiffItem[];
    deleted: DiffItem[];
  };
  statistics: {
    totalAdded: number;
    totalModified: number;
    totalDeleted: number;
    significantChanges: string[];
  };
}

/**
 * 差异项
 */
export interface DiffItem {
  path: string;
  type: 'file' | 'context' | 'memory';
  changeType: 'added' | 'modified' | 'deleted';
  description: string;
  importance: 'high' | 'medium' | 'low';
}

/**
 * 项目记忆查询引擎
 */
export class ProjectMemoryQueryEngine {
  private db: DatabaseManager;
  private vectorSearch: VectorSearchEngine;
  private queryCache: Map<string, QueryResult>;
  private cacheTimeout: number = 5 * 60 * 1000; // 5分钟缓存

  constructor(db: DatabaseManager, vectorSearch: VectorSearchEngine) {
    this.db = db;
    this.vectorSearch = vectorSearch;
    this.queryCache = new Map();

    // 定期清理缓存
    setInterval(() => this.cleanCache(), this.cacheTimeout);
  }

  /**
   * 执行查询
   */
  public async query(projectPath: string, options: QueryOptions): Promise<QueryResult> {
    const queryId = this.generateQueryId(projectPath, options);

    // 检查缓存
    const cached = this.queryCache.get(queryId);
    if (cached && this.isCacheValid(cached)) {
      console.log(`📦 使用缓存的查询结果: ${queryId}`);
      return cached;
    }

    const startTime = Date.now();
    let result: QueryResult;

    switch (options.type) {
      case QueryType.TIME_POINT:
        result = await this.queryTimePoint(projectPath, options);
        break;
      case QueryType.DIFF:
        result = await this.queryDiff(projectPath, options);
        break;
      case QueryType.EVOLUTION:
        result = await this.queryEvolution(projectPath, options);
        break;
      case QueryType.QUESTION:
        result = await this.queryQuestion(projectPath, options);
        break;
      case QueryType.RELATED:
        result = await this.queryRelated(projectPath, options);
        break;
      case QueryType.SUMMARY:
        result = await this.querySummary(projectPath, options);
        break;
      default:
        throw new Error(`不支持的查询类型: ${options.type}`);
    }

    // 添加元数据
    result.metadata.processingTime = Date.now() - startTime;

    // 缓存结果
    this.queryCache.set(queryId, result);

    return result;
  }

  /**
   * 时间点查询 - 获取特定时间点的项目状态
   */
  private async queryTimePoint(projectPath: string, options: QueryOptions): Promise<QueryResult> {
    const timePoint = options.timePoint ? new Date(options.timePoint) : new Date();
    const limit = options.limit || 20;

    console.log(`⏰ 执行时间点查询: ${timePoint.toISOString()}`);

    // 获取项目
    const project = this.db.getProjectByPath(projectPath);
    if (!project) {
      throw new Error(`项目不存在: ${projectPath}`);
    }

    // 获取时间点之前的所有上下文
    const allContexts = this.db.getContextsByProject(project.id);
    const relevantContexts = allContexts.filter(ctx => {
      const ctxTime = new Date(ctx.created_at);
      return ctxTime <= timePoint;
    });

    // 按时间排序，获取最近的上下文
    relevantContexts.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // 限制数量
    const contexts = relevantContexts.slice(0, limit);

    // 转换为查询结果
    const results: QueryResultItem[] = contexts.map(ctx => ({
      id: ctx.id,
      type: 'context' as const,
      title: this.generateContextTitle(ctx),
      content: ctx.content,
      relevance: 1.0, // 时间点查询的相关性都设为1
      timestamp: new Date(ctx.created_at),
      source: ctx.file_path || undefined,
      tags: ctx.tags ? JSON.parse(ctx.tags) : []
    }));

    return {
      queryId: this.generateQueryId(projectPath, options),
      type: QueryType.TIME_POINT,
      timestamp: new Date(),
      results,
      metadata: {
        totalFound: relevantContexts.length,
        returnedCount: results.length,
        processingTime: 0,
        confidence: relevantContexts.length > 0 ? 0.9 : 0.3
      }
    };
  }

  /**
   * 差异查询 - 比较两个时间点之间的变化
   */
  private async queryDiff(projectPath: string, options: QueryOptions): Promise<QueryResult> {
    const fromTime = options.fromTime ? new Date(options.fromTime) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 默认7天前
    const toTime = options.toTime ? new Date(options.toTime) : new Date();

    console.log(`🔄 执行差异查询: ${fromTime.toISOString()} -> ${toTime.toISOString()}`);

    const project = this.db.getProjectByPath(projectPath);
    if (!project) {
      throw new Error(`项目不存在: ${projectPath}`);
    }

    // 获取时间范围内的上下文
    const allContexts = this.db.getContextsByProject(project.id);
    const contextsInRange = allContexts.filter(ctx => {
      const ctxTime = new Date(ctx.created_at);
      return ctxTime >= fromTime && ctxTime <= toTime;
    });

    // 分析变化
    const diffAnalysis = this.analyzeDiff(contextsInRange, fromTime, toTime);

    // 生成结果
    const results: QueryResultItem[] = [
      {
        id: `diff-summary-${Date.now()}`,
        type: 'insight',
        title: '变化摘要',
        content: diffAnalysis.summary,
        relevance: 1.0,
        timestamp: new Date(),
        tags: ['diff', 'summary']
      }
    ];

    // 添加重要变化
    diffAnalysis.statistics.significantChanges.forEach((change, index) => {
      results.push({
        id: `diff-change-${index}`,
        type: 'insight',
        title: `重要变化 ${index + 1}`,
        content: change,
        relevance: 0.9,
        timestamp: new Date(),
        tags: ['diff', 'significant']
      });
    });

    return {
      queryId: this.generateQueryId(projectPath, options),
      type: QueryType.DIFF,
      timestamp: new Date(),
      results,
      metadata: {
        totalFound: contextsInRange.length,
        returnedCount: results.length,
        processingTime: 0,
        confidence: contextsInRange.length > 5 ? 0.85 : 0.5
      }
    };
  }

  /**
   * 演变分析 - 分析项目的发展轨迹
   */
  private async queryEvolution(projectPath: string, options: QueryOptions): Promise<QueryResult> {
    console.log(`📈 执行演变分析: ${projectPath}`);

    const project = this.db.getProjectByPath(projectPath);
    if (!project) {
      throw new Error(`项目不存在: ${projectPath}`);
    }

    // 获取所有上下文
    const allContexts = this.db.getContextsByProject(project.id);
    if (allContexts.length === 0) {
      return this.createEmptyResult(QueryType.EVOLUTION);
    }

    // 按时间排序
    allContexts.sort((a, b) => {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    // 识别演变阶段
    const phases = this.identifyEvolutionPhases(allContexts);

    // 生成结果
    const results: QueryResultItem[] = [];

    // 添加整体演变概览
    results.push({
      id: 'evolution-overview',
      type: 'insight',
      title: '项目演变概览',
      content: this.generateEvolutionOverview(phases, allContexts),
      relevance: 1.0,
      timestamp: new Date(),
      tags: ['evolution', 'overview']
    });

    // 添加各阶段详情
    phases.forEach((phase, index) => {
      results.push({
        id: `evolution-phase-${index}`,
        type: 'insight',
        title: `阶段 ${index + 1}: ${phase.phase}`,
        content: this.formatEvolutionPhase(phase),
        relevance: 0.9 - index * 0.1,
        timestamp: phase.startTime,
        tags: ['evolution', 'phase', phase.phase]
      });
    });

    // 添加里程碑
    const milestones = this.identifyMilestones(allContexts);
    milestones.forEach((milestone, index) => {
      results.push({
        id: `milestone-${index}`,
        type: 'insight',
        title: `里程碑: ${milestone.title}`,
        content: milestone.description,
        relevance: 0.8,
        timestamp: milestone.timestamp,
        tags: ['evolution', 'milestone']
      });
    });

    return {
      queryId: this.generateQueryId(projectPath, options),
      type: QueryType.EVOLUTION,
      timestamp: new Date(),
      results,
      metadata: {
        totalFound: allContexts.length,
        returnedCount: results.length,
        processingTime: 0,
        confidence: allContexts.length > 10 ? 0.9 : 0.6
      }
    };
  }

  /**
   * 智能问答 - 基于项目记忆回答问题
   */
  private async queryQuestion(projectPath: string, options: QueryOptions): Promise<QueryResult> {
    const question = options.question;
    if (!question) {
      throw new Error('问题不能为空');
    }

    console.log(`❓ 执行智能问答: ${question}`);

    const project = this.db.getProjectByPath(projectPath);
    if (!project) {
      throw new Error(`项目不存在: ${projectPath}`);
    }

    // 使用向量搜索找到相关上下文
    const allContexts = this.db.getContextsForVectorSearch(project.id);
    const searchResults = await this.vectorSearch.searchContexts(question, allContexts, {
      query: question,
      use_semantic_search: true,
      limit: options.limit || 10,
      similarity_threshold: options.similarityThreshold || 0.5
    });

    // 分析问题类型
    const questionType = this.analyzeQuestionType(question);

    // 根据问题类型处理结果
    const results: QueryResultItem[] = [];

    if (searchResults.length === 0) {
      results.push({
        id: 'no-answer',
        type: 'insight',
        title: '未找到相关信息',
        content: '抱歉，在项目记忆中未找到与您问题相关的信息。',
        relevance: 0,
        timestamp: new Date(),
        tags: ['question', 'no-result']
      });
    } else {
      // 生成回答
      const answer = this.generateAnswer(question, questionType, searchResults);
      results.push({
        id: 'answer-main',
        type: 'insight',
        title: '回答',
        content: answer,
        relevance: 1.0,
        timestamp: new Date(),
        tags: ['question', 'answer', questionType]
      });

      // 添加相关上下文
      searchResults.slice(0, 3).forEach((result, index) => {
        results.push({
          id: `context-${result.id}`,
          type: 'context',
          title: `相关记忆 ${index + 1}`,
          content: result.content.substring(0, 500) + (result.content.length > 500 ? '...' : ''),
          relevance: result.similarity || 0,
          timestamp: new Date(result.created_at || Date.now()),
          source: result.file_path,
          tags: result.tags ? JSON.parse(result.tags) : []
        });
      });
    }

    return {
      queryId: this.generateQueryId(projectPath, options),
      type: QueryType.QUESTION,
      timestamp: new Date(),
      results,
      metadata: {
        totalFound: searchResults.length,
        returnedCount: results.length,
        processingTime: 0,
        confidence: searchResults.length > 0 ? Math.max(...searchResults.map(r => r.similarity || 0)) : 0
      }
    };
  }

  /**
   * 相关记忆查询 - 查找与指定上下文相关的记忆
   */
  private async queryRelated(projectPath: string, options: QueryOptions): Promise<QueryResult> {
    const contextId = options.contextId;
    if (!contextId) {
      throw new Error('上下文ID不能为空');
    }

    console.log(`🔗 查询相关记忆: ${contextId}`);

    // 获取原始上下文
    const context = this.db.getContextById(contextId);
    if (!context) {
      throw new Error(`上下文不存在: ${contextId}`);
    }

    // 使用向量搜索找相似内容
    const project = this.db.getProjectByPath(projectPath);
    if (!project) {
      throw new Error(`项目不存在: ${projectPath}`);
    }

    const allContexts = this.db.getContextsForVectorSearch(project.id);
    // 排除自己
    const filteredContexts = allContexts.filter(c => c.id !== contextId);
    const searchResults = await this.vectorSearch.searchContexts(context.content, filteredContexts, {
      query: context.content,
      use_semantic_search: true,
      limit: options.limit || 10,
      similarity_threshold: options.similarityThreshold || 0.3
    });

    // 转换为查询结果
    const results: QueryResultItem[] = searchResults.map((result, index) => ({
      id: result.id,
      type: 'context' as const,
      title: `相关记忆 ${index + 1}`,
      content: result.content,
      relevance: result.similarity || 0,
      timestamp: new Date(result.created_at || Date.now()),
      source: result.file_path,
      tags: result.tags ? JSON.parse(result.tags) : []
    }));

    return {
      queryId: this.generateQueryId(projectPath, options),
      type: QueryType.RELATED,
      timestamp: new Date(),
      results,
      metadata: {
        totalFound: searchResults.length,
        returnedCount: results.length,
        processingTime: 0,
        confidence: searchResults.length > 0 ? 0.8 : 0.3
      }
    };
  }

  /**
   * 摘要生成 - 生成项目记忆的摘要
   */
  private async querySummary(projectPath: string, options: QueryOptions): Promise<QueryResult> {
    console.log(`📝 生成项目摘要: ${projectPath}`);

    const project = this.db.getProjectByPath(projectPath);
    if (!project) {
      throw new Error(`项目不存在: ${projectPath}`);
    }

    // 获取所有上下文
    const allContexts = this.db.getContextsByProject(project.id);
    const sessions = this.db.getSessionsByProject(project.id);

    // 按类型分组
    const contextsByType: Record<string, Context[]> = {};
    allContexts.forEach(ctx => {
      const type = ctx.type || 'other';
      if (!contextsByType[type]) {
        contextsByType[type] = [];
      }
      contextsByType[type].push(ctx);
    });

    // 生成摘要
    const results: QueryResultItem[] = [];

    // 整体摘要
    results.push({
      id: 'summary-overall',
      type: 'insight',
      title: '项目整体摘要',
      content: this.generateOverallSummary(project, allContexts, sessions),
      relevance: 1.0,
      timestamp: new Date(),
      tags: ['summary', 'overall']
    });

    // 各类型摘要
    Object.entries(contextsByType).forEach(([type, contexts]) => {
      if (contexts.length > 0) {
        results.push({
          id: `summary-${type}`,
          type: 'insight',
          title: `${this.getTypeDisplayName(type as ContextType)}摘要`,
          content: this.generateTypeSummary(type as ContextType, contexts),
          relevance: 0.8,
          timestamp: new Date(),
          tags: ['summary', type]
        });
      }
    });

    // 关键洞察
    const insights = this.extractKeyInsights(allContexts);
    insights.forEach((insight, index) => {
      results.push({
        id: `insight-${index}`,
        type: 'insight',
        title: insight.title,
        content: insight.content,
        relevance: 0.7,
        timestamp: new Date(),
        tags: ['summary', 'insight']
      });
    });

    return {
      queryId: this.generateQueryId(projectPath, options),
      type: QueryType.SUMMARY,
      timestamp: new Date(),
      results,
      metadata: {
        totalFound: allContexts.length,
        returnedCount: results.length,
        processingTime: 0,
        confidence: allContexts.length > 5 ? 0.85 : 0.5
      }
    };
  }

  // 辅助方法

  private generateQueryId(projectPath: string, options: QueryOptions): string {
    const timestamp = Date.now().toString(36);
    const optionsHash = this.hashObject(options).substring(0, 8);
    const pathHash = this.hashString(projectPath).substring(0, 8);
    return `query_${pathHash}_${optionsHash}_${timestamp}`;
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj);
    return this.hashString(str);
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private isCacheValid(result: QueryResult): boolean {
    const age = Date.now() - result.timestamp.getTime();
    return age < this.cacheTimeout;
  }

  private cleanCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.queryCache.forEach((result, key) => {
      if (!this.isCacheValid(result)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.queryCache.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`🧹 清理了 ${keysToDelete.length} 个过期的查询缓存`);
    }
  }

  private generateContextTitle(ctx: Context): string {
    if (ctx.file_path) {
      const fileName = ctx.file_path.split(/[/\\]/).pop() || ctx.file_path;
      return `${this.getTypeDisplayName(ctx.type)} - ${fileName}`;
    }
    return `${this.getTypeDisplayName(ctx.type)} - ${ctx.id.substring(0, 8)}`;
  }

  private getTypeDisplayName(type: ContextType): string {
    const displayNames = {
      [ContextType.CODE]: '代码',
      [ContextType.CONVERSATION]: '对话',
      [ContextType.ERROR]: '错误',
      [ContextType.SOLUTION]: '解决方案',
      [ContextType.DOCUMENTATION]: '文档',
      [ContextType.TEST]: '测试',
      [ContextType.CONFIGURATION]: '配置',
      [ContextType.COMMIT]: '提交'
    };
    return displayNames[type] || '其他';
  }

  private analyzeDiff(contexts: Context[], fromTime: Date, toTime: Date): DiffAnalysis {
    const added: DiffItem[] = [];
    const modified: DiffItem[] = [];
    const deleted: DiffItem[] = [];

    // 按文件路径分组
    const fileGroups: Record<string, Context[]> = {};
    contexts.forEach(ctx => {
      if (ctx.file_path) {
        if (!fileGroups[ctx.file_path]) {
          fileGroups[ctx.file_path] = [];
        }
        fileGroups[ctx.file_path].push(ctx);
      }
    });

    // 分析每个文件的变化
    Object.entries(fileGroups).forEach(([filePath, fileContexts]) => {
      if (fileContexts.length === 1) {
        added.push({
          path: filePath,
          type: 'file',
          changeType: 'added',
          description: `新增文件: ${filePath}`,
          importance: 'medium'
        });
      } else {
        modified.push({
          path: filePath,
          type: 'file',
          changeType: 'modified',
          description: `修改文件: ${filePath} (${fileContexts.length}次变更)`,
          importance: fileContexts.length > 5 ? 'high' : 'medium'
        });
      }
    });

    // 识别重要变化
    const significantChanges: string[] = [];

    // 错误和解决方案
    const errors = contexts.filter(ctx => ctx.type === ContextType.ERROR);
    const solutions = contexts.filter(ctx => ctx.type === ContextType.SOLUTION);
    if (errors.length > 0) {
      significantChanges.push(`发现 ${errors.length} 个错误`);
    }
    if (solutions.length > 0) {
      significantChanges.push(`实现 ${solutions.length} 个解决方案`);
    }

    // 新增测试
    const tests = contexts.filter(ctx => ctx.type === ContextType.TEST);
    if (tests.length > 0) {
      significantChanges.push(`添加 ${tests.length} 个测试`);
    }

    // 生成摘要
    const summary = `在 ${fromTime.toLocaleDateString()} 到 ${toTime.toLocaleDateString()} 期间，` +
                   `项目共产生 ${contexts.length} 个变更记录。` +
                   `其中新增 ${added.length} 个文件，修改 ${modified.length} 个文件。` +
                   (significantChanges.length > 0 ? `主要变化包括: ${significantChanges.join('、')}。` : '');

    return {
      fromTime,
      toTime,
      summary,
      changes: { added, modified, deleted },
      statistics: {
        totalAdded: added.length,
        totalModified: modified.length,
        totalDeleted: deleted.length,
        significantChanges
      }
    };
  }

  private identifyEvolutionPhases(contexts: Context[]): EvolutionPhase[] {
    const phases: EvolutionPhase[] = [];

    if (contexts.length === 0) return phases;

    // 简单的阶段识别逻辑
    const totalDuration = new Date(contexts[contexts.length - 1].created_at).getTime() -
                         new Date(contexts[0].created_at).getTime();
    const daysDuration = totalDuration / (1000 * 60 * 60 * 24);

    // 根据上下文密度和类型识别阶段
    let currentPhase: EvolutionPhase = {
      phase: 'initialization',
      startTime: new Date(contexts[0].created_at),
      description: '项目初始化阶段',
      keyChanges: [],
      metrics: {
        filesAdded: 0,
        filesModified: 0,
        filesDeleted: 0,
        contextsCreated: 0
      }
    };

    let lastPhaseChange = 0;

    contexts.forEach((ctx, index) => {
      currentPhase.metrics.contextsCreated++;

      // 检测阶段转换
      if (index - lastPhaseChange > contexts.length * 0.3) {
        // 结束当前阶段
        currentPhase.endTime = new Date(ctx.created_at);
        phases.push(currentPhase);

        // 开始新阶段
        const phaseType = this.determinePhaseType(ctx, index, contexts);
        currentPhase = {
          phase: phaseType,
          startTime: new Date(ctx.created_at),
          description: this.getPhaseDescription(phaseType),
          keyChanges: [],
          metrics: {
            filesAdded: 0,
            filesModified: 0,
            filesDeleted: 0,
            contextsCreated: 0
          }
        };
        lastPhaseChange = index;
      }

      // 记录关键变化
      if (ctx.type === ContextType.ERROR || ctx.type === ContextType.SOLUTION) {
        currentPhase.keyChanges.push(`${this.getTypeDisplayName(ctx.type)}: ${ctx.content.substring(0, 50)}...`);
      }
    });

    // 添加最后一个阶段
    if (currentPhase.metrics.contextsCreated > 0) {
      currentPhase.endTime = new Date(contexts[contexts.length - 1].created_at);
      phases.push(currentPhase);
    }

    return phases;
  }

  private determinePhaseType(ctx: Context, index: number, allContexts: Context[]): string {
    const position = index / allContexts.length;

    if (position < 0.2) return 'initialization';
    if (position < 0.5) return 'development';
    if (position < 0.7) return 'testing';
    if (position < 0.9) return 'optimization';
    return 'maintenance';
  }

  private getPhaseDescription(phase: string): string {
    const descriptions: Record<string, string> = {
      'initialization': '项目初始化和基础搭建',
      'development': '核心功能开发阶段',
      'testing': '测试和调试阶段',
      'optimization': '性能优化和改进阶段',
      'maintenance': '维护和持续改进阶段'
    };
    return descriptions[phase] || '项目演进阶段';
  }

  private generateEvolutionOverview(phases: EvolutionPhase[], contexts: Context[]): string {
    const firstContext = contexts[0];
    const lastContext = contexts[contexts.length - 1];
    const duration = new Date(lastContext.created_at).getTime() - new Date(firstContext.created_at).getTime();
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));

    return `项目从 ${new Date(firstContext.created_at).toLocaleDateString()} 开始，` +
           `已经历 ${days} 天的开发，共经过 ${phases.length} 个主要阶段。` +
           `累计产生 ${contexts.length} 个记忆点。` +
           `当前处于${phases[phases.length - 1]?.phase || '未知'}阶段。`;
  }

  private formatEvolutionPhase(phase: EvolutionPhase): string {
    const duration = phase.endTime
      ? (phase.endTime.getTime() - phase.startTime.getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    return `${phase.description}\n` +
           `时间: ${phase.startTime.toLocaleDateString()} - ${phase.endTime?.toLocaleDateString() || '进行中'}\n` +
           `持续: ${Math.round(duration)} 天\n` +
           `记忆点: ${phase.metrics.contextsCreated}\n` +
           (phase.keyChanges.length > 0 ? `关键变化:\n${phase.keyChanges.map(c => `  - ${c}`).join('\n')}` : '');
  }

  private identifyMilestones(contexts: Context[]): Array<{title: string, description: string, timestamp: Date}> {
    const milestones: Array<{title: string, description: string, timestamp: Date}> = [];

    // 识别重要的里程碑
    contexts.forEach(ctx => {
      // 首次提交
      if (ctx.type === ContextType.COMMIT && milestones.length === 0) {
        milestones.push({
          title: '项目首次提交',
          description: '项目开发正式开始',
          timestamp: new Date(ctx.created_at)
        });
      }

      // 首次测试
      if (ctx.type === ContextType.TEST && !milestones.some(m => m.title.includes('测试'))) {
        milestones.push({
          title: '引入测试',
          description: '项目开始重视质量保证',
          timestamp: new Date(ctx.created_at)
        });
      }

      // 重大错误修复
      if (ctx.type === ContextType.SOLUTION && ctx.content.toLowerCase().includes('fix')) {
        milestones.push({
          title: '重要修复',
          description: ctx.content.substring(0, 100),
          timestamp: new Date(ctx.created_at)
        });
      }
    });

    return milestones.slice(0, 5); // 限制返回5个最重要的里程碑
  }

  private analyzeQuestionType(question: string): string {
    const q = question.toLowerCase();

    if (q.includes('什么') || q.includes('what')) return 'what';
    if (q.includes('如何') || q.includes('怎么') || q.includes('how')) return 'how';
    if (q.includes('为什么') || q.includes('why')) return 'why';
    if (q.includes('哪里') || q.includes('where')) return 'where';
    if (q.includes('什么时候') || q.includes('when')) return 'when';
    if (q.includes('是否') || q.includes('有没有')) return 'boolean';

    return 'general';
  }

  private generateAnswer(question: string, questionType: string, searchResults: any[]): string {
    if (searchResults.length === 0) {
      return '未找到相关信息来回答您的问题。';
    }

    // 基于搜索结果生成回答
    const topResult = searchResults[0];
    const confidence = topResult.similarity || 0;

    let answer = '';

    switch (questionType) {
      case 'what':
        answer = `根据项目记忆，${topResult.content.substring(0, 200)}`;
        break;
      case 'how':
        answer = `实现方式如下：\n${topResult.content.substring(0, 300)}`;
        break;
      case 'why':
        answer = `原因是：${topResult.content.substring(0, 200)}`;
        break;
      case 'boolean':
        answer = confidence > 0.7 ? '是的，' : '可能，';
        answer += topResult.content.substring(0, 150);
        break;
      default:
        answer = topResult.content.substring(0, 300);
    }

    if (confidence < 0.6) {
      answer += '\n\n注意：此回答的置信度较低，可能需要进一步验证。';
    }

    return answer;
  }

  private createEmptyResult(type: QueryType): QueryResult {
    return {
      queryId: `empty-${Date.now()}`,
      type,
      timestamp: new Date(),
      results: [],
      metadata: {
        totalFound: 0,
        returnedCount: 0,
        processingTime: 0,
        confidence: 0
      }
    };
  }

  private generateOverallSummary(project: any, contexts: Context[], sessions: any[]): string {
    const contextsByType: Record<string, number> = {};
    contexts.forEach(ctx => {
      const type = ctx.type || 'other';
      contextsByType[type] = (contextsByType[type] || 0) + 1;
    });

    const activeSessions = sessions.filter(s => s.status === 'active').length;
    const totalSessions = sessions.length;

    return `项目 "${project.name}" 概览:\n` +
           `- 路径: ${project.path}\n` +
           `- 总记忆数: ${contexts.length}\n` +
           `- 会话数: ${totalSessions} (活跃: ${activeSessions})\n` +
           `- 记忆分布: ${Object.entries(contextsByType).map(([type, count]) =>
             `${this.getTypeDisplayName(type as ContextType)}(${count})`).join(', ')}\n` +
           `- 创建时间: ${new Date(project.created_at).toLocaleDateString()}\n` +
           `- 最后更新: ${contexts.length > 0 ? new Date(contexts[contexts.length - 1].created_at).toLocaleDateString() : '无'}`;
  }

  private generateTypeSummary(type: ContextType, contexts: Context[]): string {
    const recent = contexts.slice(-5);
    const summary = [`共有 ${contexts.length} 条${this.getTypeDisplayName(type)}记录。\n`];

    if (recent.length > 0) {
      summary.push('最近记录:');
      recent.forEach(ctx => {
        const preview = ctx.content.substring(0, 100).replace(/\n/g, ' ');
        summary.push(`- ${preview}${ctx.content.length > 100 ? '...' : ''}`);
      });
    }

    return summary.join('\n');
  }

  private extractKeyInsights(contexts: Context[]): Array<{title: string, content: string}> {
    const insights: Array<{title: string, content: string}> = [];

    // 错误模式分析
    const errors = contexts.filter(ctx => ctx.type === ContextType.ERROR);
    if (errors.length > 3) {
      insights.push({
        title: '常见错误模式',
        content: `项目中出现了 ${errors.length} 个错误记录，建议加强错误处理和预防措施。`
      });
    }

    // 开发活跃度
    const recentContexts = contexts.filter(ctx => {
      const age = Date.now() - new Date(ctx.created_at).getTime();
      return age < 7 * 24 * 60 * 60 * 1000; // 7天内
    });

    if (recentContexts.length > 10) {
      insights.push({
        title: '开发活跃',
        content: `最近7天产生了 ${recentContexts.length} 条记录，项目处于活跃开发状态。`
      });
    } else if (recentContexts.length === 0 && contexts.length > 0) {
      insights.push({
        title: '项目休眠',
        content: '项目最近7天没有新的开发活动，可能处于维护或暂停状态。'
      });
    }

    // 测试覆盖
    const tests = contexts.filter(ctx => ctx.type === ContextType.TEST);
    const codeContexts = contexts.filter(ctx => ctx.type === ContextType.CODE);
    if (codeContexts.length > 0) {
      const testRatio = tests.length / codeContexts.length;
      if (testRatio < 0.2) {
        insights.push({
          title: '测试覆盖不足',
          content: `测试与代码的比例为 ${(testRatio * 100).toFixed(1)}%，建议增加测试覆盖。`
        });
      } else if (testRatio > 0.5) {
        insights.push({
          title: '良好的测试实践',
          content: `测试与代码的比例为 ${(testRatio * 100).toFixed(1)}%，测试覆盖良好。`
        });
      }
    }

    return insights;
  }
}