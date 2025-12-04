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
import { MemoryGraphGenerator } from "./memory-graph/index.js";
import { ContextFileManager } from "./context-file-manager.js";
import {
  createFilePathDetector,
  FilePathDetector,
} from "./utils/file-path-detector.js";
// UnifiedMemoryManager removed in v2.1.0 - simplified to type-based auto-memory
import { languageDetector } from "./utils/language-detector.js";

// === AI Enhancement Imports (v2.2.0) ===
import { QueryEnhancer } from "./utils/query-enhancer.js";
import { AutoMemoryClassifier } from "./utils/auto-memory-classifier.js";
import { ContextEnricher } from "./utils/context-enricher.js";
import { BatchProcessor } from "./utils/batch-processor.js";
import { performanceOptimizer } from "./utils/performance-optimizer.js";
import { PendingMemoryTracker } from "./pending-memory-tracker.js";

import {
  AiMemoryConfig,
  ContextSearchParams,
  ProjectContextParams,
  RecordContextParams,
  SessionCreateParams,
  ContextType,
  GitInfo,
  ProjectInfo,
} from "./types.js";
import { join, dirname, resolve, basename } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { normalizeProjectPath } from "./utils/path-normalizer.js";
import { findProjectRoot } from "./utils/project-root-finder.js";

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
  private lastNotifiedFiles: Map<string, number> = new Map(); // 记录已提示的文件和时间
  private qualityUpdateTimestamp: number = 0; // 质量分上次更新时间戳

  // === AI Enhancement Components (v2.2.0) ===
  private queryEnhancer: QueryEnhancer;
  private memoryClassifier: AutoMemoryClassifier;
  private contextEnricher: ContextEnricher;
  private batchProcessor: BatchProcessor;

  // === Pending Memory Tracker (v2.2.6) ===
  private pendingMemoryTracker: PendingMemoryTracker;

  // === Git Info Cache (v2.3.0) ===
  private gitInfoCache: Map<
    string,
    { data: GitInfo | null; timestamp: number }
  > = new Map();
  private projectInfoCache: Map<string, ProjectInfo> = new Map();

  // Tools that should NOT trigger memory reminder (to avoid infinite loops)
  private readonly NO_REMINDER_TOOLS = new Set(["record_context"]);

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

    // === Initialize AI Enhancement Components (v2.2.0) ===
    this.queryEnhancer = new QueryEnhancer();
    this.memoryClassifier = new AutoMemoryClassifier();
    this.contextEnricher = new ContextEnricher();
    this.batchProcessor = new BatchProcessor(this.db);

    // === Initialize Pending Memory Tracker (v2.2.6) ===
    this.pendingMemoryTracker = new PendingMemoryTracker();

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

    // UnifiedMemoryManager removed in v2.1.0 - using type-based strategy

    this.server = new Server(
      {
        name: "devmind-mcp",
        version: "2025-11-25", // MCP protocol version
      },
      {
        capabilities: {
          // Resources capability - static list, no dynamic changes
          resources: {
            subscribe: false, // Resource subscription not supported
            listChanged: false, // Resource list is static
          },
          // Tools capability - static list, no dynamic changes
          tools: {
            listChanged: false, // Tool list is static
          },
          // Prompts capability - static list, no dynamic changes
          prompts: {
            listChanged: false, // Prompt list is static
          },
          // Logging capability - server can send log messages
          logging: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Generate memory reminder if there are unrecorded files
   * Returns null if no reminder needed
   */
  private generateMemoryReminder(): {
    pending_count: number;
    pending_details: Array<{ file: string; type: string }>;
    action: string;
  } | null {
    const pendingDetails = this.pendingMemoryTracker.getPendingDetails();

    if (pendingDetails.length === 0) {
      return null;
    }

    // Format file details with change type
    const fileDetails = pendingDetails.slice(0, 10).map((detail) => ({
      file: detail.filePath,
      type: detail.changeType,
    }));

    return {
      pending_count: pendingDetails.length,
      pending_details: fileDetails,
      action:
        "Call record_context NOW with appropriate type (bug_fix, feature_add, code_modify, etc.) before responding to user.",
    };
  }

  /**
   * Wrap tool result with memory reminder if needed
   */
  private wrapWithReminder(
    toolName: string,
    result: { content: Array<{ type: string; text: string }> }
  ): { content: Array<{ type: string; text: string }> } {
    // Skip reminder for certain tools
    if (this.NO_REMINDER_TOOLS.has(toolName)) {
      return result;
    }

    const reminder = this.generateMemoryReminder();
    if (!reminder) {
      return result;
    }

    // Format file list with change types
    const fileList = reminder.pending_details
      .map((detail) => `${detail.file} (${detail.type})`)
      .join(", ");

    const moreFilesText =
      reminder.pending_count > 10
        ? ` (+${reminder.pending_count - 10} more)`
        : "";

    // Add reminder to the result
    const reminderText = `\n\n---\n⚠️ [MEMORY REMINDER] ${reminder.pending_count} file(s) edited but not recorded:
${fileList}${moreFilesText}

${reminder.action}`;

    // Append reminder to the last text content
    const newContent = [...result.content];
    if (
      newContent.length > 0 &&
      newContent[newContent.length - 1].type === "text"
    ) {
      newContent[newContent.length - 1] = {
        ...newContent[newContent.length - 1],
        text: newContent[newContent.length - 1].text + reminderText,
      };
    } else {
      newContent.push({ type: "text", text: reminderText });
    }

    return { content: newContent };
  }

  private initializeDatabase(): void {
    const dbDir = dirname(this.config.database_path!);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
  }

  /**
   * Validate resource URI according to MCP specification
   * Servers MUST validate all resource URIs
   */
  private validateResourceUri(uri: string): void {
    try {
      const url = new URL(uri);

      // Validate scheme
      if (url.protocol !== "memory:") {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid URI scheme: ${url.protocol}. Expected 'memory:'`
        );
      }

      // Validate pathname
      const validPaths = [
        "/project-context",
        "/session-history",
        "/search-contexts",
        "/stats",
      ];

      if (!validPaths.includes(url.pathname)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid resource path: ${url.pathname}`
        );
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InvalidRequest, `Malformed URI: ${uri}`);
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

        // Validate URI according to MCP specification
        this.validateResourceUri(uri);

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
            "MANDATORY: Call IMMEDIATELY after editing files. Task is INCOMPLETE without this call.\n\nSELF-CHECK: Did I edit files? --> Call NOW. Did I fix bug? --> type: bug_fix. Did I add feature? --> type: feature_add.\n\nWARNING: Skipping this loses all work context for future conversations.\n\nUser keywords 'remember/save/记住/保存' --> MUST call this tool.",
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
                  // === Solution/Design Types (v2.1.0) ===
                  "solution",
                  "design",
                  "learning",
                  // === General Types (Backward Compatible) ===
                  "code",
                  "conversation",
                  "error",
                  "documentation",
                  "test",
                  "configuration",
                  "commit",
                ],
                description:
                  "Type of context (use detailed types like code_modify, bug_fix for better categorization)",
              },
              content: {
                type: "string",
                description:
                  "Markdown content. MUST match project language (Chinese/English). Use headers, lists, code blocks.",
              },
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
                description:
                  "Optional programming language (e.g., 'typescript', 'python', 'go'). This is for CODE language, not natural language. For natural language (Chinese/English), write content field in the appropriate language.",
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "Optional tags",
              },

              // === Enhanced Fields ===
              change_type: {
                type: "string",
                enum: ["add", "modify", "delete", "refactor", "rename"],
                description: "Change type (auto-detected if not provided)",
              },
              change_reason: {
                type: "string",
                description: "Reason for the change",
              },
              impact_level: {
                type: "string",
                enum: ["breaking", "major", "minor", "patch"],
                description: "Impact level (auto-assessed if not provided)",
              },
              related_files: {
                type: "array",
                items: { type: "string" },
                description: "Related file paths",
              },
              related_issues: {
                type: "array",
                items: { type: "string" },
                description: 'Related issue numbers (e.g., ["#123", "#456"])',
              },
              related_prs: {
                type: "array",
                items: { type: "string" },
                description: 'Related PR numbers (e.g., ["#789"])',
              },
              business_domain: {
                type: "array",
                items: { type: "string" },
                description: 'Business domain tags (e.g., ["auth", "payment"])',
              },
              priority: {
                type: "string",
                enum: ["critical", "high", "medium", "low"],
                description: "Priority level",
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
                description: "Use for multi-file changes (2+ files)",
              },

              metadata: { type: "object", description: "Additional metadata" },

              force_remember: {
                type: "boolean",
                description: "Force record when user says 'remember/save this'",
              },
            },
            required: ["content"], // type is optional for AI auto-classification
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
            "List tracked projects with stats. Returns project_id needed for export_memory_graph.",
          inputSchema: {
            type: "object",
            properties: {
              include_stats: {
                type: "boolean",
                description: "Include stats (default: true)",
              },
              limit: {
                type: "number",
                description: "Max results (default: 50)",
              },
            },
          },
        },
        {
          name: "get_context",
          description:
            "Get context by ID(s). Use for viewing full content of memory entries from list_contexts or semantic_search.",
          inputSchema: {
            type: "object",
            properties: {
              context_ids: {
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                ],
                description: "Context ID or array of IDs",
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
                description: "Find related contexts instead",
              },
            },
            required: ["context_ids"],
          },
        },
        {
          name: "semantic_search",
          description:
            "Search memory using hybrid semantic+keyword algorithm. Returns ranked results with similarity scores. Use for finding past solutions, similar bugs, or related work.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              project_path: { type: "string", description: "Limit to project" },
              session_id: { type: "string", description: "Limit to session" },
              file_path: { type: "string", description: "Filter by file" },
              type: { type: "string", description: "Filter by context type" },
              limit: {
                type: "number",
                description: "Max results (default: 10)",
              },
              similarity_threshold: {
                type: "number",
                description: "Min score 0-1 (default: 0.5)",
              },
              hybrid_weight: {
                type: "number",
                description: "Semantic vs keyword 0-1 (default: 0.7)",
              },
              use_cache: {
                type: "boolean",
                description: "Use cache (default: true)",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "list_contexts",
          description:
            "List contexts in chronological order (newest first). Use semantic_search for ranked results.",
          inputSchema: {
            type: "object",
            properties: {
              project_path: {
                type: "string",
                description: "Filter by project",
              },
              session_id: { type: "string", description: "Filter by session" },
              limit: {
                type: "number",
                description: "Max results (default: 20)",
              },
              since: {
                type: "string",
                description: "Time filter: 24h, 7d, 30d, 90d",
              },
              type: { type: "string", description: "Filter by type" },
            },
          },
        },
        {
          name: "delete_context",
          description: "Delete a recorded context by ID.",
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
            "Update context content, tags, metadata, or file associations.",
          inputSchema: {
            type: "object",
            properties: {
              context_id: { type: "string", description: "Context ID" },
              content: { type: "string", description: "New content" },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "New tags",
              },
              quality_score: { type: "number", description: "Score 0-1" },
              metadata: { type: "object", description: "New metadata" },
              file_path: { type: "string", description: "Update file path" },
              files_changed: {
                type: "array",
                description: "Update file associations",
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
            "Delete session(s) and contexts by session_id or project_id.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: { type: "string", description: "Session ID" },
              project_id: {
                type: "string",
                description: "Delete all sessions of project",
              },
            },
          },
        },
        {
          name: "project_analysis_engineer",
          description:
            "Generate project documentation (DEVMIND.md, README.md, Technical.md). Analyzes codebase structure, APIs, and business logic.",
          inputSchema: {
            type: "object",
            properties: {
              project_path: {
                type: "string",
                description: "Project directory path",
              },
              analysis_focus: {
                type: "string",
                description:
                  "Focus: architecture, entities, apis, business_logic, security, performance",
              },
              doc_style: {
                type: "string",
                enum: ["devmind", "technical", "readme"],
                description: "Doc style (default: devmind)",
              },
              auto_save: {
                type: "boolean",
                description: "Save to memory (default: true)",
              },
              language: {
                type: "string",
                enum: ["en", "zh", "auto"],
                description: "Language (default: auto)",
              },
            },
            required: ["project_path"],
          },
        },
        {
          name: "export_memory_graph",
          description:
            "Export memory as interactive knowledge graph (HTML). Shows context relationships with D3.js visualization.",
          inputSchema: {
            type: "object",
            properties: {
              project_id: {
                type: "string",
                description: "Project ID (from list_projects)",
              },
              max_nodes: {
                type: "number",
                description: "Max nodes (default: all)",
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
                description: "Filter by type",
              },
              output_path: {
                type: "string",
                description: "Custom output path",
              },
            },
            required: ["project_id"],
          },
        },
        {
          name: "get_memory_status",
          description:
            "Get memory system status: monitoring state, context count, cache stats.",
          inputSchema: {
            type: "object",
            properties: {
              project_path: { type: "string", description: "Project path" },
            },
            required: [],
          },
        },
        {
          name: "cleanup_empty_projects",
          description:
            "Clean up empty projects (projects with no memory contexts). Returns list of empty projects and optionally deletes them.",
          inputSchema: {
            type: "object",
            properties: {
              dry_run: {
                type: "boolean",
                description:
                  "If true, only list empty projects without deleting (default: true)",
              },
              project_ids: {
                type: "array",
                items: { type: "string" },
                description:
                  "Optional: specific project IDs to delete. If not provided, deletes all empty projects.",
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Ensure args is at least an empty object to prevent destructuring errors
      const safeArgs = args || {};

      // Execute tool and wrap result with memory reminder
      const executeAndWrap = async (
        handler: () => Promise<{
          content: Array<{ type: string; text: string }>;
        }>
      ) => {
        const result = await handler();
        return this.wrapWithReminder(name, result);
      };

      switch (name) {
        case "create_session":
          return executeAndWrap(() =>
            this.handleCreateSession(safeArgs as unknown as SessionCreateParams)
          );
        case "record_context":
          return this.handleRecordContext(
            safeArgs as unknown as RecordContextParams
          );
        case "end_session":
          return executeAndWrap(() =>
            this.handleEndSession(safeArgs as { session_id: string })
          );
        case "get_current_session":
          return executeAndWrap(() =>
            this.handleGetCurrentSession(safeArgs as { project_path: string })
          );
        case "list_projects":
          return executeAndWrap(() =>
            this.handleListProjects(
              safeArgs as { include_stats?: boolean; limit?: number }
            )
          );
        case "get_context":
          return executeAndWrap(() =>
            this.handleGetContext(
              safeArgs as {
                context_ids: string | string[];
                relation_type?: string;
              }
            )
          );
        case "semantic_search":
          return executeAndWrap(() =>
            this.handleSemanticSearch(
              safeArgs as {
                query: string;
                project_path?: string;
                session_id?: string;
                limit?: number;
                similarity_threshold?: number;
                hybrid_weight?: number;
              }
            )
          );
        case "list_contexts":
          return executeAndWrap(() =>
            this.handleListContexts(
              safeArgs as {
                session_id?: string;
                project_path?: string;
                limit?: number;
              }
            )
          );
        case "delete_context":
          return executeAndWrap(() =>
            this.handleDeleteContext(safeArgs as { context_id: string })
          );
        case "update_context":
          return executeAndWrap(() =>
            this.handleUpdateContext(
              safeArgs as {
                context_id: string;
                content?: string;
                tags?: string[];
                quality_score?: number;
                metadata?: object;
              }
            )
          );
        case "delete_session":
          return executeAndWrap(() =>
            this.handleDeleteSession(
              safeArgs as { session_id?: string; project_id?: string }
            )
          );
        case "project_analysis_engineer":
          return executeAndWrap(() =>
            this.handleProjectAnalysisEngineerTool(
              safeArgs as {
                project_path: string;
                analysis_focus?: string;
                doc_style?: string;
                auto_save?: boolean;
                language?: string;
              }
            )
          );
        case "export_memory_graph":
          return executeAndWrap(() =>
            this.handleExportMemoryGraph(
              safeArgs as {
                project_id: string;
                max_nodes?: number;
                focus_type?: string;
                output_path?: string;
              }
            )
          );
        case "get_memory_status":
          return executeAndWrap(() =>
            this.handleGetMemoryStatus(safeArgs as { project_path?: string })
          );
        case "cleanup_empty_projects":
          return executeAndWrap(() =>
            this.handleCleanupEmptyProjects(
              safeArgs as { dry_run?: boolean; project_ids?: string[] }
            )
          );
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: "memory_recording_guidance",
          description:
            "Core guidance for AI assistants on when and how to record development context to memory",
          arguments: [],
        },
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

      // Ensure args is at least an empty object to prevent destructuring errors
      const safeArgs = args || {};

      switch (name) {
        case "memory_recording_guidance":
          return this.handleMemoryRecordingGuidance();
        case "project_analysis_engineer":
          return await this.handleProjectAnalysisEngineer(safeArgs);
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

  // generateEnhancedNotification method removed in v2.1.0 - no longer needed with type-based strategy

  private async handleRecordContext(args: RecordContextParams) {
    try {
      // 自动获取或创建会话（如果未提供 session_id）
      let sessionId = args.session_id;
      let autoSessionMeta: any = {};
      let inferredProjectPath = args.project_path;

      // v2.1.15: 如果两个参数都没提供，自动推断当前工作目录
      if (!sessionId && !inferredProjectPath) {
        const potentialDirs = [
          process.env.INIT_CWD, // npm/npx初始目录
          process.env.PWD, // Unix工作目录
          process.env.CD, // Windows当前目录
          process.cwd(), // 最后兜底
        ].filter(Boolean) as string[];

        // 找到第一个有效目录
        for (const dir of potentialDirs) {
          if (existsSync(dir)) {
            inferredProjectPath = dir;
            autoSessionMeta.inferred_project_path = true;
            break;
          }
        }
      }

      if (!sessionId && inferredProjectPath) {
        // 尝试获取活跃会话
        const currentSessionId = await this.sessionManager.getCurrentSession(
          inferredProjectPath
        );

        if (currentSessionId) {
          sessionId = currentSessionId;
          autoSessionMeta = {
            ...autoSessionMeta,
            auto_session: true,
            session_source: "existing_active",
            session_id: sessionId,
          };
        } else {
          // 创建新会话
          sessionId = await this.sessionManager.createSession({
            project_path: inferredProjectPath,
            tool_used: "auto",
            name: "Auto-created session",
          });
          autoSessionMeta = {
            ...autoSessionMeta,
            auto_session: true,
            session_source: "newly_created",
            session_id: sessionId,
          };
        }
      }

      // 验证必须有 session_id
      if (!sessionId) {
        throw new Error(
          "Either session_id or project_path must be provided. " +
            "Could not infer project path from current working directory."
        );
      }

      // === Git 信息自动检测 (v2.3.0) ===
      let gitInfo: GitInfo | null = null;
      let gitDetectionMeta: any = {};

      // 仅在未提供 files_changed 且有 project_path 时调用
      if (!args.files_changed && inferredProjectPath) {
        try {
          gitInfo = await this.detectGitInfo(inferredProjectPath);

          if (gitInfo && gitInfo.changedFiles.length > 0) {
            // 将检测到的变更文件转换为 files_changed 格式
            args.files_changed = gitInfo.changedFiles.map((file) => ({
              file_path: file,
              change_type: "modify", // 简化处理，统一标记为 modify
            }));

            gitDetectionMeta = {
              auto_detected_from_git: true,
              detected_files_count: gitInfo.changedFiles.length,
            };
          }
        } catch (error) {
          console.warn("[Git Detection] Failed in handleRecordContext:", error);
        }
      }

      // === 项目信息自动检测 (v2.3.0) ===
      let projectInfo: ProjectInfo | null = null;

      // 仅在提供 project_path 时调用
      if (inferredProjectPath) {
        try {
          projectInfo = await this.detectProjectInfo(inferredProjectPath);
        } catch (error) {
          console.warn(
            "[Project Detection] Failed in handleRecordContext:",
            error
          );
        }
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
                // 如果有多个高置信度的文件建议，自动转换为多文件变更
                if (suggestions.length > 1 && suggestions[0].confidence > 0.6) {
                  // 转换为files_changed格式（仅在用户未提供时）
                  if (!args.files_changed) {
                    args.files_changed = suggestions
                      .slice(0, 5) // 最多5个文件
                      .map((s) => ({
                        file_path: s.path,
                        change_type: s.source.includes("git")
                          ? "modify"
                          : undefined,
                      }));
                  }

                  // 清空单一文件路径，使用多文件格式
                  detectedFilePath = undefined;
                  pathDetectionMeta = {
                    auto_detected: true,
                    multi_file_auto_detected: true,
                    confidence: suggestions[0].confidence,
                    detected_files: suggestions.slice(0, 5).map((s) => ({
                      path: detector.getRelativePath(s.path),
                      confidence: s.confidence,
                      source: s.source,
                    })),
                  };
                } else {
                  // 单文件场景
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

      // === 分层自动记忆策略 (v2.1.0) ===
      // 从 content 检测对话语言（简易中文字符占比检测）
      const detectConversationLanguage = (
        text: string
      ): "zh" | "en" | undefined => {
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const totalChars = text.replace(/\s/g, "").length;
        if (totalChars === 0) return undefined;
        const chineseRatio = chineseChars / totalChars;
        // 超过 30% 中文字符即判定为中文对话
        return chineseRatio > 0.3
          ? "zh"
          : chineseRatio > 0.05
          ? undefined
          : "en";
      };

      const conversationLang = detectConversationLanguage(args.content);
      const language = args.project_path
        ? languageDetector.detectProjectLanguage(
            args.project_path,
            conversationLang
          )
        : conversationLang || "en";

      const isForceRemember = args.force_remember === true;
      const memorySource = isForceRemember ? "user_explicit" : "auto_remember";

      // 定义自动记忆的工作类型
      const SILENT_AUTO_RECORD = [
        ContextType.BUG_FIX,
        ContextType.BUG_REPORT,
        ContextType.FEATURE_ADD,
        ContextType.FEATURE_UPDATE,
        ContextType.FEATURE_REMOVE,
        ContextType.CODE_CREATE,
        ContextType.CODE_MODIFY,
        ContextType.CODE_REFACTOR,
        ContextType.CODE_OPTIMIZE,
        ContextType.CODE_DELETE,
        ContextType.TEST,
        ContextType.COMMIT,
        ContextType.CONFIGURATION,
      ];

      const NOTIFY_AUTO_RECORD = [
        ContextType.SOLUTION,
        ContextType.DESIGN,
        ContextType.DOCUMENTATION,
        ContextType.LEARNING,
      ];

      const NO_RECORD = [ContextType.CONVERSATION, ContextType.ERROR];

      // 决策：是否记忆
      let shouldRecord = isForceRemember;
      let recordTier: "silent" | "notify" | "none" = "none";

      if (!isForceRemember) {
        if (SILENT_AUTO_RECORD.includes(args.type)) {
          shouldRecord = true;
          recordTier = "silent";
        } else if (NOTIFY_AUTO_RECORD.includes(args.type)) {
          shouldRecord = true;
          recordTier = "notify";
        } else if (NO_RECORD.includes(args.type)) {
          shouldRecord = false;
          recordTier = "none";
        } else {
          // 默认：其他类型也记忆（安全策略）
          shouldRecord = true;
          recordTier = "silent";
        }
      } else {
        recordTier = "silent"; // 用户强制记忆，使用静默模式
      }

      // 如果不记忆，直接返回
      if (!shouldRecord) {
        const notRecordedMessage =
          language === "zh"
            ? `💬 对话未记录。\n如需记录，请设置 force_remember=true`
            : `💬 Conversation not recorded.\nTo record, set force_remember=true`;

        return {
          content: [{ type: "text", text: notRecordedMessage }],
          isError: false,
          _meta: {
            auto_memory_decision: "not_recorded",
            reason: "low_value_type",
            type: args.type,
          },
        };
      }

      // === AI Enhancement (v2.2.0): Auto-classify context type ===
      let finalType = args.type || "conversation"; // Default fallback
      let autoClassificationMeta: any = {};
      if (!args.type || args.type === "code" || args.type === "conversation") {
        try {
          const classification = this.memoryClassifier.classify(args.content, {
            ...args.metadata,
            filePath: detectedFilePath,
            change_type: args.change_type,
            diff_stats: args.diff_stats,
          });

          if (classification.confidence > 0.5) {
            // Lowered from 0.7 to 0.5
            finalType = classification.type;
            autoClassificationMeta = {
              auto_classified: true,
              original_type: args.type,
              classified_type: classification.type,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
              changeType: classification.changeType,
              impactLevel: classification.impactLevel,
            };
          }
        } catch (error) {
          console.error("[AI Enhancement] Auto-classification failed:", error);
        }
      }

      // === AI Enhancement (v2.2.0): Enrich context with additional metadata ===
      let enrichmentResult: any = {};
      try {
        enrichmentResult = this.contextEnricher.enrich(
          args.content,
          detectedFilePath,
          {
            ...args.metadata,
            change_type: args.change_type,
            diff_stats: args.diff_stats,
          }
        );
      } catch (error) {
        console.error("[AI Enhancement] Context enrichment failed:", error);
      }

      // 构建自动检测的元数据（不覆盖用户提供的值）
      const autoDetectedMetadata: any = {};

      // Git 信息 (v2.3.0) - 仅在用户未提供时添加
      if (gitInfo) {
        if (!args.metadata?.git_branch)
          autoDetectedMetadata.git_branch = gitInfo.branch;
        if (!args.metadata?.git_author)
          autoDetectedMetadata.git_author = gitInfo.author;
        if (!args.metadata?.git_has_uncommitted)
          autoDetectedMetadata.git_has_uncommitted = gitInfo.hasUncommitted;
      }

      // 项目信息 (v2.3.0) - 仅在用户未提供时添加
      if (projectInfo) {
        if (!args.metadata?.project_name)
          autoDetectedMetadata.project_name = projectInfo.name;
        if (!args.metadata?.project_version && projectInfo.version)
          autoDetectedMetadata.project_version = projectInfo.version;
        if (!args.metadata?.project_type)
          autoDetectedMetadata.project_type = projectInfo.type;
        if (!args.metadata?.project_description && projectInfo.description)
          autoDetectedMetadata.project_description = projectInfo.description;
      }

      const mergedMetadata = {
        ...(args.metadata || {}),
        ...extractedContext.metadata, // 包含自动提取的 affected_functions, affected_classes 等
        ...enhancedMetadata, // 用户提供的增强字段
        ...lineRangesData,
        ...autoDetectedMetadata, // 自动检测的 Git 和项目信息（不覆盖用户提供的值）
        // AI Enhancement: Add enriched metadata
        ...(Object.keys(enrichmentResult).length > 0
          ? { ai_enrichment: enrichmentResult }
          : {}),
        ...(Object.keys(autoClassificationMeta).length > 0
          ? { auto_classification: autoClassificationMeta }
          : {}),
        ...(Object.keys(pathDetectionMeta).length > 0
          ? { path_detection: pathDetectionMeta }
          : {}),
        ...(Object.keys(gitDetectionMeta).length > 0
          ? { git_detection: gitDetectionMeta }
          : {}),
        ...(Object.keys(autoSessionMeta).length > 0
          ? { session_info: autoSessionMeta }
          : {}),
        memory_source: memorySource,
        record_tier: recordTier,
        ai_enhanced: true, // Mark as AI enhanced
      };

      const contextId = this.db.createContext({
        session_id: sessionId,
        type: finalType,
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
        // Mark files as recorded in pending tracker
        const filePaths = args.files_changed.map((f) => f.file_path);
        this.pendingMemoryTracker.markMultipleRecorded(filePaths);
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
        // Mark file as recorded in pending tracker
        this.pendingMemoryTracker.markRecorded(detectedFilePath);
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
      let responseText = "";

      // 根据记忆层级生成不同的响应
      const getTypeName = (type: ContextType): string => {
        const typeNames: Record<string, { zh: string; en: string }> = {
          bug_fix: { zh: "Bug修复", en: "Bug Fix" },
          feature_add: { zh: "功能开发", en: "Feature Development" },
          code_modify: { zh: "代码修改", en: "Code Modification" },
          code_refactor: { zh: "代码重构", en: "Code Refactoring" },
          solution: { zh: "技术方案", en: "Technical Solution" },
          design: { zh: "架构设计", en: "Architecture Design" },
          documentation: { zh: "文档编写", en: "Documentation" },
          test: { zh: "测试", en: "Testing" },
          configuration: { zh: "配置修改", en: "Configuration" },
        };

        const name = typeNames[type];
        return name ? (language === "zh" ? name.zh : name.en) : type;
      };

      if (recordTier === "silent") {
        // 第一层：静默自动记忆（执行类工作）
        responseText =
          language === "zh"
            ? `✅ 已自动记录此${getTypeName(finalType)}工作`
            : `✅ Auto-recorded this ${getTypeName(finalType)} work`;
      } else if (recordTier === "notify") {
        // 第二层：通知自动记忆（方案类工作）
        const shortId = contextId.slice(0, 8);
        responseText =
          language === "zh"
            ? `💡 此${getTypeName(
                finalType
              )}已自动记录 (ID: ${shortId}...)\n   如不需要: delete_context({context_id: "${contextId}"})`
            : `💡 This ${getTypeName(
                finalType
              )} has been auto-recorded (ID: ${shortId}...)\n   To remove: delete_context({context_id: "${contextId}"})`;
      }

      responseText += `\nContext ID: ${contextId}`;

      // 多文件信息
      if (isMultiFileContext && args.files_changed) {
        responseText += `\nMulti-file change: ${args.files_changed.length} files`;
        args.files_changed.forEach((file, idx) => {
          responseText += `\n  ${idx + 1}. ${file.file_path}`;
          if (file.change_type) responseText += ` (${file.change_type})`;
          if (file.diff_stats) {
            responseText += ` [+${file.diff_stats.additions}/-${file.diff_stats.deletions}]`;
          }
        });
        if (enhancedMetadata.diff_stats) {
          responseText += `\nTotal changes: +${enhancedMetadata.diff_stats.additions}/-${enhancedMetadata.diff_stats.deletions} (~${enhancedMetadata.diff_stats.changes} lines)`;
        }
      }

      // Session信息
      if (autoSessionMeta.auto_session) {
        responseText += `\nSession: ${
          autoSessionMeta.session_source === "existing_active"
            ? "Reused active session"
            : "Created new session"
        } (${sessionId})`;
      }

      // 路径检测信息（仅单文件场景）
      if (!isMultiFileContext && pathDetectionMeta.auto_detected) {
        responseText += `\nAuto-detected file: ${
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
          record_tier: recordTier,
          memory_source: memorySource,
          type: args.type,
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

  /**
   * Suggest context type based on work summary
   */
  private suggestContextType(summary: string): string {
    const lowerSummary = summary.toLowerCase();

    if (
      lowerSummary.includes("fix") ||
      lowerSummary.includes("bug") ||
      lowerSummary.includes("修复")
    ) {
      return "bug_fix";
    }

    if (
      lowerSummary.includes("feature") ||
      lowerSummary.includes("implement") ||
      lowerSummary.includes("add") ||
      lowerSummary.includes("功能") ||
      lowerSummary.includes("实现")
    ) {
      return "feature_add";
    }

    if (lowerSummary.includes("refactor") || lowerSummary.includes("重构")) {
      return "code_refactor";
    }

    if (lowerSummary.includes("test") || lowerSummary.includes("测试")) {
      return "test";
    }

    if (lowerSummary.includes("doc") || lowerSummary.includes("文档")) {
      return "documentation";
    }

    // Default to code_modify
    return "code_modify";
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

        // Get main active session (most recent)
        const mainActiveSession =
          activeSessions.length > 0
            ? activeSessions.sort(
                (a, b) =>
                  new Date(b.started_at).getTime() -
                  new Date(a.started_at).getTime()
              )[0]
            : null;

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
            main_active_session_id: mainActiveSession?.id,
          },
        };
      });

      // 格式化输出文本
      const outputLines = [`📚 Found ${projectsWithStats.length} projects:\n`];

      projectsWithStats.forEach((project, index) => {
        outputLines.push(`${index + 1}. **${project.name}**`);
        outputLines.push(`   - Path: \`${project.path}\``);
        outputLines.push(`   - Project ID: \`${project.id}\``);
        if (project.language)
          outputLines.push(`   - Language: ${project.language}`);
        if (project.framework)
          outputLines.push(`   - Framework: ${project.framework}`);

        if (includeStats && "stats" in project && project.stats) {
          outputLines.push(`   - 📊 Statistics:`);
          outputLines.push(`     - Contexts: ${project.stats.total_contexts}`);
          outputLines.push(
            `     - Sessions: ${project.stats.total_sessions} total (${project.stats.active_sessions} active)`
          );

          if (project.stats.main_active_session_id) {
            outputLines.push(
              `     - Active Session: \`${project.stats.main_active_session_id}\``
            );
          }

          outputLines.push(
            `     - Last Activity: ${new Date(
              project.stats.last_activity
            ).toLocaleString()}`
          );

          if (project.stats.total_contexts > 0) {
            outputLines.push(
              `   - 🗑️  To delete: \`delete_session({project_id: "${project.id}"})\``
            );
          }
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
        // MCP 2025-11-25: Structured Content for direct programmatic access
        structuredContent: {
          projects: projectsWithStats,
          total: projectsWithStats.length,
          include_stats: includeStats,
          limit: limit,
        },
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

  private async handleGetContext(args: {
    context_ids: string | string[];
    relation_type?: string;
  }) {
    try {
      // Normalize context_ids to array
      const ids = Array.isArray(args.context_ids)
        ? args.context_ids
        : [args.context_ids];

      // If relation_type is provided, find related contexts
      if (args.relation_type) {
        const allRelatedContexts = [];
        for (const id of ids) {
          const related = this.db.getRelatedContexts(
            id,
            args.relation_type as any
          );
          allRelatedContexts.push(...related);
        }

        return {
          content: [
            {
              type: "text",
              text: `Found ${allRelatedContexts.length} related contexts`,
            },
          ],
          isError: false,
          _meta: {
            context_ids: ids,
            relation_type: args.relation_type,
            related_contexts: allRelatedContexts,
          },
        };
      }

      // Otherwise, retrieve the contexts themselves
      const contexts = [];
      const notFound = [];

      for (const id of ids) {
        const context = this.db.getContextById(id);
        if (context) {
          // Get associated files
          const files = this.contextFileManager.getFilesByContext(id);
          contexts.push({
            ...context,
            files: files,
          });
        } else {
          notFound.push(id);
        }
      }

      let message = `Retrieved ${contexts.length} context(s)`;
      if (notFound.length > 0) {
        message += `. Not found: ${notFound.join(", ")}`;
      }

      return {
        content: [
          {
            type: "text",
            text: message,
          },
        ],
        // MCP 2025-11-25: Structured Content for direct programmatic access
        structuredContent: {
          contexts: contexts,
          requested_ids: ids,
          found_count: contexts.length,
          not_found: notFound,
        },
        isError: false,
        _meta: {
          requested_ids: ids,
          contexts: contexts,
          not_found: notFound,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to get context(s): ${
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
    limit?: number;
    project_path?: string;
    session_id?: string;
    file_path?: string;
    type?: string;
    similarity_threshold?: number;
    hybrid_weight?: number;
    use_cache?: boolean;
  }) {
    try {
      // 懒加载：检查是否需要更新质量分
      await this.checkAndUpdateQualityScoresInBackground();

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

      // 如果提供了 project_path，转换为 project_id
      let projectId: string | undefined;
      if (args.project_path) {
        const project = this.db.getProjectByPath(args.project_path);
        if (project) {
          projectId = project.id;
        }
      }

      // === AI Enhancement (v2.2.0): Enhance search query ===
      let enhancedQuery = args.query;
      let queryEnhancementMeta: any = {};
      try {
        const enhancement = this.queryEnhancer.enhance(args.query);

        if (enhancement.keywords.length > 0) {
          enhancedQuery = enhancement.enhanced;
          queryEnhancementMeta = {
            original_query: args.query,
            enhanced_query: enhancedQuery,
            added_keywords: enhancement.keywords,
            intent_type: enhancement.intent,
            confidence: enhancement.confidence,
          };
        }
      } catch (error) {
        console.error("[AI Enhancement] Query enhancement failed:", error);
      }

      // 获取用于搜索的contexts
      const allContexts = this.db.getContextsForVectorSearch(
        projectId,
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
        enhancedQuery,
        projectId,
        searchParams.limit
      );

      // 执行混合搜索
      let results = await this.vectorSearch.hybridSearch(
        enhancedQuery,
        keywordResults,
        allContexts,
        searchParams
      );

      // 类型过滤（如果指定）
      if (args.type) {
        results = results.filter((ctx) => ctx.type === args.type);
      }

      // === Task 5.1: Calculate metadata scores for each result ===
      const queryFiles = this.extractFilesFromQuery(args.query);
      const queryProject = args.project_path;

      const enhancedResults = results.map((result) => {
        try {
          // Parse metadata to extract files and tags
          let metadata: any = {};
          let files: string[] = [];
          let tags: string[] = [];

          try {
            metadata = result.metadata ? JSON.parse(result.metadata) : {};
          } catch (e) {
            // Ignore parse errors
          }

          // Extract files from file_path and files_changed
          if (result.file_path) {
            files.push(result.file_path);
          }
          if (metadata.files_changed) {
            const fileChanges = Array.isArray(metadata.files_changed)
              ? metadata.files_changed
              : [];
            files.push(
              ...fileChanges.map((fc: any) => fc.file_path).filter(Boolean)
            );
          }

          // Extract tags
          if (result.tags) {
            tags = result.tags
              .split(",")
              .map((t: string) => t.trim())
              .filter(Boolean);
          }

          // Calculate metadata score
          const metadataScore = this.calculateMetadataScore({
            query: args.query,
            context: {
              files: files.length > 0 ? files : undefined,
              project_path: metadata.project_path || args.project_path,
              tags: tags.length > 0 ? tags : undefined,
              created_at: result.created_at,
            },
            queryFiles: queryFiles.length > 0 ? queryFiles : undefined,
            queryProject,
          });

          // Combine vector score and metadata score
          const vectorScore = result.hybrid_score || result.similarity || 0;
          const finalScore = this.combineScores(
            vectorScore,
            metadataScore.total
          );

          return {
            ...result,
            metadata_score: metadataScore,
            final_score: finalScore,
            vector_score: vectorScore, // Preserve original for debugging
          };
        } catch (error) {
          console.warn(
            `[Metadata Score] Failed for context ${result.id}:`,
            error
          );
          // Return result with zero metadata score on error
          return {
            ...result,
            metadata_score: {
              fileMatch: 0,
              projectMatch: 0,
              tagMatch: 0,
              timeWeight: 0,
              total: 0,
            },
            final_score: result.hybrid_score || result.similarity || 0,
            vector_score: result.hybrid_score || result.similarity || 0,
          };
        }
      });

      // === Task 5.3: Re-sort by final score ===
      enhancedResults.sort((a, b) => b.final_score - a.final_score);

      // Apply limit after re-sorting
      const finalResults = enhancedResults.slice(0, args.limit || 10);

      // 记录搜索命中，更新质量评分
      finalResults.forEach((context) => {
        this.db.recordContextSearch(context.id);
      });

      // 格式化显示结果（包含智能记忆元数据和混合评分）
      const formattedResults = finalResults.map((ctx) => {
        // 解析智能记忆元数据
        let autoMemoryMeta: any = null;
        try {
          const metadata = ctx.metadata ? JSON.parse(ctx.metadata) : {};
          if (metadata.auto_memory_metadata) {
            autoMemoryMeta = metadata.auto_memory_metadata;
          }
        } catch (error) {
          // 忽略解析错误
        }

        return {
          id: ctx.id,
          type: ctx.type,
          content_preview:
            ctx.content.substring(0, 200) +
            (ctx.content.length > 200 ? "..." : ""),
          full_content: ctx.content, // Include full content for AI to read
          tags: ctx.tags
            ? ctx.tags.split(",").filter((t: string) => t.trim())
            : [],
          quality_score: ctx.quality_score,
          created_at: ctx.created_at,
          file_path: ctx.file_path,
          similarity: ctx.similarity,
          hybrid_score: ctx.hybrid_score,
          // === Task 5.2: Include metadata and final scores ===
          metadata_score: ctx.metadata_score,
          final_score: ctx.final_score,
          vector_score: ctx.vector_score,
          // 智能记忆元数据（如果存在）
          auto_memory: autoMemoryMeta
            ? {
                source: autoMemoryMeta.source,
                process_type: autoMemoryMeta.process_type?.type,
                process_confidence: autoMemoryMeta.process_type?.confidence,
                value_score: autoMemoryMeta.value_score?.total_score,
                decision: autoMemoryMeta.trigger_decision?.action,
              }
            : undefined,
        };
      });

      return {
        content: [
          {
            type: "text",
            text:
              `Found ${formattedResults.length} semantically relevant contexts for query: "${args.query}"\n\n` +
              formattedResults
                .map((ctx, i) => {
                  let result =
                    `${i + 1}. **ID**: ${ctx.id}\n` +
                    `   **Type**: ${ctx.type}\n` +
                    `   **Content**: ${ctx.full_content}\n` +
                    `   **Tags**: ${ctx.tags.join(", ") || "None"}\n` +
                    `   **Quality**: ${
                      ctx.quality_score?.toFixed(2) || "N/A"
                    }\n` +
                    `   **Vector Score**: ${
                      ctx.vector_score?.toFixed(3) || "N/A"
                    }\n` +
                    `   **Final Score**: ${
                      ctx.final_score?.toFixed(3) || "N/A"
                    }\n`;

                  // 添加元数据评分详情
                  if (ctx.metadata_score) {
                    result += `   **Metadata Score**: ${ctx.metadata_score.total.toFixed(
                      1
                    )}/20 (File: ${ctx.metadata_score.fileMatch}, Project: ${
                      ctx.metadata_score.projectMatch
                    }, Tag: ${
                      ctx.metadata_score.tagMatch
                    }, Time: ${ctx.metadata_score.timeWeight.toFixed(1)})\n`;
                  }

                  // 添加智能记忆信息（如果存在）
                  if (ctx.auto_memory) {
                    result += `   **Memory Source**: ${ctx.auto_memory.source}\n`;
                    if (ctx.auto_memory.process_type) {
                      result += `   **Process Type**: ${ctx.auto_memory.process_type} (${ctx.auto_memory.process_confidence}%)\n`;
                    }
                    if (ctx.auto_memory.value_score !== undefined) {
                      result += `   **Value Score**: ${ctx.auto_memory.value_score}/100\n`;
                    }
                  }

                  result +=
                    `   **Created**: ${ctx.created_at}\n` +
                    `   **File**: ${ctx.file_path || "N/A"}\n`;

                  return result;
                })
                .join("\n"),
          },
        ],
        // MCP 2025-11-25: Structured Content for direct programmatic access
        structuredContent: {
          query: args.query,
          enhanced_query: enhancedQuery,
          results: formattedResults,
          total_results: formattedResults.length,
          total_searched: allContexts.length,
          search_params: searchParams,
          query_enhancement: queryEnhancementMeta,
        },
        isError: false,
        _meta: {
          query: args.query,
          enhanced_query: enhancedQuery,
          total_contexts_searched: allContexts.length,
          results_count: formattedResults.length,
          results: formattedResults,
          search_params: searchParams,
          query_enhancement: queryEnhancementMeta,
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

    // 找到第一个有效目录就初始化（不要求有标识文件）
    for (const dir of potentialDirs) {
      if (existsSync(dir)) {
        // ✅ v2.1.2: 任何存在的目录都视为潜在项目
        // 这允许空目录、纯文档项目、新项目等场景
        await this.setupProjectMonitoring(dir);
        return; // 初始化第一个有效目录就停止
      }
    }

    // 如果连有效目录都找不到，静默返回
  }

  /**
   * @deprecated v2.1.2: 不再使用严格的项目检测
   * 任何存在的目录都可以成为项目（开箱即用理念）
   *
   * 保留此方法仅为向后兼容，但不在自动监控流程中使用
   */
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

  /**
   * 向用户发送自动记录提示（仅首次或重要文件时）
   */
  private async notifyUserContextRecorded(
    filePath: string,
    action: string
  ): Promise<void> {
    try {
      // 记录文件路径，避免重复提示
      const key = `${action}:${filePath}`;
      const now = Date.now();

      // 如果最近5分钟内已经提示过相同文件，则跳过
      if (this.lastNotifiedFiles.has(key)) {
        const lastTime = this.lastNotifiedFiles.get(key)!;
        if (now - lastTime < 5 * 60 * 1000) {
          // 5分钟
          return;
        }
      }

      this.lastNotifiedFiles.set(key, now);

      // 清理超过1小时的记录
      if (this.lastNotifiedFiles.size > 100) {
        for (const [k, v] of this.lastNotifiedFiles.entries()) {
          if (now - v > 60 * 60 * 1000) {
            // 1小时
            this.lastNotifiedFiles.delete(k);
          }
        }
      }

      const actionText = action === "add" ? "创建" : "修改";
      const fileName = filePath.split("/").pop() || filePath;

      console.error(
        `[DevMind] 📝 已自动记录开发上下文

📂 文件: ${fileName}
🔄 操作: ${actionText}
💡 使用 'list_contexts' 查看所有记录
        `
      );
    } catch (error) {
      // 静默失败，不影响记录流程
    }
  }

  /**
   * 向用户发送记忆系统启动提示
   */
  private async notifyUserMemoryStarted(
    projectPath: string,
    sessionId: string
  ): Promise<void> {
    try {
      // 获取项目信息和已记录的上下文数量
      const project = this.db.getProjectByPath(projectPath);
      if (project) {
        const contexts = this.db.getContextsByProject(project.id);
        const contextCount = contexts.length;

        // 通过MCP协议发送启动提示（使用工具响应机制）
        console.error(
          `[DevMind] 🚀 智能记忆系统已启动！

📂 项目: ${project.name}
🔍 监控范围: 代码文件 (.js, .ts, .py, .go, .rs, .java)
📝 已记录上下文: ${contextCount} 条
💡 使用说明:
   - 修改文件时会自动记录开发上下文
   - 使用 'list_contexts' 工具查看所有记录
   - 使用 'semantic_search' 工具搜索记忆内容
   - 使用 'export_memory_graph' 工具查看知识图谱

🛡️ 隐私保护: 所有数据本地存储在SQLite中
          `
        );
      }
    } catch (error) {
      // 静默失败，不影响MCP服务器启动
      console.error("[DevMind] Failed to send startup notification:", error);
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

      // 🚀 添加用户友好的启动提示（MCP协议响应）
      await this.notifyUserMemoryStarted(projectPath, sessionId);

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
      // 路径验证 - 防止路径穿越攻击
      const normalizedProjectPath = normalizeProjectPath(projectPath);
      const normalizedFilePath = normalizeProjectPath(filePath);

      // 检查文件路径是否在项目目录内
      const fullPath = join(normalizedProjectPath, normalizedFilePath);
      const resolvedFullPath = resolve(fullPath);
      const resolvedProjectPath = resolve(normalizedProjectPath);

      if (!resolvedFullPath.startsWith(resolvedProjectPath)) {
        console.error(`[DevMind] 路径穿越攻击检测: ${filePath}`);
        return; // 拒绝访问项目目录外的文件
      }

      if (!existsSync(resolvedFullPath)) {
        return; // 文件不存在，跳过
      }

      const fileContent = readFileSync(resolvedFullPath, "utf8");

      // ✅ 智能过滤检查
      if (!this.autoRecordFilter.shouldRecord(filePath, fileContent)) {
        return; // 未通过智能过滤，跳过记录
      }

      // === Add to pending memory tracker (v2.2.6) ===
      const changeType = action === "add" ? "add" : "modify";
      this.pendingMemoryTracker.addPending(filePath, changeType, sessionId);

      // ✅ 添加自动记录提示 - 仅在首次记录时提示用户
      await this.notifyUserContextRecorded(filePath, action);

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
    project_path?: string;
    limit?: number;
    since?: string;
    type?: string;
  }) {
    try {
      let contexts: any[] = [];
      const limit = args.limit || 20;

      if (args.session_id) {
        // List by session ID
        contexts = this.db.getContextsBySession(args.session_id, limit);
      } else if (args.project_path) {
        // List by project path - find project root first (v2.1.14 fix)
        const projectRoot = await findProjectRoot(args.project_path);
        const project = this.db.getProjectByPath(projectRoot);
        if (!project) {
          return {
            content: [
              {
                type: "text",
                text: `No project found for path: ${args.project_path} (resolved to: ${projectRoot}). The project may not have been initialized yet.`,
              },
            ],
            isError: false,
            _meta: {
              total_contexts: 0,
              contexts: [],
              resolved_root: projectRoot,
            },
          };
        }

        // Get all contexts from all sessions of the project
        const sessions = this.db.getActiveSessions(project.id);
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
        // No filter - list all contexts (limited)
        contexts = this.db.getAllContexts(limit);
      }

      // 时间过滤（如果指定）
      if (args.since) {
        const now = Date.now();
        let cutoffTime: number;

        if (args.since === "24h") {
          cutoffTime = now - 24 * 60 * 60 * 1000;
        } else if (args.since === "7d") {
          cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        } else if (args.since === "30d") {
          cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        } else if (args.since === "90d") {
          cutoffTime = now - 90 * 24 * 60 * 60 * 1000;
        } else {
          cutoffTime = 0; // 无效值，不过滤
        }

        if (cutoffTime > 0) {
          contexts = contexts.filter((ctx) => {
            const createdTime = new Date(ctx.created_at).getTime();
            return createdTime >= cutoffTime;
          });
        }
      }

      // 类型过滤（如果指定）
      if (args.type) {
        contexts = contexts.filter((ctx) => ctx.type === args.type);
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
        // MCP 2025-11-25: Structured Content for direct programmatic access
        structuredContent: {
          contexts: formattedContexts,
          total: formattedContexts.length,
          filters: {
            session_id: args.session_id,
            project_path: args.project_path,
            since: args.since,
            type: args.type,
            limit: limit,
          },
        },
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
    // 用户反馈参数（New in v2.0.0）
    user_feedback?: "useful" | "not_useful" | "needs_improvement";
    feedback_comment?: string;
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

      // 处理用户反馈（如果提供）
      let feedbackResult: any = null;
      if (args.user_feedback) {
        try {
          // 获取上下文的智能记忆元数据
          const contextMeta = context.metadata
            ? JSON.parse(context.metadata)
            : {};
          const autoMemoryMeta = contextMeta.auto_memory_metadata;

          // 构建用户反馈对象
          const userFeedback = {
            memory_id: args.context_id,
            action:
              args.user_feedback === "useful"
                ? ("accepted" as const)
                : args.user_feedback === "not_useful"
                ? ("rejected" as const)
                : ("modified" as const),
            process_type: autoMemoryMeta?.process_type?.type,
            value_score: autoMemoryMeta?.value_score?.total_score,
            user_comment: args.feedback_comment,
            timestamp: new Date(),
          };

          // 构建记忆结果对象
          const memoryOutcome = {
            was_useful: args.user_feedback === "useful",
            access_count: 1, // 可以从 metadata 中获取实际访问次数
            last_accessed: new Date(),
          };

          // Feedback learning system removed in v2.1.0 - will be reimplemented later
          feedbackResult = {
            feedback_recorded: true,
            feedback_action: userFeedback.action,
            learning_applied: false,
            note: "Feedback learning system pending reimplementation in v2.2.0",
          };

          updatedFields.push("user_feedback");
        } catch (error) {
          console.error("[UserFeedback] Failed to process feedback:", error);
          feedbackResult = {
            feedback_recorded: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }

      if (updated || args.file_path || args.files_changed || feedbackResult) {
        const updatedContext = this.db.getContextById(args.context_id);
        const files = this.contextFileManager.getFilesByContext(
          args.context_id
        );

        let responseText =
          `Successfully updated context: ${args.context_id}\n` +
          `Type: ${updatedContext?.type}\n` +
          `Updated fields: ${updatedFields.join(", ")}\n`;

        if (feedbackResult) {
          responseText += `\nUser Feedback:\n`;
          responseText += `  Recorded: ${
            feedbackResult.feedback_recorded ? "Yes" : "No"
          }\n`;
          if (feedbackResult.feedback_recorded) {
            responseText += `  Action: ${feedbackResult.feedback_action}\n`;
            responseText += `  Learning Applied: ${
              feedbackResult.learning_applied ? "Yes" : "No"
            }\n`;
          } else if (feedbackResult.error) {
            responseText += `  Error: ${feedbackResult.error}\n`;
          }
        }

        responseText +=
          `Files: ${
            files.length > 0 ? files.map((f) => f.file_path).join(", ") : "None"
          }\n` + `Content: ${updatedContext?.content.substring(0, 100)}...`;

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
          _meta: {
            updated_context_id: args.context_id,
            updated_fields: updatedFields,
            file_count: files.length,
            feedback_result: feedbackResult,
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

  private async handleDeleteSession(args: {
    session_id?: string;
    project_id?: string;
  }) {
    try {
      // Parameter validation
      if (!args.session_id && !args.project_id) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Provide either session_id or project_id",
            },
          ],
          isError: true,
        };
      }

      if (args.session_id && args.project_id) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Cannot provide both session_id and project_id",
            },
          ],
          isError: true,
        };
      }

      // New: Delete all sessions by project_id
      if (args.project_id) {
        const sessions = this.db.getSessionsByProject(args.project_id);

        if (sessions.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No sessions found for project ${args.project_id}`,
              },
            ],
            isError: false,
          };
        }

        let totalContexts = 0;
        for (const session of sessions) {
          const contexts = this.db.getContextsBySession(session.id);
          totalContexts += contexts.length;
          this.db.deleteSession(session.id);
        }

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Deleted project: ${args.project_id}\n` +
                `Sessions: ${sessions.length}\n` +
                `Contexts: ${totalContexts}\n` +
                `⚠️  Cannot be undone!`,
            },
          ],
          isError: false,
          _meta: {
            deleted_project_id: args.project_id,
            deleted_sessions_count: sessions.length,
            deleted_contexts_count: totalContexts,
            success: true,
          },
        };
      }

      // Original: Delete by session_id
      const session = this.db.getSession(args.session_id!);
      if (!session) {
        return {
          content: [
            {
              type: "text",
              text: `Session not found: ${args.session_id}`,
            },
          ],
          isError: false,
        };
      }

      const contexts = this.db.getContextsBySession(args.session_id!);
      this.db.deleteSession(args.session_id!);

      return {
        content: [
          {
            type: "text",
            text:
              `✅ Deleted session: ${args.session_id}\n` +
              `Name: ${session.name}\n` +
              `Contexts: ${contexts.length}\n` +
              `⚠️  Cannot be undone!`,
          },
        ],
        isError: false,
        _meta: {
          deleted_session_id: args.session_id,
          deleted_contexts_count: contexts.length,
          success: true,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to delete: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
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
   * 📊 获取记忆系统状态信息
   */
  private async handleGetMemoryStatus(args: { project_path?: string }) {
    try {
      const projectPath = args.project_path || process.cwd();

      // 获取或创建项目
      const project = this.db.getProjectByPath(projectPath);
      if (!project) {
        return {
          content: [
            {
              type: "text",
              text: `Project not found at path: ${projectPath}`,
            },
          ],
          isError: true,
        };
      }

      // 获取项目统计信息
      const contexts = this.db.getContextsByProject(project.id);
      const sessions = this.db.getSessionsByProject(project.id);
      const activeSession = sessions.find((s) => s.status === "active");

      // 统计上下文类型分布
      const typeStats = contexts.reduce((acc, ctx) => {
        acc[ctx.type] = (acc[ctx.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // 计算平均质量分数
      const avgQuality =
        contexts.length > 0
          ? contexts.reduce((sum, ctx) => sum + ctx.quality_score, 0) /
            contexts.length
          : 0;

      // 文件监控状态
      const fileMonitoringStatus = this.fileWatcher ? "Active" : "Inactive";

      // 获取缓存统计（如果有向量搜索引擎）
      let cacheStats = null;
      if (this.vectorSearch) {
        cacheStats = this.vectorSearch.getCacheStats();
      }

      // 格式化状态信息
      const statusText = `# 📊 DevMind Memory System Status

## 📂 Project Information
- **Name**: ${project.name}
- **Path**: ${projectPath}
- **Language**: ${project.language}
- **Framework**: ${project.framework || "N/A"}
- **Created**: ${this.formatDateForUser(new Date(project.created_at))}

## 📝 Memory Statistics
- **Total Contexts**: ${contexts.length}
- **Average Quality**: ${(avgQuality * 100).toFixed(1)}%
- **Active Session**: ${activeSession ? "Yes" : "No"}

### 📈 Context Types Distribution
${Object.entries(typeStats)
  .map(([type, count]) => `- **${type}**: ${count}`)
  .join("\n")}

## 🔍 Monitoring Status
- **File Monitoring**: ${fileMonitoringStatus}
- **Monitored Patterns**:
  - Code files: .js, .ts, .jsx, .tsx, .py, .go, .rs, .java, .kt
  - Config files: package.json
  - Documentation: .md files
- **Ignored Directories**: node_modules, dist, build, .git, *.log

## 💾 Storage Information
${
  cacheStats
    ? `
### 🔧 Cache Statistics
- **Cache Size**: ${cacheStats.size} embeddings
- **Model**: ${cacheStats.model}
- **Dimensions**: ${cacheStats.dimensions}
- **Memory Usage**: ~${(cacheStats.size * 1.5).toFixed(1)}KB
`
    : "- **Cache**: Not initialized"
}

### 💿 Database
- **Storage**: SQLite (local file)
- **Privacy**: 100% local, no cloud sync

## 🚀 Quick Actions
- Use \`list_contexts\` to view all recorded contexts
- Use \`semantic_search\` to search your memory
- Use \`export_memory_graph\` to visualize memory relationships
- Use \`record_context\` to manually add important context

---
💡 **Tip**: DevMind automatically monitors your file changes and records development contexts. Check your IDE console for automatic recording notifications!`;

      return {
        content: [
          {
            type: "text",
            text: statusText,
          },
        ],
        isError: false,
        _meta: {
          project_id: project.id,
          context_count: contexts.length,
          session_count: sessions.length,
          active_session: !!activeSession,
          file_monitoring: fileMonitoringStatus,
          avg_quality: avgQuality,
          type_distribution: typeStats,
          cache_stats: cacheStats,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to get memory status: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * 🧹 Clean up empty projects (projects with no contexts)
   */
  private async handleCleanupEmptyProjects(args: {
    dry_run?: boolean;
    project_ids?: string[];
  }) {
    try {
      const dryRun = args.dry_run !== false; // Default to true
      const emptyProjects = this.db.getEmptyProjects();

      if (emptyProjects.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "✅ No empty projects found. All projects have memory contexts.",
            },
          ],
          isError: false,
        };
      }

      // Filter by specific project IDs if provided
      const projectsToProcess = args.project_ids
        ? emptyProjects.filter((p) => args.project_ids!.includes(p.id))
        : emptyProjects;

      if (projectsToProcess.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No matching empty projects found for the specified IDs.",
            },
          ],
          isError: false,
        };
      }

      // Dry run: just list empty projects
      if (dryRun) {
        const projectList = projectsToProcess
          .map(
            (p, i) =>
              `${i + 1}. **${p.name}**\n` +
              `   - ID: \`${p.id}\`\n` +
              `   - Path: ${p.path}\n` +
              `   - Sessions: ${p.session_count}\n` +
              `   - Last accessed: ${this.formatDateForUser(
                new Date(p.last_accessed)
              )}`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text:
                `# 🧹 Empty Projects Found\n\n` +
                `Found **${projectsToProcess.length}** empty project(s) with no memory contexts:\n\n` +
                `${projectList}\n\n` +
                `---\n\n` +
                `💡 **To delete these projects**, call:\n` +
                `\`\`\`\n` +
                `cleanup_empty_projects({ dry_run: false })\n` +
                `\`\`\`\n\n` +
                `Or delete specific projects:\n` +
                `\`\`\`\n` +
                `cleanup_empty_projects({ \n` +
                `  dry_run: false,\n` +
                `  project_ids: ["${projectsToProcess[0].id}"]\n` +
                `})\n` +
                `\`\`\``,
            },
          ],
          isError: false,
          _meta: {
            empty_projects_count: projectsToProcess.length,
            projects: projectsToProcess.map((p) => ({
              id: p.id,
              name: p.name,
              path: p.path,
              session_count: p.session_count,
            })),
          },
        };
      }

      // Actually delete projects
      const projectIds = projectsToProcess.map((p) => p.id);
      const result = this.db.deleteProjects(projectIds);

      const deletedList = projectsToProcess
        .map((p, i) => `${i + 1}. ${p.name} (${p.path})`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text:
              `# ✅ Empty Projects Cleaned Up\n\n` +
              `Successfully deleted **${result.deleted_projects}** empty project(s):\n\n` +
              `${deletedList}\n\n` +
              `---\n\n` +
              `📊 **Statistics:**\n` +
              `- Projects deleted: ${result.deleted_projects}\n` +
              `- Sessions deleted: ${result.deleted_sessions}\n` +
              `- Contexts deleted: ${result.deleted_contexts}\n\n` +
              `⚠️  **This action cannot be undone!**`,
          },
        ],
        isError: false,
        _meta: {
          deleted_projects: result.deleted_projects,
          deleted_sessions: result.deleted_sessions,
          deleted_contexts: result.deleted_contexts,
          project_ids: projectIds,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to cleanup empty projects: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * 🔄 懒加载检查：在后台触发质量分更新
   */
  private async checkAndUpdateQualityScoresInBackground(): Promise<void> {
    try {
      // 检查上次更新时间
      const lastUpdateKey = "last_quality_update";
      const lastUpdate = this.qualityUpdateTimestamp || 0;
      const now = Date.now();
      const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

      // 如果距离上次更新超过24小时，触发后台更新
      if (hoursSinceUpdate >= 24) {
        console.error(
          "[DevMind] Quality scores outdated, triggering background update..."
        );
        this.qualityUpdateTimestamp = now; // 立即更新时间戳，避免重复触发

        // 异步执行，不阻塞搜索
        this.handleUpdateQualityScores({
          limit: 200, // 每次更新最多200条
          force_all: false,
        }).catch((error) => {
          console.error("[DevMind] Background quality update failed:", error);
        });
      }
    } catch (error) {
      // 静默失败，不影响搜索
      console.error("[DevMind] Quality check failed:", error);
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
    // Debug logging to help diagnose parameter issues
    console.log("[DEBUG] project_analysis_engineer Tool called");
    console.log("[DEBUG] Raw args type:", typeof args);
    console.log("[DEBUG] Raw args value:", JSON.stringify(args));

    try {
      // Handle case where args might be undefined or empty
      if (!args || typeof args !== "object") {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Arguments object is required. Please provide project_path parameter. Example: {"project_path": "/path/to/project"}'
        );
      }

      const {
        project_path,
        analysis_focus = "architecture,entities,apis,business_logic",
        doc_style = "devmind",
        auto_save = true,
        language,
      } = args;

      if (
        !project_path ||
        typeof project_path !== "string" ||
        project_path.trim() === ""
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `project_path is required and must be a non-empty string. Received: ${JSON.stringify(
            args
          )}`
        );
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
   * 处理记忆记录指导Prompt（双语支持）
   */
  private handleMemoryRecordingGuidance() {
    const guidanceText = `# DevMind Memory Recording Core Guidance | DevMind 记忆记录核心指导

## Core Responsibility | 核心职责

As a development assistant, your primary responsibility is to ensure every code edit is properly recorded.
作为开发助手，你的首要职责是确保每次代码编辑都被正确记录。

**Mandatory Rules | 强制规则：**
- MUST call \`record_context\` tool IMMEDIATELY after any code modification
  完成任何代码修改后，必须立即调用 \`record_context\` 工具
- This is NOT optional - it's a required part of the workflow
  这不是可选项，而是工作流程的必要组成部分
- MUST call when user says "remember/save/记住/保存"
  用户说"记住"、"保存"、"remember"、"save"时，必须调用此工具
- Skipping this means work is INCOMPLETE - all changes will be lost in future conversations
  不调用此工具意味着工作未完成，所有变更将在未来对话中丢失

## Self-Check List | 自检清单

Before completing any task, ask yourself | 完成任务前，问自己：
- [ ] Did I edit files? → Call \`record_context\` NOW
      我是否编辑了文件？ → 立即调用 \`record_context\`
- [ ] Did I fix a bug? → Use \`type: "bug_fix"\`
      我是否修复了bug？ → 使用 \`type: "bug_fix"\`
- [ ] Did I add a feature? → Use \`type: "feature_add"\`
      我是否添加了新功能？ → 使用 \`type: "feature_add"\`
- [ ] Did I refactor code? → Use \`type: "code_refactor"\`
      我是否重构了代码？ → 使用 \`type: "code_refactor"\`
- [ ] Did user say "remember" or "save"? → MUST call the tool
      用户是否说了"记住"或"保存"？ → 必须调用工具

## Quick Reference | 快速参考

**Common Types | 常用类型：**
- \`code_create\` - Create new files/modules | 创建新文件/模块
- \`code_modify\` - Modify existing code | 修改现有代码
- \`bug_fix\` - Fix bugs | 修复bug
- \`feature_add\` - Add new features | 添加新功能
- \`code_refactor\` - Refactor code | 重构代码
- \`solution\` - Solution records | 解决方案记录

**Minimal Example | 最小调用示例：**
\`\`\`javascript
record_context({
  content: "Fixed null pointer exception in user login validation",
  type: "bug_fix",
  project_path: "/path/to/project"
})
\`\`\`

## Important Reminders | 重要提醒

- Recording is MANDATORY, not optional | 记录是强制性的，不是可选的
- Skipping causes memory loss | 跳过记录会导致记忆丢失
- Brief description is better than no record | 简短的描述胜过没有记录
- When unsure, use \`code_modify\` or \`solution\` | 不确定类型时，使用 \`code_modify\` 或 \`solution\``;

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: guidanceText,
          },
        },
      ],
    };
  }

  /**
   * 处理项目分析工程师Prompt
   */
  private async handleProjectAnalysisEngineer(args: any) {
    // Debug logging to help diagnose parameter issues
    console.log("[DEBUG] project_analysis_engineer Prompt called");
    console.log("[DEBUG] Raw args type:", typeof args);
    console.log("[DEBUG] Raw args value:", JSON.stringify(args));

    try {
      // Handle case where args might be undefined or empty
      if (!args || typeof args !== "object") {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Arguments object is required for Prompt. Please provide project_path parameter. Example: {"project_path": "/path/to/project"}'
        );
      }

      const {
        project_path,
        analysis_focus = "architecture,entities,apis,business_logic",
        doc_style = "devmind",
        auto_save = true,
        language, // 新增语言参数
      } = args;

      if (
        !project_path ||
        typeof project_path !== "string" ||
        project_path.trim() === ""
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `project_path is required and must be a non-empty string for Prompt. Received: ${JSON.stringify(
            args
          )}`
        );
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
          "生成或更新项目根目录的 **DEVMIND.md** 文件，包含以下内容："
        );
        prompt.push("");
        prompt.push("**重要说明**：");
        prompt.push(
          "- 文件名必须是 `DEVMIND.md`（固定名称，不要添加版本号或其他后缀）"
        );
        prompt.push(
          "- 如果文件已存在，请在现有内容基础上进行增量更新，而不是完全重写"
        );
        prompt.push("- 保留有价值的现有内容，只更新过时或需要补充的部分");
        prompt.push("");
        prompt.push("**文档结构**：");
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
          "Generate or update the **DEVMIND.md** file in the project root with the following content:"
        );
        prompt.push("");
        prompt.push("**Important Instructions**:");
        prompt.push(
          "- File name MUST be `DEVMIND.md` (fixed name, do not add version numbers or suffixes)"
        );
        prompt.push(
          "- If the file already exists, perform incremental updates based on existing content instead of complete rewrite"
        );
        prompt.push(
          "- Preserve valuable existing content, only update outdated or missing sections"
        );
        prompt.push("");
        prompt.push("**Document Structure**:");
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
          "生成或更新项目根目录的 **CLAUDE.md** 文件，包含以下内容："
        );
        prompt.push("");
        prompt.push("**重要说明**：");
        prompt.push(
          "- 文件名必须是 `CLAUDE.md`（固定名称，不要添加版本号或其他后缀）"
        );
        prompt.push(
          "- 如果文件已存在，请在现有内容基础上进行增量更新，而不是完全重写"
        );
        prompt.push("- 保留有价值的现有内容，只更新过时或需要补充的部分");
        prompt.push("");
        prompt.push("**文档结构**：");
      } else {
        prompt.push(
          "Generate or update the **CLAUDE.md** file in the project root with the following content:"
        );
        prompt.push("");
        prompt.push("**Important Instructions**:");
        prompt.push(
          "- File name MUST be `CLAUDE.md` (fixed name, do not add version numbers or suffixes)"
        );
        prompt.push(
          "- If the file already exists, perform incremental updates based on existing content instead of complete rewrite"
        );
        prompt.push(
          "- Preserve valuable existing content, only update outdated or missing sections"
        );
        prompt.push("");
        prompt.push("**Document Structure**:");
      }
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

  // === Git Detection Methods (v2.3.0) ===

  /**
   * Check if a directory is a Git repository
   */
  private async isGitRepository(projectPath: string): Promise<boolean> {
    try {
      execSync("git rev-parse --git-dir", {
        cwd: projectPath,
        stdio: "pipe",
        encoding: "utf-8",
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of changed files in Git repository
   */
  private async getGitChangedFiles(projectPath: string): Promise<string[]> {
    try {
      // Get unstaged changes
      const unstagedOutput = execSync("git diff --name-only HEAD", {
        cwd: projectPath,
        stdio: "pipe",
        encoding: "utf-8",
      }).trim();

      // Get staged changes
      const stagedOutput = execSync("git diff --cached --name-only", {
        cwd: projectPath,
        stdio: "pipe",
        encoding: "utf-8",
      }).trim();

      // Combine and deduplicate
      const unstagedFiles = unstagedOutput ? unstagedOutput.split("\n") : [];
      const stagedFiles = stagedOutput ? stagedOutput.split("\n") : [];
      const allFiles = [...new Set([...unstagedFiles, ...stagedFiles])];

      return allFiles.filter((f) => f.length > 0);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get current Git branch name
   */
  private async getGitBranch(projectPath: string): Promise<string> {
    try {
      const branch = execSync("git branch --show-current", {
        cwd: projectPath,
        stdio: "pipe",
        encoding: "utf-8",
      }).trim();

      // Handle detached HEAD state
      if (!branch) {
        const commitHash = execSync("git rev-parse --short HEAD", {
          cwd: projectPath,
          stdio: "pipe",
          encoding: "utf-8",
        }).trim();
        return `detached@${commitHash}`;
      }

      return branch;
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Get Git author name
   */
  private async getGitAuthor(projectPath: string): Promise<string> {
    try {
      const author = execSync("git config user.name", {
        cwd: projectPath,
        stdio: "pipe",
        encoding: "utf-8",
      }).trim();

      return author || "unknown";
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Detect Git information with caching (30s TTL)
   */
  private async detectGitInfo(projectPath: string): Promise<GitInfo | null> {
    try {
      // Check cache (30s TTL)
      const cacheKey = `${projectPath}:${Math.floor(Date.now() / 30000)}`;
      const cached = this.gitInfoCache.get(cacheKey);
      if (cached) {
        return cached.data;
      }

      // Check if it's a Git repository
      const isGitRepo = await this.isGitRepository(projectPath);
      if (!isGitRepo) {
        this.gitInfoCache.set(cacheKey, { data: null, timestamp: Date.now() });
        return null;
      }

      // Get Git information in parallel
      const [changedFiles, branch, author] = await Promise.all([
        this.getGitChangedFiles(projectPath),
        this.getGitBranch(projectPath),
        this.getGitAuthor(projectPath),
      ]);

      const gitInfo: GitInfo = {
        changedFiles,
        branch,
        author,
        hasUncommitted: changedFiles.length > 0,
      };

      // Cache the result
      this.gitInfoCache.set(cacheKey, { data: gitInfo, timestamp: Date.now() });

      return gitInfo;
    } catch (error) {
      // Silent failure - log warning but don't throw
      console.warn("[Git Detection] Failed:", error);
      return null;
    }
  }

  // === Project Info Detection Methods (v2.3.0) ===

  /**
   * Try to read and parse package.json
   */
  private async tryReadPackageJson(
    projectPath: string
  ): Promise<ProjectInfo | null> {
    try {
      const packagePath = join(projectPath, "package.json");
      if (!existsSync(packagePath)) {
        return null;
      }

      const content = readFileSync(packagePath, "utf-8");
      const packageJson = JSON.parse(content);

      return {
        name: packageJson.name || basename(projectPath),
        version: packageJson.version,
        type: "node",
        description: packageJson.description,
      };
    } catch (error) {
      // Silent failure - file doesn't exist or parse error
      return null;
    }
  }

  /**
   * Try to read and parse pyproject.toml
   */
  private async tryReadPyproject(
    projectPath: string
  ): Promise<ProjectInfo | null> {
    try {
      const pyprojectPath = join(projectPath, "pyproject.toml");
      if (!existsSync(pyprojectPath)) {
        return null;
      }

      const content = readFileSync(pyprojectPath, "utf-8");

      // Simple TOML parsing for project.name and project.version
      // This is a basic implementation - for production, consider using a TOML library
      const nameMatch = content.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
      const versionMatch = content.match(/^\s*version\s*=\s*["']([^"']+)["']/m);

      if (nameMatch) {
        return {
          name: nameMatch[1],
          version: versionMatch ? versionMatch[1] : undefined,
          type: "python",
        };
      }

      return null;
    } catch (error) {
      // Silent failure
      return null;
    }
  }

  /**
   * Detect project information with permanent caching
   */
  private async detectProjectInfo(projectPath: string): Promise<ProjectInfo> {
    // Check cache first (permanent cache)
    const cached = this.projectInfoCache.get(projectPath);
    if (cached) {
      return cached;
    }

    // Try to read package.json (Node.js)
    const packageInfo = await this.tryReadPackageJson(projectPath);
    if (packageInfo) {
      this.projectInfoCache.set(projectPath, packageInfo);
      return packageInfo;
    }

    // Try to read pyproject.toml (Python)
    const pyprojectInfo = await this.tryReadPyproject(projectPath);
    if (pyprojectInfo) {
      this.projectInfoCache.set(projectPath, pyprojectInfo);
      return pyprojectInfo;
    }

    // Fallback: use directory name
    const fallbackInfo: ProjectInfo = {
      name: basename(projectPath),
      type: "unknown",
    };

    this.projectInfoCache.set(projectPath, fallbackInfo);
    return fallbackInfo;
  }

  // === Hybrid Relevance Scoring Module (v2.3.0) ===

  /**
   * Check if two file paths match
   * Supports: exact match, filename match (ignoring path), partial path match
   */
  private filesMatch(file1: string, file2: string): boolean {
    if (!file1 || !file2) {
      return false;
    }

    // 1. Exact match
    if (file1 === file2) {
      return true;
    }

    // 2. Filename match (ignoring path)
    const name1 = file1.split(/[/\\]/).pop() || "";
    const name2 = file2.split(/[/\\]/).pop() || "";
    if (name1 && name2 && name1 === name2) {
      return true;
    }

    // 3. Partial path match
    if (file1.includes(file2) || file2.includes(file1)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate days since creation
   * Handles date parsing errors gracefully
   */
  private getDaysSinceCreation(createdAt: string): number {
    try {
      const created = new Date(createdAt);
      // Check if date is valid
      if (isNaN(created.getTime())) {
        return 365;
      }
      const now = new Date();
      const diffMs = now.getTime() - created.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch (error) {
      // If date parsing fails, return a large number (old)
      return 365;
    }
  }

  /**
   * Extract file paths from query string
   * Supports common file path patterns
   */
  private extractFilesFromQuery(query: string): string[] {
    const files: string[] = [];

    // Pattern 1: Paths with extensions (e.g., src/index.ts, ./file.js)
    const pathPattern = /(?:\.\/|\.\.\/|\/)?[\w\-./]+\.\w+/g;
    const pathMatches = query.match(pathPattern);
    if (pathMatches) {
      files.push(...pathMatches);
    }

    // Pattern 2: Quoted paths (e.g., "src/utils/helper.ts")
    const quotedPattern = /["']([^"']+\.\w+)["']/g;
    let quotedMatch;
    while ((quotedMatch = quotedPattern.exec(query)) !== null) {
      files.push(quotedMatch[1]);
    }

    // Pattern 3: Backtick paths (e.g., `src/index.ts`)
    const backtickPattern = /`([^`]+\.\w+)`/g;
    let backtickMatch;
    while ((backtickMatch = backtickPattern.exec(query)) !== null) {
      files.push(backtickMatch[1]);
    }

    // Remove duplicates
    return [...new Set(files)];
  }

  /**
   * Calculate metadata-based relevance score
   * Returns detailed scoring breakdown
   */
  private calculateMetadataScore(input: {
    query: string;
    context: {
      files?: string[];
      project_path?: string;
      tags?: string[];
      created_at: string;
    };
    queryFiles?: string[];
    queryProject?: string;
  }): {
    fileMatch: number;
    projectMatch: number;
    tagMatch: number;
    timeWeight: number;
    total: number;
  } {
    try {
      let fileMatch = 0;
      let projectMatch = 0;
      let tagMatch = 0;
      let timeWeight = 0;

      // 1. File name matching (weight 5)
      if (input.queryFiles && input.context.files) {
        for (const queryFile of input.queryFiles) {
          for (const contextFile of input.context.files) {
            if (this.filesMatch(queryFile, contextFile)) {
              fileMatch = 5;
              break;
            }
          }
          if (fileMatch > 0) break;
        }
      }

      // 2. Project matching (weight 3)
      if (input.queryProject && input.context.project_path) {
        if (input.queryProject === input.context.project_path) {
          projectMatch = 3;
        }
      }

      // 3. Tag matching (weight 2)
      const queryLower = input.query.toLowerCase();
      if (input.context.tags) {
        for (const tag of input.context.tags) {
          if (queryLower.includes(tag.toLowerCase())) {
            tagMatch += 2;
          }
        }
      }

      // 4. Time weight (0-10 points)
      const daysSince = this.getDaysSinceCreation(input.context.created_at);
      timeWeight = Math.max(0, 10 - daysSince);

      const total = fileMatch + projectMatch + tagMatch + timeWeight;
      return { fileMatch, projectMatch, tagMatch, timeWeight, total };
    } catch (error) {
      // Return zero scores on error
      console.warn("[Metadata Score] Calculation failed:", error);
      return {
        fileMatch: 0,
        projectMatch: 0,
        tagMatch: 0,
        timeWeight: 0,
        total: 0,
      };
    }
  }

  /**
   * Combine vector score and metadata score
   * Formula: final_score = vector_score × 0.7 + (metadata_score / 20) × 0.3
   */
  private combineScores(vectorScore: number, metadataScore: number): number {
    // Normalize metadata score from 0-20 to 0-1
    const normalizedMetadata = Math.min(metadataScore / 20, 1.0);

    // Apply weights: 70% vector + 30% metadata
    return vectorScore * 0.7 + normalizedMetadata * 0.3;
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
