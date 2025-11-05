import { ProcessType, ValueScore } from "./auto-memory-types.js";

/**
 * 开发内容价值评估器
 * 智能判断开发内容的记忆价值
 */
export class DevelopmentValueEvaluator {
  private readonly VALUE_WEIGHTS = {
    code_significance: 0.3,
    problem_complexity: 0.25,
    solution_importance: 0.25,
    reusability: 0.2,
  };

  /**
   * 评估内容价值
   */
  async evaluateContentValue(
    content: string,
    processType: ProcessType,
    customWeights?: {
      code_significance: number;
      problem_complexity: number;
      solution_importance: number;
      reusability: number;
    }
  ): Promise<ValueScore> {
    // 使用自定义权重或默认权重
    const weights = customWeights || this.VALUE_WEIGHTS;

    // 1. 代码显著性评估
    const codeSignificance = await this.assessCodeSignificance(
      content,
      processType
    );

    // 2. 问题复杂度评估
    const problemComplexity = await this.assessProblemComplexity(
      content,
      processType
    );

    // 3. 解决方案重要性评估
    const solutionImportance = await this.assessSolutionImportance(
      content,
      processType
    );

    // 4. 可复用性评估
    const reusability = await this.assessReusability(content, processType);

    // 5. 综合评分计算（使用传入的权重）
    const totalScore =
      codeSignificance * weights.code_significance +
      problemComplexity * weights.problem_complexity +
      solutionImportance * weights.solution_importance +
      reusability * weights.reusability;

    return {
      code_significance: codeSignificance,
      problem_complexity: problemComplexity,
      solution_importance: solutionImportance,
      reusability: reusability,
      total_score: Math.round(totalScore),
      breakdown: {
        code_details: this.getCodeSignificanceDetails(content),
        problem_details: this.getProblemComplexityDetails(content),
        solution_details: this.getSolutionImportanceDetails(content),
        reusability_details: this.getReusabilityDetails(content),
      },
    };
  }

  /**
   * 评估代码显著性
   */
  private async assessCodeSignificance(
    content: string,
    processType: ProcessType
  ): Promise<number> {
    let score = 0;

    // 算法复杂度检测
    const algorithmKeywords = [
      "algorithm",
      "complexity",
      "big o",
      "optimization",
      "performance",
      "算法",
      "复杂度",
      "优化",
      "性能",
    ];
    const algorithmMatches = algorithmKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += algorithmMatches * 15;

    // 代码质量指标
    const codeQualityIndicators = [
      { pattern: /\b(clean code|SOLID|design pattern)\b/gi, score: 20 },
      {
        pattern: /\b(test coverage|unit test|integration test)\b/gi,
        score: 15,
      },
      { pattern: /\b(performance|scalability|efficiency)\b/gi, score: 18 },
    ];

    for (const indicator of codeQualityIndicators) {
      if (indicator.pattern.test(content)) {
        score += indicator.score;
      }
    }

    // 代码长度和复杂度
    const lines = content.split("\n").length;
    score += Math.min(20, lines / 10);

    // 根据过程类型调整
    if (processType.type === "code_change" || processType.type === "refactor") {
      score *= 1.2; // 代码变更和重构提升20%
    } else if (processType.type === "feature_add") {
      // 新功能添加：即使没有详细代码，也给基础分
      score = Math.max(score, 30); // 保证最低30分
    }

    return Math.min(100, score);
  }

