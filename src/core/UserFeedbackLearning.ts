/**
 * UserFeedbackLearning - 用户反馈学习系统
 *
 * 从用户反馈中学习，动态调整评估参数、记忆阈值和识别模式
 */

import { DatabaseManager } from "../database.js";
import {
  UserFeedback,
  MemoryOutcome,
  ProcessTypeEnum,
} from "./auto-memory-types.js";
import { randomUUID } from "crypto";

/**
 * 学习参数类型
 */
type ParameterType = "threshold" | "weight" | "pattern";

/**
 * 学习参数
 */
interface LearningParameter {
  id: string;
  parameter_type: ParameterType;
  parameter_name: string;
  parameter_value: number;
  updated_at: string;
  update_reason?: string;
  previous_value?: number;
}

/**
 * 参数变更记录
 */
interface ParameterChange {
  parameter_name: string;
  old_value: number;
  new_value: number;
  reason: string;
}

/**
 * 反馈统计
 */
interface FeedbackStats {
  total_count: number;
  accepted_count: number;
  rejected_count: number;
  modified_count: number;
  acceptance_rate: number;
}

/**
 * 过程类型统计
 */
interface ProcessTypeStats {
  [key: string]: FeedbackStats;
}

export class UserFeedbackLearning {
  private db: DatabaseManager;

  // 学习参数调整的最小样本数
  private readonly MIN_FEEDBACK_SAMPLES = 10;

  // 参数调整的步长
  private readonly ADJUSTMENT_STEP = 0.05; // 5%

  // 参数的有效范围
  private readonly PARAM_RANGES = {
    threshold: { min: 20, max: 95 },
    weight: { min: 0.1, max: 0.5 },
  };

  constructor(db: DatabaseManager) {
    this.db = db;
    this.initializeDefaultParameters();
  }

  /**
   * 初始化默认学习参数
   */
  private initializeDefaultParameters(): void {
    const defaultParams = [
      // 阈值参数
      { type: "threshold", name: "high_value", value: 80 },
      { type: "threshold", name: "medium_value", value: 50 },
      { type: "threshold", name: "low_value", value: 25 },

      // 权重参数
      { type: "weight", name: "code_significance", value: 0.3 },
      { type: "weight", name: "problem_complexity", value: 0.25 },
      { type: "weight", name: "solution_importance", value: 0.25 },
      { type: "weight", name: "reusability", value: 0.2 },
    ];

    for (const param of defaultParams) {
      this.ensureParameterExists(
        param.type as ParameterType,
        param.name,
        param.value
      );
    }
  }

  /**
   * 确保参数存在，如果不存在则创建
   */
  private ensureParameterExists(
    type: ParameterType,
    name: string,
    defaultValue: number
  ): void {
    const existing = this.getParameter(type, name);
    if (!existing) {
      this.setParameter(type, name, defaultValue, "Initial default value");
    }
  }

  /**
   * 从用户反馈中学习
   */
  async learnFromFeedback(
    memoryId: string,
    userFeedback: UserFeedback,
    outcome: MemoryOutcome
  ): Promise<void> {
    try {
      // 1. 记录用户反馈到数据库
      this.recordFeedback(userFeedback);

      // 2. 获取反馈统计
      const stats = this.getFeedbackStatistics();

      // 3. 检查是否有足够的样本进行学习
      if (stats.total_count < this.MIN_FEEDBACK_SAMPLES) {
        console.log(
          `[UserFeedbackLearning] Not enough samples yet (${stats.total_count}/${this.MIN_FEEDBACK_SAMPLES})`
        );
        return;
      }

      // 4. 更新评估参数
      await this.updateEvaluationParameters(userFeedback, outcome);

      // 5. 调整记忆阈值
      await this.adjustMemoryThresholds(userFeedback);

      // 6. 优化识别模式（如果提供了过程类型）
      if (userFeedback.process_type) {
        await this.optimizeDetectionPatterns(userFeedback);
      }

      console.log(
        `[UserFeedbackLearning] Learning completed for memory ${memoryId}`
      );
    } catch (error) {
      console.error("[UserFeedbackLearning] Learning failed:", error);
      throw error;
    }
  }

