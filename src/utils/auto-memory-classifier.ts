/**
 * 自动记忆分类器（v2.2.0）
 *
 * 功能：
 * 1. 自动识别上下文类型（代码、文档、错误、测试等）
 * 2. 智能判断是否需要强制记忆
 * 3. 基于内容特征的记忆层级决策
 * 4. 支持中英文混合场景
 */

import { ContextType } from '../types.js';

export interface ClassificationResult {
  type: ContextType;
  confidence: number;
  forceRemember: boolean;
  memoryTier: 'silent' | 'notify' | 'none';
  reasoning: string;
  features: string[]; // 触发分类的特征关键词
  changeType?: 'add' | 'modify' | 'delete' | 'refactor' | 'rename';
  impactLevel?: 'breaking' | 'major' | 'minor' | 'patch';
}

export interface ClassificationConfig {
  minConfidenceThreshold: number;
  enableForceRememberDetection: boolean;
  enableTierOptimization: boolean;
}

export class AutoMemoryClassifier {
  private config: ClassificationConfig;

  // 记忆类型关键词映射
  private typePatterns: Partial<Record<ContextType, RegExp[]>> = {
    [ContextType.CODE_CREATE]: [
      /\b(new|create|add)\s+(function|class|component|module)\b/i,
      /\bcreate\s+(\w+)\s+(file|component|module)\b/i,
      /新增|创建|新建|添加/i,
    ],
    [ContextType.CODE_MODIFY]: [
      /\b(update|modify|change|refactor)\s+(code|function|class)\b/i,
      /\bmodify|change|update|编辑|修改/i,
      /\bperformance|optimiz/i,
    ],
    [ContextType.CODE_DELETE]: [
      /\b(remove|delete|deprecated)\s+(code|function|class)\b/i,
      /删除|移除|废弃/i,
      /TODO:\s*remove/i,
    ],
    [ContextType.CODE_REFACTOR]: [
      /\b(refactor|restructure|restructure)\b/i,
      /\brefactor|重构|优化结构/i,
      /\bimprove\s+(code|structure|performance)\b/i,
    ],
    [ContextType.CODE_OPTIMIZE]: [
      /\boptimiz(e|ation)|performance|improve\s+speed\b/i,
      /优化|性能|效率/i,
    ],
    [ContextType.BUG_FIX]: [
      /\b(fix|bug|error|issue|exception|debug)\b/i,
      /修复|调试|错误|异常|问题/i,
      /\berror|exception|bug|缺陷/i,
    ],
    [ContextType.BUG_REPORT]: [
      /\b(report|found|discover)\s+(bug|error|issue)\b/i,
      /报告|发现\s+(bug|错误|问题)/i,
    ],
    [ContextType.FEATURE_ADD]: [
      /\b(add|implement|build)\s+(feature|functionality)\b/i,
      /添加|实现|新增\s+(功能|特性)/i,
      /\bfeature\b/i,
    ],
    [ContextType.FEATURE_UPDATE]: [
      /\b(update|enhance|improve)\s+(feature|functionality)\b/i,
      /更新|增强|改进\s+(功能|特性)/i,
    ],
    [ContextType.FEATURE_REMOVE]: [
      /\b(remove|deprecated)\s+(feature|functionality)\b/i,
      /移除|废弃\s+(功能|特性)/i,
    ],
    [ContextType.TEST]: [
      /\b(test|spec|testing|unit|integration|e2e)\b/i,
      /测试|单元测试|集成测试/i,
      /\bit\b|\bdescribe\b|\bexpect\b/i,
    ],
    [ContextType.DOCUMENTATION]: [
      /\b(doc|document|readme|guide|documentation)\b/i,
      /文档|说明|README|指南/i,
      /#\s+\w+/m, // Markdown 标题
    ],
    [ContextType.SOLUTION]: [
      /\b(solution|resolve|fix|answer)\b/i,
      /解决方案|解决|修复|答案/i,
      /\bresolved|fixed|solved/i,
    ],
    [ContextType.DESIGN]: [
      /\b(design|architecture|pattern|structure)\b/i,
      /设计|架构|模式|结构/i,
      /\bUML|diagram|架构图/i,
    ],
    [ContextType.LEARNING]: [
      /\b(learn|study|understand|explore)\b/i,
      /学习|研究|理解|探索/i,
    ],
    [ContextType.CONFIGURATION]: [
      /\b(config|setup|environment|deploy)\b/i,
      /配置|设置|环境|部署/i,
      /\.env|config|settings/i,
    ],
    [ContextType.COMMIT]: [
      /\b(commit|git|branch|merge)\b/i,
      /提交|分支|合并/i,
    ],
    [ContextType.ERROR]: [
      /\b(fail|failed|crash|broken|cannot|unable)\b/i,
      /失败|错误|崩溃|无法/i,
    ],
    [ContextType.CONVERSATION]: [
      /\b(think|consider|maybe|perhaps|hmm)\b/i,
      /思考|考虑|或许|可能/i,
    ],
  };

