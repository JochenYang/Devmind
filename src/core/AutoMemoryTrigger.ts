import {
  ProcessType,
  ValueScore,
  AutoMemoryDecision,
  BasicDecision,
  EnhancedDecision,
  ContentFeatures,
} from "./auto-memory-types.js";

/**
 * 自动记忆触发引擎
 * 根据评估结果决定是否自动记忆
 */
export class AutoMemoryTrigger {
  private readonly MEMORY_THRESHOLDS = {
    HIGH_VALUE: 80, // 高价值：自动记忆
    MEDIUM_VALUE: 50, // 中价值：询问确认
    LOW_VALUE: 25, // 低价值：忽略
  };

  /**
   * 判断是否应该自动记忆
   */
  async shouldAutoRemember(
    content: string,
    processType: ProcessType,
    valueScore: ValueScore,
    customThresholds?: {
      high_value: number;
      medium_value: number;
      low_value: number;
    }
  ): Promise<AutoMemoryDecision> {
    // 使用自定义阈值或默认阈值
    const thresholds = customThresholds || this.MEMORY_THRESHOLDS;

    // 1. 基础评分判断（使用传入的阈值）
    let decision = this.makeBasicDecision(valueScore.total_score, thresholds);

    // 2. 上下文增强判断
    decision = this.enhanceWithContext(decision, content, processType);

    // 3. 用户偏好调整（预留接口）
    decision = this.adjustForUserPreferences(decision, processType);

    // 4. 生成决策理由
    const reasoning = this.generateDecisionReasoning(
      valueScore,
      processType,
      decision.action
    );

    return {
      action: decision.action,
      confidence: decision.confidence,
      reasoning: reasoning,
      memory_type: this.determineMemoryType(processType, valueScore),
      priority: this.calculatePriority(decision.action, valueScore),
      suggested_tags: this.generateSuggestedTags(content, processType),
      metadata: {
        score_breakdown: valueScore.breakdown,
        process_confidence: processType.confidence,
        timestamp: new Date(),
        version: "1.0",
      },
    };
  }

  /**
   * 基础决策
   */
  private makeBasicDecision(
    score: number,
    thresholds: {
      HIGH_VALUE?: number;
      MEDIUM_VALUE?: number;
      LOW_VALUE?: number;
      high_value?: number;
      medium_value?: number;
      low_value?: number;
    } = this.MEMORY_THRESHOLDS
  ): BasicDecision {
    // 兼容两种命名方式
    const highThreshold = thresholds.HIGH_VALUE ?? thresholds.high_value ?? 80;
    const mediumThreshold =
      thresholds.MEDIUM_VALUE ?? thresholds.medium_value ?? 50;

    if (score >= highThreshold) {
      return {
        action: "auto_remember",
        confidence: 0.9,
        reason: "High-value content, auto-remember",
      };
    }

    if (score >= mediumThreshold) {
      return {
        action: "ask_confirmation",
        confidence: 0.7,
        reason: "Medium-value content, suggest confirmation",
      };
    }

    return {
      action: "ignore",
      confidence: 0.8,
      reason: "Low-value content, ignore",
    };
  }

  /**
   * 上下文增强决策
   */
  private enhanceWithContext(
    decision: BasicDecision,
    content: string,
    processType: ProcessType
  ): EnhancedDecision {
    // 分析内容特征
    const contentFeatures = this.analyzeContentFeatures(content);

    // 如果是罕见问题，即使分数中等也建议记忆
    if (processType.type === "bug_fix" && contentFeatures.is_rare_issue) {
      return {
        ...decision,
        action:
          decision.action === "ignore" ? "ask_confirmation" : decision.action,
        confidence: Math.min(0.9, decision.confidence + 0.1),
        enhancement_reason: "Rare issue detected, suggest remembering",
      };
    }

    // 如果是高复用性内容，降低记忆门槛
    if (
      contentFeatures.high_reusability &&
      decision.action === "ask_confirmation"
    ) {
      return {
        ...decision,
        action: "auto_remember",
        confidence: Math.min(0.9, decision.confidence + 0.1),
        enhancement_reason: "High reusability content, auto-remember",
      };
    }

    // 如果包含架构设计，提升优先级
    if (
      contentFeatures.has_architecture &&
      decision.action === "ask_confirmation"
    ) {
      return {
        ...decision,
        action: "auto_remember",
        confidence: Math.min(0.9, decision.confidence + 0.15),
        enhancement_reason: "Architecture design detected, auto-remember",
      };
    }

    // 如果包含性能优化，提升优先级
    if (contentFeatures.has_performance && decision.action === "ignore") {
      return {
        ...decision,
        action: "ask_confirmation",
        confidence: Math.min(0.8, decision.confidence + 0.1),
        enhancement_reason:
          "Performance optimization detected, suggest confirmation",
      };
    }

    // 如果包含安全相关，提升优先级
    if (contentFeatures.has_security) {
      return {
        ...decision,
        action:
          decision.action === "ignore" ? "ask_confirmation" : "auto_remember",
        confidence: Math.min(0.95, decision.confidence + 0.2),
        enhancement_reason: "Security-related content, high priority",
      };
    }

    return decision;
  }

  /**
   * 用户偏好调整（预留接口）
   */
  private adjustForUserPreferences(
    decision: EnhancedDecision,
    processType: ProcessType
  ): EnhancedDecision {
    // 预留接口，未来可以根据用户反馈学习调整
    // 目前直接返回原决策
    return decision;
  }