  /**
   * 记录用户反馈
   */
  private recordFeedback(feedback: UserFeedback): void {
    const id = randomUUID();
    const stmt = this.db["db"].prepare(`
      INSERT INTO user_feedback (
        id, context_id, feedback_action, process_type, 
        value_score, user_comment, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      feedback.memory_id,
      feedback.action,
      feedback.process_type || null,
      feedback.value_score || null,
      feedback.user_comment || null,
      feedback.timestamp.toISOString()
    );
  }

  /**
   * 更新评估参数
   */
  private async updateEvaluationParameters(
    feedback: UserFeedback,
    outcome: MemoryOutcome
  ): Promise<void> {
    const changes: ParameterChange[] = [];

    // 如果用户拒绝了高分内容，说明评分过高，需要调整权重
    if (
      feedback.action === "rejected" &&
      feedback.value_score &&
      feedback.value_score > 70
    ) {
      // 降低相关维度的权重
      const weights = this.getAllWeights();
      const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

      for (const [name, value] of Object.entries(weights)) {
        const newValue = Math.max(
          this.PARAM_RANGES.weight.min,
          value - this.ADJUSTMENT_STEP * 0.5
        );

        if (newValue !== value) {
          this.setParameter(
            "weight",
            name,
            newValue,
            `Adjusted down due to high-score rejection`
          );
          changes.push({
            parameter_name: name,
            old_value: value,
            new_value: newValue,
            reason: "High-score rejection",
          });
        }
      }

      // 重新归一化权重
      this.normalizeWeights();
    }

    // 如果用户接受了低分内容，说明评分过低，需要提升权重
    if (
      feedback.action === "accepted" &&
      feedback.value_score &&
      feedback.value_score < 50
    ) {
      // 提升相关维度的权重
      const weights = this.getAllWeights();

      for (const [name, value] of Object.entries(weights)) {
        const newValue = Math.min(
          this.PARAM_RANGES.weight.max,
          value + this.ADJUSTMENT_STEP * 0.5
        );

        if (newValue !== value) {
          this.setParameter(
            "weight",
            name,
            newValue,
            `Adjusted up due to low-score acceptance`
          );
          changes.push({
            parameter_name: name,
            old_value: value,
            new_value: newValue,
            reason: "Low-score acceptance",
          });
        }
      }

      // 重新归一化权重
      this.normalizeWeights();
    }

    // 记录学习历史
    if (changes.length > 0) {
      await this.recordLearningHistory(changes);
    }
  }

  /**
   * 调整记忆阈值
   */
  private async adjustMemoryThresholds(feedback: UserFeedback): Promise<void> {
    const changes: ParameterChange[] = [];

    // 获取过程类型的统计数据
    const processStats = this.getProcessTypeStatistics();

    // 如果某个过程类型的接受率过低，降低阈值
    if (feedback.process_type && processStats[feedback.process_type]) {
      const stats = processStats[feedback.process_type];

      if (stats.acceptance_rate < 0.5 && stats.total_count >= 5) {
        // 接受率低于50%，降低阈值
        const highThreshold = this.getParameter("threshold", "high_value");
        if (highThreshold) {
          const newValue = Math.max(
            this.PARAM_RANGES.threshold.min,
            highThreshold.parameter_value - 5
          );

          if (newValue !== highThreshold.parameter_value) {
            this.setParameter(
              "threshold",
              "high_value",
              newValue,
              `Lowered due to low acceptance rate for ${feedback.process_type}`
            );
            changes.push({
              parameter_name: "high_value",
              old_value: highThreshold.parameter_value,
              new_value: newValue,
              reason: `Low acceptance rate for ${feedback.process_type}`,
            });
          }
        }
      } else if (stats.acceptance_rate > 0.9 && stats.total_count >= 5) {
        // 接受率高于90%，提高阈值
        const highThreshold = this.getParameter("threshold", "high_value");
        if (highThreshold) {
          const newValue = Math.min(
            this.PARAM_RANGES.threshold.max,
            highThreshold.parameter_value + 5
          );

          if (newValue !== highThreshold.parameter_value) {
            this.setParameter(
              "threshold",
              "high_value",
              newValue,
              `Raised due to high acceptance rate for ${feedback.process_type}`
            );
            changes.push({
              parameter_name: "high_value",
              old_value: highThreshold.parameter_value,
              new_value: newValue,
              reason: `High acceptance rate for ${feedback.process_type}`,
            });
          }
        }
      }
    }

    // 记录学习历史
    if (changes.length > 0) {
      await this.recordLearningHistory(changes);
    }
  }

  /**
   * 优化识别模式
   */
  private async optimizeDetectionPatterns(
    feedback: UserFeedback
  ): Promise<void> {
    // 这里可以实现更复杂的模式学习逻辑
    // 例如：记录哪些关键词组合导致了错误的识别
    // 目前先记录反馈，为未来的优化做准备

    console.log(
      `[UserFeedbackLearning] Pattern optimization for ${feedback.process_type} - feedback: ${feedback.action}`
    );
  }

  /**
   * 记录学习历史
   */
  private async recordLearningHistory(
    changes: ParameterChange[]
  ): Promise<void> {
    console.log("[UserFeedbackLearning] Parameter changes:", changes);

    // 可以将变更记录到单独的历史表中，用于审计和回滚
    // 目前通过 learning_parameters 表的 previous_value 字段记录
  }

  /**
   * 获取反馈统计
   */
  private getFeedbackStatistics(): FeedbackStats {
    const stmt = this.db["db"].prepare(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN feedback_action = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
        SUM(CASE WHEN feedback_action = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN feedback_action = 'modified' THEN 1 ELSE 0 END) as modified_count
      FROM user_feedback
    `);

    const result = stmt.get() as any;

    return {
      total_count: result.total_count || 0,
      accepted_count: result.accepted_count || 0,
      rejected_count: result.rejected_count || 0,
      modified_count: result.modified_count || 0,
      acceptance_rate:
        result.total_count > 0 ? result.accepted_count / result.total_count : 0,
    };
  }