  // 强制记忆关键词
  private forceRememberPatterns: RegExp[] = [
    /\b(remember|save|记住|保存)\b/i,
    /\b(important|critical|key|essential|核心|关键|重要)\b/i,
    /\b(note|todo|fixme)\b/i,
    /#\s*IMPORTANT/i,
    /⚠️|🚨|⭐/,
  ];

  // 影响级别关键词
  private impactLevelPatterns: Record<string, RegExp[]> = {
    breaking: [
      /\b(breaking|major|deprecate|remove\s+support)\b/i,
      /破坏性|重大|废弃/i,
    ],
    major: [
      /\b(major|significant|important|enhance)\b/i,
      /重要|重大|显著/i,
    ],
    minor: [
      /\b(minor|small|tweak|minor)\b/i,
      /轻微|小改动/i,
    ],
    patch: [
      /\b(patch|bugfix|hotfix)\b/i,
      /补丁|修复/i,
    ],
  };

  // 变更类型关键词
  private changeTypePatterns: Record<string, RegExp[]> = {
    add: [
      /\b(add|create|new|insert)\b/i,
      /添加|新增|创建/i,
    ],
    modify: [
      /\b(update|modify|change|edit)\b/i,
      /修改|更新|编辑/i,
    ],
    delete: [
      /\b(remove|delete|drop)\b/i,
      /删除|移除/i,
    ],
    refactor: [
      /\b(refactor|restructure|restructure)\b/i,
      /重构|重组/i,
    ],
    rename: [
      /\b(rename|move)\b/i,
      /重命名|移动/i,
    ],
  };

  constructor(config: Partial<ClassificationConfig> = {}) {
    this.config = {
      minConfidenceThreshold: 0.6,
      enableForceRememberDetection: true,
      enableTierOptimization: true,
      ...config,
    };
  }

  /**
   * 对内容进行自动分类
   */
  classify(content: string, metadata?: Record<string, any>): ClassificationResult {
    // 1. 检测记忆类型
    const typeDetection = this.detectType(content, metadata);

    // 2. 检测是否需要强制记忆
    const forceRemember = this.shouldForceRemember(content, metadata);

    // 3. 确定记忆层级
    const memoryTier = this.determineMemoryTier(typeDetection.type, forceRemember);

    // 4. 检测变更类型
    const changeType = this.detectChangeType(content, metadata);

    // 5. 评估影响级别
    const impactLevel = this.assessImpactLevel(content, typeDetection);

    return {
      type: typeDetection.type,
      confidence: typeDetection.confidence,
      forceRemember,
      memoryTier,
      reasoning: typeDetection.reasoning,
      features: typeDetection.features,
      changeType,
      impactLevel,
    };
  }