  /**
   * 评估问题复杂度
   */
  private async assessProblemComplexity(
    content: string,
    processType: ProcessType
  ): Promise<number> {
    let score = 0;

    // 多文件修改检测（新增）
    const fileCountMatch = content.match(/(文件修改|修改文件|files? changed?|modified files?)[:|：]/i);
    if (fileCountMatch) {
      // 提取文件数量
      const fileMatches = content.match(/[-*]\s+[^\n]+\.(tsx?|jsx?|vue|py|java|go|rs|cpp|c|h)/gi);
      if (fileMatches) {
        const fileCount = fileMatches.length;
        if (fileCount >= 5) score += 40;
        else if (fileCount >= 3) score += 25;
        else if (fileCount >= 2) score += 15;
      }
    }

    // 代码行数统计（新增）
    const linesAddedMatch = content.match(/(\d+)\s*(lines?|\u884c)\s*(added?|new|新增)/i);
    if (linesAddedMatch) {
      const linesAdded = parseInt(linesAddedMatch[1]);
      score += Math.min(30, linesAdded / 10);
    }

    // 问题描述复杂度
    const complexityKeywords = [
      "race condition",
      "deadlock",
      "memory leak",
      "concurrency",
      "distributed system",
      "microservices",
      "scalability",
      "performance bottleneck",
      "security vulnerability",
      "竞态条件",
      "死锁",
      "内存泄漏",
      "并发",
      "分布式",
      "微服务",
      "可扩展性",
      "性能瓶颈",
      "安全漏洞",
    ];

    const complexityMatches = complexityKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += complexityMatches * 12;

    // 技术栈深度
    const techStackDepth = this.analyzeTechStackDepth(content);
    score += techStackDepth * 8;

    // 问题影响范围
    const impactIndicators = [
      { pattern: /\b(production|critical|urgent|security)\b/gi, score: 25 },
      { pattern: /\b(user|customer|business impact)\b/gi, score: 20 },
      { pattern: /\b(system|infrastructure|database)\b/gi, score: 15 },
    ];

    for (const indicator of impactIndicators) {
      if (indicator.pattern.test(content)) {
        score += indicator.score;
      }
    }

    // 根据过程类型调整
    if (processType.type === "bug_fix") {
      score *= 1.3; // Bug修复提升30%
    } else if (processType.type === "feature_add" && score > 0) {
      score *= 1.2; // 新功能添加提升20%
    }

    return Math.min(100, score);
  }

  /**
   * 评估解决方案重要性
   */
  private async assessSolutionImportance(
    content: string,
    processType: ProcessType
  ): Promise<number> {
    let score = 0;

    // 创新性
    const innovationKeywords = [
      "novel",
      "innovative",
      "creative",
      "unique",
      "new approach",
      "创新",
      "新颖",
      "独特",
      "新方法",
    ];
    const innovationMatches = innovationKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += innovationMatches * 15;

    // 通用性
    const genericityKeywords = [
      "generic",
      "reusable",
      "extensible",
      "flexible",
      "通用",
      "可复用",
      "可扩展",
      "灵活",
    ];
    const genericityMatches = genericityKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += genericityMatches * 12;

    // 完整性
    const completenessKeywords = [
      "complete",
      "comprehensive",
      "thorough",
      "detailed",
      "完整",
      "全面",
      "详细",
    ];
    const completenessMatches = completenessKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += completenessMatches * 10;

    // UX/用户体验价值识别（新增）
    const uxKeywords = [
      "user experience",
      "ux",
      "usability",
      "accessibility",
      "user interface",
      "ui improvement",
      "interaction",
      "responsive",
      "用户体验",
      "可用性",
      "交互",
      "界面优化",
      "响应式",
    ];
    const uxMatches = uxKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += uxMatches * 18;

    // i18n/国际化价值识别（新增）
    const i18nKeywords = [
      "internationalization",
      "i18n",
      "localization",
      "l10n",
      "translation",
      "multilingual",
      "locale",
      "language support",
      "国际化",
      "本地化",
      "多语言",
      "翻译",
    ];
    const i18nMatches = i18nKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += i18nMatches * 20;

    // 根据过程类型调整
    if (processType.type === "solution_design") {
      score *= 1.4; // 方案设计提升40%
    } else if (processType.type === "feature_add") {
      score *= 1.2; // 新功能添加提升20%
    }

    return Math.min(100, score);
  }

