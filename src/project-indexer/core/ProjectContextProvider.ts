/**
 * DevMind MCP 项目上下文提供器
 *
 * 提供智能的项目上下文感知功能，包括：
 * 1. 自动检测开发阶段
 * 2. 识别技术栈和架构模式
 * 3. 提供智能建议和最佳实践
 * 4. 项目健康度评估
 */

import { DatabaseManager } from '../../database.js';
import { Context, ContextType, Session } from '../../types.js';
import { ProjectAnalyzer } from '../tools/ProjectAnalyzer.js';
import { FileScanner } from '../tools/FileScanner.js';
import { DEFAULT_INDEXING_CONFIG } from '../types/IndexingTypes.js';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * 开发阶段
 */
export enum DevelopmentPhase {
  INITIALIZATION = 'initialization',    // 初始化阶段
  DEVELOPMENT = 'development',          // 开发阶段
  TESTING = 'testing',                  // 测试阶段
  OPTIMIZATION = 'optimization',        // 优化阶段
  PRODUCTION = 'production',            // 生产阶段
  MAINTENANCE = 'maintenance'           // 维护阶段
}

/**
 * 项目上下文
 */
export interface ProjectContext {
  // 基础信息
  projectPath: string;
  projectName: string;
  currentPhase: DevelopmentPhase;
  phaseConfidence: number;

  // 技术栈
  techStack: {
    primary: string;
    frameworks: string[];
    databases?: string[];
    tools: string[];
    testing?: string[];
  };

  // 架构模式
  architecture: {
    patterns: string[];
    style: 'monolithic' | 'microservices' | 'serverless' | 'hybrid';
    layers: string[];
  };

  // 项目特征
  features: {
    hasTests: boolean;
    hasCI: boolean;
    hasDocker: boolean;
    hasKubernetes: boolean;
    hasMonitoring: boolean;
    hasLogging: boolean;
    hasDocumentation: boolean;
  };

  // 活动状态
  activity: {
    lastActivity: Date;
    activeDevelopers: number;
    recentChanges: number;
    hotspots: string[];  // 频繁修改的文件
  };

  // 健康指标
  health: {
    score: number;        // 0-100
    issues: string[];
    strengths: string[];
  };

  // 智能建议
  suggestions: {
    immediate: string[];   // 立即执行的建议
    shortTerm: string[];   // 短期建议
    longTerm: string[];    // 长期建议
  };

  // 上下文元数据
  metadata: {
    generatedAt: Date;
    confidence: number;
    dataPoints: number;
  };
}

/**
 * 建议优先级
 */
export enum SuggestionPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

/**
 * 建议类别
 */
export enum SuggestionCategory {
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  QUALITY = 'quality',
  TESTING = 'testing',
  DOCUMENTATION = 'documentation',
  ARCHITECTURE = 'architecture',
  DEPLOYMENT = 'deployment'
}

/**
 * 智能建议
 */
export interface SmartSuggestion {
  id: string;
  title: string;
  description: string;
  category: SuggestionCategory;
  priority: SuggestionPriority;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  actionItems: string[];
  resources?: string[];
}

/**
 * 项目上下文提供器
 */
export class ProjectContextProvider {
  private db: DatabaseManager;
  private projectAnalyzer: ProjectAnalyzer;
  private fileScanner: FileScanner;
  private contextCache: Map<string, { context: ProjectContext; timestamp: number }>;
  private cacheTimeout: number = 10 * 60 * 1000; // 10分钟缓存

  constructor(db: DatabaseManager) {
    this.db = db;
    this.projectAnalyzer = new ProjectAnalyzer();
    this.fileScanner = new FileScanner(DEFAULT_INDEXING_CONFIG);
    this.contextCache = new Map();
  }

  /**
   * 获取项目上下文
   */
  public async getProjectContext(projectPath: string): Promise<ProjectContext> {
    // 检查缓存
    const cached = this.contextCache.get(projectPath);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log(`📦 使用缓存的项目上下文: ${projectPath}`);
      return cached.context;
    }

    console.log(`🔍 分析项目上下文: ${projectPath}`);

    // 获取项目信息
    const project = this.db.getProjectByPath(projectPath);
    if (!project) {
      throw new Error(`项目不存在: ${projectPath}`);
    }

