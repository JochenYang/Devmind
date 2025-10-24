import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DatabaseManager } from "./database.js";
import { SessionManager } from "./session-manager.js";
import { ContentExtractor } from "./content-extractor.js";
import { VectorSearchEngine } from "./vector-search.js";
import { AutoRecordFilter } from "./auto-record-filter.js";
import { QualityScoreCalculator } from "./quality-score-calculator.js";
import { MemoryGraphGenerator } from "./memory-graph-generator.js";
import { ContextFileManager } from "./context-file-manager.js";
import {
  createFilePathDetector,
  FilePathDetector,
} from "./utils/file-path-detector.js";
import {
  AiMemoryConfig,
  ContextSearchParams,
  ProjectContextParams,
  RecordContextParams,
  SessionCreateParams,
  ContextType,
} from "./types.js";
import { join, dirname } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync } from "fs";

export class AiMemoryMcpServer {
  private server: Server;
  private db: DatabaseManager;
  private sessionManager: SessionManager;
  private contentExtractor: ContentExtractor;
  private vectorSearch: VectorSearchEngine | null = null;
  private qualityCalculator: QualityScoreCalculator;
  private graphGenerator: MemoryGraphGenerator;
  private contextFileManager: ContextFileManager;
  private config: AiMemoryConfig;
  private autoMonitoringInitialized: boolean = false;
  private autoRecordFilter: AutoRecordFilter;
  private fileWatcher: any = null;

  // 真实日期记录函数
  private getCurrentRealDate(): string {
    return new Date().toISOString();
  }