  /**
   * 评估可复用性
   */
  private async assessReusability(
    content: string,
    processType: ProcessType
  ): Promise<number> {
    let score = 0;

    // 抽象程度
    const abstractionKeywords = [
      "abstract",
      "interface",
      "generic",
      "template",
      "抽象",
      "接口",
      "泛型",
      "模板",
    ];
    const abstractionMatches = abstractionKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += abstractionMatches * 15;

    // 文档完整性
    const hasDocumentation =
      content.includes("/**") ||
      content.includes("///") ||
      content.includes("```");
    if (hasDocumentation) {
      score += 20;
    }

    // 适用场景广度
    const versatilityKeywords = [
      "versatile",
      "flexible",
      "adaptable",
      "configurable",
      "多用途",
      "灵活",
      "可配置",
    ];
    const versatilityMatches = versatilityKeywords.filter((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += versatilityMatches * 12;

    // 代码示例
    const hasCodeExample =
      content.includes("```") || content.includes("example");
    if (hasCodeExample) {
      score += 15;
    }

    // 可复用模式识别（新增）
    const reusablePatterns = [
      {
        name: "HashRouter anchor handling",
        keywords: ["hashrouter", "anchor", "scrollintoview", "preventdefault"],
        score: 20,
      },
      {
        name: "i18n integration pattern",
        keywords: ["uselanguage", "i18n", "translation", "locale"],
        score: 20,
      },
      {
        name: "Error boundary",
        keywords: ["errorboundary", "componentdidcatch", "fallback"],
        score: 25,
      },
      {
        name: "Custom React hook",
        keywords: ["hook", "useeffect", "usestate"],
        patterns: [/use[A-Z]\w+/],
        score: 20,
      },
      {
        name: "State management pattern",
        keywords: ["redux", "context", "provider", "store"],
        score: 18,
      },
    ];

    for (const pattern of reusablePatterns) {
      let matches = 0;

      // 关键词匹配
      if (pattern.keywords) {
        matches = pattern.keywords.filter((kw) =>
          content.toLowerCase().includes(kw.toLowerCase())
        ).length;
      }

      // 正则匹配
      if (pattern.patterns) {
        matches += pattern.patterns.filter((p) => p.test(content)).length;
      }

      // 至少匹配2个特征才认为是该模式
      if (matches >= 2) {
        score += pattern.score;
      }
    }

    return Math.min(100, score);
  }

  /**
   * 分析技术栈深度
   */
  private analyzeTechStackDepth(content: string): number {
    const technologies = [
      "react",
      "vue",
      "angular",
      "node",
      "python",
      "java",
      "typescript",
      "javascript",
      "sql",
      "mongodb",
      "redis",
      "docker",
      "kubernetes",
      "aws",
      "azure",
      "gcp",
    ];

    const matchedTech = technologies.filter((tech) =>
      content.toLowerCase().includes(tech)
    );

    return matchedTech.length;
  }

  /**
   * 获取代码显著性详情
   */
  private getCodeSignificanceDetails(content: string): string {
    const details: string[] = [];

    if (content.toLowerCase().includes("algorithm")) {
      details.push("Contains algorithm implementation");
    }
    if (content.toLowerCase().includes("optimization")) {
      details.push("Includes optimization techniques");
    }
    if (content.toLowerCase().includes("performance")) {
      details.push("Addresses performance concerns");
    }

    return details.length > 0 ? details.join("; ") : "Standard code change";
  }

  /**
   * 获取问题复杂度详情
   */
  private getProblemComplexityDetails(content: string): string {
    const details: string[] = [];

    if (content.toLowerCase().includes("memory leak")) {
      details.push("Memory leak issue");
    }
    if (content.toLowerCase().includes("concurrency")) {
      details.push("Concurrency problem");
    }
    if (content.toLowerCase().includes("security")) {
      details.push("Security concern");
    }

    return details.length > 0
      ? details.join("; ")
      : "Standard complexity problem";
  }

  /**
   * 获取解决方案重要性详情
   */
  private getSolutionImportanceDetails(content: string): string {
    const details: string[] = [];

    if (content.toLowerCase().includes("innovative")) {
      details.push("Innovative approach");
    }
    if (content.toLowerCase().includes("comprehensive")) {
      details.push("Comprehensive solution");
    }
    if (content.toLowerCase().includes("extensible")) {
      details.push("Extensible design");
    }

    return details.length > 0
      ? details.join("; ")
      : "Standard solution approach";
  }

  /**
   * 获取可复用性详情
   */
  private getReusabilityDetails(content: string): string {
    const details: string[] = [];

    if (content.includes("/**") || content.includes("///")) {
      details.push("Well documented");
    }
    if (content.toLowerCase().includes("generic")) {
      details.push("Generic implementation");
    }
    if (content.includes("```")) {
      details.push("Includes code examples");
    }

    return details.length > 0
      ? details.join("; ")
      : "Standard reusability level";
  }
}
