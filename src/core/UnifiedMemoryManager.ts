import { DevelopmentProcessDetector } from "./DevelopmentProcessDetector.js";
import { DevelopmentValueEvaluator } from "./DevelopmentValueEvaluator.js";
import { AutoMemoryTrigger } from "./AutoMemoryTrigger.js";
import { UserFeedbackLearning } from "./UserFeedbackLearning.js";
import {
  InteractionContext,
  MemoryProcessingResult,
  UserIntent,
} from "./auto-memory-types.js";
import { languageDetector } from "../utils/language-detector.js";
import { DatabaseManager } from "../database.js";

/**
 * 统一记忆管理器
 * 协调各组件，统一处理记忆请求
 */
export class UnifiedMemoryManager {
  private detector: DevelopmentProcessDetector;
  private evaluator: DevelopmentValueEvaluator;
  private trigger: AutoMemoryTrigger;
  private feedback: UserFeedbackLearning;

  constructor(db: DatabaseManager) {
    this.detector = new DevelopmentProcessDetector();
    this.evaluator = new DevelopmentValueEvaluator();
    this.trigger = new AutoMemoryTrigger();
    this.feedback = new UserFeedbackLearning(db);
  }

  /**
   * 处理用户输入
   */
  async processUserInput(
    content: string,
    context: InteractionContext,
    userIntent?: UserIntent,
    projectPath?: string
  ): Promise<MemoryProcessingResult> {
    // 1. 用户主动记忆（最高优先级）
    if (userIntent?.type === "explicit_memory") {
      return await this.handleExplicitMemory(content, userIntent, projectPath);
    }

    // 2. MCP智能自动记忆 - 使用学习后的参数
    const thresholds = this.feedback.getThresholds();
    const weights = this.feedback.getWeights();

    // 使用学习后的权重进行评估
    const processType = await this.detector.detectProcessType(content, context);
    const valueScore = await this.evaluator.evaluateContentValue(
      content,
      processType,
      weights
    );

    // 使用学习后的阈值进行决策
    const memoryDecision = await this.trigger.shouldAutoRemember(
      content,
      processType,
      valueScore,
      thresholds
    );

    return {
      process_type: processType,
      value_score: valueScore,
      memory_decision: memoryDecision,
      action_required: this.determineRequiredAction(
        memoryDecision,
        projectPath
      ),
    };
  }

  /**
   * 处理用户主动记忆
   */
  private async handleExplicitMemory(
    content: string,
    intent: UserIntent,
    projectPath?: string
  ): Promise<MemoryProcessingResult> {
    // 用户主动记忆总是执行，但仍然进行评估以提供元数据
    const context: InteractionContext = {};
    const processType = await this.detector.detectProcessType(content, context);
    const valueScore = await this.evaluator.evaluateContentValue(
      content,
      processType
    );

    return {
      process_type: processType,
      value_score: valueScore,
      action_required: {
        type: "memory_stored",
        message: this.formatMessage("user_explicit_stored", projectPath || ""),
      },
    };
  }

  /**
   * 确定需要的操作
   */
  private determineRequiredAction(
    decision: any,
    projectPath?: string
  ): {
    type: "memory_stored" | "confirmation_needed" | "ignored";
    message: string;
    suggestion?: string;
  } {
    const language = projectPath
      ? languageDetector.detectProjectLanguage(projectPath)
      : "en";

    if (decision.action === "auto_remember") {
      return {
        type: "memory_stored",
        message: this.formatMessage("auto_stored", projectPath || "", language),
      };
    }

    if (decision.action === "ask_confirmation") {
      return {
        type: "confirmation_needed",
        message: this.formatMessage(
          "confirmation_needed",
          projectPath || "",
          language
        ),
        suggestion: decision.reasoning,
      };
    }

    return {
      type: "ignored",
      message: this.formatMessage("ignored", projectPath || "", language),
    };
  }

  /**
   * 格式化输出消息（支持中英文）
   */
  private formatMessage(
    type: string,
    projectPath: string,
    language: "zh" | "en" = "en"
  ): string {
    const messages: Record<string, Record<string, string>> = {
      user_explicit_stored: {
        zh: "已记忆（用户主动）",
        en: "Stored (User explicit)",
      },
      auto_stored: {
        zh: "已自动记忆",
        en: "Auto-stored",
      },
      confirmation_needed: {
        zh: "建议记忆（需要确认）",
        en: "Suggested to remember (confirmation needed)",
      },
      ignored: {
        zh: "已忽略（价值评分较低）",
        en: "Ignored (low value score)",
      },
    };

    return messages[type]?.[language] || messages[type]?.["en"] || type;
  }

  /**
   * 格式化详细输出（用于返回给 AI）
   */
  formatDetailedOutput(
    result: MemoryProcessingResult,
    projectPath?: string
  ): string {
    const language = projectPath
      ? languageDetector.detectProjectLanguage(projectPath)
      : "en";

    const lines: string[] = [];

    // 状态消息
    lines.push(result.action_required.message);
    lines.push("");

    // 如果有评估结果，显示详细信息
    if (result.process_type && result.value_score && result.memory_decision) {
      if (language === "zh") {
        lines.push("评估结果：");
        lines.push(
          `- 过程类型：${result.process_type.type}（置信度 ${result.process_type.confidence}%）`
        );
        lines.push(`- 价值评分：${result.value_score.total_score}/100`);
        lines.push(`  * 代码显著性：${result.value_score.code_significance}`);
        lines.push(`  * 问题复杂度：${result.value_score.problem_complexity}`);
        lines.push(
          `  * 解决方案重要性：${result.value_score.solution_importance}`
        );
        lines.push(`  * 可复用性：${result.value_score.reusability}`);
        lines.push("");
        lines.push(
          `建议标签：${result.memory_decision.suggested_tags.join(", ")}`
        );
        lines.push("");
        lines.push(`决策理由：${result.memory_decision.reasoning}`);
      } else {
        lines.push("Evaluation Result:");
        lines.push(
          `- Process Type: ${result.process_type.type} (Confidence ${result.process_type.confidence}%)`
        );
        lines.push(`- Value Score: ${result.value_score.total_score}/100`);
        lines.push(
          `  * Code Significance: ${result.value_score.code_significance}`
        );
        lines.push(
          `  * Problem Complexity: ${result.value_score.problem_complexity}`
        );
        lines.push(
          `  * Solution Importance: ${result.value_score.solution_importance}`
        );
        lines.push(`  * Reusability: ${result.value_score.reusability}`);
        lines.push("");
        lines.push(
          `Suggested Tags: ${result.memory_decision.suggested_tags.join(", ")}`
        );
        lines.push("");
        lines.push(`Decision Reasoning: ${result.memory_decision.reasoning}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * 获取反馈学习系统（用于外部访问）
   */
  public getFeedbackLearning(): UserFeedbackLearning {
    return this.feedback;
  }
}