    // 获取会话和上下文
    const sessions = this.db.getSessionsByProject(project.id);
    const contexts = this.db.getContextsByProject(project.id);

    // 扫描文件系统
    const files = await this.fileScanner.scan(projectPath, DEFAULT_INDEXING_CONFIG);

    // 分析项目
    const { structure, features } = await this.projectAnalyzer.analyzeProject(projectPath, files);

    // 生成上下文
    const context: ProjectContext = {
      projectPath,
      projectName: project.name,
      currentPhase: this.detectDevelopmentPhase(contexts, sessions, structure),
      phaseConfidence: this.calculatePhaseConfidence(contexts, sessions),

      techStack: this.extractTechStack(features, structure),
      architecture: this.analyzeArchitecture(structure, files),
      features: await this.detectFeatures(projectPath, structure),
      activity: this.analyzeActivity(contexts, sessions),
      health: this.assessHealth(contexts, structure, features),
      suggestions: await this.generateSuggestions(contexts, structure, features),

      metadata: {
        generatedAt: new Date(),
        confidence: this.calculateOverallConfidence(contexts, sessions),
        dataPoints: contexts.length + sessions.length + files.length
      }
    };

    // 缓存结果
    this.contextCache.set(projectPath, {
      context,
      timestamp: Date.now()
    });