  /**
   * 分析内容特征
   */
  private analyzeContentFeatures(content: string): ContentFeatures {
    const lowerContent = content.toLowerCase();

    return {
      is_rare_issue:
        lowerContent.includes("rare") ||
        lowerContent.includes("unusual") ||
        lowerContent.includes("edge case") ||
        lowerContent.includes("罕见") ||
        lowerContent.includes("特殊情况"),

      high_reusability:
        lowerContent.includes("reusable") ||
        lowerContent.includes("generic") ||
        lowerContent.includes("utility") ||
        lowerContent.includes("helper") ||
        lowerContent.includes("可复用") ||
        lowerContent.includes("通用"),

      has_algorithm:
        lowerContent.includes("algorithm") ||
        lowerContent.includes("complexity") ||
        lowerContent.includes("算法") ||
        lowerContent.includes("复杂度"),

      has_architecture:
        lowerContent.includes("architecture") ||
        lowerContent.includes("design pattern") ||
        lowerContent.includes("架构") ||
        lowerContent.includes("设计模式"),

      has_performance:
        lowerContent.includes("performance") ||
        lowerContent.includes("optimization") ||
        lowerContent.includes("性能") ||
        lowerContent.includes("优化"),

      has_security:
        lowerContent.includes("security") ||
        lowerContent.includes("vulnerability") ||
        lowerContent.includes("安全") ||
        lowerContent.includes("漏洞"),
    };
  }

  /**
   * 生成决策理由
   */
  private generateDecisionReasoning(
    valueScore: ValueScore,
    processType: ProcessType,
    action: string
  ): string {
    const reasons: string[] = [];

    // 添加评分信息
    reasons.push(`Total score: ${valueScore.total_score}/100`);

    // 添加过程类型信息
    reasons.push(
      `Process type: ${processType.type} (confidence: ${processType.confidence}%)`
    );

    // 添加决策原因
    if (action === "auto_remember") {
      if (valueScore.total_score >= 90) {
        reasons.push("Exceptional value content");
      } else if (valueScore.total_score >= 80) {
        reasons.push("High-value content worth remembering");
      }
    } else if (action === "ask_confirmation") {
      reasons.push("Medium-value content, user confirmation recommended");
    } else {
      reasons.push("Low-value content, not worth remembering");
    }

    // 添加突出的维度
    const topDimensions = [
      { name: "code significance", score: valueScore.code_significance },
      { name: "problem complexity", score: valueScore.problem_complexity },
      { name: "solution importance", score: valueScore.solution_importance },
      { name: "reusability", score: valueScore.reusability },
    ]
      .filter((d) => d.score >= 80)
      .map((d) => d.name);

    if (topDimensions.length > 0) {
      reasons.push(`Strong in: ${topDimensions.join(", ")}`);
    }

    return reasons.join("; ");
  }

  /**
   * 确定记忆类型
   */
  private determineMemoryType(
    processType: ProcessType,
    valueScore: ValueScore
  ): string {
    // 根据过程类型映射到记忆类型
    const typeMapping: Record<string, string> = {
      feature_add: "feature_add",
      code_change: "code_modify",
      bug_fix: "bug_fix",
      solution_design: "solution",
      testing: "test",
      documentation: "documentation",
      refactor: "code_refactor",
    };

    return typeMapping[processType.type] || "conversation";
  }

  /**
   * 计算优先级
   */
  private calculatePriority(
    action: string,
    valueScore: ValueScore
  ): "critical" | "high" | "medium" | "low" {
    if (action === "auto_remember") {
      if (valueScore.total_score >= 90) {
        return "critical";
      } else if (valueScore.total_score >= 80) {
        return "high";
      }
    }

    if (action === "ask_confirmation") {
      return "medium";
    }

    return "low";
  }

  /**
   * 生成建议标签
   */
  private generateSuggestedTags(
    content: string,
    processType: ProcessType
  ): string[] {
    const tags: string[] = [];
    const lowerContent = content.toLowerCase();

    // 基于过程类型的标签
    tags.push(processType.type.replace("_", "-"));

    // 基于内容的标签
    const tagKeywords = [
      { keyword: "algorithm", tag: "algorithm" },
      { keyword: "performance", tag: "performance" },
      { keyword: "security", tag: "security" },
      { keyword: "optimization", tag: "optimization" },
      { keyword: "refactor", tag: "refactoring" },
      { keyword: "architecture", tag: "architecture" },
      { keyword: "design pattern", tag: "design-pattern" },
      { keyword: "memory leak", tag: "memory-leak" },
      { keyword: "concurrency", tag: "concurrency" },
      { keyword: "database", tag: "database" },
      { keyword: "api", tag: "api" },
      { keyword: "test", tag: "testing" },
      { keyword: "i18n", tag: "i18n" },
      { keyword: "internationalization", tag: "i18n" },
      { keyword: "ux", tag: "ux" },
      { keyword: "user experience", tag: "ux" },
    ];

    for (const { keyword, tag } of tagKeywords) {
      if (lowerContent.includes(keyword) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    // 从关键元素中提取标签
    if (processType.key_elements.keywords) {
      for (const keyword of processType.key_elements.keywords.slice(0, 2)) {
        const tag = keyword.toLowerCase().replace(/\s+/g, "-");
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }

    // 限制标签数量
    return tags.slice(0, 5);
  }
}
