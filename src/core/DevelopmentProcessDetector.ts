import {
  ProcessType,
  ProcessTypeEnum,
  InteractionContext,
} from "./auto-memory-types.js";

/**
 * 开发过程智能识别器
 * 自动识别用户的开发行为类型
 */
export class DevelopmentProcessDetector {
  private readonly PROCESS_PATTERNS = {
    code_change: {
      keywords: [
        "implement",
        "refactor",
        "optimize",
        "algorithm",
        "function",
        "class",
        "method",
        "实现",
        "优化",
        "算法",
        "函数",
        "类",
        "方法",
      ],
      patterns: [
        /\bfunction\s+\w+\s*\([^)]*\)\s*{/,
        /\bclass\s+\w+\s*{/,
        /\bconst\s+\w+\s*=\s*\(?[^)]*\)?\s*=>/,
        /\bdef\s+\w+\s*\([^)]*\)\s*:/,
        /\bpublic\s+\w+\s+\w+\s*\(/,
      ],
      confidence_boost: 20,
    },

    feature_add: {
      keywords: [
        "add",
        "create",
        "new",
        "implement",
        "build",
        "develop",
        "introduce",
        "添加",
        "新增",
        "创建",
        "构建",
        "引入",
        "new page",
        "new component",
        "new feature",
        "new functionality",
        "新页面",
        "新组件",
        "新功能",
      ],
      patterns: [
        /\bcreate\s+(new\s+)?[\w]+/i,
        /\badd\s+(new\s+)?[\w]+/i,
        /\bimplement\s+(new\s+)?[\w]+/i,
        /\bnew\s+(page|component|feature|module|function)/i,
        /\bbuild\s+(new\s+)?[\w]+/i,
      ],
      confidence_boost: 35,
    },

    bug_fix: {
      keywords: [
        "fix bug",
        "bug fix",
        "error",
        "issue",
        "resolve",
        "patch",
        "debug",
        "exception",
        "crash",
        "修复错误",
        "修复bug",
        "错误",
        "问题",
        "解决",
        "调试",
        "异常",
        "崩溃",
      ],
      patterns: [
        /\berror\b/i,
        /\bexception\b/i,
        /\bfix\s+bug\b/i,
        /\bbug\s+fix\b/i,
        /\bdebug\b/i,
        /\bcrash\b/i,
      ],
      confidence_boost: 25,
    },

    solution_design: {
      keywords: [
        "design",
        "architecture",
        "pattern",
        "strategy",
        "approach",
        "solution",
        "plan",
        "structure",
        "设计",
        "架构",
        "模式",
        "策略",
        "方案",
        "计划",
        "结构",
      ],
      patterns: [
        /\bdesign\b/i,
        /\barchitecture\b/i,
        /\bpattern\b/i,
        /\bstrategy\b/i,
        /\bapproach\b/i,
      ],
      confidence_boost: 30,
    },

    testing: {
      keywords: [
        "test",
        "unit",
        "integration",
        "e2e",
        "spec",
        "assertion",
        "mock",
        "测试",
        "单元",
        "集成",
        "断言",
        "模拟",
      ],
      patterns: [
        /\btest\b/i,
        /\bit\(/,
        /\bdescribe\(/,
        /\bexpect\(/,
        /\bassert\b/i,
      ],
      confidence_boost: 15,
    },

    documentation: {
      keywords: [
        "document",
        "readme",
        "comment",
        "doc",
        "guide",
        "tutorial",
        "文档",
        "说明",
        "注释",
        "指南",
        "教程",
      ],
      patterns: [/\/\*\*[\s\S]*?\*\//, /\/\/.*/, /#.*/, /```[\s\S]*?```/],
      confidence_boost: 10,
    },

    refactor: {
      keywords: [
        "refactor",
        "restructure",
        "reorganize",
        "cleanup",
        "improve",
        "重构",
        "重组",
        "清理",
        "改进",
      ],
      patterns: [/\brefactor\b/i, /\brestructure\b/i, /\breorganize\b/i],
      confidence_boost: 18,
    },
  };

  /**
   * 检测过程类型
   */
  async detectProcessType(
    content: string,
    context: InteractionContext
  ): Promise<ProcessType> {
    const scores: Record<string, number> = {};

    // 1. 关键词匹配评分
    for (const [type, config] of Object.entries(this.PROCESS_PATTERNS)) {
      let score = 0;

      // 关键词匹配
      const keywordMatches = config.keywords.filter((keyword) =>
        content.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      score += keywordMatches * 10;

      // 模式匹配
      const patternMatches = config.patterns.filter((pattern) =>
        pattern.test(content)
      ).length;
      score += patternMatches * 15;

      // 置信度提升
      score += config.confidence_boost;

      scores[type] = score;
    }

    // 2. 上下文分析
    const contextScore = this.analyzeContext(context);
    for (const type in scores) {
      scores[type] += contextScore[type] || 0;
    }

    // 3. 选择最高分类型
    const bestMatch = Object.entries(scores).reduce((a, b) =>
      scores[a[0]] > scores[b[0]] ? a : b
    );

    const processType = bestMatch[0] as ProcessTypeEnum;
    const confidence = Math.min(100, bestMatch[1]);

    return {
      type: processType,
      confidence: confidence,
      key_elements: this.extractKeyElements(content, processType),
      reasoning: this.generateReasoning(scores, processType),
    };
  }

  /**
   * 分析上下文
   */
  private analyzeContext(context: InteractionContext): Record<string, number> {
    const scores: Record<string, number> = {};

    // 基于用户历史行为分析
    if (context.userHistory && context.userHistory.length > 0) {
      const recentActivities = context.userHistory.slice(-10);

      // 代码提交频率
      const codeSubmissions = recentActivities.filter(
        (a) => a.type === "code_change"
      ).length;
      scores.code_change = codeSubmissions * 5;

      // Bug修复频率
      const bugFixes = recentActivities.filter(
        (a) => a.type === "bug_fix"
      ).length;
      scores.bug_fix = bugFixes * 8;

      // 方案设计频率
      const designs = recentActivities.filter(
        (a) => a.type === "solution_design"
      ).length;
      scores.solution_design = designs * 6;
    }

    return scores;
  }

  /**
   * 提取关键元素
   */
  private extractKeyElements(
    content: string,
    type: ProcessTypeEnum
  ): {
    files?: string[];
    functions?: string[];
    classes?: string[];
    keywords?: string[];
  } {
    const elements: {
      files?: string[];
      functions?: string[];
      classes?: string[];
      keywords?: string[];
    } = {};

    // 提取文件路径
    const fileMatches = content.match(
      /[\w-]+\.[\w]+|[\w-]+\/[\w-]+\.[\w]+|[\w-]+\\[\w-]+\.[\w]+/g
    );
    if (fileMatches) {
      elements.files = [...new Set(fileMatches)].slice(0, 5);
    }

    // 提取函数名
    const functionMatches = content.match(
      /function\s+(\w+)|def\s+(\w+)|const\s+(\w+)\s*=/g
    );
    if (functionMatches) {
      elements.functions = [...new Set(functionMatches)].slice(0, 5);
    }

    // 提取类名
    const classMatches = content.match(/class\s+(\w+)/g);
    if (classMatches) {
      elements.classes = [...new Set(classMatches)].slice(0, 5);
    }

    // 提取关键词
    const config = this.PROCESS_PATTERNS[type];
    if (config) {
      const matchedKeywords = config.keywords.filter((keyword) =>
        content.toLowerCase().includes(keyword.toLowerCase())
      );
      elements.keywords = [...new Set(matchedKeywords)].slice(0, 5);
    }

    return elements;
  }

  /**
   * 生成推理说明
   */
  private generateReasoning(
    scores: Record<string, number>,
    bestType: string
  ): string {
    const sortedScores = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const reasons = sortedScores.map(
      ([type, score]) => `${type}(${score.toFixed(0)})`
    );

    return `Detected as ${bestType} based on scores: ${reasons.join(", ")}`;
  }
}
