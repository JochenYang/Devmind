// 数据库模型类型定义
export interface Project {
  id: string;
  name: string;
  path: string;
  git_remote_url?: string;
  language: string;
  framework?: string;
  created_at: string;
  last_accessed: string;
  metadata: string; // JSON
}

export interface Session {
  id: string;
  project_id: string;
  name: string;
  started_at: string;
  ended_at?: string;
  tool_used: string; // vscode, cli, etc.
  status: "active" | "completed" | "paused";
  metadata: string; // JSON
}

export interface Context {
  id: string;
  session_id: string;
  type: ContextType;
  content: string;
  file_path?: string;
  line_start?: number; // Deprecated: use line_ranges for multiple ranges
  line_end?: number; // Deprecated: use line_ranges for multiple ranges
  language?: string;
  tags: string; // comma-separated
  quality_score: number;
  created_at: string;
  embedding?: Float64Array;
  embedding_text?: string; // JSON serialized embedding
  embedding_version?: string;
  embedding_model?: string;
  metadata: string; // JSON - includes quality_metrics, line_ranges, etc.
}

// 多维度质量评分指标 (存储在metadata中)
export interface QualityMetrics {
  overall: number; // 综合评分 (0-1, 对应quality_score)
  relevance: number; // 相关性 - 基于被引用/检索次数
  freshness: number; // 新鲜度 - 基于时间衰减
  completeness: number; // 完整性 - 基于内容丰富度
  accuracy: number; // 准确性 - 基于用户反馈/验证
  usefulness: number; // 实用性 - 综合指标

  // 元数据
  reference_count?: number; // 被引用次数
  search_count?: number; // 被检索次数
  last_accessed?: string; // 最后访问时间
  user_rating?: number; // 用户评分 (可选)
}

// 增强的上下文元数据结构 (存储在metadata JSON中)
export interface EnhancedContextMetadata {
  // === 变更信息 ===
  change_type?: "add" | "modify" | "delete" | "refactor" | "rename"; // 变更类型
  change_reason?: string; // 变更原因/动机

  // === 影响范围 ===
  impact_level?: "breaking" | "major" | "minor" | "patch"; // 影响程度
  affected_functions?: string[]; // 修改的函数名列表
  affected_classes?: string[]; // 修改的类名列表
  affected_modules?: string[]; // 影响的模块

  // === 关联信息 ===
  related_files?: string[]; // 关联的其他文件
  related_issues?: string[]; // 关联的Issue编号 ['#123', '#456']
  related_prs?: string[]; // 关联的PR编号 ['#789']
  depends_on?: string[]; // 依赖的文件/模块

  // === 代码差异 ===
  diff_stats?: {
    additions: number; // 新增行数
    deletions: number; // 删除行数
    changes: number; // 修改行数
  };

  // === 业务信息 ===
  business_domain?: string[]; // 业务领域标签 ['auth', 'payment']
  priority?: "critical" | "high" | "medium" | "low"; // 优先级

  // === 行范围（多段支持） ===
  line_ranges?: Array<[number, number]>; // 多个不连续的行范围

  // === 质量指标 ===
  quality_metrics?: QualityMetrics; // 质量评分详情

  // === 其他元数据 ===
  [key: string]: any; // 允许扩展
}

export interface Relationship {
  id: string;
  from_context_id: string;
  to_context_id: string;
  type: RelationType;
  strength: number;
  created_at: string;
}

export enum ContextType {
  // === 代码变更类型（细化） ===
  CODE_CREATE = "code_create", // 新建文件/代码
  CODE_MODIFY = "code_modify", // 修改现有代码
  CODE_DELETE = "code_delete", // 删除代码
  CODE_REFACTOR = "code_refactor", // 重构（不改变功能）
  CODE_OPTIMIZE = "code_optimize", // 性能优化

  // === Bug相关 ===
  BUG_FIX = "bug_fix", // 修复Bug
  BUG_REPORT = "bug_report", // Bug报告

  // === 功能相关 ===
  FEATURE_ADD = "feature_add", // 新增功能
  FEATURE_UPDATE = "feature_update", // 功能更新
  FEATURE_REMOVE = "feature_remove", // 移除功能