  private formatDateForUser(date?: Date): string {
    const targetDate = date || new Date();
    return targetDate.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Shanghai",
    });
  }

  private formatDateForRecord(date?: Date): string {
    const targetDate = date || new Date();
    return targetDate.toISOString().split("T")[0]; // YYYY-MM-DD 格式
  }

  constructor(config: AiMemoryConfig = {}) {
    this.config = {
      database_path: join(homedir(), ".devmind", "memory.db"),
      max_contexts_per_session: 1000,
      quality_threshold: 0.3,
      auto_save_interval: 30000, // 30 seconds
      ignored_patterns: [
        "node_modules/**",
        ".git/**",
        "dist/**",
        "build/**",
        "*.log",
        "*.tmp",
      ],
      included_extensions: [
        ".js",
        ".ts",
        ".jsx",
        ".tsx",
        ".py",
        ".go",
        ".rs",
        ".java",
        ".kt",
        ".php",
        ".rb",
        ".c",
        ".cpp",
        ".cs",
        ".swift",
        ".dart",
        ".md",
        ".txt",
      ],
      vector_search: {
        enabled: true,
        model_name: "Xenova/all-MiniLM-L6-v2",
        dimensions: 384,
        similarity_threshold: 0.5,
        hybrid_weight: 0.7,
        cache_embeddings: true,
      },
      ...config,
    };

    this.initializeDatabase();
    this.db = new DatabaseManager(this.config.database_path!);
    this.sessionManager = new SessionManager(this.db, this.config);
    this.contentExtractor = new ContentExtractor();
    this.qualityCalculator = new QualityScoreCalculator();
    this.graphGenerator = new MemoryGraphGenerator(this.db);
    this.contextFileManager = new ContextFileManager(this.db);

    // 初始化自动记录过滤器
    this.autoRecordFilter = new AutoRecordFilter({
      minChangeInterval: 30000, // 30秒
      minContentLength: 50,
      maxContentLength: 50000, // 50KB
      supportedExtensions: this.config.included_extensions,
    });

    // 初始化向量搜索引擎
    if (this.config.vector_search?.enabled) {
      this.vectorSearch = new VectorSearchEngine({
        model_name: this.config.vector_search.model_name,
        dimensions: this.config.vector_search.dimensions,
        similarity_threshold: this.config.vector_search.similarity_threshold,
        hybrid_weight: this.config.vector_search.hybrid_weight,
        cache_embeddings: this.config.vector_search.cache_embeddings,
      });
    }

    this.server = new Server(
      {
        name: "devmind-mcp",
        version: "1.9.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private initializeDatabase(): void {
    const dbDir = dirname(this.config.database_path!);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
  }

  private setupHandlers(): void {
    // Resources handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "memory://project-context",
          name: "Project Context",
          description: "Get comprehensive context for a project",
          mimeType: "application/json",
        },
        {
          uri: "memory://session-history",
          name: "Session History",
          description: "Get history of development sessions",
          mimeType: "application/json",
        },
        {
          uri: "memory://search-contexts",
          name: "Search Contexts",
          description: "Search through stored contexts",
          mimeType: "application/json",
        },
        {
          uri: "memory://stats",
          name: "Memory Statistics",
          description: "Get memory database statistics",
          mimeType: "application/json",
        },
      ],
    }));

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri } = request.params;
        const url = new URL(uri);

        switch (url.pathname) {
          case "/project-context":
            return await this.handleProjectContext(url.searchParams);
          case "/session-history":
            return await this.handleSessionHistory(url.searchParams);
          case "/search-contexts":
            return await this.handleSearchContexts(url.searchParams);
          case "/stats":
            return await this.handleStats();
          default:
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Unknown resource: ${uri}`
            );
        }
      }
    );

    // Tools handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "create_session",
          description:
            "Create a new development session for a project (or reuse existing active session)",
          inputSchema: {
            type: "object",
            properties: {
              project_path: {
                type: "string",
                description: "Path to the project directory",
              },
              tool_used: {
                type: "string",
                description: "Tool being used (vscode, cli, etc.)",
              },
              name: { type: "string", description: "Optional session name" },
              metadata: { type: "object", description: "Optional metadata" },
              force: {
                type: "boolean",
                description:
                  "Force create new session even if active session exists (default: false)",
              },
            },
            required: ["project_path", "tool_used"],
          },
        },
        {
          name: "record_context",
          description:
            "[ENHANCED] Record development context with rich metadata. Supports automatic change type detection, function/class extraction, and impact analysis.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description:
                  "Session ID to record context in (optional if project_path is provided)",
              },
              project_path: {
                type: "string",
                description:
                  "Project path to auto-detect/create session (optional if session_id is provided)",
              },
              type: {
                type: "string",
                enum: [
                  // === Code Changes (Detailed) ===
                  "code_create",
                  "code_modify",
                  "code_delete",
                  "code_refactor",
                  "code_optimize",
                  // === Bug Related ===
                  "bug_fix",
                  "bug_report",
                  // === Feature Related ===
                  "feature_add",
                  "feature_update",
                  "feature_remove",
                  // === General Types (Backward Compatible) ===
                  "code",
                  "conversation",
                  "error",
                  "solution",
                  "documentation",
                  "test",
                  "configuration",
                  "commit",
                ],
                description:
                  "Type of context (use detailed types like code_modify, bug_fix for better categorization)",
              },
              content: { type: "string", description: "The context content" },
              file_path: { type: "string", description: "Optional file path" },
              line_start: {
                type: "number",
                description:
                  "Optional starting line number (deprecated, use line_ranges for multiple ranges)",
              },
              line_end: {
                type: "number",
                description:
                  "Optional ending line number (deprecated, use line_ranges for multiple ranges)",
              },
              line_ranges: {
                type: "array",
                items: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 2,
                  maxItems: 2,
                },
                description:
                  "Multiple line ranges: [[10,15], [50,60]] for non-contiguous changes",
              },
              language: {
                type: "string",
                description: "Optional programming language",
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "Optional tags",
              },

              // === 增强字段 (New in v1.16.0) ===
              change_type: {
                type: "string",
                enum: ["add", "modify", "delete", "refactor", "rename"],
                description: "🆕 Change type (auto-detected if not provided)",
              },
              change_reason: {
                type: "string",
                description: "🆕 Reason for the change",
              },
              impact_level: {
                type: "string",
                enum: ["breaking", "major", "minor", "patch"],
                description: "🆕 Impact level (auto-assessed if not provided)",
              },
              related_files: {
                type: "array",
                items: { type: "string" },
                description: "🆕 Related file paths",
              },
              related_issues: {
                type: "array",
                items: { type: "string" },
                description:
                  '🆕 Related issue numbers (e.g., ["#123", "#456"])',
              },
              related_prs: {
                type: "array",
                items: { type: "string" },
                description: '🆕 Related PR numbers (e.g., ["#789"])',
              },
              business_domain: {
                type: "array",
                items: { type: "string" },
                description:
                  '🆕 Business domain tags (e.g., ["auth", "payment"])',
              },
              priority: {
                type: "string",
                enum: ["critical", "high", "medium", "low"],
                description: "🆕 Priority level",
              },
              diff_stats: {
                type: "object",
                properties: {
                  additions: {
                    type: "number",
                    description: "Number of lines added",
                  },
                  deletions: {
                    type: "number",
                    description: "Number of lines deleted",
                  },
                  changes: {
                    type: "number",
                    description: "Number of lines changed",
                  },
                },
                description: "Code diff statistics",
              },

              // === Multi-File Change Support ===
              files_changed: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    file_path: { type: "string", description: "File path" },
                    change_type: {
                      type: "string",
                      enum: ["add", "modify", "delete", "rename"],
                      description: "File-level change type",
                    },
                    diff_stats: {
                      type: "object",
                      properties: {
                        additions: { type: "number" },
                        deletions: { type: "number" },
                        changes: { type: "number" },
                      },
                    },
                    line_ranges: {
                      type: "array",
                      items: {
                        type: "array",
                        items: { type: "number" },
                        minItems: 2,
                        maxItems: 2,
                      },
                    },
                  },
                  required: ["file_path"],
                },
                description:
                  "Multiple files changed in a single commit/operation (merged into one memory record)",
              },

              metadata: {
                type: "object",
                description: "Optional additional metadata",
              },
            },
            required: ["type", "content"],
          },
        },
        {
          name: "end_session",
          description: "End a development session",
          inputSchema: {
            type: "object",
            properties: {
              session_id: { type: "string", description: "Session ID to end" },
            },
            required: ["session_id"],
          },
        },
        {
          name: "get_current_session",
          description: "Get the current active session for a project",
          inputSchema: {
            type: "object",
            properties: {
              project_path: {
                type: "string",
                description: "Path to the project directory",
              },
            },
            required: ["project_path"],
          },
        },
        {
          name: "list_projects",
          description:
            "[RECOMMENDED] List all projects with memory statistics (contexts count, sessions count, last activity). Use this to overview all tracked projects.",
          inputSchema: {
            type: "object",
            properties: {
              include_stats: {
                type: "boolean",
                description:
                  "Include detailed statistics for each project (default: true)",
              },
              limit: {
                type: "number",
                description:
                  "Maximum number of projects to return (default: 50)",
              },
            },
          },
        },
        {
          name: "extract_file_context",
          description:
            "[LOW-LEVEL] Extract structured metadata from a single file (classes, functions, imports). NOT for project analysis - use project_analysis_engineer instead.",
          inputSchema: {
            type: "object",
            properties: {
              file_path: { type: "string", description: "Path to the file" },
              session_id: {
                type: "string",
                description: "Optional session ID to record context in",
              },
              record: {
                type: "boolean",
                description: "Whether to record the extracted context",
              },
            },
            required: ["file_path"],
          },
        },
        {
          name: "get_related_contexts",
          description: "Get contexts related to a specific context",
          inputSchema: {
            type: "object",
            properties: {
              context_id: {
                type: "string",
                description: "Context ID to find related contexts for",
              },
              relation_type: {
                type: "string",
                enum: [
                  "depends_on",
                  "related_to",
                  "fixes",
                  "implements",
                  "tests",
                  "documents",
                ],
                description: "Optional specific relation type",
              },
            },
            required: ["context_id"],
          },
        },
        {
          name: "semantic_search",
          description:
            "[RECOMMENDED] Intelligent search across project memory using AI embeddings. Use this to find relevant past contexts, similar problems, or related code.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query text" },
              project_id: {
                type: "string",
                description: "Optional project ID to search within",
              },
              session_id: {
                type: "string",
                description: "Optional session ID to search within",
              },
              limit: {
                type: "number",
                description: "Maximum number of results (default: 10)",
              },
              similarity_threshold: {
                type: "number",
                description: "Similarity threshold (default: 0.5)",
              },
              hybrid_weight: {
                type: "number",
                description:
                  "Weight for semantic vs keyword search (0-1, default: 0.7)",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "list_contexts",
          description:
            "List recorded contexts (search history, debug sessions, code changes). Use semantic_search for intelligent queries.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description: "Optional session ID to filter contexts",
              },
              project_id: {
                type: "string",
                description: "Optional project ID to filter contexts",
              },
              limit: {
                type: "number",
                description: "Maximum number of results (default: 20)",
              },
            },
          },
        },
        {
          name: "delete_context",
          description:
            "Delete a specific recorded context. Use for cleanup, not for regular development flow.",
          inputSchema: {
            type: "object",
            properties: {
              context_id: {
                type: "string",
                description: "Context ID to delete",
              },
            },
            required: ["context_id"],
          },
        },
        {
          name: "update_context",
          description:
            "Update existing context metadata, content, or file associations. Rarely needed in normal development.",
          inputSchema: {
            type: "object",
            properties: {
              context_id: {
                type: "string",
                description: "Context ID to update",
              },
              content: { type: "string", description: "New content" },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "New tags",
              },
              quality_score: {
                type: "number",
                description: "New quality score (0-1)",
              },
              metadata: { type: "object", description: "New metadata" },
              file_path: {
                type: "string",
                description:
                  "Update single file path (will replace existing file associations)",
              },
              files_changed: {
                type: "array",
                description:
                  "Update multiple file associations (will replace existing)",
                items: {
                  type: "object",
                  properties: {
                    file_path: { type: "string" },
                    change_type: { type: "string" },
                    line_ranges: { type: "array" },
                    diff_stats: { type: "object" },
                  },
                  required: ["file_path"],
                },
              },
            },
            required: ["context_id"],
          },
        },
        {
          name: "delete_session",
          description:
            "Delete a session and all its contexts (use with caution)",
          inputSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description: "Session ID to delete",
              },
            },
            required: ["session_id"],
          },
        },
        {
          name: "generate_embeddings",
          description: "Generate embeddings for contexts without them",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description:
                  "Maximum number of contexts to process (default: 50)",
              },
              force_update: {
                type: "boolean",
                description:
                  "Update contexts even if they have existing embeddings",
              },
              project_id: {
                type: "string",
                description: "Optional project ID to filter contexts",
              },
            },
          },
        },
        {
          name: "project_analysis_engineer",
          description:
            "[PRIMARY] Comprehensive project analysis and documentation generator. Use this for: analyzing entire projects, understanding codebase architecture, generating professional documentation (DEVMIND.md, CLAUDE.md). This is the main tool for project-level analysis.",
          inputSchema: {
            type: "object",
            properties: {
              project_path: {
                type: "string",
                description: "Path to the project directory to analyze",
              },
              analysis_focus: {
                type: "string",
                description:
                  "Focus areas: architecture, entities, apis, business_logic, security, performance (comma-separated)",
              },
              doc_style: {
                type: "string",
                enum: ["devmind", "claude", "technical", "readme"],
                description:
                  "Documentation style: devmind (DEVMIND.md format), claude (CLAUDE.md format), technical (technical spec), readme (README format). Default: devmind",
              },
              auto_save: {
                type: "boolean",
                description:
                  "Automatically save generated analysis to memory (default: true)",
              },
              language: {
                type: "string",
                enum: ["en", "zh", "auto"],
                description:
                  "Documentation language: en (English), zh (Chinese), auto (detect from README). Default: auto",
              },
            },
            required: ["project_path"],
          },
        },
        {
          name: "optimize_project_memory",
          description: "Optimize project memory storage and performance",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "string",
                description: "Project ID to optimize",
              },
              strategies: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "clustering",
                    "compression",
                    "deduplication",
                    "summarization",
                    "ranking",
                    "archiving",
                  ],
                },
                description: "Optimization strategies to apply (default: all)",
              },
              dry_run: {
                type: "boolean",
                description:
                  "Preview optimization without applying (default: false)",
              },
            },
            required: ["project_id"],
          },
        },
        {
          name: "update_quality_scores",
          description:
            "Recalculate multi-dimensional quality scores for contexts (freshness, relevance, usefulness). Run this periodically to update time-decayed scores.",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "string",
                description: "Optional project ID to filter contexts",
              },
              limit: {
                type: "number",
                description:
                  "Maximum number of contexts to update (default: 100)",
              },
              force_all: {
                type: "boolean",
                description:
                  "Force update all contexts, even recently updated ones (default: false)",
              },
            },
          },
        },
        {
          name: "export_memory_graph",
          description:
            "Export project memory relationships as interactive HTML visualization with D3.js force-directed graph.",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "string",
                description: "Project ID to export graph for",
              },
              max_nodes: {
                type: "number",
                description:
                  "Maximum number of nodes to include (default: 0 = all)",
              },
              focus_type: {
                type: "string",
                enum: [
                  "all",
                  "solution",
                  "error",
                  "code",
                  "documentation",
                  "conversation",
                ],
                description: "Filter by context type (default: all)",
              },
              output_path: {
                type: "string",
                description: "Optional custom output path for the HTML file",
              },
            },
            required: ["project_id"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "create_session":
          return await this.handleCreateSession(
            args as unknown as SessionCreateParams
          );
        case "record_context":
          return await this.handleRecordContext(
            args as unknown as RecordContextParams
          );
        case "end_session":
          return await this.handleEndSession(args as { session_id: string });
        case "get_current_session":
          return await this.handleGetCurrentSession(
            args as { project_path: string }
          );
        case "list_projects":
          return await this.handleListProjects(
            args as { include_stats?: boolean; limit?: number }
          );
        case "extract_file_context":
          return await this.handleExtractFileContext(
            args as { file_path: string; session_id?: string; record?: boolean }
          );
        case "get_related_contexts":
          return await this.handleGetRelatedContexts(
            args as { context_id: string; relation_type?: string }
          );
        case "semantic_search":
          return await this.handleSemanticSearch(
            args as {
              query: string;
              project_id?: string;
              session_id?: string;
              limit?: number;
              similarity_threshold?: number;
              hybrid_weight?: number;
            }
          );
        case "generate_embeddings":
          return await this.handleGenerateEmbeddings(
            args as {
              limit?: number;
              force_update?: boolean;
              project_id?: string;
            }
          );
        case "list_contexts":
          return await this.handleListContexts(
            args as {
              session_id?: string;
              project_id?: string;
              limit?: number;
            }
          );
        case "delete_context":
          return await this.handleDeleteContext(args as { context_id: string });
        case "update_context":
          return await this.handleUpdateContext(
            args as {
              context_id: string;
              content?: string;
              tags?: string[];
              quality_score?: number;
              metadata?: object;
            }
          );
        case "delete_session":
          return await this.handleDeleteSession(args as { session_id: string });
        case "project_analysis_engineer":
          return await this.handleProjectAnalysisEngineerTool(
            args as {
              project_path: string;
              analysis_focus?: string;
              doc_style?: string;
              auto_save?: boolean;
              language?: string;
            }
          );
        case "optimize_project_memory":
          return await this.handleOptimizeProjectMemory(
            args as {
              project_id: string;
              strategies?: string[];
              dry_run?: boolean;
            }
          );
        case "update_quality_scores":
          return await this.handleUpdateQualityScores(
            args as {
              project_id?: string;
              limit?: number;
              force_all?: boolean;
            }
          );
        case "export_memory_graph":
          return await this.handleExportMemoryGraph(
            args as {
              project_id: string;
              max_nodes?: number;
              focus_type?: string;
              output_path?: string;
            }
          );
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: "project_analysis_engineer",
          description:
            "Professional project analysis engineer prompt that analyzes project structure, identifies core functionality, and generates comprehensive development documentation",
          arguments: [
            {
              name: "project_path",
              description: "Path to the project directory to analyze",
              required: true,
            },
            {
              name: "analysis_focus",
              description:
                "Focus areas: architecture, entities, apis, business_logic, security, performance (comma-separated)",
              required: false,
            },
            {
              name: "doc_style",
              description:
                "Documentation style: devmind (DEVMIND.md format), claude (CLAUDE.md format), technical (technical spec), readme (README format)",
              required: false,
            },
            {
              name: "auto_save",
              description:
                "Automatically save generated analysis to memory (default: true)",
              required: false,
            },
            {
              name: "language",
              description:
                "Documentation language: en (English), zh (Chinese), auto (detect from README)",
              required: false,
            },
          ],
        },
      ],
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "project_analysis_engineer":
          return await this.handleProjectAnalysisEngineer(args);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown prompt: ${name}`
          );
      }
    });
  }

  // Resource handlers
  private async handleProjectContext(params: URLSearchParams) {
    const projectId = params.get("project_id");
    const includeSessions = params.get("include_sessions") === "true";
    const includeContexts = params.get("include_contexts") === "true";
    const limit = params.get("limit")
      ? parseInt(params.get("limit")!)
      : undefined;

    if (!projectId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "project_id parameter is required"
      );
    }

    const contexts = includeSessions
      ? this.db.getContextsBySession(projectId, limit)
      : [];

    return {
      contents: [
        {
          uri: `memory://project-context?project_id=${projectId}`,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              project_id: projectId,
              sessions: includeSessions ? contexts : undefined,
              contexts: includeContexts ? contexts : undefined,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleSessionHistory(params: URLSearchParams) {
    const sessionId = params.get("session_id");
    const limit = params.get("limit")
      ? parseInt(params.get("limit")!)
      : undefined;

    if (!sessionId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "session_id parameter is required"
      );
    }

    const contexts = this.db.getContextsBySession(sessionId, limit);

    return {
      contents: [
        {
          uri: `memory://session-history?session_id=${sessionId}`,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              session_id: sessionId,
              contexts,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleSearchContexts(params: URLSearchParams) {
    const query = params.get("query");
    const projectId = params.get("project_id");
    const limit = params.get("limit") ? parseInt(params.get("limit")!) : 20;

    if (!query) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "query parameter is required"
      );
    }

    const contexts = this.db.searchContexts(
      query,
      projectId || undefined,
      limit
    );

    return {
      contents: [
        {
          uri: `memory://search-contexts?query=${encodeURIComponent(query)}`,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              query,
              results: contexts,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleStats() {
    const stats = this.db.getStats();

    return {
      contents: [
        {
          uri: "memory://stats",
          mimeType: "application/json",
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  // Tool handlers
  private async handleCreateSession(args: SessionCreateParams) {
    try {
      const sessionId = await this.sessionManager.createSession(args);
      const session = this.db.getSession(sessionId);

      return {
        content: [
          {
            type: "text",
            text: `Created new session: ${sessionId}`,
          },
        ],
        isError: false,
        _meta: {
          session_id: sessionId,
          session: session,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to create session: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleRecordContext(args: RecordContextParams) {
    try {
      // 自动获取或创建会话（如果未提供 session_id）
      let sessionId = args.session_id;
      let autoSessionMeta: any = {};

      if (!sessionId && args.project_path) {
        // 尝试获取活跃会话
        const currentSessionId = await this.sessionManager.getCurrentSession(
          args.project_path
        );

        if (currentSessionId) {
          sessionId = currentSessionId;
          autoSessionMeta = {
            auto_session: true,
            session_source: "existing_active",
            session_id: sessionId,
          };
        } else {
          // 创建新会话
          sessionId = await this.sessionManager.createSession({
            project_path: args.project_path,
            tool_used: "auto",
            name: "Auto-created session",
          });
          autoSessionMeta = {
            auto_session: true,
            session_source: "newly_created",
            session_id: sessionId,
          };
        }
      }

      // 验证必须有 session_id
      if (!sessionId) {
        throw new Error("Either session_id or project_path must be provided");
      }

      // 智能检测文件路径（如果未提供）
      let detectedFilePath = args.file_path;
      let detectedLanguage = args.language;
      let pathDetectionMeta: any = {};

      if (!detectedFilePath) {
        const session = this.db.getSession(sessionId);
        if (session && session.project_id) {
          const project = this.db.getProject(session.project_id);
          if (project && project.path) {
            try {
              const detector = createFilePathDetector(project.path);

              // 获取最近的上下文记录（用于推断）
              const recentContexts = this.db
                .getContextsBySession(sessionId)
                .slice(0, 10)
                .map((ctx) => ({
                  file_path: ctx.file_path,
                  content: ctx.content,
                  created_at: ctx.created_at,
                }));

              const suggestions = await detector.detectFilePath({
                projectPath: project.path,
                content: args.content,
                recentContexts,
              });

              if (suggestions.length > 0) {
                const topSuggestion = suggestions[0];
                detectedFilePath = topSuggestion.path;
                pathDetectionMeta = {
                  auto_detected: true,
                  confidence: topSuggestion.confidence,
                  source: topSuggestion.source,
                  reason: topSuggestion.reason,
                  all_suggestions: suggestions.slice(0, 3).map((s) => ({
                    path: detector.getRelativePath(s.path),
                    confidence: s.confidence,
                    source: s.source,
                  })),
                };
              }
            } catch (error) {
              console.error(
                "[handleRecordContext] File path detection failed:",
                error
              );
            }
          }
        }
      }

      const extractedContext = this.contentExtractor.extractCodeContext(
        args.content,
        detectedFilePath,
        args.line_start,
        args.line_end
      );

      // 处理多行范围
      let finalLineStart = args.line_start;
      let finalLineEnd = args.line_end;
      const lineRangesData: any = {};

      if (args.line_ranges && args.line_ranges.length > 0) {
        // 使用 line_ranges（新方式）
        lineRangesData.line_ranges = args.line_ranges;
        // 为了向后兼容，仍然保存第一个范围到 line_start/line_end
        finalLineStart = args.line_ranges[0][0];
        finalLineEnd = args.line_ranges[args.line_ranges.length - 1][1];
      }

      // 合并元数据（包括新增强字段）
      const enhancedMetadata: any = {};

      // 从 RecordContextParams 中提取增强字段
      if (args.change_type) enhancedMetadata.change_type = args.change_type;
      if (args.change_reason)
        enhancedMetadata.change_reason = args.change_reason;
      if (args.impact_level) enhancedMetadata.impact_level = args.impact_level;
      if (args.related_files)
        enhancedMetadata.related_files = args.related_files;
      if (args.related_issues)
        enhancedMetadata.related_issues = args.related_issues;
      if (args.related_prs) enhancedMetadata.related_prs = args.related_prs;
      if (args.business_domain)
        enhancedMetadata.business_domain = args.business_domain;
      if (args.priority) enhancedMetadata.priority = args.priority;
      if (args.diff_stats) enhancedMetadata.diff_stats = args.diff_stats;

      // 处理多文件变更（合并为一条记忆）
      let isMultiFileContext = false;
      if (args.files_changed && args.files_changed.length > 0) {
        isMultiFileContext = true;
        enhancedMetadata.files_changed = args.files_changed;

        // 自动汇总所有文件的diff统计
        if (!enhancedMetadata.diff_stats) {
          const totalStats = args.files_changed.reduce(
            (acc, file) => {
              if (file.diff_stats) {
                acc.additions += file.diff_stats.additions || 0;
                acc.deletions += file.diff_stats.deletions || 0;
                acc.changes += file.diff_stats.changes || 0;
              }
              return acc;
            },
            { additions: 0, deletions: 0, changes: 0 }
          );
          enhancedMetadata.diff_stats = totalStats;
        }

        // 自动收集所有相关文件路径
        if (!enhancedMetadata.related_files) {
          enhancedMetadata.related_files = args.files_changed.map(
            (f) => f.file_path
          );
        }

        // 多文件场景：清空单一文件路径，使用特殊标记或留空
        // 实际文件列表存储在 metadata.files_changed 中
        detectedFilePath = undefined;
        finalLineStart = undefined;
        finalLineEnd = undefined;
      }

      const mergedMetadata = {
        ...(args.metadata || {}),
        ...extractedContext.metadata, // 包含自动提取的 affected_functions, affected_classes 等
        ...enhancedMetadata, // 用户提供的增强字段
        ...lineRangesData,
        ...(Object.keys(pathDetectionMeta).length > 0
          ? { path_detection: pathDetectionMeta }
          : {}),
        ...(Object.keys(autoSessionMeta).length > 0
          ? { session_info: autoSessionMeta }
          : {}),
      };

      const contextId = this.db.createContext({
        session_id: sessionId,
        type: args.type,
        content: args.content,
        file_path: undefined, // 不再使用单一 file_path，改用 context_files 表
        line_start: finalLineStart,
        line_end: finalLineEnd,
        language: detectedLanguage || extractedContext.language,
        tags: (args.tags || extractedContext.tags).join(","),
        quality_score: extractedContext.quality_score,
        metadata: JSON.stringify(mergedMetadata),
      });

      // 添加文件关联到 context_files 表
      if (args.files_changed && args.files_changed.length > 0) {
        // 多文件场景
        this.contextFileManager.addFiles(contextId, args.files_changed);
      } else if (detectedFilePath) {
        // 单文件场景（向后兼容）
        this.contextFileManager.addFiles(contextId, [
          {
            file_path: detectedFilePath,
            change_type: args.change_type,
            line_ranges: args.line_ranges,
            diff_stats: args.diff_stats,
          },
        ]);
      }

      // 异步生成embedding（不阻塞响应）
      if (this.vectorSearch && this.config.vector_search?.enabled) {
        // 确保数据库仍然可用
        if (this.db && this.db.isConnected()) {
          this.generateEmbeddingForContext(contextId, args.content).catch(
            (error) => {
              console.error(
                `Failed to generate embedding for context ${contextId}:`,
                error
              );
            }
          );
        }
      }

      // 构建响应消息
      let responseText = `Recorded context: ${contextId}`;

      // 多文件信息
      if (isMultiFileContext && args.files_changed) {
        responseText += `\n📁 Multi-file change: ${args.files_changed.length} files`;
        args.files_changed.forEach((file, idx) => {
          responseText += `\n  ${idx + 1}. ${file.file_path}`;
          if (file.change_type) responseText += ` (${file.change_type})`;
          if (file.diff_stats) {
            responseText += ` [+${file.diff_stats.additions}/-${file.diff_stats.deletions}]`;
          }
        });
        if (enhancedMetadata.diff_stats) {
          responseText += `\n📊 Total changes: +${enhancedMetadata.diff_stats.additions}/-${enhancedMetadata.diff_stats.deletions} (~${enhancedMetadata.diff_stats.changes} lines)`;
        }
      }

      // Session信息
      if (autoSessionMeta.auto_session) {
        responseText += `\n📋 Session: ${
          autoSessionMeta.session_source === "existing_active"
            ? "Reused active session"
            : "Created new session"
        } (${sessionId})`;
      }

      // 路径检测信息（仅单文件场景）
      if (!isMultiFileContext && pathDetectionMeta.auto_detected) {
        responseText += `\n🔍 Auto-detected file: ${
          pathDetectionMeta.all_suggestions?.[0]?.path || "N/A"
        } (confidence: ${Math.round(
          (pathDetectionMeta.confidence || 0) * 100
        )}%)`;
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
        isError: false,
        _meta: {
          context_id: contextId,
          quality_score: extractedContext.quality_score,
          embedding_enabled: !!(
            this.vectorSearch && this.config.vector_search?.enabled
          ),
          is_multi_file: isMultiFileContext,
          files_count: isMultiFileContext ? args.files_changed?.length : 1,
          ...pathDetectionMeta,
          ...autoSessionMeta,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to record context: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  // 辅助方法：为单个context生成embedding
  private async generateEmbeddingForContext(
    contextId: string,
    content: string
  ): Promise<void> {
    if (!this.vectorSearch) return;

    try {
      // 检查数据库是否仍然可用
      if (!this.db || !this.db.isConnected()) {
        console.error(
          "Database connection is closed, skipping embedding generation"
        );
        return;
      }

      await this.vectorSearch.initialize();
      const embedding = await this.vectorSearch.generateEmbedding(content);
      const embeddingText = JSON.stringify(embedding);

      this.db.updateContextEmbedding(
        contextId,
        embedding,
        embeddingText,
        "v1.0"
      );
    } catch (error) {
      throw error;
    }
  }

  private async handleEndSession(args: { session_id: string }) {
    try {
      this.sessionManager.endSession(args.session_id);

      return {
        content: [
          {
            type: "text",
            text: `Ended session: ${args.session_id}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to end session: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetCurrentSession(args: { project_path: string }) {
    try {
      const sessionId = await this.sessionManager.getCurrentSession(
        args.project_path
      );

      if (sessionId) {
        const session = this.db.getSession(sessionId);
        return {
          content: [
            {
              type: "text",
              text: `Current session: ${sessionId}`,
            },
          ],
          isError: false,
          _meta: {
            session_id: sessionId,
            session: session,
          },
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: "No active session found for this project",
            },
          ],
          isError: false,
          _meta: {
            session_id: null,
          },
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to get current session: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleListProjects(args: {
    include_stats?: boolean;
    limit?: number;
  }) {
    try {
      const includeStats = args.include_stats !== false; // 默认 true
      const limit = args.limit || 50;

      // 获取所有项目
      const projects = this.db.getAllProjects(limit);

      // 为每个项目附加统计信息
      const projectsWithStats = projects.map((project) => {
        if (!includeStats) {
          return {
            id: project.id,
            name: project.name,
            path: project.path,
            language: project.language,
            framework: project.framework,
          };
        }

        // 获取项目的统计信息
        const sessions = this.db.getProjectSessions(project.id);
        const contextsCount = this.db.getProjectContextsCount(project.id);
        const activeSessions = sessions.filter((s) => s.status === "active");

        // 获取最后活动时间
        let lastActivity = project.created_at;
        if (sessions.length > 0) {
          const lastSession = sessions.sort(
            (a, b) =>
              new Date(b.ended_at || b.started_at).getTime() -
              new Date(a.ended_at || a.started_at).getTime()
          )[0];
          lastActivity = lastSession.ended_at || lastSession.started_at;
        }

        return {
          id: project.id,
          name: project.name,
          path: project.path,
          language: project.language,
          framework: project.framework,
          stats: {
            total_sessions: sessions.length,
            active_sessions: activeSessions.length,
            total_contexts: contextsCount,
            last_activity: lastActivity,
            created_at: project.created_at,
          },
        };
      });

      // 格式化输出文本
      const outputLines = [`📚 Found ${projectsWithStats.length} projects:\n`];

      projectsWithStats.forEach((project, index) => {
        outputLines.push(`${index + 1}. **${project.name}**`);
        outputLines.push(`   - Path: \`${project.path}\``);
        outputLines.push(`   - ID: ${project.id}`);
        if (project.language)
          outputLines.push(`   - Language: ${project.language}`);
        if (project.framework)
          outputLines.push(`   - Framework: ${project.framework}`);

        if (includeStats && "stats" in project && project.stats) {
          outputLines.push(`   - 📊 Statistics:`);
          outputLines.push(`     - Contexts: ${project.stats.total_contexts}`);
          outputLines.push(
            `     - Sessions: ${project.stats.total_sessions} (${project.stats.active_sessions} active)`
          );
          outputLines.push(
            `     - Last Activity: ${new Date(
              project.stats.last_activity
            ).toLocaleString()}`
          );
        }
        outputLines.push("");
      });

      return {
        content: [
          {
            type: "text",
            text: outputLines.join("\n"),
          },
        ],
        isError: false,
        _meta: {
          total_projects: projectsWithStats.length,
          projects: projectsWithStats,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to list projects: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleExtractFileContext(args: {
    file_path: string;
    session_id?: string;
    record?: boolean;
  }) {
    try {
      const contexts = this.contentExtractor.extractFromFile(args.file_path);
      const results = [];

      for (const context of contexts) {
        if (args.record && args.session_id) {
          const contextId = this.db.createContext({
            session_id: args.session_id,
            type: context.type,
            content: context.content,
            file_path: context.file_path,
            line_start: context.line_start,
            line_end: context.line_end,
            language: context.language,
            tags: context.tags.join(","),
            quality_score: context.quality_score,
            metadata: JSON.stringify(context.metadata),
          });
          results.push({ ...context, context_id: contextId });
        } else {
          results.push(context);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Extracted ${results.length} contexts from ${args.file_path}${
              args.record ? " and recorded them" : ""
            }`,
          },
        ],
        isError: false,
        _meta: {
          contexts: results,
          file_path: args.file_path,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to extract file context: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetRelatedContexts(args: {
    context_id: string;
    relation_type?: string;
  }) {
    try {
      const relatedContexts = this.db.getRelatedContexts(
        args.context_id,
        args.relation_type as any
      );

      return {
        content: [
          {
            type: "text",
            text: `Found ${relatedContexts.length} related contexts`,
          },
        ],
        isError: false,
        _meta: {
          context_id: args.context_id,
          related_contexts: relatedContexts,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to get related contexts: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSemanticSearch(args: {
    query: string;
    project_id?: string;
    session_id?: string;
    limit?: number;
    similarity_threshold?: number;
    hybrid_weight?: number;
  }) {
    try {
      if (!this.vectorSearch) {
        return {
          content: [
            {
              type: "text",
              text: "Semantic search is not enabled. Please enable vector_search in configuration.",
            },
          ],
          isError: true,
        };
      }

      // 加载模型如果尚未初始化
      await this.vectorSearch.initialize();

      // 获取用于搜索的contexts
      const allContexts = this.db.getContextsForVectorSearch(
        args.project_id,
        args.session_id
      );

      if (allContexts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No contexts with embeddings found. Try running generate_embeddings first.",
            },
          ],
          isError: false,
          _meta: {
            query: args.query,
            results: [],
          },
        };
      }

      // 执行语义搜索
      const searchParams = {
        query: args.query,
        use_semantic_search: true,
        limit: args.limit || 10,
        similarity_threshold:
          args.similarity_threshold ||
          this.config.vector_search?.similarity_threshold ||
          0.5,
        hybrid_weight:
          args.hybrid_weight || this.config.vector_search?.hybrid_weight || 0.7,
      };

      // 获取关键词搜索结果作为基线
      const keywordResults = this.db.searchContexts(
        args.query,
        args.project_id,
        searchParams.limit
      );

      // 执行混合搜索
      const results = await this.vectorSearch.hybridSearch(
        args.query,
        keywordResults,
        allContexts,
        searchParams
      );

      // 🚀 记录搜索命中，更新质量评分
      results.forEach((context) => {
        this.db.recordContextSearch(context.id);
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} semantically relevant contexts for query: "${args.query}"`,
          },
        ],
        isError: false,
        _meta: {
          query: args.query,
          total_contexts_searched: allContexts.length,
          results: results.map((r) => ({
            ...r,
            similarity: r.similarity,
            hybrid_score: r.hybrid_score,
          })),
          search_params: searchParams,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to perform semantic search: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGenerateEmbeddings(args: {
    limit?: number;
    force_update?: boolean;
    project_id?: string;
  }) {
    try {
      if (!this.vectorSearch) {
        return {
          content: [
            {
              type: "text",
              text: "Vector search is not enabled. Please enable vector_search in configuration.",
            },
          ],
          isError: true,
        };
      }

      // 加载模型如果尚未初始化
      await this.vectorSearch.initialize();

      // 获取需要处理的contexts
      const limit = args.limit || 50;
      let contexts: any[];

      if (args.force_update) {
        // 如果强制更新，获取所有contexts
        contexts = this.db
          .getContextsForVectorSearch(args.project_id)
          .slice(0, limit);
      } else {
        // 否则只获取没有embedding的contexts
        contexts = this.db.getContextsWithoutEmbedding(limit);

        // 如果指定了project_id，进一步过滤
        if (args.project_id) {
          const projectContexts = this.db.getContextsForVectorSearch(
            args.project_id
          );
          const projectContextIds = new Set(projectContexts.map((c) => c.id));
          contexts = contexts.filter((c) => projectContextIds.has(c.id));
        }
      }

      if (contexts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: args.force_update
                ? "No contexts found to update embeddings for."
                : "All contexts already have embeddings. Use force_update=true to regenerate.",
            },
          ],
          isError: false,
          _meta: {
            processed: 0,
            total_available: 0,
          },
        };
      }

      // 生成embeddings
      let processed = 0;
      let errors = 0;

      for (const context of contexts) {
        try {
          const embedding = await this.vectorSearch.generateEmbedding(
            context.content
          );
          const embeddingText = JSON.stringify(embedding);

          this.db.updateContextEmbedding(
            context.id,
            embedding,
            embeddingText,
            "v1.0"
          );

          processed++;
        } catch (error) {
          console.error(
            `Failed to generate embedding for context ${context.id}:`,
            error
          );
          errors++;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully generated embeddings for ${processed} contexts${
              errors > 0 ? ` (${errors} errors)` : ""
            }.`,
          },
        ],
        isError: false,
        _meta: {
          processed,
          errors,
          total_requested: contexts.length,
          embedding_stats: this.db.getEmbeddingStats(),
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to generate embeddings: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  // Prompt handlers
  async start(): Promise<void> {
    // 确保在 MCP (stdio) 传输下，任何日志都不会写入 stdout，避免破坏 JSON-RPC 流
    // 将 console.log/info/debug 重定向到 stderr。
    try {
      const originalError = console.error.bind(console);
      const toStderr = (...args: any[]) => originalError(...args);
      console.log = toStderr as any;
      console.info = toStderr as any;
      console.debug = toStderr as any;
    } catch {}

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // ✅ 立即启动自动监控，不等待工具调用
    try {
      await this.startAutoMonitoring();
      console.error("[DevMind] Auto-monitoring initialized successfully");
    } catch (error) {
      console.error("[DevMind] Failed to initialize auto-monitoring:", error);
      // 不抛出错误，确保MCP服务器正常启动
    }
  }

  private async startAutoMonitoring(): Promise<void> {
    // 改进的工作目录检测 - 优先使用环境变量
    const potentialDirs = [
      process.env.INIT_CWD, // npm/npx初始目录
      process.env.PWD, // Unix工作目录
      process.env.CD, // Windows当前目录
      process.cwd(), // 最后兜底
    ].filter(Boolean) as string[];

    for (const dir of potentialDirs) {
      if (this.isProjectDirectory(dir)) {
        await this.setupProjectMonitoring(dir);
        return; // 找到项目目录就停止
      }
    }

    // 如果没有找到项目目录，静默返回
  }

  private isProjectDirectory(dirPath: string): boolean {
    if (!dirPath || !existsSync(dirPath)) return false;

    // 检查是否是项目目录的标识文件
    const projectIndicators = [
      "package.json",
      ".git",
      "src",
      "index.js",
      "main.py",
      "Cargo.toml",
      "go.mod",
      "pom.xml",
      ".project",
      "composer.json",
    ];

    return projectIndicators.some((indicator) =>
      existsSync(join(dirPath, indicator))
    );
  }

  private async setupProjectMonitoring(projectPath: string): Promise<void> {
    try {
      // 获取项目主会话
      let sessionId = await this.getProjectSession(projectPath);

      if (!sessionId) {
        // 只有在项目第一次使用时才创建主会话
        const projectName = require("path").basename(projectPath);
        const sessionResult = await this.handleCreateSession({
          project_path: projectPath,
          tool_used: "devmind",
          name: `${projectName} - Main Session`,
        });

        if (!sessionResult.isError && sessionResult._meta?.session_id) {
          sessionId = sessionResult._meta.session_id;
        }
      }

      if (sessionId) {
        // 为新项目创建初始欢迎记忆内容
        await this.createInitialProjectContext(sessionId, projectPath);

        // 启动文件监控
        await this.startFileWatcher(projectPath, sessionId);
      }
    } catch (error) {
      // 静默失败，不影响MCP服务器启动
    }
  }

  private async getProjectSession(projectPath: string): Promise<string | null> {
    try {
      // 获取或创建项目
      const project = await this.sessionManager.getOrCreateProject(projectPath);

      // 查找项目主会话（最早的会话）
      let mainSession = this.db.getProjectMainSession(project.id);

      if (mainSession) {
        // 确保主会话是活跃的
        if (mainSession.status !== "active") {
          this.db.reactivateSession(mainSession.id);
        }
        return mainSession.id;
      }

      // 如果没有主会话，返回null让系统创建一个
      return null;
    } catch (error) {
      console.error("[DevMind] Error in getProjectSession:", error);
      return null;
    }
  }

  private async startFileWatcher(
    projectPath: string,
    sessionId: string
  ): Promise<void> {
    // 智能文件监控器
    const patterns = [
      "**/*.{js,ts,jsx,tsx,py,go,rs,java,kt}",
      "**/package.json",
      "**/*.md",
    ];

    try {
      const chokidar = await import("chokidar");

      this.fileWatcher = chokidar.watch(patterns, {
        cwd: projectPath,
        ignored: [
          "**/node_modules/**",
          "**/dist/**",
          "**/build/**",
          "**/.git/**",
          "**/*.log",
        ],
        persistent: true, // 持续监控，不阻止进程退出
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 2000, // 文件写入稳定后2秒再触发
          pollInterval: 100,
        },
      });

      this.fileWatcher
        .on("change", (filePath: string) => {
          this.handleAutoFileChange(sessionId, "change", filePath, projectPath);
        })
        .on("add", (filePath: string) => {
          this.handleAutoFileChange(sessionId, "add", filePath, projectPath);
        });
    } catch (error) {
      // chokidar不可用，静默失败
      console.error("[DevMind] File watcher initialization failed:", error);
    }
  }

  private async handleAutoFileChange(
    sessionId: string,
    action: string,
    filePath: string,
    projectPath: string
  ): Promise<void> {
    try {
      const fullPath = join(projectPath, filePath);

      if (!existsSync(fullPath)) {
        return; // 文件不存在，跳过
      }

      const fileContent = readFileSync(fullPath, "utf8");

      // ✅ 智能过滤检查
      if (!this.autoRecordFilter.shouldRecord(filePath, fileContent)) {
        return; // 未通过智能过滤，跳过记录
      }

      // 使用 ContentExtractor 分析内容
      const extractedContext = this.contentExtractor.extractCodeContext(
        fileContent,
        filePath
      );

      // 智能判断上下文类型
      const contextType = this.determineContextType(
        filePath,
        action,
        extractedContext
      );

      // 提取语义化标签
      const semanticTags = this.extractSemanticTags(filePath, extractedContext);

      // 生成智能摘要
      const summary = this.generateSmartSummary(filePath, action, fileContent);

      // 记录上下文
      await this.handleRecordContext({
        session_id: sessionId,
        type: contextType,
        content: `${summary}\n\n\`\`\`${extractedContext.language}\n${fileContent}\n\`\`\``,
        file_path: filePath,
        language: extractedContext.language,
        tags: [...semanticTags, "auto", action],
        metadata: {
          auto_recorded: true,
          action: action,
          file_size: fileContent.length,
          quality_score: extractedContext.quality_score,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      // 静默失败，但记录错误
      console.error("[DevMind] Auto-record failed for", filePath, ":", error);
    }
  }

  /**
   * 智能判断上下文类型
   */
  private determineContextType(
    filePath: string,
    action: string,
    extractedContext: any
  ): ContextType {
    // 配置文件
    if (
      filePath.includes("package.json") ||
      filePath.includes("tsconfig") ||
      filePath.includes("config") ||
      filePath.endsWith(".env.example")
    ) {
      return ContextType.CONFIGURATION;
    }

    // 文档文件
    if (
      filePath.endsWith(".md") ||
      filePath.includes("README") ||
      filePath.includes("doc")
    ) {
      return ContextType.DOCUMENTATION;
    }

    // 测试文件
    if (
      filePath.includes(".test.") ||
      filePath.includes(".spec.") ||
      filePath.includes("/__tests__/")
    ) {
      return ContextType.TEST;
    }

    // 默认为代码类型
    return ContextType.CODE;
  }

  /**
   * 提取语义化标签
   */
  private extractSemanticTags(
    filePath: string,
    extractedContext: any
  ): string[] {
    const tags: string[] = [];

    // 文件扩展名
    const ext = filePath.split(".").pop() || "unknown";
    tags.push(ext);

    // 文件路径特征
    if (filePath.includes("/api/")) tags.push("api");
    if (filePath.includes("/components/")) tags.push("component");
    if (filePath.includes("/utils/") || filePath.includes("/helpers/"))
      tags.push("utility");
    if (filePath.includes("/models/") || filePath.includes("/schema/"))
      tags.push("data-model");
    if (filePath.includes("/services/")) tags.push("service");
    if (filePath.includes("/hooks/")) tags.push("hooks");

    // 从 extractedContext 提取的标签
    if (extractedContext.tags && Array.isArray(extractedContext.tags)) {
      tags.push(...extractedContext.tags);
    }

    return [...new Set(tags)]; // 去重
  }

  /**
   * 生成智能摘要
   */
  private generateSmartSummary(
    filePath: string,
    action: string,
    content: string
  ): string {
    const fileName = filePath.split("/").pop() || filePath;
    const actionText = action === "change" ? "修改" : "新增";
    const lines = content.split("\n").length;
    const chars = content.length;

    return `[自动记录] ${actionText}文件: ${fileName} (${lines}行, ${chars}字符)`;
  }

  private async createInitialProjectContext(
    sessionId: string,
    projectPath: string
  ): Promise<void> {
    try {
      // 检查是否已有上下文记录
      const existingContexts = this.db.getContextsBySession(sessionId, 1);
      if (existingContexts.length > 0) {
        return; // 已有记录，无需创建初始内容
      }

      // 获取项目信息
      const projectName = require("path").basename(projectPath);
      const project = await this.sessionManager.getOrCreateProject(projectPath);

      const welcomeContent = `# DevMind Memory Initialized

Welcome to **${projectName}** development session!

## Project Details
- **Path**: ${projectPath}
- **Language**: ${project?.language || "Auto-detected"}
- **Framework**: ${project?.framework || "N/A"}
- **Session Started**: ${this.formatDateForUser()}

## What's Being Monitored
✅ File changes (*.js, *.ts, *.py, *.go, *.rs, *.java, *.kt, etc.)
✅ Configuration files (package.json, *.md)
✅ Auto-recording enabled for development activities

## Available Tools
- **semantic_search**: Find related contexts and solutions
- **record_context**: Manually save important insights
- **list_contexts**: View all recorded memories
- **extract_file_context**: Analyze specific files

💡 **Tip**: I'll automatically track your file changes. Use manual recording for decisions, solutions, and important insights!

Happy coding! 🚀`;

      await this.handleRecordContext({
        session_id: sessionId,
        type: ContextType.DOCUMENTATION,
        content: welcomeContent,
        tags: ["initialization", "welcome", "project-info", "auto-generated"],
        metadata: {
          created_by: "devmind-auto",
          is_initial: true,
          project_name: projectName,
        },
      });
    } catch (error) {
      // 静默失败，不影响项目监控启动
    }
  }

  // Context management handlers
  private async handleListContexts(args: {
    session_id?: string;
    project_id?: string;
    limit?: number;
  }) {
    try {
      let contexts: any[] = [];
      const limit = args.limit || 20;

      if (args.session_id) {
        // List by session
        contexts = this.db.getContextsBySession(args.session_id, limit);
      } else if (args.project_id) {
        // List by project (get all contexts from all sessions of the project)
        const sessions = this.db.getActiveSessions(args.project_id);
        for (const session of sessions) {
          const sessionContexts = this.db.getContextsBySession(
            session.id,
            limit
          );
          contexts.push(...sessionContexts);
        }
        // Sort by created_at and limit
        contexts.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        contexts = contexts.slice(0, limit);
      } else {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Either session_id or project_id is required"
        );
      }

      // Format contexts for display
      const formattedContexts = contexts.map((ctx) => ({
        id: ctx.id,
        type: ctx.type,
        content_preview:
          ctx.content.substring(0, 100) +
          (ctx.content.length > 100 ? "..." : ""),
        tags: ctx.tags
          ? ctx.tags.split(",").filter((t: string) => t.trim())
          : [],
        quality_score: ctx.quality_score,
        created_at: ctx.created_at,
        file_path: ctx.file_path,
        session_id: ctx.session_id,
      }));

      return {
        content: [
          {
            type: "text",
            text:
              `Found ${formattedContexts.length} contexts:\n\n` +
              formattedContexts
                .map(
                  (ctx, i) =>
                    `${i + 1}. **ID**: ${ctx.id}\n` +
                    `   **Type**: ${ctx.type}\n` +
                    `   **Content**: ${ctx.content_preview}\n` +
                    `   **Tags**: ${ctx.tags.join(", ") || "None"}\n` +
                    `   **Quality**: ${ctx.quality_score}\n` +
                    `   **Created**: ${ctx.created_at}\n` +
                    `   **File**: ${ctx.file_path || "N/A"}\n`
                )
                .join("\n"),
          },
        ],
        _meta: {
          total_contexts: formattedContexts.length,
          contexts: formattedContexts,
        },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to list contexts: ${error}` }],
        isError: true,
      };
    }
  }

  private async handleDeleteContext(args: { context_id: string }) {
    try {
      // First check if context exists
      const context = this.db.getContextById(args.context_id);
      if (!context) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Context with ID ${args.context_id} not found`
        );
      }

      // Delete the context
      const deleted = this.db.deleteContext(args.context_id);

      if (deleted) {
        return {
          content: [
            {
              type: "text",
              text:
                `Successfully deleted context: ${args.context_id}\n` +
                `Type: ${context.type}\n` +
                `Content: ${context.content.substring(0, 100)}...`,
            },
          ],
          _meta: {
            deleted_context_id: args.context_id,
            success: true,
          },
        };
      } else {
        throw new Error("Delete operation failed");
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to delete context: ${error}` }],
        isError: true,
      };
    }
  }

  private async handleUpdateContext(args: {
    context_id: string;
    content?: string;
    tags?: string[];
    quality_score?: number;
    metadata?: object;
    file_path?: string;
    files_changed?: Array<{
      file_path: string;
      change_type?: "add" | "modify" | "delete" | "refactor" | "rename";
      line_ranges?: number[][];
      diff_stats?: { additions: number; deletions: number; changes: number };
    }>;
  }) {
    try {
      // First check if context exists
      const context = this.db.getContextById(args.context_id);
      if (!context) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Context with ID ${args.context_id} not found`
        );
      }

      // Prepare updates
      const updates: any = {};
      const updatedFields: string[] = [];

      if (args.content !== undefined) {
        updates.content = args.content;
        updatedFields.push("content");
      }
      if (args.tags !== undefined) {
        updates.tags = args.tags.join(",");
        updatedFields.push("tags");
      }
      if (args.quality_score !== undefined) {
        updates.quality_score = args.quality_score;
        updatedFields.push("quality_score");
      }
      if (args.metadata !== undefined) {
        updates.metadata = args.metadata;
        updatedFields.push("metadata");
      }

      // Update the context
      const updated = this.db.updateContext(args.context_id, updates);

      // Update file associations if provided
      if (args.file_path || args.files_changed) {
        // Delete existing file associations
        this.contextFileManager.deleteFilesByContext(args.context_id);

        // Add new file associations
        if (args.files_changed) {
          this.contextFileManager.addFiles(args.context_id, args.files_changed);
          updatedFields.push("files_changed");
        } else if (args.file_path) {
          this.contextFileManager.addFiles(args.context_id, [
            { file_path: args.file_path },
          ]);
          updatedFields.push("file_path");
        }
      }

      if (updated || args.file_path || args.files_changed) {
        const updatedContext = this.db.getContextById(args.context_id);
        const files = this.contextFileManager.getFilesByContext(
          args.context_id
        );

        return {
          content: [
            {
              type: "text",
              text:
                `Successfully updated context: ${args.context_id}\n` +
                `Type: ${updatedContext?.type}\n` +
                `Updated fields: ${updatedFields.join(", ")}\n` +
                `Files: ${
                  files.length > 0
                    ? files.map((f) => f.file_path).join(", ")
                    : "None"
                }\n` +
                `Content: ${updatedContext?.content.substring(0, 100)}...`,
            },
          ],
          _meta: {
            updated_context_id: args.context_id,
            updated_fields: updatedFields,
            file_count: files.length,
            success: true,
          },
        };
      } else {
        throw new Error("Update operation failed");
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to update context: ${error}` }],
        isError: true,
      };
    }
  }

  private async handleDeleteSession(args: { session_id: string }) {
    try {
      // First check if session exists and get context count
      const session = this.db.getSession(args.session_id);
      if (!session) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Session with ID ${args.session_id} not found`
        );
      }

      const contexts = this.db.getContextsBySession(args.session_id);
      const contextCount = contexts.length;

      // Delete the session (this will cascade delete all contexts due to foreign key constraint)
      const deleted = this.db.deleteSession(args.session_id);

      if (deleted) {
        return {
          content: [
            {
              type: "text",
              text:
                `Successfully deleted session: ${args.session_id}\n` +
                `Name: ${session.name}\n` +
                `Contexts deleted: ${contextCount}\n` +
                `⚠️  This action cannot be undone!`,
            },
          ],
          _meta: {
            deleted_session_id: args.session_id,
            deleted_contexts_count: contextCount,
            success: true,
          },
        };
      } else {
        throw new Error("Delete operation failed");
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to delete session: ${error}` }],
        isError: true,
      };
    }
  }

  // Removed redundant project analysis handlers:
  // - handleIndexProject: Use project_analysis_engineer prompt instead for comprehensive analysis
  // - handleAnalyzeProject: Basic analysis merged into project_analysis_engineer
  // - handleGenerateProjectDoc: Professional documentation via project_analysis_engineer
  // - handleQueryProjectMemory: Overly complex, use semantic_search instead
  // - handleGetProjectContext: Redundant with existing context tools
  //
  // These tools were causing confusion and overlap with the more powerful prompt-based approach.

  /**
   * 📊 导出记忆图谱（HTML格式）
   */
  private async handleExportMemoryGraph(args: {
    project_id: string;
    max_nodes?: number;
    focus_type?: string;
    output_path?: string;
  }) {
    try {
      const maxNodes = args.max_nodes !== undefined ? args.max_nodes : 0; // 0表示显示所有
      const focusType = args.focus_type || "all";

      // 验证项目存在
      const project = this.db.getProject(args.project_id);
      if (!project) {
        return {
          content: [
            { type: "text", text: `Project not found: ${args.project_id}` },
          ],
          isError: true,
        };
      }

      // 生成 HTML 图谱
      const result = await this.graphGenerator.generateGraph(args.project_id, {
        max_nodes: maxNodes,
        focus_type: focusType,
        output_path: args.output_path,
      });

      // 返回 HTML 文件路径
      return {
        content: [
          {
            type: "text",
            text: `# 📊 Memory Graph Exported\n\n✅ **Format**: HTML (Interactive)\n📁 **File**: \`${
              result.file_path
            }\`\n📊 **Nodes**: ${
              maxNodes === 0 ? "All" : maxNodes
            }\n🔗 **Filter**: ${focusType}\n\n🌐 Open the file in your browser for interactive D3.js visualization!\n\n---\n\n**Quick access**: \`file:///${result.file_path?.replace(
              /\\/g,
              "/"
            )}\``,
          },
        ],
        isError: false,
        _meta: {
          format: "html",
          file_path: result.file_path,
          project_name: project.name,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to export memory graph: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * 🚀 更新context的多维度质量评分
   */
  private async handleUpdateQualityScores(args: {
    project_id?: string;
    limit?: number;
    force_all?: boolean;
  }) {
    try {
      const limit = args.limit || 100;

      // 获取需要更新的contexts
      let contexts: any[];
      if (args.project_id) {
        contexts = this.db
          .getContextsByProject(args.project_id)
          .slice(0, limit);
      } else {
        // 获取最近的contexts
        const allProjects = this.db.getAllProjects(10);
        contexts = [];
        for (const project of allProjects) {
          const projectContexts = this.db
            .getContextsByProject(project.id)
            .slice(0, limit / allProjects.length);
          contexts.push(...projectContexts);
          if (contexts.length >= limit) break;
        }
        contexts = contexts.slice(0, limit);
      }

      if (contexts.length === 0) {
        return {
          content: [{ type: "text", text: "No contexts found to update." }],
          isError: false,
        };
      }

      // 更新质量评分
      let updated = 0;
      let skipped = 0;
      const updates: any[] = [];

      for (const context of contexts) {
        // 如果不是强制更新，检查是否最近已更新
        if (!args.force_all) {
          const metadata = context.metadata ? JSON.parse(context.metadata) : {};
          const lastAccessed = metadata.quality_metrics?.last_accessed;
          if (lastAccessed) {
            const daysSince = Math.floor(
              (Date.now() - new Date(lastAccessed).getTime()) /
                (1000 * 60 * 60 * 24)
            );
            if (daysSince < 7) {
              skipped++;
              continue; // 跳过最近更新的
            }
          }
        }

        // 计算新的质量评分
        const qualityMetrics =
          this.qualityCalculator.calculateQualityMetrics(context);

        // 更新metadata
        const metadata = context.metadata ? JSON.parse(context.metadata) : {};
        metadata.quality_metrics = qualityMetrics;

        // 更新到数据库
        const success = this.db.updateContext(context.id, {
          quality_score: qualityMetrics.overall,
          metadata: JSON.stringify(metadata),
        });

        if (success) {
          updated++;
          updates.push({
            id: context.id,
            old_score: context.quality_score,
            new_score: qualityMetrics.overall,
            relevance: qualityMetrics.relevance,
            freshness: qualityMetrics.freshness,
            usefulness: qualityMetrics.usefulness,
          });
        }
      }

      // 生成报告
      let output = `# 🚀 Quality Score Update Report\n\n`;
      output += `**Total Contexts**: ${contexts.length}\n`;
      output += `**Updated**: ${updated}\n`;
      output += `**Skipped** (recently updated): ${skipped}\n\n`;

      if (updates.length > 0) {
        output += `## Top Improvements\n\n`;
        updates
          .sort(
            (a, b) => b.new_score - b.old_score - (a.new_score - a.old_score)
          )
          .slice(0, 5)
          .forEach((u) => {
            const improvement = ((u.new_score - u.old_score) * 100).toFixed(1);
            const improvementNum = parseFloat(improvement);
            output += `- Context \`${u.id.substring(
              0,
              8
            )}...\`: ${u.old_score.toFixed(2)} → ${u.new_score.toFixed(2)} (${
              improvementNum > 0 ? "+" : ""
            }${improvement}%)\n`;
            output += `  - Relevance: ${u.relevance.toFixed(
              2
            )}, Freshness: ${u.freshness.toFixed(
              2
            )}, Usefulness: ${u.usefulness.toFixed(2)}\n`;
          });
      }

      output += `\n✨ Quality scores updated successfully! Search results will now reflect improved rankings.`;

      return {
        content: [{ type: "text", text: output }],
        isError: false,
        _meta: {
          total: contexts.length,
          updated,
          skipped,
          updates: updates.slice(0, 10), // 只返回前10个
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to update quality scores: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleOptimizeProjectMemory(args: {
    project_id: string;
    strategies?: string[];
    dry_run?: boolean;
  }) {
    try {
      // 导入优化器
      const { ProjectMemoryOptimizer, OptimizationStrategy } = await import(
        "./project-indexer/core/ProjectMemoryOptimizer.js"
      );

      // 创建优化器实例
      const optimizer = new ProjectMemoryOptimizer(this.db, this.vectorSearch!);

      // 确定要使用的策略
      const strategies = args.strategies?.map((s) => s as any) || [
        OptimizationStrategy.DEDUPLICATION,
        OptimizationStrategy.CLUSTERING,
        OptimizationStrategy.COMPRESSION,
        OptimizationStrategy.SUMMARIZATION,
      ];

      if (args.dry_run) {
        // 预览模式 - 只获取优化建议
        const insights = await optimizer.getOptimizationInsights(
          args.project_id
        );

        let output = `# Optimization Preview for Project ${args.project_id}\n\n`;

        output += `## Storage Analysis\n`;
        output += `- Total Size: ${(
          insights.storageAnalysis.totalSize / 1024
        ).toFixed(2)} KB\n`;
        output += `- Average Context Size: ${(
          insights.storageAnalysis.avgContextSize / 1024
        ).toFixed(2)} KB\n`;
        output += `- Largest Contexts: ${insights.storageAnalysis.largestContexts
          .slice(0, 3)
          .map(
            (c) => `${c.id.substring(0, 8)} (${(c.size / 1024).toFixed(2)} KB)`
          )
          .join(", ")}\n\n`;

        output += `## Redundancy Analysis\n`;
        output += `- Estimated Duplicates: ${insights.redundancyAnalysis.estimatedDuplicates}\n`;
        output += `- Potential Savings: ${(
          insights.redundancyAnalysis.potentialSavings / 1024
        ).toFixed(2)} KB\n\n`;

        output += `## Recommendations\n`;
        insights.recommendations.forEach((r) => {
          output += `- **${r.priority.toUpperCase()}**: ${r.action}\n`;
          output += `  Impact: ${r.impact}, Effort: ${r.effort}\n`;
        });

        return {
          content: [{ type: "text", text: output }],
          isError: false,
          _meta: { insights, dry_run: true },
        };
      } else {
        // 执行优化
        const report = await optimizer.optimizeProject(
          args.project_id,
          strategies
        );

        let output = `# Optimization Report\n\n`;
        output += `Project: ${report.projectId}\n`;
        output += `Strategies Applied: ${report.strategies.join(", ")}\n`;
        output += `Processing Time: ${report.performance.timeTaken}ms\n\n`;

        if (report.results.deduplication) {
          const dedup = report.results.deduplication;
          output += `## Deduplication\n`;
          output += `- Scanned: ${dedup.totalScanned} contexts\n`;
          output += `- Duplicates Found: ${dedup.duplicatesFound}\n`;
          output += `- Duplicates Removed: ${dedup.duplicatesRemoved}\n`;
          output += `- Space Reclaimed: ${(dedup.spaceReclaimed / 1024).toFixed(
            2
          )} KB\n\n`;
        }

        if (report.results.clustering) {
          const cluster = report.results.clustering;
          output += `## Clustering\n`;
          output += `- Clusters Created: ${cluster.clustersCreated}\n`;
          output += `- Average Cluster Size: ${cluster.averageClusterSize.toFixed(
            1
          )}\n`;
          output += `- Outliers: ${cluster.outliers}\n\n`;
        }

        if (report.results.compression) {
          const comp = report.results.compression;
          output += `## Compression\n`;
          output += `- Original Size: ${(comp.original.size / 1024).toFixed(
            2
          )} KB\n`;
          output += `- Compressed Size: ${(comp.compressed.size / 1024).toFixed(
            2
          )} KB\n`;
          output += `- Compression Ratio: ${(comp.ratio * 100).toFixed(1)}%\n`;
          output += `- Space Saved: ${(comp.savedBytes / 1024).toFixed(
            2
          )} KB\n\n`;
        }

        if (report.recommendations.length > 0) {
          output += `## Recommendations\n`;
          report.recommendations.forEach((r) => {
            output += `- ${r}\n`;
          });
        }

        return {
          content: [{ type: "text", text: output }],
          isError: false,
          _meta: { report },
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to optimize project memory: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * 处理项目分析工程师 Tool（直接调用，返回分析文档）
   */
  private async handleProjectAnalysisEngineerTool(args: any) {
    try {
      const {
        project_path,
        analysis_focus = "architecture,entities,apis,business_logic",
        doc_style = "devmind",
        auto_save = true,
        language,
      } = args;

      if (!project_path) {
        throw new McpError(ErrorCode.InvalidParams, "project_path is required");
      }

      console.log(`🔍 Starting project analysis for: ${project_path}`);
      console.log(`🎯 Focus areas: ${analysis_focus}`);
      console.log(`📝 Documentation style: ${doc_style}`);
      if (language) console.log(`🌐 Language: ${language}`);

      // 扫描和分析项目
      const projectData = await this.analyzeProjectForPrompt(
        project_path,
        analysis_focus.split(",")
      );

      // 生成专业分析提示
      const analysisPrompt = await this.generateAnalysisPrompt(
        projectData,
        doc_style,
        analysis_focus,
        language
      );

      // 准备会话信息
      let sessionId: string | undefined;
      if (auto_save) {
        const project = await this.sessionManager.getOrCreateProject(
          project_path
        );
        try {
          sessionId = await this.sessionManager.createSession({
            project_path: project_path,
            tool_used: "project_analysis_engineer",
            name: `Professional Analysis - ${projectData.projectName}`,
          });
        } catch (error) {
          console.warn("Could not create session for auto-save:", error);
        }
      }

      console.log(`✅ Generated analysis prompt ready for AI processing`);

      // 返回分析提示，AI 将处理并生成文档
      return {
        content: [
          {
            type: "text",
            text:
              analysisPrompt +
              (sessionId
                ? `\n\n---\n\n📝 **Auto-save enabled**: Generated documentation will be automatically saved to session ${sessionId}`
                : ""),
          },
        ],
        isError: false,
        _meta: {
          project_path: project_path,
          project_name: projectData.projectName,
          analysis_focus: analysis_focus,
          doc_style: doc_style,
          auto_save: auto_save,
          session_id: sessionId,
          files_analyzed: projectData.keyFiles.length,
          project_type: projectData.projectType,
          prompt_ready: true,
        },
      };
    } catch (error) {
      console.error("Project analysis engineer tool failed:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to analyze project: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * 处理项目分析工程师Prompt
   */
  private async handleProjectAnalysisEngineer(args: any) {
    try {
      const {
        project_path,
        analysis_focus = "architecture,entities,apis,business_logic",
        doc_style = "devmind",
        auto_save = true,
        language, // 新增语言参数
      } = args;

      if (!project_path) {
        throw new McpError(ErrorCode.InvalidParams, "project_path is required");
      }

      console.log(`🔍 Starting project analysis for: ${project_path}`);
      console.log(`🎯 Focus areas: ${analysis_focus}`);
      console.log(`📝 Documentation style: ${doc_style}`);
      if (language) console.log(`🌐 Language: ${language}`);

      // 扫描和分析项目
      const projectData = await this.analyzeProjectForPrompt(
        project_path,
        analysis_focus.split(",")
      );

      // 生成专业分析提示（传入语言参数）
      const analysisPrompt = await this.generateAnalysisPrompt(
        projectData,
        doc_style,
        analysis_focus,
        language
      );

      // 如果启用auto_save，准备保存函数
      let saveInstructions = "";
      if (auto_save) {
        // 获取或创建项目会话
        const project = await this.sessionManager.getOrCreateProject(
          project_path
        );
        let sessionId;
        try {
          sessionId = await this.sessionManager.createSession({
            project_path: project_path,
            tool_used: "project_analysis_engineer",
            name: `Professional Analysis - ${projectData.projectName}`,
          });
        } catch (error) {
          console.warn("Could not create session for auto-save:", error);
        }

        if (sessionId) {
          saveInstructions = `\n\n---\n\n**IMPORTANT: After you complete your analysis, automatically save it to memory using:**\n\n\`\`\`\nrecord_context\nsession_id: ${sessionId}\ntype: documentation\ncontent: [Your complete analysis report]\ntags: project_analysis,professional_documentation,${doc_style}_style\n\`\`\`\n\nThis will ensure the analysis is preserved in the project's memory for future reference.`;
        }
      }

      console.log(
        `✅ Generated analysis prompt: ${
          analysisPrompt.length + saveInstructions.length
        } characters`
      );

      return {
        description: `Professional Project Analysis Engineer - Deep analysis of "${projectData.projectName}" project`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: analysisPrompt + saveInstructions,
            },
          },
        ],
        _meta: {
          project_path: project_path,
          project_name: projectData.projectName,
          analysis_focus: analysis_focus,
          doc_style: doc_style,
          auto_save: auto_save,
          files_analyzed: projectData.keyFiles.length,
          project_type: projectData.projectType,
        },
      };
    } catch (error) {
      console.error("Project analysis engineer failed:", error);
      return {
        description: "Project Analysis Failed",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Failed to analyze project: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          },
        ],
        _meta: { error: true },
      };
    }
  }

  /**
   * 分析项目用于生成提示
   */
  private async analyzeProjectForPrompt(
    projectPath: string,
    focusAreas: string[]
  ) {
    const path = await import("path");
    const fs = await import("fs/promises");

    const projectName = path.basename(projectPath);

    // 读取关键项目文件
    let packageJson: any = null;
    let readmeContent = "";
    let mainFiles: string[] = [];

    try {
      const packagePath = path.join(projectPath, "package.json");
      const packageContent = await fs.readFile(packagePath, "utf-8");
      packageJson = JSON.parse(packageContent);
    } catch {
      // 如果不是Node.js项目，继续其他分析
    }

    try {
      const readmePath = path.join(projectPath, "README.md");
      readmeContent = await fs.readFile(readmePath, "utf-8");
    } catch {
      // README可选
    }

    // 使用现有的项目分析器获取结构信息
    const { FileScanner } = await import(
      "./project-indexer/tools/FileScanner.js"
    );
    const { ProjectAnalyzer } = await import(
      "./project-indexer/tools/ProjectAnalyzer.js"
    );

    const scanner = new FileScanner();
    const analyzer = new ProjectAnalyzer();

    const files = await scanner.scan(projectPath);
    const { structure, features } = await analyzer.analyzeProject(
      projectPath,
      files
    );

    // 选择关键文件进行内容分析
    const keyFiles = await this.selectKeyFiles(files, focusAreas);
    const fileContents = await this.extractFileContents(keyFiles);

    return {
      projectName,
      projectPath,
      packageJson,
      readmeContent,
      structure,
      features,
      files,
      keyFiles,
      fileContents,
      projectType: features.projectType,
      mainLanguage: features.technicalStack.language,
    };
  }

  /**
   * 选择关键文件
   */
  private async selectKeyFiles(files: any[], focusAreas: string[]) {
    const path = await import("path");
    const keyFiles: any[] = [];

    // 配置文件
    const configFiles = files.filter((f) =>
      [
        "package.json",
        "tsconfig.json",
        "webpack.config.js",
        "vite.config.ts",
        "tailwind.config.js",
        "next.config.js",
        ".env",
        "docker-compose.yml",
      ].includes(path.basename(f.path))
    );
    keyFiles.push(...configFiles);

    // 主入口文件
    const entryFiles = files.filter((f) =>
      [
        "index.ts",
        "index.js",
        "main.ts",
        "main.js",
        "app.ts",
        "app.js",
        "server.ts",
        "server.js",
      ].includes(path.basename(f.path))
    );
    keyFiles.push(...entryFiles);

    // 根据关注领域选择特定文件
    if (focusAreas.includes("entities") || focusAreas.includes("apis")) {
      const modelFiles = files
        .filter(
          (f) =>
            f.path.includes("model") ||
            f.path.includes("entity") ||
            f.path.includes("type") ||
            f.path.includes("schema") ||
            f.path.includes("api") ||
            f.path.includes("route")
        )
        .slice(0, 8);
      keyFiles.push(...modelFiles);
    }

    // 最大的几个文件
    const largestFiles = files
      .filter((f) => !keyFiles.some((kf) => kf.path === f.path))
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 5);
    keyFiles.push(...largestFiles);

    return keyFiles.slice(0, 20); // 限制文件数量
  }

  /**
   * 提取文件内容
   */
  private async extractFileContents(keyFiles: any[]) {
    const fs = await import("fs/promises");
    const contents = [];

    for (const file of keyFiles) {
      try {
        const content = await fs.readFile(file.path, "utf-8");
        const lines = content.split("\n");

        contents.push({
          file: file.path,
          size: file.size,
          lines: lines.length,
          content:
            lines.length > 150
              ? lines.slice(0, 75).join("\n") +
                "\n\n[... truncated ...]\n\n" +
                lines.slice(-25).join("\n")
              : content,
        });
      } catch (error) {
        console.warn(`Failed to read file ${file.path}:`, error);
      }
    }

    return contents;
  }

  /**
   * 检测文档语言
   */
  private detectDocumentationLanguage(
    readmeContent?: string,
    userLanguage?: string
  ): string {
    // 如果用户明确指定语言
    if (userLanguage) {
      return userLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
    }

    // 基于README内容检测
    if (readmeContent) {
      const chineseChars = (readmeContent.match(/[\u4e00-\u9fff]/g) || [])
        .length;
      const totalChars = readmeContent.length;

      // 如果中文字符占比超过10%，判定为中文项目
      if (chineseChars / totalChars > 0.1) {
        return "zh";
      }
    }

    // 默认英文
    return "en";
  }

  /**
   * 生成专业分析提示
   */
  private async generateAnalysisPrompt(
    projectData: any,
    docStyle: string,
    analysisFocus: string,
    language?: string
  ): Promise<string> {
    const {
      projectName,
      packageJson,
      readmeContent,
      structure,
      features,
      fileContents,
    } = projectData;

    // 自动检测语言（基于用户输入或README内容）
    const detectedLanguage = this.detectDocumentationLanguage(
      readmeContent,
      language
    );
    const isChineseDoc = detectedLanguage === "zh";

    const prompt = [];

    // 根据语言生成不同的标题和角色设定
    if (isChineseDoc) {
      prompt.push("# 🏗️ 专业项目分析工程师");
      prompt.push("");
      prompt.push(
        "你是一名资深软件架构师和项目分析专家。你的任务是对这个项目进行全面分析，并生成专业的开发文档。"
      );
      prompt.push("");
      prompt.push(
        "**重要**: 请使用中文生成所有文档内容，包括技术术语的中文解释。"
      );
      prompt.push("");
    } else {
      prompt.push("# 🏗️ Professional Project Analysis Engineer");
      prompt.push("");
      prompt.push(
        "You are a senior software architect and project analysis expert. Your task is to conduct a comprehensive analysis of this project and generate professional development documentation."
      );
      prompt.push("");
      prompt.push(
        "**Important**: Please generate all documentation content in English."
      );
      prompt.push("");
    }

    // 项目基本信息
    const projectInfoTitle = isChineseDoc
      ? "## 📋 项目信息"
      : "## 📋 Project Information";
    prompt.push(projectInfoTitle);
    prompt.push(`- **Project Name**: ${projectName}`);
    prompt.push(`- **Project Type**: ${features.projectType}`);
    prompt.push(`- **Main Language**: ${features.technicalStack.language}`);
    if (features.technicalStack.framework) {
      prompt.push(`- **Framework**: ${features.technicalStack.framework}`);
    }
    prompt.push(`- **Total Files**: ${structure.totalFiles}`);
    prompt.push(`- **Analysis Focus**: ${analysisFocus}`);
    prompt.push("");

    // 项目描述（如果有）
    if (packageJson?.description) {
      const descTitle = isChineseDoc
        ? "## 📝 项目描述"
        : "## 📝 Project Description";
      prompt.push(descTitle);
      prompt.push(packageJson.description);
      prompt.push("");
    }

    // README摘要（如果有）
    if (readmeContent) {
      const readmeTitle = isChineseDoc
        ? "## 📖 README 概览"
        : "## 📖 README Overview";
      prompt.push(readmeTitle);
      const readmeLines = readmeContent.split("\n").slice(0, 20).join("\n");
      prompt.push(readmeLines);
      if (readmeContent.split("\n").length > 20) {
        prompt.push("[... README continues ...]");
      }
      prompt.push("");
    }

    // 技术栈信息
    if (packageJson?.dependencies || packageJson?.devDependencies) {
      const techStackTitle = isChineseDoc
        ? "## 🛠️ 技术栈"
        : "## 🛠️ Technology Stack";
      prompt.push(techStackTitle);
      if (packageJson.dependencies) {
        prompt.push("**Dependencies:**");
        Object.entries(packageJson.dependencies)
          .slice(0, 10)
          .forEach(([dep, version]) => {
            prompt.push(`- ${dep}: ${version}`);
          });
        if (Object.keys(packageJson.dependencies).length > 10) {
          prompt.push(
            `- ... and ${
              Object.keys(packageJson.dependencies).length - 10
            } more dependencies`
          );
        }
      }
      if (packageJson.scripts) {
        prompt.push("");
        prompt.push("**Scripts:**");
        Object.entries(packageJson.scripts).forEach(([script, command]) => {
          prompt.push(`- \`${script}\`: ${command}`);
        });
      }
      prompt.push("");
    }

    // 项目结构
    prompt.push("## 📁 Project Structure");
    if (structure.directories && structure.directories.length > 0) {
      prompt.push("**Key Directories:**");
      structure.directories.slice(0, 15).forEach((dir: any) => {
        prompt.push(`- ${dir.path || dir}`);
      });
    }
    prompt.push("");

    // 关键文件内容
    prompt.push("## 🔍 Key File Analysis");
    prompt.push(
      "Below are the contents of the most important files in the project:"
    );
    prompt.push("");

    for (const file of fileContents.slice(0, 8)) {
      const path = await import("path");
      const fileName = path.basename(file.file);
      const ext = path.extname(file.file).substring(1);
      prompt.push(`### ${fileName}`);
      prompt.push(`\`\`\`${ext}`);
      prompt.push(file.content);
      prompt.push("```");
      prompt.push("");
    }

    // 分析任务
    const analysisTitle = isChineseDoc
      ? "## 🎯 分析要求"
      : "## 🎯 Analysis Requirements";
    prompt.push(analysisTitle);
    prompt.push("");

    if (docStyle === "devmind") {
      if (isChineseDoc) {
        prompt.push(
          "生成一份全面的 **DEVMIND.md** 风格的开发文档，包含以下内容："
        );
        prompt.push("");
        prompt.push("1. **项目概述** - 项目的核心功能和价值主张");
        prompt.push(
          "2. **主要功能** - 详细列出项目提供的核心功能特性，每个功能包含简短说明"
        );
        prompt.push("3. **开发命令** - 构建、测试和运行的基本命令");
        prompt.push("4. **架构概览** - 高级系统设计和组件关系");
        prompt.push("5. **核心组件** - 主要模块、类及其职责");
        prompt.push("6. **重要实现细节** - 关键技术决策和模式");
        prompt.push("7. **配置** - 如何配置和自定义系统");
        prompt.push("8. **开发笔记** - 开发者的重要注意事项");
        prompt.push("9. **常见开发任务** - 典型的工作流程和过程");
      } else {
        prompt.push(
          "Generate a comprehensive **DEVMIND.md** style development guide that includes:"
        );
        prompt.push("");
        prompt.push(
          "1. **Project Overview** - What this project does and its core value proposition"
        );
        prompt.push(
          "2. **Key Features** - Detailed list of core features/capabilities provided by this project, with brief explanation for each"
        );
        prompt.push(
          "3. **Development Commands** - Essential commands for building, testing, and running"
        );
        prompt.push(
          "4. **Architecture Overview** - High-level system design and component relationships"
        );
        prompt.push(
          "5. **Core Components** - Main modules, classes, and their responsibilities"
        );
        prompt.push(
          "6. **Important Implementation Details** - Key technical decisions and patterns"
        );
        prompt.push(
          "7. **Configuration** - How to configure and customize the system"
        );
        prompt.push(
          "8. **Development Notes** - Important considerations for developers"
        );
        prompt.push(
          "9. **Common Development Tasks** - Typical workflows and procedures"
        );
      }
    } else if (docStyle === "claude") {
      if (isChineseDoc) {
        prompt.push(
          "生成一份全面的 **CLAUDE.md** 风格的开发指南，包含以下内容："
        );
      } else {
        prompt.push(
          "Generate a comprehensive **CLAUDE.md** style development guide that includes:"
        );
      }
      prompt.push("");
      prompt.push(
        "1. **Project Overview** - What this project does and its core value proposition"
      );
      prompt.push(
        "2. **Development Commands** - Essential commands for building, testing, and running"
      );
      prompt.push(
        "3. **Architecture Overview** - High-level system design and component relationships"
      );
      prompt.push(
        "4. **Core Components** - Main modules, classes, and their responsibilities"
      );
      prompt.push(
        "5. **Important Implementation Details** - Key technical decisions and patterns"
      );
      prompt.push(
        "6. **Configuration** - How to configure and customize the system"
      );
      prompt.push(
        "7. **Development Notes** - Important considerations for developers"
      );
      prompt.push(
        "8. **Common Development Tasks** - Typical workflows and procedures"
      );
    } else if (docStyle === "technical") {
      prompt.push(
        "Generate a detailed **Technical Specification** that includes:"
      );
      prompt.push("");
      prompt.push(
        "1. **System Architecture** - Detailed component design and interactions"
      );
      prompt.push(
        "2. **API Documentation** - Endpoints, methods, and data structures"
      );
      prompt.push("3. **Database Schema** - Data models and relationships");
      prompt.push(
        "4. **Security Considerations** - Authentication, authorization, and data protection"
      );
      prompt.push(
        "5. **Performance Characteristics** - Scalability and optimization details"
      );
      prompt.push(
        "6. **Deployment Guide** - Infrastructure and deployment procedures"
      );
    } else {
      prompt.push("Generate a comprehensive **README.md** that includes:");
      prompt.push("");
      prompt.push(
        "1. **Project Description** - Clear explanation of what the project does"
      );
      prompt.push(
        "2. **Installation Instructions** - Step-by-step setup guide"
      );
      prompt.push("3. **Usage Examples** - Common use cases and code examples");
      prompt.push(
        "4. **API Reference** - Available methods and their parameters"
      );
      prompt.push(
        "5. **Contributing Guidelines** - How to contribute to the project"
      );
      prompt.push(
        "6. **License and Credits** - Legal information and acknowledgments"
      );
    }

    prompt.push("");
    prompt.push("## 📋 Analysis Guidelines");
    prompt.push("");
    prompt.push("- **Be Professional**: Use clear, precise technical language");
    prompt.push(
      "- **Be Comprehensive**: Cover all important aspects of the project"
    );
    prompt.push(
      "- **Be Practical**: Focus on information developers actually need"
    );
    prompt.push(
      "- **Be Accurate**: Base your analysis on the actual code and configuration"
    );
    prompt.push(
      "- **Be Structured**: Organize information in a logical, easy-to-follow format"
    );
    prompt.push("");
    prompt.push(
      "**Important**: This documentation will be used by developers to understand and work with this project. Make it as helpful and accurate as possible!"
    );

    return prompt.join("\n");
  }

  async close(): Promise<void> {
    // 关闭文件监控器
    if (this.fileWatcher) {
      try {
        await this.fileWatcher.close();
        console.error("[DevMind] File watcher closed successfully");
      } catch (error) {
        console.error("[DevMind] Error closing file watcher:", error);
      }
    }

    // 清理自动记录过滤器缓存
    if (this.autoRecordFilter) {
      this.autoRecordFilter.reset();
    }

    // 关闭数据库连接
    if (this.db) {
      this.db.close();
    }

    // MCP Server close method doesn't exist, so we skip it
    // await this.server.close();
  }
}