  /**
   * 检测记忆类型
   */
  private detectType(
    content: string,
    metadata?: Record<string, any>
  ): {
    type: ContextType;
    confidence: number;
    reasoning: string;
    features: string[];
  } {
    const scores: Record<ContextType, number> = {} as any;
    const matchedFeatures: string[] = [];

    // 从元数据中提取特征
    if (metadata?.change_type) {
      const changeType = metadata.change_type as string;
      const typeMap: Record<string, ContextType> = {
        'add': ContextType.CODE_CREATE,
        'modify': ContextType.CODE_MODIFY,
        'delete': ContextType.CODE_DELETE,
        'refactor': ContextType.CODE_REFACTOR,
        'rename': ContextType.CODE_MODIFY, // 临时映射到 CODE_MODIFY
      };
      const mappedType = typeMap[changeType];
      if (mappedType) {
        scores[mappedType] = (scores[mappedType] || 0) + 0.8;
        matchedFeatures.push(`change_type:${changeType}`);
      }
    }

    // 模式匹配评分
    const contentLower = content.toLowerCase();
    for (const [type, patterns] of Object.entries(this.typePatterns)) {
      let typeScore = 0;
      const matchedPatterns: string[] = [];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          typeScore += 0.3;
          matchedPatterns.push(pattern.source);
        }
      }

      // 检查代码特征（如果内容看起来像代码）
      if (type.startsWith('code_') && this.looksLikeCode(content)) {
        typeScore += 0.2;
        matchedPatterns.push('code_syntax');
      }