    return context;
  }

  /**
   * 获取智能建议
   */
  public async getSmartSuggestions(projectPath: string): Promise<SmartSuggestion[]> {
    const context = await this.getProjectContext(projectPath);
    const suggestions: SmartSuggestion[] = [];

    // 基于当前阶段生成建议
    const phaseSuggestions = this.generatePhaseSuggestions(context.currentPhase);
    suggestions.push(...phaseSuggestions);

    // 基于健康问题生成建议
    const healthSuggestions = this.generateHealthSuggestions(context.health);
    suggestions.push(...healthSuggestions);

    // 基于技术栈生成建议
    const techSuggestions = this.generateTechStackSuggestions(context.techStack);
    suggestions.push(...techSuggestions);

    // 基于架构生成建议
    const archSuggestions = this.generateArchitectureSuggestions(context.architecture);
    suggestions.push(...archSuggestions);

    // 排序建议（按优先级和影响力）
    suggestions.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const impactOrder = { high: 0, medium: 1, low: 2 };

      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return impactOrder[a.impact] - impactOrder[b.impact];
    });

    return suggestions;
  }

  /**
   * 获取阶段特定的指导
   */
  public async getPhaseGuidance(projectPath: string): Promise<{
    phase: DevelopmentPhase;
    guidelines: string[];
    nextSteps: string[];
    commonIssues: string[];
    bestPractices: string[];
  }> {
    const context = await this.getProjectContext(projectPath);

    const guidance = {
      phase: context.currentPhase,
      guidelines: this.getPhaseGuidelines(context.currentPhase),
      nextSteps: this.getPhaseNextSteps(context.currentPhase),
      commonIssues: this.getPhaseCommonIssues(context.currentPhase),
      bestPractices: this.getPhaseBestPractices(context.currentPhase)
    };

    return guidance;
  }

  /**
   * 评估项目成熟度
   */
  public async assessMaturity(projectPath: string): Promise<{
    level: 'initial' | 'developing' | 'defined' | 'managed' | 'optimizing';
    score: number;
    dimensions: {
      code: number;
      testing: number;
      documentation: number;
      architecture: number;
      operations: number;
    };
    recommendations: string[];
  }> {
    const context = await this.getProjectContext(projectPath);

    // 评估各维度成熟度
    const dimensions = {
      code: this.assessCodeMaturity(context),
      testing: this.assessTestingMaturity(context),
      documentation: this.assessDocumentationMaturity(context),
      architecture: this.assessArchitectureMaturity(context),
      operations: this.assessOperationsMaturity(context)
    };

    // 计算总体成熟度
    const totalScore = Object.values(dimensions).reduce((sum, score) => sum + score, 0) / 5;

    // 确定成熟度级别
    let level: 'initial' | 'developing' | 'defined' | 'managed' | 'optimizing';
    if (totalScore < 20) level = 'initial';
    else if (totalScore < 40) level = 'developing';
    else if (totalScore < 60) level = 'defined';
    else if (totalScore < 80) level = 'managed';
    else level = 'optimizing';

    // 生成建议
    const recommendations = this.generateMaturityRecommendations(level, dimensions);

    return {
      level,
      score: totalScore,
      dimensions,
      recommendations
    };
  }

  // 私有辅助方法

  private detectDevelopmentPhase(contexts: Context[], sessions: Session[], structure: any): DevelopmentPhase {
    // 基于多个因素检测开发阶段

    // 1. 基于上下文数量和类型
    if (contexts.length < 10) {
      return DevelopmentPhase.INITIALIZATION;
    }

    // 2. 基于错误和测试的比例
    const errors = contexts.filter(c => c.type === ContextType.ERROR).length;
    const tests = contexts.filter(c => c.type === ContextType.TEST).length;
    const solutions = contexts.filter(c => c.type === ContextType.SOLUTION).length;

    const totalContexts = contexts.length;
    const testRatio = tests / totalContexts;
    const errorRatio = errors / totalContexts;

    // 3. 基于文件结构
    const hasTests = structure.directories.some((d: string) => d.includes('test'));
    const hasCI = structure.configFiles.some((f: string) =>
      f.includes('.github/workflows') || f.includes('.gitlab-ci') || f.includes('jenkins'));
    const hasDocker = structure.configFiles.some((f: string) => f.includes('docker'));

    // 4. 基于最近活动
    const recentContexts = contexts.filter(c => {
      const age = Date.now() - new Date(c.created_at).getTime();
      return age < 7 * 24 * 60 * 60 * 1000; // 7天内
    });

    // 判断阶段
    if (hasDocker && hasCI) {
      return DevelopmentPhase.PRODUCTION;
    }

    if (testRatio > 0.3 && hasTests) {
      return DevelopmentPhase.TESTING;
    }

    if (errorRatio > 0.2 && solutions > errors * 0.5) {
      return DevelopmentPhase.OPTIMIZATION;
    }

    if (recentContexts.length < 5 && totalContexts > 50) {
      return DevelopmentPhase.MAINTENANCE;
    }

    return DevelopmentPhase.DEVELOPMENT;
  }

  private calculatePhaseConfidence(contexts: Context[], sessions: Session[]): number {
    // 基于数据点数量计算置信度
    const dataPoints = contexts.length + sessions.length;

    if (dataPoints < 10) return 0.3;
    if (dataPoints < 50) return 0.5;
    if (dataPoints < 100) return 0.7;
    if (dataPoints < 500) return 0.85;
    return 0.95;
  }

  private extractTechStack(features: any, structure: any): any {
    return {
      primary: features.technicalStack.language,
      frameworks: features.technicalStack.framework ? [features.technicalStack.framework] : [],
      databases: features.technicalStack.database,
      tools: features.technicalStack.devTools,
      testing: features.technicalStack.testing
    };
  }

  private analyzeArchitecture(structure: any, files: any[]): any {
    const patterns: string[] = [];
    const layers: string[] = [];

    // 检测架构模式
    if (structure.directories.some((d: string) => d.includes('controller'))) {
      patterns.push('MVC');
      layers.push('controllers');
    }
    if (structure.directories.some((d: string) => d.includes('service'))) {
      patterns.push('Service Layer');
      layers.push('services');
    }
    if (structure.directories.some((d: string) => d.includes('repository'))) {
      patterns.push('Repository');
      layers.push('repositories');
    }
    if (structure.directories.some((d: string) => d.includes('component'))) {
      patterns.push('Component-Based');
      layers.push('components');
    }

    // 检测架构风格
    let style: 'monolithic' | 'microservices' | 'serverless' | 'hybrid' = 'monolithic';

    if (structure.configFiles.some((f: string) => f.includes('serverless'))) {
      style = 'serverless';
    } else if (structure.directories.some((d: string) => d.includes('services')) &&
               structure.configFiles.some((f: string) => f.includes('docker-compose'))) {
      style = 'microservices';
    }

    return { patterns, style, layers };
  }

  private async detectFeatures(projectPath: string, structure: any): Promise<any> {
    return {
      hasTests: structure.directories.some((d: string) => d.includes('test')),
      hasCI: structure.configFiles.some((f: string) =>
        f.includes('.github/workflows') || f.includes('.gitlab-ci')),
      hasDocker: structure.configFiles.some((f: string) => f.includes('docker')),
      hasKubernetes: structure.configFiles.some((f: string) => f.includes('k8s') || f.includes('kubernetes')),
      hasMonitoring: structure.configFiles.some((f: string) => f.includes('prometheus') || f.includes('grafana')),
      hasLogging: structure.dependencies?.some((d: string) => d.includes('winston') || d.includes('bunyan')) || false,
      hasDocumentation: structure.configFiles.includes('README.md')
    };
  }

  private analyzeActivity(contexts: Context[], sessions: Session[]): any {
    const now = Date.now();
    const recentContexts = contexts.filter(c => {
      const age = now - new Date(c.created_at).getTime();
      return age < 30 * 24 * 60 * 60 * 1000; // 30天内
    });

    // 找出热点文件
    const fileFrequency: Record<string, number> = {};
    contexts.forEach(c => {
      if (c.file_path) {
        fileFrequency[c.file_path] = (fileFrequency[c.file_path] || 0) + 1;
      }
    });

    const hotspots = Object.entries(fileFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([file]) => file);

    // 统计活跃开发者（通过不同工具判断）
    const tools = new Set(sessions.map(s => s.tool_used));

    return {
      lastActivity: contexts.length > 0 ? new Date(contexts[contexts.length - 1].created_at) : new Date(),
      activeDevelopers: tools.size,
      recentChanges: recentContexts.length,
      hotspots
    };
  }

  private assessHealth(contexts: Context[], structure: any, features: any): any {
    let score = 50; // 基础分
    const issues: string[] = [];
    const strengths: string[] = [];

    // 正面因素
    if (structure.directories.some((d: string) => d.includes('test'))) {
      score += 10;
      strengths.push('有测试覆盖');
    }

    if (structure.configFiles.includes('README.md')) {
      score += 5;
      strengths.push('有文档');
    }

    if (structure.configFiles.some((f: string) => f.includes('lint'))) {
      score += 5;
      strengths.push('配置了代码检查');
    }

    if (features.complexity.score < 50) {
      score += 5;
      strengths.push('复杂度适中');
    }

    // 负面因素
    if (!structure.directories.some((d: string) => d.includes('test'))) {
      score -= 15;
      issues.push('缺少测试');
    }

    const errors = contexts.filter(c => c.type === ContextType.ERROR);
    const solutions = contexts.filter(c => c.type === ContextType.SOLUTION);
    if (errors.length > solutions.length * 2) {
      score -= 10;
      issues.push('未解决的错误较多');
    }

    if (features.complexity.score > 80) {
      score -= 10;
      issues.push('项目复杂度过高');
    }

    // 确保分数在0-100范围内
    score = Math.max(0, Math.min(100, score));

    return { score, issues, strengths };
  }

  private async generateSuggestions(contexts: Context[], structure: any, features: any): Promise<any> {
    const immediate: string[] = [];
    const shortTerm: string[] = [];
    const longTerm: string[] = [];

    // 立即建议
    if (!structure.configFiles.includes('.gitignore')) {
      immediate.push('添加 .gitignore 文件');
    }

    const errors = contexts.filter(c => c.type === ContextType.ERROR);
    if (errors.length > 5) {
      immediate.push('解决未处理的错误');
    }

    // 短期建议
    if (!structure.directories.some((d: string) => d.includes('test'))) {
      shortTerm.push('添加单元测试');
    }

    if (!structure.configFiles.includes('README.md')) {
      shortTerm.push('编写项目文档');
    }

    if (!structure.configFiles.some((f: string) => f.includes('lint'))) {
      shortTerm.push('配置代码检查工具');
    }

    // 长期建议
    if (features.complexity.score > 70) {
      longTerm.push('重构代码以降低复杂度');
    }

    if (!structure.configFiles.some((f: string) => f.includes('docker'))) {
      longTerm.push('考虑容器化部署');
    }

    if (!structure.configFiles.some((f: string) => f.includes('ci'))) {
      longTerm.push('建立持续集成流程');
    }

    return { immediate, shortTerm, longTerm };
  }

  private calculateOverallConfidence(contexts: Context[], sessions: Session[]): number {
    const totalDataPoints = contexts.length + sessions.length;

    if (totalDataPoints < 10) return 0.3;
    if (totalDataPoints < 50) return 0.5;
    if (totalDataPoints < 200) return 0.7;
    if (totalDataPoints < 1000) return 0.85;
    return 0.95;
  }

  private generatePhaseSuggestions(phase: DevelopmentPhase): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];

    switch (phase) {
      case DevelopmentPhase.INITIALIZATION:
        suggestions.push({
          id: 'init-structure',
          title: '建立项目结构',
          description: '创建清晰的目录结构和基础配置',
          category: SuggestionCategory.ARCHITECTURE,
          priority: SuggestionPriority.HIGH,
          effort: 'low',
          impact: 'high',
          actionItems: [
            '创建 src、test、docs 目录',
            '添加 README.md 文件',
            '配置 .gitignore',
            '初始化包管理器'
          ]
        });
        break;

      case DevelopmentPhase.DEVELOPMENT:
        suggestions.push({
          id: 'dev-testing',
          title: '建立测试体系',
          description: '开始编写单元测试和集成测试',
          category: SuggestionCategory.TESTING,
          priority: SuggestionPriority.HIGH,
          effort: 'medium',
          impact: 'high',
          actionItems: [
            '选择测试框架',
            '编写第一个单元测试',
            '设置测试覆盖率目标',
            '集成测试到CI流程'
          ]
        });
        break;

      case DevelopmentPhase.TESTING:
        suggestions.push({
          id: 'test-coverage',
          title: '提高测试覆盖率',
          description: '确保关键路径都有测试覆盖',
          category: SuggestionCategory.TESTING,
          priority: SuggestionPriority.MEDIUM,
          effort: 'high',
          impact: 'medium',
          actionItems: [
            '分析测试覆盖率报告',
            '为关键功能添加测试',
            '添加端到端测试',
            '实施测试驱动开发'
          ]
        });
        break;

      case DevelopmentPhase.PRODUCTION:
        suggestions.push({
          id: 'prod-monitoring',
          title: '加强监控和日志',
          description: '建立完善的监控和日志体系',
          category: SuggestionCategory.DEPLOYMENT,
          priority: SuggestionPriority.HIGH,
          effort: 'medium',
          impact: 'high',
          actionItems: [
            '配置应用监控',
            '设置错误追踪',
            '建立日志聚合',
            '创建监控仪表板'
          ]
        });
        break;
    }

    return suggestions;
  }

  private generateHealthSuggestions(health: any): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];

    health.issues.forEach((issue: string) => {
      if (issue.includes('测试')) {
        suggestions.push({
          id: 'health-testing',
          title: '改善测试覆盖',
          description: issue,
          category: SuggestionCategory.TESTING,
          priority: SuggestionPriority.HIGH,
          effort: 'medium',
          impact: 'high',
          actionItems: ['添加单元测试', '配置测试框架', '设置覆盖率目标']
        });
      }

      if (issue.includes('错误')) {
        suggestions.push({
          id: 'health-errors',
          title: '处理未解决的错误',
          description: issue,
          category: SuggestionCategory.QUALITY,
          priority: SuggestionPriority.CRITICAL,
          effort: 'low',
          impact: 'high',
          actionItems: ['查看错误日志', '优先修复关键错误', '添加错误处理']
        });
      }

      if (issue.includes('复杂')) {
        suggestions.push({
          id: 'health-complexity',
          title: '降低代码复杂度',
          description: issue,
          category: SuggestionCategory.QUALITY,
          priority: SuggestionPriority.MEDIUM,
          effort: 'high',
          impact: 'medium',
          actionItems: ['识别复杂模块', '重构大型函数', '提取可重用组件']
        });
      }
    });

    return suggestions;
  }

  private generateTechStackSuggestions(techStack: any): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];

    if (!techStack.testing || techStack.testing.length === 0) {
      suggestions.push({
        id: 'tech-testing',
        title: '添加测试框架',
        description: '项目缺少测试框架',
        category: SuggestionCategory.TESTING,
        priority: SuggestionPriority.HIGH,
        effort: 'low',
        impact: 'high',
        actionItems: [
          '选择合适的测试框架',
          '配置测试环境',
          '编写示例测试'
        ]
      });
    }

    return suggestions;
  }

  private generateArchitectureSuggestions(architecture: any): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];

    if (architecture.patterns.length === 0) {
      suggestions.push({
        id: 'arch-pattern',
        title: '采用架构模式',
        description: '项目缺少明确的架构模式',
        category: SuggestionCategory.ARCHITECTURE,
        priority: SuggestionPriority.MEDIUM,
        effort: 'high',
        impact: 'high',
        actionItems: [
          '评估项目需求',
          '选择合适的架构模式',
          '重构代码结构',
          '文档化架构决策'
        ]
      });
    }

    return suggestions;
  }

  private getPhaseGuidelines(phase: DevelopmentPhase): string[] {
    const guidelines: Record<DevelopmentPhase, string[]> = {
      [DevelopmentPhase.INITIALIZATION]: [
        '建立清晰的项目结构',
        '定义编码规范',
        '配置版本控制',
        '创建基础文档'
      ],
      [DevelopmentPhase.DEVELOPMENT]: [
        '遵循编码规范',
        '定期代码审查',
        '持续集成',
        '保持代码简洁'
      ],
      [DevelopmentPhase.TESTING]: [
        '编写全面的测试',
        '保持高测试覆盖率',
        '自动化测试执行',
        '修复所有测试失败'
      ],
      [DevelopmentPhase.OPTIMIZATION]: [
        '性能分析和优化',
        '代码重构',
        '减少技术债务',
        '优化构建过程'
      ],
      [DevelopmentPhase.PRODUCTION]: [
        '监控应用性能',
        '快速响应问题',
        '保持文档更新',
        '定期安全审查'
      ],
      [DevelopmentPhase.MAINTENANCE]: [
        '保持依赖更新',
        '修复安全漏洞',
        '优化性能',
        '改善文档'
      ]
    };

    return guidelines[phase] || [];
  }

  private getPhaseNextSteps(phase: DevelopmentPhase): string[] {
    const nextSteps: Record<DevelopmentPhase, string[]> = {
      [DevelopmentPhase.INITIALIZATION]: [
        '完成项目基础架构',
        '开始实现核心功能',
        '建立开发流程'
      ],
      [DevelopmentPhase.DEVELOPMENT]: [
        '完成主要功能',
        '开始编写测试',
        '准备部署环境'
      ],
      [DevelopmentPhase.TESTING]: [
        '达到测试覆盖目标',
        '进行性能测试',
        '准备生产部署'
      ],
      [DevelopmentPhase.OPTIMIZATION]: [
        '完成性能优化',
        '减少技术债务',
        '准备发布'
      ],
      [DevelopmentPhase.PRODUCTION]: [
        '建立监控体系',
        '优化运维流程',
        '收集用户反馈'
      ],
      [DevelopmentPhase.MAINTENANCE]: [
        '计划新功能',
        '技术栈升级',
        '架构演进'
      ]
    };

    return nextSteps[phase] || [];
  }

  private getPhaseCommonIssues(phase: DevelopmentPhase): string[] {
    const issues: Record<DevelopmentPhase, string[]> = {
      [DevelopmentPhase.INITIALIZATION]: [
        '不清晰的项目结构',
        '缺少版本控制',
        '没有编码规范'
      ],
      [DevelopmentPhase.DEVELOPMENT]: [
        '代码质量下降',
        '缺少测试',
        '技术债务累积'
      ],
      [DevelopmentPhase.TESTING]: [
        '测试覆盖不足',
        '测试执行缓慢',
        '测试不稳定'
      ],
      [DevelopmentPhase.OPTIMIZATION]: [
        '过度优化',
        '破坏现有功能',
        '忽视新需求'
      ],
      [DevelopmentPhase.PRODUCTION]: [
        '监控不足',
        '响应缓慢',
        '文档过时'
      ],
      [DevelopmentPhase.MAINTENANCE]: [
        '依赖过时',
        '安全漏洞',
        '性能退化'
      ]
    };

    return issues[phase] || [];
  }

  private getPhaseBestPractices(phase: DevelopmentPhase): string[] {
    const practices: Record<DevelopmentPhase, string[]> = {
      [DevelopmentPhase.INITIALIZATION]: [
        '使用脚手架工具',
        '配置自动化工具',
        '建立CI/CD流程'
      ],
      [DevelopmentPhase.DEVELOPMENT]: [
        '测试驱动开发',
        '持续集成',
        '代码审查'
      ],
      [DevelopmentPhase.TESTING]: [
        '自动化测试',
        '测试金字塔',
        'A/B测试'
      ],
      [DevelopmentPhase.OPTIMIZATION]: [
        '性能监控',
        '渐进式优化',
        '基准测试'
      ],
      [DevelopmentPhase.PRODUCTION]: [
        '蓝绿部署',
        '灰度发布',
        '回滚机制'
      ],
      [DevelopmentPhase.MAINTENANCE]: [
        '自动化更新',
        '定期审查',
        '知识管理'
      ]
    };

    return practices[phase] || [];
  }

  private assessCodeMaturity(context: ProjectContext): number {
    let score = 0;

    if (context.features.hasTests) score += 20;
    if (context.features.hasCI) score += 20;
    if (context.features.hasDocumentation) score += 10;
    if (context.health.score > 70) score += 20;
    if (context.architecture.patterns.length > 0) score += 15;
    if (context.techStack.tools.length > 3) score += 15;

    return Math.min(100, score);
  }

  private assessTestingMaturity(context: ProjectContext): number {
    let score = 0;

    if (context.features.hasTests) score += 30;
    if (context.techStack.testing && context.techStack.testing.length > 0) score += 20;
    if (context.features.hasCI) score += 25;
    if (context.currentPhase === DevelopmentPhase.TESTING) score += 25;

    return Math.min(100, score);
  }

  private assessDocumentationMaturity(context: ProjectContext): number {
    let score = 0;

    if (context.features.hasDocumentation) score += 40;
    if (context.health.score > 60) score += 20;
    if (context.suggestions.immediate.length === 0) score += 20;
    if (context.metadata.dataPoints > 100) score += 20;

    return Math.min(100, score);
  }

  private assessArchitectureMaturity(context: ProjectContext): number {
    let score = 0;

    if (context.architecture.patterns.length > 0) score += 30;
    if (context.architecture.layers.length > 2) score += 20;
    if (context.architecture.style !== 'monolithic') score += 25;
    if (context.features.hasDocker) score += 25;

    return Math.min(100, score);
  }

  private assessOperationsMaturity(context: ProjectContext): number {
    let score = 0;

    if (context.features.hasCI) score += 20;
    if (context.features.hasDocker) score += 20;
    if (context.features.hasKubernetes) score += 20;
    if (context.features.hasMonitoring) score += 20;
    if (context.features.hasLogging) score += 20;

    return Math.min(100, score);
  }

  private generateMaturityRecommendations(
    level: string,
    dimensions: any
  ): string[] {
    const recommendations: string[] = [];

    // 基于最低分维度生成建议
    const lowestDimension = Object.entries(dimensions)
      .sort((a: [string, any], b: [string, any]) => (a[1] as number) - (b[1] as number))[0];

    const [dimension, score] = lowestDimension as [string, number];

    if (score < 50) {
      switch (dimension) {
        case 'code':
          recommendations.push('提高代码质量：添加代码检查工具、进行代码审查');
          break;
        case 'testing':
          recommendations.push('加强测试：编写单元测试、集成测试、端到端测试');
          break;
        case 'documentation':
          recommendations.push('完善文档：编写README、API文档、架构文档');
          break;
        case 'architecture':
          recommendations.push('改进架构：采用设计模式、模块化、分层架构');
          break;
        case 'operations':
          recommendations.push('优化运维：配置CI/CD、容器化、监控系统');
          break;
      }
    }

    // 基于成熟度级别生成建议
    switch (level) {
      case 'initial':
        recommendations.push('建立基础开发流程和规范');
        recommendations.push('开始版本控制和基础文档');
        break;
      case 'developing':
        recommendations.push('标准化开发流程');
        recommendations.push('建立测试体系');
        break;
      case 'defined':
        recommendations.push('优化开发流程');
        recommendations.push('提高自动化程度');
        break;
      case 'managed':
        recommendations.push('基于度量持续改进');
        recommendations.push('优化性能和质量');
        break;
      case 'optimizing':
        recommendations.push('持续创新和优化');
        recommendations.push('分享最佳实践');
        break;
    }

    return recommendations;
  }
}