  /**
   * 获取过程类型统计
   */
  private getProcessTypeStatistics(): ProcessTypeStats {
    const stmt = this.db["db"].prepare(`
      SELECT 
        process_type,
        COUNT(*) as total_count,
        SUM(CASE WHEN feedback_action = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
        SUM(CASE WHEN feedback_action = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN feedback_action = 'modified' THEN 1 ELSE 0 END) as modified_count
      FROM user_feedback
      WHERE process_type IS NOT NULL
      GROUP BY process_type
    `);

    const results = stmt.all() as any[];
    const stats: ProcessTypeStats = {};

    for (const row of results) {
      stats[row.process_type] = {
        total_count: row.total_count,
        accepted_count: row.accepted_count,
        rejected_count: row.rejected_count,
        modified_count: row.modified_count,
        acceptance_rate:
          row.total_count > 0 ? row.accepted_count / row.total_count : 0,
      };
    }

    return stats;
  }

  /**
   * 获取学习参数
   */
  public getParameter(
    type: ParameterType,
    name: string
  ): LearningParameter | null {
    const stmt = this.db["db"].prepare(`
      SELECT * FROM learning_parameters
      WHERE parameter_type = ? AND parameter_name = ?
    `);

    const result = stmt.get(type, name) as LearningParameter | undefined;
    return result || null;
  }

  /**
   * 设置学习参数
   */
  private setParameter(
    type: ParameterType,
    name: string,
    value: number,
    reason?: string
  ): void {
    const existing = this.getParameter(type, name);

    if (existing) {
      // 更新现有参数
      const stmt = this.db["db"].prepare(`
        UPDATE learning_parameters
        SET parameter_value = ?, 
            previous_value = ?,
            updated_at = ?,
            update_reason = ?
        WHERE parameter_type = ? AND parameter_name = ?
      `);

      stmt.run(
        value,
        existing.parameter_value,
        new Date().toISOString(),
        reason || null,
        type,
        name
      );
    } else {
      // 创建新参数
      const stmt = this.db["db"].prepare(`
        INSERT INTO learning_parameters (
          id, parameter_type, parameter_name, parameter_value,
          updated_at, update_reason, previous_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        randomUUID(),
        type,
        name,
        value,
        new Date().toISOString(),
        reason || null,
        null
      );
    }
  }

  /**
   * 获取所有权重参数
   */
  private getAllWeights(): Record<string, number> {
    const stmt = this.db["db"].prepare(`
      SELECT parameter_name, parameter_value
      FROM learning_parameters
      WHERE parameter_type = 'weight'
    `);

    const results = stmt.all() as Array<{
      parameter_name: string;
      parameter_value: number;
    }>;

    const weights: Record<string, number> = {};
    for (const row of results) {
      weights[row.parameter_name] = row.parameter_value;
    }

    return weights;
  }

  /**
   * 归一化权重（确保总和为1）
   */
  private normalizeWeights(): void {
    const weights = this.getAllWeights();
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);

    if (total === 0) return;

    for (const [name, value] of Object.entries(weights)) {
      const normalized = value / total;
      this.setParameter("weight", name, normalized, "Weight normalization");
    }
  }

  /**
   * 获取当前阈值
   */
  public getThresholds(): {
    high_value: number;
    medium_value: number;
    low_value: number;
  } {
    const high = this.getParameter("threshold", "high_value");
    const medium = this.getParameter("threshold", "medium_value");
    const low = this.getParameter("threshold", "low_value");

    return {
      high_value: high?.parameter_value || 80,
      medium_value: medium?.parameter_value || 50,
      low_value: low?.parameter_value || 25,
    };
  }

  /**
   * 获取当前权重
   */
  public getWeights(): {
    code_significance: number;
    problem_complexity: number;
    solution_importance: number;
    reusability: number;
  } {
    const weights = this.getAllWeights();

    return {
      code_significance: weights.code_significance || 0.3,
      problem_complexity: weights.problem_complexity || 0.25,
      solution_importance: weights.solution_importance || 0.25,
      reusability: weights.reusability || 0.2,
    };
  }

  /**
   * 重置所有参数到默认值
   */
  public resetToDefaults(): void {
    this.db["db"].exec(`DELETE FROM learning_parameters`);
    this.initializeDefaultParameters();
    console.log("[UserFeedbackLearning] All parameters reset to defaults");
  }

  /**
   * 获取学习历史
   */
  public getLearningHistory(limit: number = 50): LearningParameter[] {
    const stmt = this.db["db"].prepare(`
      SELECT * FROM learning_parameters
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as LearningParameter[];
  }
}
