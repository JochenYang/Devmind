/**
 * 智能自动记忆功能的类型定义
 */

/**
 * 过程类型枚举
 */
export type ProcessTypeEnum =
  | "code_change"
  | "bug_fix"
  | "solution_design"
  | "testing"
  | "documentation"
  | "refactor";

/**
 * 过程类型识别结果
 */
export interface ProcessType {
  type: ProcessTypeEnum;
  confidence: number; // 0-100
  key_elements: {
    files?: string[];
    functions?: string[];
    classes?: string[];
    keywords?: string[];
  };
  reasoning: string;
}

/**
 * 交互上下文
 */
export interface InteractionContext {
  userHistory?: Array<{
    type: string;
    timestamp: Date;
    content: string;
  }>;
  currentFiles?: string[];
  recentCommits?: string[];
}

/**
 * 价值评分
 */
export interface ValueScore {
  code_significance: number; // 0-100
  problem_complexity: number; // 0-100
  solution_importance: number; // 0-100
  reusability: number; // 0-100
  total_score: number; // 0-100 (加权平均)
  breakdown: {
    code_details: string;
    problem_details: string;
    solution_details: string;
    reusability_details: string;
  };
}

/**
 * 自动记忆决策
 */
export interface AutoMemoryDecision {
  action: "auto_remember" | "ask_confirmation" | "ignore";
  confidence: number; // 0-1
  reasoning: string;
  memory_type: string;
  priority: "critical" | "high" | "medium" | "low";
  suggested_tags: string[];
  metadata: {
    score_breakdown: any;
    process_confidence: number;
    timestamp: Date;
    version: string;
  };
}

/**
 * 记忆处理结果
 */
export interface MemoryProcessingResult {
  process_type?: ProcessType;
  value_score?: ValueScore;
  memory_decision?: AutoMemoryDecision;
  action_required: {
    type: "memory_stored" | "confirmation_needed" | "ignored";
    message: string;
    memory_id?: string;
    suggestion?: string;
  };
}

/**
 * 用户意图
 */
export interface UserIntent {
  type: "explicit_memory" | "ai_proactive" | "auto_trigger";
  memory_type?: string;
  tags?: string[];
  priority?: string;
}

/**
 * 用户反馈
 */
export interface UserFeedback {
  memory_id: string;
  action: "accepted" | "rejected" | "modified";
  process_type?: string;
  value_score?: number;
  user_comment?: string;
  timestamp: Date;
}

/**
 * 记忆结果
 */
export interface MemoryOutcome {
  was_useful: boolean;
  access_count: number;
  last_accessed?: Date;
}

/**
 * 基础决策
 */
export interface BasicDecision {
  action: "auto_remember" | "ask_confirmation" | "ignore";
  confidence: number;
  reason: string;
}

/**
 * 增强决策
 */
export interface EnhancedDecision extends BasicDecision {
  enhancement_reason?: string;
}

/**
 * 内容特征
 */
export interface ContentFeatures {
  is_rare_issue: boolean;
  high_reusability: boolean;
  has_algorithm: boolean;
  has_architecture: boolean;
  has_performance: boolean;
  has_security: boolean;
}

/**
 * 智能记忆元数据（存储在数据库中）
 */
export interface AutoMemoryMetadata {
  source: "user_explicit" | "ai_proactive" | "auto_trigger";
  process_type: {
    type: ProcessTypeEnum;
    confidence: number;
    key_elements: any;
  };
  value_score: {
    total_score: number;
    code_significance: number;
    problem_complexity: number;
    solution_importance: number;
    reusability: number;
  };
  trigger_decision: {
    action: string;
    reasoning: string;
    suggested_tags: string[];
  };
  user_feedback?: {
    action: string;
    timestamp: string;
  };
}
