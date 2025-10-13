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
  metadata: string; // JSON - now can include line_ranges: [[start,end], [start,end]]
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
  session_id: string;
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
