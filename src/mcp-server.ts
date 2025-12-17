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
  private autoRecordFilter: AutoRecordFilter;
  private qualityUpdateTimestamp: number = 0; // 质量分上次更新时间戳

  // === AI Enhancement Components (v2.2.0) ===
  private queryEnhancer: QueryEnhancer;
  private memoryClassifier: AutoMemoryClassifier;
  private contextEnricher: ContextEnricher;
  private batchProcessor: BatchProcessor;

  // === Git Info Cache (v2.3.0) ===
  private gitInfoCache: Map<
    string,
    { data: GitInfo | null; timestamp: number }
  > = new Map();
  private projectInfoCache: Map<string, ProjectInfo> = new Map();

  // v2.5.3: Session tracking removed - no longer needed with required project_path

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

  // === 智能记忆合并方法 (v2.4.9) ===
  private mergeMemoryContent(
    existingContent: string,
    newContent: string
  ): string {
    // 边界情况处理：空内容防护
    const safeExisting = (existingContent || "").trim();
    const safeNew = (newContent || "").trim();

    // 如果新内容为空，返回已有内容
    if (!safeNew) {
      console.log("[DevMind] New content is empty, keeping existing content");
      return safeExisting || "";
    }

    // 如果已有内容为空，直接返回新内容
    if (!safeExisting) {
      console.log(
        "[DevMind] Existing content is empty, using new content directly"
      );
      return safeNew;
    }

    try {
      // 如果是相同问题，保留历史演进过程
      if (this.isSameProblem(safeExisting, safeNew)) {
        console.log(
          "[DevMind] Detected same problem, preserving history and adding evolution"
        );
        return this.preserveEvolution(safeExisting, safeNew);
      }

      // 如果是相关问题的扩展，记录扩展过程
      if (this.isRelatedProblem(safeExisting, safeNew)) {
        console.log("[DevMind] Detected related problem, recording extension");
        return safeExisting + "\n\n---\n相关扩展：\n" + safeNew;
      }

      // 即使内容不完全相关，也要记录演进过程（防止遗漏重要信息）
      console.log("[DevMind] Recording evolution regardless of similarity");
      return safeExisting + "\n\n---\n演进记录：\n" + safeNew;
    } catch (error) {
      // 异常情况：返回合并后的内容，确保不丢失数据
      console.error("[DevMind] Error in mergeMemoryContent:", error);
      return safeExisting + "\n\n---\n[合并异常] 新增内容：\n" + safeNew;
    }
  }

  // === 保留历史演进过程的方法 ===
  private preserveEvolution(
    existingContent: string,
    newContent: string
  ): string {
    const timestamp = new Date().toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return (
      existingContent +
      "\n\n---\n🚀 演进记录 (" +
      timestamp +
      ")：\n" +
      newContent
    );
  }

  private isSameProblem(content1: string, content2: string): boolean {
    const keywords1 = this.extractKeywords(content1);
    const keywords2 = this.extractKeywords(content2);

    // 防护：避免除以零
    const maxLen = Math.max(keywords1.length, keywords2.length);
    if (maxLen === 0) {
      return false;
    }

    const commonKeywords = keywords1.filter((k) => keywords2.includes(k));
    const similarity = commonKeywords.length / maxLen;

    return similarity > 0.6; // 60%关键词重叠认为相同问题
  }

  private isRelatedProblem(content1: string, content2: string): boolean {
    const keywords1 = this.extractKeywords(content1);
    const keywords2 = this.extractKeywords(content2);

    // 防护：避免除以零
    const maxLen = Math.max(keywords1.length, keywords2.length);
    if (maxLen === 0) {
      return false;
    }

    const commonKeywords = keywords1.filter((k) => keywords2.includes(k));
    const similarity = commonKeywords.length / maxLen;

    return similarity > 0.3 && similarity <= 0.6; // 30-60%重叠认为相关问题
  }

  // 注：mergeSolutions 方法在 v2.4.9 中已移除（未使用的死代码）

  private extractKeywords(content: string): string[] {
    // 简单的关键词提取，实际实现中可以使用更复杂的NLP
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter((word) => !this.isStopWord(word));

    return [...new Set(words)];
  }

  private isStopWord(word: string): boolean {
    const stopWords = [
      "this",
      "that",
      "with",
      "from",
      "they",
      "have",
      "been",
      "were",
      "said",
      "each",
      "which",
      "their",
      "time",
      "will",
      "about",
      "would",
      "there",
      "could",
      "other",
    ];
    return stopWords.includes(word);
  }

  // === 解析文本格式的语义搜索结果 (v2.4.9) ===
  private parseTextSearchResults(text: string): any[] {
    const results = [];

    try {
      // 匹配格式: "1. **ID**: 12345"
      const lines = text.split("\n");
      for (const line of lines) {
        const idMatch = line.match(/\d+\.\s*\*\*ID\*\*:\s*([a-f0-9\-]+)/i);
        if (idMatch) {
          const contextId = idMatch[1];
          // 提取相似度信息，如果找不到则使用默认值
          const similarityMatch =
            line.match(/similarity[:\s]+([\d.]+)/i) ||
            line.match(/([\d.]+)\s*%/);
          const similarity = similarityMatch
            ? parseFloat(similarityMatch[1]) /
              (similarityMatch[1].includes("%") ? 100 : 1)
            : 0.85; // 默认0.85相似度

          results.push({
            id: contextId,
            similarity_score: similarity,
            content: "", // 文本格式不包含内容
            created_at: new Date().toISOString(),
          });
          console.log(
            `[DevMind] Parsed context ${contextId} with similarity ${similarity}`
          );
        }
      }

      console.log(
        "[DevMind] Total parsed text results:",
        results.length,
        "contexts"
      );
    } catch (error) {
      console.error("[DevMind] Failed to parse text search results:", error);
    }

    return results;
  }

  constructor(config: AiMemoryConfig = {}) {
    this.config = {
      database_path: join(homedir(), ".devmind", "memory.db"),
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
          description: `Record development context to memory. Call IMMEDIATELY after file changes.

WHEN TO USE:
- After making code changes (edits, additions, deletions)
- When solving bugs or implementing features
- Documenting design decisions or learning
- Capturing important development work

WHEN NOT TO USE:
- Do NOT record query processes or search operations
- Do NOT record information retrieval (use semantic_search instead)
- Do NOT record when just looking up existing information

WORKFLOW: Edit files → semantic_search → record_context (or update_context if similar exists) → Respond

Auto-detects: Git changes, context type, quality scores. Smart update for duplicates (v2.4.9).`,
          inputSchema: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description:
                  "Markdown content. MUST match project language (Chinese/English). Use headers, lists, code blocks.",
              },
              type: {
                type: "string",
                enum: [
                  "code_create",
                  "code_modify",
                  "code_delete",
                  "code_refactor",
                  "code_optimize",
                  "bug_fix",
                  "bug_report",
                  "feature_add",
                  "feature_update",
                  "feature_remove",
                  "solution",
                  "design",
                  "learning",
                  "code",
                  "conversation",
                  "error",
                  "documentation",
                  "test",
                  "configuration",
                  "commit",
                ],
                description: "Context type (auto-detected if not provided)",
              },
              project_path: {
                type: "string",
                description:
                  "Project path (REQUIRED). Absolute path to the project directory. This ensures memory is recorded to the correct project session. Example: '/path/to/project' or 'C:\\Users\\user\\project'",
              },
              session_id: {
                type: "string",
                description:
                  "Session ID to record context in (optional, will use project's active session if not provided)",
              },
              file_path: { type: "string", description: "Optional file path" },
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
                  additions: { type: "number" },
                  deletions: { type: "number" },
                  changes: { type: "number" },
                },
                description: "Code diff statistics",
              },
              metadata: { type: "object", description: "Additional metadata" },
              force_remember: {
                type: "boolean",
                description: "Force record when user says 'remember/save this'",
              },
            },
            required: ["content", "project_path"],
          },
        },
        {
          name: "manage_session",
          description:
            "Manage development sessions: end, delete, or end and delete.",
          inputSchema: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["end", "delete", "end_and_delete"],
                description:
                  "Action: 'end' (mark complete), 'delete' (remove permanently), 'end_and_delete' (both)",
              },
              session_id: { type: "string", description: "Session ID" },
              project_id: {
                type: "string",
                description:
                  "Delete all sessions of project (only for delete action)",
              },
            },
            required: ["action"],
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
                description:
                  "Project path (required). If not provided, automatically detects current project.",
              },
            },
            required: ["project_path"],
          },
        },
        {
          name: "list_projects",
          description: `List all tracked projects with statistics and activity information.

WHEN TO USE:
- Getting overview of tracked projects
- Finding project IDs for other operations (e.g., export_memory_graph)
- Checking project activity and statistics

PARAMETERS:
- include_stats: Include detailed statistics (default: true)
- limit: Max projects to return (default: 50)

Returns: Project ID, name, path, language, framework, stats (contexts, sessions, last activity).`,
          inputSchema: {
            type: "object",
            properties: {
              include_stats: {
                type: "boolean",
                description:
                  "Whether to include detailed statistics for each project (default: true). Statistics include context count, session count, and last activity time. Set to false for faster listing without stats.",
              },
              limit: {
                type: "number",
                description:
                  "Maximum number of projects to return (default: 50). Increase if you have many projects and want to see them all.",
              },
            },
          },
        },
        {
          name: "get_context",
          description: `Retrieve full details of specific contexts by their IDs or find related contexts.

WHEN TO USE:
- Getting full content after seeing previews in list_contexts
- Viewing complete details from semantic_search results
- Finding contexts related to a specific context
- Retrieving multiple contexts at once

PARAMETERS:
- context_ids: Single ID (string) or multiple IDs (array)
- relation_type: Optional. Find related contexts (depends_on, related_to, fixes, implements, tests, documents)

Returns complete context data: id, content, type, files, metadata, tags, timestamps.`,
          inputSchema: {
            type: "object",
            properties: {
              context_ids: {
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                ],
                description:
                  "Single context ID (string) or multiple context IDs (array of strings) to retrieve. Get IDs from list_contexts or semantic_search results.",
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
                description:
                  "Optional. Instead of retrieving the contexts, find contexts related to them by this relationship type. Options: 'depends_on' (dependencies), 'related_to' (related work), 'fixes' (bug fixes), 'implements' (feature implementations), 'tests' (test coverage), 'documents' (documentation).",
              },
            },
            required: ["context_ids"],
          },
        },
        {
          name: "semantic_search",
          description: `Search through both development memory AND indexed codebase files using hybrid semantic+keyword algorithm.

WHEN TO USE:
- Finding how similar bugs were fixed
- Searching for code examples or patterns
- Discovering related work in project history
- Learning from past solutions
- Querying project files for implementation details
- Finding code patterns across the entire codebase

IMPORTANT: This is a READ-ONLY operation for finding information. Do NOT use this to record new contexts - use semantic_search to FIND answers, then respond directly to users.

KEY PARAMETERS:
- query: What you're looking for (required)
- project_path/session_id/file_path: Filter scope
- type: Filter by context type (bug_fix, feature_add, etc.)
- limit: Max results (default: 10)
- similarity_threshold: Min relevance 0-1 (default: 0.5)

Returns results sorted by relevance with scores and metadata.`,
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Search query describing what you're looking for. Can include keywords, descriptions, file names, or problem descriptions. Examples: 'bug fix for authentication', 'how to handle database errors', 'React component patterns'",
              },
              project_path: {
                type: "string",
                description:
                  "Limit search to a specific project directory path. Use when you only want results from one project.",
              },
              session_id: {
                type: "string",
                description:
                  "Limit search to a specific development session. Use when you want to see what was done in a particular session.",
              },
              file_path: {
                type: "string",
                description:
                  "Filter results to only contexts related to this specific file path. Use when searching for work done on a particular file.",
              },
              type: {
                type: "string",
                description:
                  "Filter by context type (bug_fix, feature_add, code_modify, etc.). Use when you want specific types of work.",
              },
              limit: {
                type: "number",
                description:
                  "Maximum number of results to return (default: 10). Increase for broader search, decrease for focused results.",
              },
              similarity_threshold: {
                type: "number",
                description:
                  "Minimum relevance score from 0 to 1 (default: 0.5). Higher values return only very relevant results, lower values cast a wider net.",
              },
              hybrid_weight: {
                type: "number",
                description:
                  "Balance between semantic (meaning-based) and keyword (exact match) search, from 0 to 1 (default: 0.7 = 70% semantic, 30% keyword). Adjust based on search needs.",
              },
              use_cache: {
                type: "boolean",
                description:
                  "Whether to use cached search results for faster performance (default: true). Set to false to force fresh search.",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "list_contexts",
          description: `List development contexts in chronological order (newest first) for browsing project history.

WHEN TO USE:
- Browsing recent work in a project
- Reviewing what was done in a session
- Getting overview of project activity

WHEN NOT TO USE:
- Searching for specific content → use semantic_search instead

PARAMETERS:
- project_path/session_id: Filter by project or session
- limit: Max contexts (default: 20)
- since: Time filter (24h, 7d, 30d, 90d)
- type: Filter by context type (bug_fix, feature_add, etc.)

Returns contexts with previews, sorted by creation time (newest first).`,
          inputSchema: {
            type: "object",
            properties: {
              project_path: {
                type: "string",
                description:
                  "Filter to show only contexts from this specific project directory path",
              },
              session_id: {
                type: "string",
                description:
                  "Filter to show only contexts from this specific development session",
              },
              limit: {
                type: "number",
                description:
                  "Maximum number of contexts to return (default: 20). Use higher values to see more history.",
              },
              since: {
                type: "string",
                description:
                  "Time filter to show only recent contexts. Options: '24h' (last 24 hours), '7d' (last week), '30d' (last month), '90d' (last 3 months). Omit to show all time.",
              },
              type: {
                type: "string",
                description:
                  "Filter by context type to show only specific kinds of work. Examples: 'bug_fix', 'feature_add', 'code_modify', 'documentation', 'test'. Omit to show all types.",
              },
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
          description: `Update existing memory context to avoid duplicate records.

WHEN TO USE:
- User explicitly requests to update a previous memory
- AI discovers the same bug/issue was already recorded and needs updating
- Refining or correcting previously recorded information
- Avoiding duplicate memories for the same problem

WORKFLOW:
1. Search for existing related context using semantic_search
2. If found duplicate/related context, use update_context instead of record_context
3. This prevents memory clutter and maintains clean history

YOU SHOULD:
- Check for existing similar contexts before creating new ones
- Update existing context when solving the same problem again
- Preserve context history while keeping information current`,
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
        // delete_session 已合并到 manage_session (v2.4.9)
        // project_analysis_engineer 工具已移除，请使用 Prompt 版本 (v2.4.9)
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
              project_path: {
                type: "string",
                description:
                  "Project path (optional). If not provided, shows status for auto-detected project.",
              },
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
        {
          name: "codebase",
          description: `Index codebase files into memory. Scans all files in the project directory and stores them for semantic search.

FEATURES:
- Recursive directory scanning with multi-language support
- Supports .gitignore and .augmentignore exclusion patterns
- Automatic binary file detection and skipping
- Incremental indexing based on file hashes (only changed files)
- Stores index in separate file_index table (doesn't pollute development memory)

EXAMPLES:
- First time setup: codebase({project_path: "/path/to/project"})
- Force reindex all files: codebase({project_path: "/path/to/project", force_reindex: true})
- After code changes: Run again to update index for semantic_search

EXCLUDED BY DEFAULT:
- node_modules/, .git/, dist/, build/, *.log, *.tmp
- Binary files (images, executables, etc.)
- Files matching .gitignore and .augmentignore patterns

Use semantic_search to query indexed files after indexing.`,
          inputSchema: {
            type: "object",
            properties: {
              project_path: {
                type: "string",
                description:
                  "Project path (required). Path to the project directory to index.",
              },
              force_reindex: {
                type: "boolean",
                description: "Force reindex all files (default: false)",
              },
            },
            required: ["project_path"],
          },
        },
        {
          name: "delete_codebase_index",
          description: `Delete codebase index for a project. Removes all indexed files and related indexing sessions.

WHEN TO USE:
- Cleaning up after project deletion or move
- Resetting index to rebuild from scratch
- Freeing up disk space
- Removing outdated or corrupted index

EXAMPLE:
delete_codebase_index({project_path: "/path/to/project"})

Note: This only deletes the file index, not your development memory contexts.`,
          inputSchema: {
            type: "object",
            properties: {
              project_path: {
                type: "string",
                description:
                  "Project path (required). Path to the project directory to delete index for.",
              },
            },
            required: ["project_path"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Ensure args is at least an empty object to prevent destructuring errors
      const safeArgs = args || {};

      switch (name) {
        case "create_session":
          return this.handleCreateSession(
            safeArgs as unknown as SessionCreateParams
          );
        case "record_context":
          return this.handleRecordContext(
            safeArgs as unknown as RecordContextParams
          );
        case "manage_session":
          return this.handleManageSession(
            safeArgs as {
              action: "end" | "delete" | "end_and_delete";
              session_id?: string;
              project_id?: string;
            }
          );
        case "get_current_session":
          return this.handleGetCurrentSession(
            safeArgs as { project_path: string }
          );
        case "list_projects":
          return this.handleListProjects(
            safeArgs as { include_stats?: boolean; limit?: number }
          );
        case "get_context":
          return this.handleGetContext(
            safeArgs as {
              context_ids: string | string[];
              relation_type?: string;
            }
          );
        case "semantic_search":
          return this.handleSemanticSearch(
            safeArgs as {
              query: string;
              project_path?: string;
              session_id?: string;
              limit?: number;
              similarity_threshold?: number;
              hybrid_weight?: number;
            }
          );
        case "list_contexts":
          return this.handleListContexts(
            safeArgs as {
              session_id?: string;
              project_path?: string;
              limit?: number;
            }
          );
        case "delete_context":
          return this.handleDeleteContext(safeArgs as { context_id: string });
        case "update_context":
          return this.handleUpdateContext(
            safeArgs as {
              context_id: string;
              content?: string;
              tags?: string[];
              quality_score?: number;
              metadata?: object;
            }
          );
        // delete_session 和 project_analysis_engineer 已移除 (v2.4.9)
        case "export_memory_graph":
          return this.handleExportMemoryGraph(
            safeArgs as {
              project_id: string;
              max_nodes?: number;
              focus_type?: string;
              output_path?: string;
            }
          );
        case "get_memory_status":
          return this.handleGetMemoryStatus(
            safeArgs as { project_path?: string }
          );
        case "cleanup_empty_projects":
          return this.handleCleanupEmptyProjects(
            safeArgs as { dry_run?: boolean; project_ids?: string[] }
          );
        case "codebase":
          return this.handleCodebase(
            safeArgs as { project_path: string; force_reindex?: boolean }
          );
        case "delete_codebase_index":
          return this.handleDeleteCodebaseIndex(
            safeArgs as { project_path: string }
          );
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [],
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Ensure args is at least an empty object to prevent destructuring errors
      const safeArgs = args || {};

      throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${name}`);
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
      // === 智能去重检测 (v2.4.7) ===
      // 检测是否有相似的最近记忆，避免重复记录
      let duplicateWarning: string | null = null;
      let topMatch: any = null; // 保存最佳匹配结果供后续智能更新使用
      let hoursSince = 0; // 保存时间差供后续使用

      if (args.content && args.content.length > 10) {
        // 降低阈值确保短内容也能触发
        try {
          // 搜索最近 24 小时内的相似记忆 - 优化参数
          const recentContexts = await this.handleSemanticSearch({
            query: args.content.substring(0, 150), // 减少查询长度，提高匹配精度
            limit: 5, // 增加搜索结果数量，避免遗漏
            similarity_threshold: 0.75, // 从0.85降低到0.75，提高召回率
            project_path: args.project_path,
          });

          console.log(
            "[DevMind] Duplicate detection - Content length:",
            args.content.length
          );
          console.log(
            "[DevMind] Semantic search result:",
            recentContexts.isError ? "ERROR" : "SUCCESS"
          );

          if (!recentContexts.isError && recentContexts.content) {
            let results = [];
            try {
              // 安全解析语义搜索结果
              const text = recentContexts.content[0]?.text;
              if (text && text.startsWith("{") && text.endsWith("}")) {
                const parsed = JSON.parse(text);
                results = parsed.results || [];
                console.log(
                  "[DevMind] Successfully parsed semantic search results:",
                  results.length
                );
              } else if (
                text &&
                text.includes("Found") &&
                text.includes("semantically relevant contexts")
              ) {
                // 解析文本格式的响应
                results = this.parseTextSearchResults(text);
                console.log(
                  "[DevMind] Successfully parsed text search results:",
                  results.length
                );
              } else {
                console.warn(
                  "[DevMind] Semantic search returned non-JSON response:",
                  text?.substring(0, 100)
                );
                results = [];
              }
            } catch (parseError) {
              console.error(
                "[DevMind] Failed to parse semantic search results:",
                parseError
              );
              console.error(
                "[DevMind] Raw response:",
                recentContexts.content?.[0]?.text
              );
              results = [];
            }

            if (results && results.length > 0) {
              topMatch = results[0]; // 保存最佳匹配结果
              // 检查是否是最近 24 小时内的高度相似记忆
              const createdAt = new Date(topMatch.created_at);
              hoursSince =
                (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

              // 降低智能更新的相似度阈值到0.7，确保能触发更新
              if (hoursSince < 24 && topMatch.similarity_score > 0.7) {
                // 从0.75降低到0.7
                duplicateWarning = `⚠️ Potential duplicate detected: Similar context exists (ID: ${
                  topMatch.id
                }, similarity: ${(topMatch.similarity_score * 100).toFixed(
                  1
                )}%, ${hoursSince.toFixed(
                  1
                )}h ago). Consider using update_context instead.`;
                console.log(`[DevMind] ${duplicateWarning}`);
              }
            }
          }
        } catch (error) {
          // 静默失败，不影响记录流程
          console.error("[DevMind] Duplicate detection failed:", error);
        }
      }

      // v2.5.3: project_path 现在是必需参数，简化逻辑
      let sessionId = args.session_id;
      let autoSessionMeta: any = {};
      const projectPath = args.project_path;

      // 验证 project_path 必须提供
      if (!projectPath) {
        throw new Error(
          "project_path is required. Please provide the absolute path to your project directory.\n" +
            "Example: record_context({ content: '...', project_path: '/path/to/project' })"
        );
      }

      // 标准化项目路径
      const projectRoot = findProjectRoot(projectPath);
      const normalizedProjectPath = normalizeProjectPath(projectRoot);

      console.log(
        `[DevMind] Using project path: ${projectPath} -> ${normalizedProjectPath}`
      );

      // 如果没有提供 session_id，获取或创建项目的活跃会话
      if (!sessionId) {
        const currentSessionId = await this.sessionManager.getCurrentSession(
          normalizedProjectPath
        );

        if (currentSessionId) {
          sessionId = currentSessionId;
          autoSessionMeta = {
            auto_session: true,
            session_source: "existing_active",
            session_id: sessionId,
          };
          console.log(`[DevMind] Using existing active session: ${sessionId}`);
        } else {
          // 创建新会话
          sessionId = await this.sessionManager.createSession({
            project_path: normalizedProjectPath,
            tool_used: "auto",
            name: "Auto-created session",
          });
          autoSessionMeta = {
            auto_session: true,
            session_source: "newly_created",
            session_id: sessionId,
          };
          console.log(`[DevMind] Created new session: ${sessionId}`);
        }
      }

      // === Git 信息自动检测 (v2.3.0) ===
      let gitInfo: GitInfo | null = null;
      let gitDetectionMeta: any = {};

      // 仅在未提供 files_changed 时调用
      if (!args.files_changed) {
        try {
          gitInfo = await this.detectGitInfo(normalizedProjectPath);

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

      // 自动检测项目信息
      try {
        projectInfo = await this.detectProjectInfo(normalizedProjectPath);
      } catch (error) {
        console.warn(
          "[Project Detection] Failed in handleRecordContext:",
          error
        );
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

      let contextId: string;

      // === v2.5.3: 禁用自动更新，改为仅提示 ===
      // 自动更新容易误判，导致不同工作的记忆被错误合并
      // 现在只提示 AI，由 AI 决定是否使用 update_context
      if (duplicateWarning && topMatch && topMatch.similarity_score > 0.95) {
        console.log(
          "[DevMind] High similarity detected (>95%), but creating new record. AI can manually update if needed."
        );

        // 更新提示信息，提供更详细的指导
        duplicateWarning = `⚠️ 检测到相似记忆：
- ID: ${topMatch.id}
- 相似度: ${(topMatch.similarity_score * 100).toFixed(1)}%
- 创建时间: ${hoursSince.toFixed(1)}小时前
- 类型: ${topMatch.type || "unknown"}

如果这是重复工作，建议使用 update_context(context_id: "${
          topMatch.id
        }") 更新现有记忆。
否则已创建新记录（推荐保留独立记忆）。`;
      }

      // 始终创建新记录（简化逻辑）
      contextId = this.db.createContext({
        session_id: sessionId,
        type: finalType,
        content: args.content,
        file_path: undefined,
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

      // v2.5.3: 移除自动更新的响应分支（已禁用自动更新）
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

      // 重复警告信息 (v2.4.7)
      if (duplicateWarning) {
        responseText += `\n\n${duplicateWarning}`;
      }

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
        const sourceText =
          autoSessionMeta.session_source === "existing_active"
            ? "Reused active session"
            : autoSessionMeta.session_source === "tracked_session"
            ? "Used tracked session"
            : "Created new session";
        responseText += `\nSession: ${sourceText} (${sessionId})`;
      }

      // 路径检测信息（仅单文件场景）
      if (!isMultiFileContext && pathDetectionMeta.auto_detected) {
        responseText += `\nAuto-detected file: ${
          pathDetectionMeta.all_suggestions?.[0]?.path || "N/A"
        } (confidence: ${Math.round(
          (pathDetectionMeta.confidence || 0) * 100
        )}%)`;
      }

      // v2.5.4: Session tracking removed - no longer needed

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
          // v2.5.3: 移除自动更新元数据（已禁用自动更新功能）
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

  // === 统一的会话管理方法 (v2.4.9) ===
  private async handleManageSession(args: {
    action: "end" | "delete" | "end_and_delete";
    session_id?: string;
    project_id?: string;
  }) {
    try {
      const { action, session_id, project_id } = args;

      // 验证参数
      if (action === "end" && !session_id) {
        return {
          content: [
            {
              type: "text",
              text: "Error: session_id is required for 'end' action",
            },
          ],
          isError: true,
        };
      }

      if (
        (action === "delete" || action === "end_and_delete") &&
        !session_id &&
        !project_id
      ) {
        return {
          content: [
            {
              type: "text",
              text: "Error: session_id or project_id is required for delete actions",
            },
          ],
          isError: true,
        };
      }

      // 执行操作
      switch (action) {
        case "end": {
          this.sessionManager.endSession(session_id!);
          return {
            content: [
              { type: "text", text: `✅ Session ended: ${session_id}` },
            ],
            isError: false,
            _meta: { action: "end", session_id },
          };
        }

        case "delete": {
          return await this.performDeleteSession(session_id, project_id);
        }

        case "end_and_delete": {
          if (session_id) {
            this.sessionManager.endSession(session_id);
          }
          return await this.performDeleteSession(session_id, project_id);
        }

        default:
          return {
            content: [
              { type: "text", text: `Error: Unknown action '${action}'` },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to manage session: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  // 内部方法：执行删除会话
  private async performDeleteSession(session_id?: string, project_id?: string) {
    if (project_id) {
      const sessions = this.db.getSessionsByProject(project_id);
      if (sessions.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No sessions found for project ${project_id}`,
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
            text: `✅ Deleted project: ${project_id}\nSessions: ${sessions.length}\nContexts: ${totalContexts}\n⚠️ Cannot be undone!`,
          },
        ],
        isError: false,
        _meta: {
          deleted_project_id: project_id,
          deleted_sessions_count: sessions.length,
          deleted_contexts_count: totalContexts,
        },
      };
    }

    // 删除单个会话
    const session = this.db.getSession(session_id!);
    if (!session) {
      return {
        content: [{ type: "text", text: `Session not found: ${session_id}` }],
        isError: false,
      };
    }

    const contexts = this.db.getContextsBySession(session_id!);
    this.db.deleteSession(session_id!);

    return {
      content: [
        {
          type: "text",
          text: `✅ Deleted session: ${session_id}\nName: ${session.name}\nContexts: ${contexts.length}\n⚠️ Cannot be undone!`,
        },
      ],
      isError: false,
      _meta: {
        deleted_session_id: session_id,
        deleted_contexts_count: contexts.length,
      },
    };
  }

  // 保留原方法作为内部调用（向后兼容）
  private async handleEndSession(args: { session_id: string }) {
    return this.handleManageSession({
      action: "end",
      session_id: args.session_id,
    });
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

      // 获取用于搜索的contexts（开发记忆）
      const allContexts = this.db.getContextsForVectorSearch(
        projectId,
        args.session_id
      );

      // 获取代码库索引文件
      const allFileIndex = this.db.getFileIndexForVectorSearch(
        projectId,
        args.session_id
      );

      // 转换 file_index 为兼容格式以便搜索
      const fileIndexAsContexts = allFileIndex.map((file) => ({
        id: file.id,
        session_id: file.session_id,
        project_id: file.project_id,
        content: file.content,
        type: "code" as ContextType, // 使用 ContextType.CODE 表示代码文件
        tags: file.tags,
        file_path: file.file_path,
        created_at: file.indexed_at,
        updated_at: file.modified_time,
        quality_score: 0.95, // 提升代码文件优先级，确保"如何实现"类查询优先返回代码
        embedding_text: undefined, // 文件没有预生成的embedding
        metadata: file.metadata,
      }));

      // 合并开发记忆和代码库索引
      const allSearchData = [...allContexts, ...fileIndexAsContexts];

      if (allSearchData.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No contexts or codebase files found. Try running generate_embeddings first or index your codebase.",
            },
          ],
          isError: false,
          _meta: {
            query: args.query,
            results: [],
            contexts_count: 0,
            files_count: 0,
          },
        };
      }

      // 执行语义搜索
      const searchParams = {
        query: args.query,
        use_semantic_search: true,
        limit: args.limit || 20, // 增加默认限制以包含更多结果
        similarity_threshold:
          args.similarity_threshold ||
          this.config.vector_search?.similarity_threshold ||
          0.5,
        hybrid_weight:
          args.hybrid_weight || this.config.vector_search?.hybrid_weight || 0.7,
      };

      // 获取关键词搜索结果作为基线（仅针对开发记忆）
      const keywordResults = this.db.searchContexts(
        enhancedQuery,
        projectId,
        searchParams.limit
      );

      // 执行混合搜索（搜索所有数据：记忆 + 代码库）
      let results = await this.vectorSearch.hybridSearch(
        enhancedQuery,
        keywordResults,
        allSearchData,
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
          total_files_searched: allFileIndex.length,
          results_count: formattedResults.length,
          results: formattedResults,
          search_params: searchParams,
          query_enhancement: queryEnhancementMeta,
          contexts_count: allContexts.length,
          files_count: allFileIndex.length,
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

      // 文件监控状态（已移除自动监控功能）
      const fileMonitoringStatus = "Disabled";

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
   * 处理 codebase 工具：索引代码库文件
   */
  private async handleCodebase(args: {
    project_path: string;
    force_reindex?: boolean;
  }) {
    try {
      const { project_path, force_reindex = false } = args;

      if (!project_path || typeof project_path !== "string") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "project_path is required and must be a string"
        );
      }

      console.log(
        `[ContextEngine] Starting to index codebase: ${project_path}`
      );

      // 导入 ContextEngine
      const { ContextEngine } = await import("./context-engine/index.js");
      const contextEngine = new ContextEngine(this.db, this.sessionManager);

      // 索引代码库
      const result = await contextEngine.indexCodebase(project_path, {
        forceReindex: force_reindex,
      });

      // 返回结果
      return {
        content: [
          {
            type: "text",
            text:
              `# 📚 Codebase Index Complete\n\n` +
              `**Project:** ${project_path}\n\n` +
              `## 📊 Index Statistics\n` +
              `- Total files found: ${result.totalFiles}\n` +
              `- Successfully indexed: ${result.successFiles}\n` +
              `- Failed to index: ${result.failedFiles}\n` +
              `- Skipped files: ${result.skippedFiles}\n` +
              `- Duration: ${result.duration}ms\n\n` +
              `## 🔍 Next Steps\n` +
              `You can now search the codebase using semantic_search:\n\n` +
              `\`\`\`\n` +
              `semantic_search({ query: "your search query" })\n` +
              `\`\`\`\n\n` +
              `This will search both your development memory and the indexed codebase files.`,
          },
        ],
        isError: false,
        _meta: {
          project_path,
          force_reindex,
          total_files: result.totalFiles,
          success_files: result.successFiles,
          failed_files: result.failedFiles,
          duration: result.duration,
          errors: result.errors,
        },
      };
    } catch (error) {
      console.error("[ContextEngine] Indexing failed:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to index codebase: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleDeleteCodebaseIndex(args: { project_path: string }) {
    try {
      const { project_path } = args;

      if (!project_path || typeof project_path !== "string") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "project_path is required and must be a string"
        );
      }

      console.log(
        `[ContextEngine] Starting to delete codebase index: ${project_path}`
      );

      // 导入 ContextEngine
      const { ContextEngine } = await import("./context-engine/index.js");
      const contextEngine = new ContextEngine(this.db, this.sessionManager);

      // 删除索引
      const result = await contextEngine.deleteCodebaseIndex(project_path);

      // 返回结果
      return {
        content: [
          {
            type: "text",
            text:
              `# 🗑️ Codebase Index Deleted\n\n` +
              `**Project:** ${project_path}\n\n` +
              `## 📊 Deletion Summary\n` +
              `- Files deleted: ${result.deleted_files}\n` +
              `- Sessions deleted: ${result.deleted_sessions}\n\n` +
              `The codebase index has been successfully removed. You can re-index the project using the 'codebase' tool if needed.`,
          },
        ],
        isError: false,
        _meta: {
          project_path,
          deleted_files: result.deleted_files,
          deleted_sessions: result.deleted_sessions,
        },
      };
    } catch (error) {
      console.error("[ContextEngine] Deletion failed:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to delete codebase index: ${
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

  /**
   * 处理项目分析工程师 Tool（直接调用，返回分析文档）
   */

  /**
   * 分析项目用于生成提示
   */

  /**
   * 选择关键文件
   */

  /**
   * 提取文件内容
   */

  /**
   * 生成专业分析提示
   */

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