      if (typeScore > 0) {
        scores[type as ContextType] = (scores[type as ContextType] || 0) + typeScore;
        if (matchedPatterns.length > 0) {
          matchedFeatures.push(`${type}:${matchedPatterns.join(',')}`);
        }
      }
    }

    // 找到得分最高的类型
    const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [bestType, bestScore] = sortedScores[0] || [ContextType.CONVERSATION, 0];

    // 计算置信度
    const confidence = Math.min(bestScore, 1.0);

    // 生成推理说明
    const reasoning = this.generateReasoning(bestType as ContextType, confidence, matchedFeatures);

    return {
      type: bestType as ContextType,
      confidence,
      reasoning,
      features: matchedFeatures,
    };
  }

  /**
   * 检测是否需要强制记忆
   */
  private shouldForceRemember(content: string, metadata?: Record<string, any>): boolean {
    if (!this.config.enableForceRememberDetection) {
      return false;
    }

    // 检查明确的强制记忆标记
    for (const pattern of this.forceRememberPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // 检查元数据中的 force_remember 字段
    if (metadata?.force_remember === true) {
      return true;
    }

    // 检查高价值内容特征
    const highValueFeatures = [
      /\b(important|critical|key|核心|关键)\b/i,
      /\b(architecture|design|pattern)\b/i,
      /\b(security|auth|permission)\b/i,
      /\b(api|endpoint|interface)\b/i,
      /\b(database|schema|model)\b/i,
    ];

    for (const pattern of highValueFeatures) {
      if (pattern.test(content)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 确定记忆层级
   */
  private determineMemoryTier(
    type: ContextType,
    forceRemember: boolean
  ): 'silent' | 'notify' | 'none' {
    if (forceRemember) {
      return 'silent'; // 强制记忆使用静默模式
    }

    // 静默记忆类型（自动记录）
    const silentTypes: ContextType[] = [
      ContextType.BUG_FIX,
      ContextType.BUG_REPORT,
      ContextType.FEATURE_ADD,
      ContextType.FEATURE_UPDATE,
      ContextType.FEATURE_REMOVE,
      ContextType.CODE_CREATE,
      ContextType.CODE_MODIFY,
      ContextType.CODE_REFACTOR,
      ContextType.CODE_OPTIMIZE,
      ContextType.CODE_DELETE,
      ContextType.TEST,
      ContextType.COMMIT,
      ContextType.CONFIGURATION,
    ];

    // 通知记忆类型（提示用户）
    const notifyTypes: ContextType[] = [
      ContextType.SOLUTION,
      ContextType.DESIGN,
      ContextType.DOCUMENTATION,
      ContextType.LEARNING,
    ];

    // 不记忆类型
    const noneTypes: ContextType[] = [
      ContextType.CONVERSATION,
      ContextType.ERROR,
    ];

    if (silentTypes.includes(type)) {
      return 'silent';
    } else if (notifyTypes.includes(type)) {
      return 'notify';
    } else if (noneTypes.includes(type)) {
      return 'none';
    }

    // 默认：其他类型也记忆（安全策略）
    return 'silent';
  }

  /**
   * 检测变更类型
   */
  private detectChangeType(content: string, metadata?: Record<string, any>): 'add' | 'modify' | 'delete' | 'refactor' | 'rename' | undefined {
    // 从元数据直接获取
    if (metadata?.change_type) {
      const validTypes = ['add', 'modify', 'delete', 'refactor', 'rename'];
      if (validTypes.includes(metadata.change_type)) {
        return metadata.change_type as any;
      }
    }

    // 模式匹配
    for (const [changeType, patterns] of Object.entries(this.changeTypePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          return changeType as any;
        }
      }
    }

    return undefined;
  }

  /**
   * 评估影响级别
   */
  private assessImpactLevel(
    content: string,
    typeDetection: { type: ContextType; confidence: number }
  ): 'breaking' | 'major' | 'minor' | 'patch' | undefined {
    // 模式匹配
    for (const [level, patterns] of Object.entries(this.impactLevelPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          return level as any;
        }
      }
    }

    // 基于类型的默认级别
    const typeImpactMap: Partial<Record<ContextType, 'breaking' | 'major' | 'minor' | 'patch'>> = {
      [ContextType.CODE_CREATE]: 'minor',
      [ContextType.CODE_MODIFY]: 'minor',
      [ContextType.CODE_DELETE]: 'major',
      [ContextType.CODE_REFACTOR]: 'major',
      [ContextType.CODE_OPTIMIZE]: 'minor',
      [ContextType.BUG_FIX]: 'patch',
      [ContextType.BUG_REPORT]: 'minor',
      [ContextType.FEATURE_ADD]: 'major',
      [ContextType.FEATURE_UPDATE]: 'minor',
      [ContextType.FEATURE_REMOVE]: 'major',
      [ContextType.TEST]: 'minor',
      [ContextType.DOCUMENTATION]: 'minor',
      [ContextType.SOLUTION]: 'minor',
      [ContextType.DESIGN]: 'major',
      [ContextType.LEARNING]: 'minor',
      [ContextType.CONFIGURATION]: 'minor',
      [ContextType.COMMIT]: 'minor',
      [ContextType.ERROR]: 'minor',
      [ContextType.CONVERSATION]: 'minor',
    };

    return typeImpactMap[typeDetection.type];
  }

  /**
   * 判断内容是否像代码
   */
  private looksLikeCode(content: string): boolean {
    const codeIndicators = [
      /\b(function|class|const|let|var|import|export)\b/,
      /\b(def|class|import|from)\b/, // Python
      /\b(func|type|struct)\b/, // Go/Rust
      /\{[\s\S]*\}/, // 大括号
      /\(/, // 圆括号
      /=>/, // 箭头函数
    ];

    return codeIndicators.some(pattern => pattern.test(content));
  }

  /**
   * 生成推理说明
   */
  private generateReasoning(
    type: ContextType,
    confidence: number,
    features: string[]
  ): string {
    const confidenceLevel = confidence >= 0.8 ? '高' : confidence >= 0.6 ? '中' : '低';
    const featureCount = features.length;

    return `类型: ${type}, 置信度: ${confidenceLevel} (${confidence.toFixed(2)}), 匹配特征: ${featureCount}个`;
  }

  /**
   * 批量分类
   */
  batchClassify(contents: Array<{ content: string; metadata?: Record<string, any> }>): ClassificationResult[] {
    return contents.map(item => this.classify(item.content, item.metadata));
  }

  /**
   * 获取分类统计信息
   */
  getClassificationStats(results: ClassificationResult[]): Record<ContextType, number> {
    const stats: Record<ContextType, number> = {} as any;
    results.forEach(result => {
      stats[result.type] = (stats[result.type] || 0) + 1;
    });
    return stats;
  }
}