  // === 方案设计类型（New） ===
  SOLUTION = "solution", // 技术方案讨论
  DESIGN = "design", // 架构/系统设计
  LEARNING = "learning", // 技术学习/概念讨论

  // === 通用类型（保持向后兼容） ===
  CODE = "code", // 通用代码（未细分时使用）
  CONVERSATION = "conversation", // 纯聊天
  ERROR = "error", // 错误报告
  DOCUMENTATION = "documentation", // 文档编写
  TEST = "test", // 测试相关
  CONFIGURATION = "configuration", // 配置修改
  COMMIT = "commit", // 版本提交
}

export enum RelationType {
  DEPENDS_ON = "depends_on",
  RELATED_TO = "related_to",
  FIXES = "fixes",
  IMPLEMENTS = "implements",
  TESTS = "tests",
  DOCUMENTS = "documents",
}

// MCP 接口类型
export interface ContextSearchParams {
  query: string;
  project_id?: string;
  session_id?: string;
  type?: ContextType;
  limit?: number;
  similarity_threshold?: number;

  // Vector search options
  use_semantic_search?: boolean;
  hybrid_weight?: number;
  force_recompute_embedding?: boolean;
}

export interface ProjectContextParams {
  project_id: string;
  include_sessions?: boolean;
  include_contexts?: boolean;
  limit?: number;
}

export interface RecordContextParams {
  session_id?: string; // Optional: If not provided, will auto-detect/create from project_path
  project_path?: string; // Optional: Used to auto-detect/create session if session_id not provided
  type: ContextType;
  content: string;
  file_path?: string;
  line_start?: number; // Single range start (deprecated, use line_ranges)
  line_end?: number; // Single range end (deprecated, use line_ranges)
  line_ranges?: Array<[number, number]>; // Multiple ranges: [[10,15], [50,60]]
  language?: string;
  tags?: string[];

  // === 增强字段 ===
  change_type?: "add" | "modify" | "delete" | "refactor" | "rename"; // 变更类型
  change_reason?: string; // 变更原因
  impact_level?: "breaking" | "major" | "minor" | "patch"; // 影响程度
  related_files?: string[]; // 关联文件
  related_issues?: string[]; // 关联Issue
  related_prs?: string[]; // 关联PR
  business_domain?: string[]; // 业务领域
  priority?: "critical" | "high" | "medium" | "low"; // 优先级
  diff_stats?: {
    // 代码差异统计
    additions: number;
    deletions: number;
    changes: number;
  };

  // === 多文件变更支持 ===
  files_changed?: Array<{
    // 多个文件变更（合并为一条记忆）
    file_path: string; // 文件路径
    change_type?: "add" | "modify" | "delete" | "rename"; // 文件级别的变更类型
    diff_stats?: {
      // 该文件的diff统计
      additions: number;
      deletions: number;
      changes: number;
    };
    line_ranges?: Array<[number, number]>; // 该文件的变更行范围
  }>;

  metadata?: Record<string, any>; // 其他元数据

  // === 简化自动记忆参数 (v2.1.0) ===
  force_remember?: boolean; // 用户强制记忆（默认 false）
}

export interface SessionCreateParams {
  project_path: string;
  tool_used: string;
  name?: string;
  metadata?: Record<string, any>;
}

// 配置类型
export interface AiMemoryConfig {
  database_path?: string;
  max_contexts_per_session?: number;
  quality_threshold?: number;
  embedding_model?: string;
  auto_save_interval?: number;
  ignored_patterns?: string[];
  included_extensions?: string[];

  // Vector search configuration
  vector_search?: {
    enabled?: boolean;
    model_name?: string;
    dimensions?: number;
    similarity_threshold?: number;
    hybrid_weight?: number; // 0-1, weight for semantic vs keyword search
    cache_embeddings?: boolean;
  };
}

// === Git Integration Types (v2.3.0) ===
export interface GitInfo {
  changedFiles: string[]; // git diff + staged files
  branch: string; // 当前分支
  author: string; // git config user.name
  hasUncommitted: boolean; // 是否有未提交变更
}

export interface ProjectInfo {
  name: string; // 项目名称
  version?: string; // 项目版本
  type?: string; // 项目类型 (node, python, go, etc.)
  description?: string; // 项目描述
}
