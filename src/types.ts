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
  status: 'active' | 'completed' | 'paused';
  metadata: string; // JSON
}

export interface Context {
  id: string;
  session_id: string;
  type: ContextType;
  content: string;
  file_path?: string;
  line_start?: number; // Deprecated: use line_ranges for multiple ranges
  line_end?: number;   // Deprecated: use line_ranges for multiple ranges
  language?: string;
  tags: string; // comma-separated
  quality_score: number;
  created_at: string;
  embedding?: Float64Array;
  embedding_text?: string; // JSON serialized embedding
  embedding_version?: string;
  metadata: string; // JSON - includes quality_metrics, line_ranges, etc.
}

// 多维度质量评分指标 (存储在metadata中)
export interface QualityMetrics {
  overall: number;          // 综合评分 (0-1, 对应quality_score)
  relevance: number;        // 相关性 - 基于被引用/检索次数
  freshness: number;        // 新鲜度 - 基于时间衰减
  completeness: number;     // 完整性 - 基于内容丰富度
  accuracy: number;         // 准确性 - 基于用户反馈/验证
  usefulness: number;       // 实用性 - 综合指标
  
  // 元数据
  reference_count?: number; // 被引用次数
  search_count?: number;    // 被检索次数
  last_accessed?: string;   // 最后访问时间
  user_rating?: number;     // 用户评分 (可选)
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
  CODE = 'code',
  CONVERSATION = 'conversation',
  ERROR = 'error',
  SOLUTION = 'solution',
  DOCUMENTATION = 'documentation',
  TEST = 'test',
  CONFIGURATION = 'configuration',
  COMMIT = 'commit'
}

export enum RelationType {
  DEPENDS_ON = 'depends_on',
  RELATED_TO = 'related_to',
  FIXES = 'fixes',
  IMPLEMENTS = 'implements',
  TESTS = 'tests',
  DOCUMENTS = 'documents'
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
  line_end?: number;   // Single range end (deprecated, use line_ranges)
  line_ranges?: Array<[number, number]>; // Multiple ranges: [[10,15], [50,60]]
  language?: string;
  tags?: string[];
  metadata?: Record<string, any>;
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
