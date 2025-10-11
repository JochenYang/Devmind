import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DatabaseManager } from './database.js';
import { SessionManager } from './session-manager.js';
import { ContentExtractor } from './content-extractor.js';
import { VectorSearchEngine } from './vector-search.js';
import { 
  AiMemoryConfig, 
  ContextSearchParams, 
  ProjectContextParams, 
  RecordContextParams, 
  SessionCreateParams,
  ContextType 
} from './types.js';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync } from 'fs';

export class AiMemoryMcpServer {
  private server: Server;
  private db: DatabaseManager;
  private sessionManager: SessionManager;
  private contentExtractor: ContentExtractor;
  private vectorSearch: VectorSearchEngine | null = null;
  private config: AiMemoryConfig;

  constructor(config: AiMemoryConfig = {}) {
    this.config = {
      database_path: join(homedir(), '.devmind', 'memory.db'),
      max_contexts_per_session: 1000,
      quality_threshold: 0.3,
      auto_save_interval: 30000, // 30 seconds
      ignored_patterns: [
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        '*.log',
        '*.tmp'
      ],
      included_extensions: [
        '.js', '.ts', '.jsx', '.tsx',
        '.py', '.go', '.rs', '.java', '.kt',
        '.php', '.rb', '.c', '.cpp', '.cs',
        '.swift', '.dart', '.md', '.txt'
      ],
      vector_search: {
        enabled: true,
        model_name: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        similarity_threshold: 0.5,
        hybrid_weight: 0.7,
        cache_embeddings: true,
      },
      ...config
    };

    this.initializeDatabase();
    this.db = new DatabaseManager(this.config.database_path!);
    this.sessionManager = new SessionManager(this.db, this.config);
    this.contentExtractor = new ContentExtractor();
    
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
        name: 'devmind-mcp',
        version: '1.2.6',
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
    
    // 延迟启动自动监控，不阻塞MCP握手
    this.scheduleAutoMonitoring();
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
          uri: 'memory://project-context',
          name: 'Project Context',
          description: 'Get comprehensive context for a project',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://session-history',
          name: 'Session History',
          description: 'Get history of development sessions',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://search-contexts',
          name: 'Search Contexts',
          description: 'Search through stored contexts',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://stats',
          name: 'Memory Statistics',
          description: 'Get memory database statistics',
          mimeType: 'application/json',
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      const url = new URL(uri);

      switch (url.pathname) {
        case '/project-context':
          return await this.handleProjectContext(url.searchParams);
        case '/session-history':
          return await this.handleSessionHistory(url.searchParams);
        case '/search-contexts':
          return await this.handleSearchContexts(url.searchParams);
        case '/stats':
          return await this.handleStats();
        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
      }
    });

    // Tools handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_session',
          description: 'Create a new development session for a project',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: { type: 'string', description: 'Path to the project directory' },
              tool_used: { type: 'string', description: 'Tool being used (vscode, cli, etc.)' },
              name: { type: 'string', description: 'Optional session name' },
              metadata: { type: 'object', description: 'Optional metadata' },
            },
            required: ['project_path', 'tool_used'],
          },
        },
        {
          name: 'record_context',
          description: 'Record a new context in the current session',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Session ID to record context in' },
              type: { 
                type: 'string', 
                enum: ['code', 'conversation', 'error', 'solution', 'documentation', 'test', 'configuration', 'commit'],
                description: 'Type of context'
              },
              content: { type: 'string', description: 'The context content' },
              file_path: { type: 'string', description: 'Optional file path' },
              line_start: { type: 'number', description: 'Optional starting line number' },
              line_end: { type: 'number', description: 'Optional ending line number' },
              language: { type: 'string', description: 'Optional programming language' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
              metadata: { type: 'object', description: 'Optional metadata' },
            },
            required: ['session_id', 'type', 'content'],
          },
        },
        {
          name: 'end_session',
          description: 'End a development session',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Session ID to end' },
            },
            required: ['session_id'],
          },
        },
        {
          name: 'get_current_session',
          description: 'Get the current active session for a project',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: { type: 'string', description: 'Path to the project directory' },
            },
            required: ['project_path'],
          },
        },
        {
          name: 'extract_file_context',
          description: 'Extract context from a file and optionally record it',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Path to the file' },
              session_id: { type: 'string', description: 'Optional session ID to record context in' },
              record: { type: 'boolean', description: 'Whether to record the extracted context' },
            },
            required: ['file_path'],
          },
        },
        {
          name: 'get_related_contexts',
          description: 'Get contexts related to a specific context',
          inputSchema: {
            type: 'object',
            properties: {
              context_id: { type: 'string', description: 'Context ID to find related contexts for' },
              relation_type: { 
                type: 'string', 
                enum: ['depends_on', 'related_to', 'fixes', 'implements', 'tests', 'documents'],
                description: 'Optional specific relation type'
              },
            },
            required: ['context_id'],
          },
        },
        {
          name: 'semantic_search',
          description: 'Perform semantic search using vector embeddings',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query text' },
              project_id: { type: 'string', description: 'Optional project ID to search within' },
              session_id: { type: 'string', description: 'Optional session ID to search within' },
              limit: { type: 'number', description: 'Maximum number of results (default: 10)' },
              similarity_threshold: { type: 'number', description: 'Similarity threshold (default: 0.5)' },
              hybrid_weight: { type: 'number', description: 'Weight for semantic vs keyword search (0-1, default: 0.7)' },
            },
            required: ['query'],
          },
        },
        {
          name: 'list_contexts',
          description: 'List contexts in a session or project for management',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Optional session ID to filter contexts' },
              project_id: { type: 'string', description: 'Optional project ID to filter contexts' },
              limit: { type: 'number', description: 'Maximum number of results (default: 20)' },
            },
          },
        },
        {
          name: 'delete_context',
          description: 'Delete a specific context by ID',
          inputSchema: {
            type: 'object',
            properties: {
              context_id: { type: 'string', description: 'Context ID to delete' },
            },
            required: ['context_id'],
          },
        },
        {
          name: 'update_context',
          description: 'Update a context content, tags, or metadata',
          inputSchema: {
            type: 'object',
            properties: {
              context_id: { type: 'string', description: 'Context ID to update' },
              content: { type: 'string', description: 'New content' },
              tags: { type: 'array', items: { type: 'string' }, description: 'New tags' },
              quality_score: { type: 'number', description: 'New quality score (0-1)' },
              metadata: { type: 'object', description: 'New metadata' },
            },
            required: ['context_id'],
          },
        },
        {
          name: 'delete_session',
          description: 'Delete a session and all its contexts (use with caution)',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Session ID to delete' },
            },
            required: ['session_id'],
          },
        },
        {
          name: 'generate_embeddings',
          description: 'Generate embeddings for contexts without them',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Maximum number of contexts to process (default: 50)' },
              force_update: { type: 'boolean', description: 'Update contexts even if they have existing embeddings' },
              project_id: { type: 'string', description: 'Optional project ID to filter contexts' },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'create_session':
          return await this.handleCreateSession(args as unknown as SessionCreateParams);
        case 'record_context':
          return await this.handleRecordContext(args as unknown as RecordContextParams);
        case 'end_session':
          return await this.handleEndSession(args as { session_id: string });
        case 'get_current_session':
          return await this.handleGetCurrentSession(args as { project_path: string });
        case 'extract_file_context':
          return await this.handleExtractFileContext(args as { file_path: string; session_id?: string; record?: boolean });
        case 'get_related_contexts':
          return await this.handleGetRelatedContexts(args as { context_id: string; relation_type?: string });
        case 'semantic_search':
          return await this.handleSemanticSearch(args as { 
            query: string; 
            project_id?: string; 
            session_id?: string;
            limit?: number; 
            similarity_threshold?: number;
            hybrid_weight?: number;
          });
        case 'generate_embeddings':
          return await this.handleGenerateEmbeddings(args as { 
            limit?: number; 
            force_update?: boolean; 
            project_id?: string; 
          });
        case 'list_contexts':
          return await this.handleListContexts(args as { 
            session_id?: string; 
            project_id?: string;
            limit?: number; 
          });
        case 'delete_context':
          return await this.handleDeleteContext(args as { context_id: string });
        case 'update_context':
          return await this.handleUpdateContext(args as { 
            context_id: string;
            content?: string;
            tags?: string[];
            quality_score?: number;
            metadata?: object;
          });
        case 'delete_session':
          return await this.handleDeleteSession(args as { session_id: string });
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: 'context_summary',
          description: 'Generate a summary of project context',
          arguments: [
            {
              name: 'project_id',
              description: 'Project ID to summarize',
              required: true,
            },
            {
              name: 'session_limit',
              description: 'Maximum number of recent sessions to include',
              required: false,
            },
          ],
        },
        {
          name: 'code_explanation',
          description: 'Generate explanation for a code context',
          arguments: [
            {
              name: 'context_id',
              description: 'Context ID to explain',
              required: true,
            },
            {
              name: 'detail_level',
              description: 'Level of detail (brief, detailed, comprehensive)',
              required: false,
            },
          ],
        },
        {
          name: 'solution_recommendation',
          description: 'Get solution recommendations based on context',
          arguments: [
            {
              name: 'error_context_id',
              description: 'Error context ID to find solutions for',
              required: true,
            },
            {
              name: 'include_similar',
              description: 'Include similar solved problems',
              required: false,
            },
          ],
        },
      ],
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'context_summary':
          return await this.handleContextSummary(args);
        case 'code_explanation':
          return await this.handleCodeExplanation(args);
        case 'solution_recommendation':
          return await this.handleSolutionRecommendation(args);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${name}`);
      }
    });
  }

  // Resource handlers
  private async handleProjectContext(params: URLSearchParams) {
    const projectId = params.get('project_id');
    const includeSessions = params.get('include_sessions') === 'true';
    const includeContexts = params.get('include_contexts') === 'true';
    const limit = params.get('limit') ? parseInt(params.get('limit')!) : undefined;

    if (!projectId) {
      throw new McpError(ErrorCode.InvalidParams, 'project_id parameter is required');
    }

    const contexts = includeSessions 
      ? this.db.getContextsBySession(projectId, limit)
      : [];

    return {
      contents: [{
        uri: `memory://project-context?project_id=${projectId}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          project_id: projectId,
          sessions: includeSessions ? contexts : undefined,
          contexts: includeContexts ? contexts : undefined,
        }, null, 2),
      }],
    };
  }

  private async handleSessionHistory(params: URLSearchParams) {
    const sessionId = params.get('session_id');
    const limit = params.get('limit') ? parseInt(params.get('limit')!) : undefined;

    if (!sessionId) {
      throw new McpError(ErrorCode.InvalidParams, 'session_id parameter is required');
    }

    const contexts = this.db.getContextsBySession(sessionId, limit);

    return {
      contents: [{
        uri: `memory://session-history?session_id=${sessionId}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          session_id: sessionId,
          contexts,
        }, null, 2),
      }],
    };
  }

  private async handleSearchContexts(params: URLSearchParams) {
    const query = params.get('query');
    const projectId = params.get('project_id');
    const limit = params.get('limit') ? parseInt(params.get('limit')!) : 20;

    if (!query) {
      throw new McpError(ErrorCode.InvalidParams, 'query parameter is required');
    }

    const contexts = this.db.searchContexts(query, projectId || undefined, limit);

    return {
      contents: [{
        uri: `memory://search-contexts?query=${encodeURIComponent(query)}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          query,
          results: contexts,
        }, null, 2),
      }],
    };
  }

  private async handleStats() {
    const stats = this.db.getStats();

    return {
      contents: [{
        uri: 'memory://stats',
        mimeType: 'application/json',
        text: JSON.stringify(stats, null, 2),
      }],
    };
  }

  // Tool handlers
  private async handleCreateSession(args: SessionCreateParams) {
    try {
      const sessionId = await this.sessionManager.createSession(args);
      const session = this.db.getSession(sessionId);

      return {
        content: [{
          type: 'text',
          text: `Created new session: ${sessionId}`,
        }],
        isError: false,
        _meta: {
          session_id: sessionId,
          session: session,
        },
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async handleRecordContext(args: RecordContextParams) {
    try {
      const extractedContext = this.contentExtractor.extractCodeContext(
        args.content,
        args.file_path,
        args.line_start,
        args.line_end
      );

      const contextId = this.db.createContext({
        session_id: args.session_id,
        type: args.type,
        content: args.content,
        file_path: args.file_path,
        line_start: args.line_start,
        line_end: args.line_end,
        language: args.language || extractedContext.language,
        tags: (args.tags || extractedContext.tags).join(','),
        quality_score: extractedContext.quality_score,
        metadata: JSON.stringify(args.metadata || extractedContext.metadata),
      });

      // 异步生成embedding（不阻塞响应）
      if (this.vectorSearch && this.config.vector_search?.enabled) {
        // 确保数据库仍然可用
        if (this.db && this.db.isConnected()) {
          this.generateEmbeddingForContext(contextId, args.content).catch(error => {
            console.error(`Failed to generate embedding for context ${contextId}:`, error);
          });
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Recorded context: ${contextId}`,
        }],
        isError: false,
        _meta: {
          context_id: contextId,
          quality_score: extractedContext.quality_score,
          embedding_enabled: !!(this.vectorSearch && this.config.vector_search?.enabled),
        },
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to record context: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  // 辅助方法：为单个context生成embedding
  private async generateEmbeddingForContext(contextId: string, content: string): Promise<void> {
    if (!this.vectorSearch) return;
    
    try {
      // 检查数据库是否仍然可用
      if (!this.db || !this.db.isConnected()) {
        console.error('Database connection is closed, skipping embedding generation');
        return;
      }
      
      await this.vectorSearch.initialize();
      const embedding = await this.vectorSearch.generateEmbedding(content);
      const embeddingText = JSON.stringify(embedding);
      
      this.db.updateContextEmbedding(contextId, embedding, embeddingText, 'v1.0');
    } catch (error) {
      throw error;
    }
  }

  private async handleEndSession(args: { session_id: string }) {
    try {
      this.sessionManager.endSession(args.session_id);

      return {
        content: [{
          type: 'text',
          text: `Ended session: ${args.session_id}`,
        }],
        isError: false,
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to end session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async handleGetCurrentSession(args: { project_path: string }) {
    try {
      const sessionId = await this.sessionManager.getCurrentSession(args.project_path);
      
      if (sessionId) {
        const session = this.db.getSession(sessionId);
        return {
          content: [{
            type: 'text',
            text: `Current session: ${sessionId}`,
          }],
          isError: false,
          _meta: {
            session_id: sessionId,
            session: session,
          },
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: 'No active session found for this project',
          }],
          isError: false,
          _meta: {
            session_id: null,
          },
        };
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to get current session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async handleExtractFileContext(args: { file_path: string; session_id?: string; record?: boolean }) {
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
            tags: context.tags.join(','),
            quality_score: context.quality_score,
            metadata: JSON.stringify(context.metadata),
          });
          results.push({ ...context, context_id: contextId });
        } else {
          results.push(context);
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Extracted ${results.length} contexts from ${args.file_path}${args.record ? ' and recorded them' : ''}`,
        }],
        isError: false,
        _meta: {
          contexts: results,
          file_path: args.file_path,
        },
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to extract file context: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  private async handleGetRelatedContexts(args: { context_id: string; relation_type?: string }) {
    try {
      const relatedContexts = this.db.getRelatedContexts(
        args.context_id, 
        args.relation_type as any
      );

      return {
        content: [{
          type: 'text',
          text: `Found ${relatedContexts.length} related contexts`,
        }],
        isError: false,
        _meta: {
          context_id: args.context_id,
          related_contexts: relatedContexts,
        },
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to get related contexts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
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
          content: [{
            type: 'text',
            text: 'Semantic search is not enabled. Please enable vector_search in configuration.',
          }],
          isError: true,
        };
      }

      // 加载模型如果尚未初始化
      await this.vectorSearch.initialize();

      // 获取用于搜索的contexts
      const allContexts = this.db.getContextsForVectorSearch(args.project_id, args.session_id);
      
      if (allContexts.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No contexts with embeddings found. Try running generate_embeddings first.',
          }],
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
        similarity_threshold: args.similarity_threshold || this.config.vector_search?.similarity_threshold || 0.5,
        hybrid_weight: args.hybrid_weight || this.config.vector_search?.hybrid_weight || 0.7,
      };

      // 获取关键词搜索结果作为基线
      const keywordResults = this.db.searchContexts(args.query, args.project_id, searchParams.limit);
      
      // 执行混合搜索
      const results = await this.vectorSearch.hybridSearch(
        args.query,
        keywordResults,
        allContexts,
        searchParams
      );

      return {
        content: [{
          type: 'text',
          text: `Found ${results.length} semantically relevant contexts for query: "${args.query}"`,
        }],
        isError: false,
        _meta: {
          query: args.query,
          total_contexts_searched: allContexts.length,
          results: results.map(r => ({
            ...r,
            similarity: r.similarity,
            hybrid_score: r.hybrid_score,
          })),
          search_params: searchParams,
        },
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to perform semantic search: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
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
          content: [{
            type: 'text',
            text: 'Vector search is not enabled. Please enable vector_search in configuration.',
          }],
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
        contexts = this.db.getContextsForVectorSearch(args.project_id).slice(0, limit);
      } else {
        // 否则只获取没有embedding的contexts
        contexts = this.db.getContextsWithoutEmbedding(limit);
        
        // 如果指定了project_id，进一步过滤
        if (args.project_id) {
          const projectContexts = this.db.getContextsForVectorSearch(args.project_id);
          const projectContextIds = new Set(projectContexts.map(c => c.id));
          contexts = contexts.filter(c => projectContextIds.has(c.id));
        }
      }

      if (contexts.length === 0) {
        return {
          content: [{
            type: 'text',
            text: args.force_update 
              ? 'No contexts found to update embeddings for.'
              : 'All contexts already have embeddings. Use force_update=true to regenerate.',
          }],
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
          const embedding = await this.vectorSearch.generateEmbedding(context.content);
          const embeddingText = JSON.stringify(embedding);
          
          this.db.updateContextEmbedding(
            context.id,
            embedding,
            embeddingText,
            'v1.0'
          );
          
          processed++;
        } catch (error) {
          console.error(`Failed to generate embedding for context ${context.id}:`, error);
          errors++;
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Successfully generated embeddings for ${processed} contexts${errors > 0 ? ` (${errors} errors)` : ''}.`,
        }],
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
        content: [{
          type: 'text',
          text: `Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        isError: true,
      };
    }
  }

  // Prompt handlers
  private async handleContextSummary(args: any) {
    const projectId = args?.project_id;
    const sessionLimit = args?.session_limit || 5;

    if (!projectId) {
      throw new McpError(ErrorCode.InvalidParams, 'project_id argument is required');
    }

    // This would generate a comprehensive project context summary
    const prompt = `You are an AI assistant helping to summarize project context. 

Based on the stored contexts for project ${projectId}, provide a comprehensive summary that includes:

1. **Project Overview**: Main technologies, frameworks, and architecture
2. **Recent Development**: Key changes and developments in the last ${sessionLimit} sessions
3. **Current State**: What the project does, key components, and structure
4. **Key Patterns**: Common code patterns, architectural decisions
5. **Outstanding Issues**: Any unresolved errors or TODOs

Please provide a clear, structured summary that would help a developer quickly understand the project's current state and context.`;

    return {
      description: 'Generate a comprehensive project context summary',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt,
          },
        },
      ],
    };
  }

  private async handleCodeExplanation(args: any) {
    const contextId = args?.context_id;
    const detailLevel = args?.detail_level || 'detailed';

    if (!contextId) {
      throw new McpError(ErrorCode.InvalidParams, 'context_id argument is required');
    }

    const prompt = `You are an AI assistant helping to explain code. 

Please provide a ${detailLevel} explanation of the code context with ID: ${contextId}

Based on the detail level "${detailLevel}":
- **brief**: High-level overview of what the code does
- **detailed**: Explain the logic, key functions, and important patterns
- **comprehensive**: Deep dive into implementation details, design patterns, and relationships

Focus on making the explanation clear and educational.`;

    return {
      description: `Generate ${detailLevel} code explanation`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt,
          },
        },
      ],
    };
  }

  private async handleSolutionRecommendation(args: any) {
    const errorContextId = args?.error_context_id;
    const includeSimilar = args?.include_similar !== false;

    if (!errorContextId) {
      throw new McpError(ErrorCode.InvalidParams, 'error_context_id argument is required');
    }

    const prompt = `You are an AI assistant helping to recommend solutions for programming errors.

Based on the error context with ID: ${errorContextId}${includeSimilar ? ' and similar resolved problems in the memory' : ''}:

1. **Error Analysis**: Analyze the error and its likely causes
2. **Solution Steps**: Provide step-by-step solution recommendations
3. **Code Examples**: Include relevant code examples if needed
4. **Prevention**: Suggest how to prevent similar issues in the future
${includeSimilar ? '5. **Similar Cases**: Reference similar problems that were resolved before' : ''}

Provide practical, actionable solutions that can be immediately applied.`;

    return {
      description: 'Generate solution recommendations for an error',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt,
          },
        },
      ],
    };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  private scheduleAutoMonitoring(): void {
    // 延迟启动自动监控，确保不阻塞MCP服务器启动
    setTimeout(async () => {
      await this.startAutoMonitoring();
    }, 1000); // 1秒后启动
  }

  private async startAutoMonitoring(): Promise<void> {
    // 改进的工作目录检测 - 优先使用环境变量
    const potentialDirs = [
      process.env.INIT_CWD,        // npm/npx初始目录 
      process.env.PWD,             // Unix工作目录
      process.env.CD,              // Windows当前目录
      process.cwd()                // 最后兜底
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
      'package.json',
      '.git',
      'src',
      'index.js',
      'main.py',
      'Cargo.toml',
      'go.mod',
      'pom.xml',
      '.project',
      'composer.json'
    ];
    
    return projectIndicators.some(indicator => 
      existsSync(join(dirPath, indicator))
    );
  }
  
  private async setupProjectMonitoring(projectPath: string): Promise<void> {
    try {
      // 检查是否已有活跃会话
      let sessionId = await this.findOrCreateActiveSession(projectPath);
      
      if (!sessionId) {
        // 创建新会话
        const sessionResult = await this.handleCreateSession({
          project_path: projectPath,
          tool_used: 'mcp-auto',
          name: `DevMind Auto - ${new Date().toLocaleDateString()}`
        });
        
        if (!sessionResult.isError && sessionResult._meta?.session_id) {
          sessionId = sessionResult._meta.session_id;
        }
      }
      
      if (sessionId) {
        // 为新项目创建初始欢迎记忆内容
        await this.createInitialProjectContext(sessionId, projectPath);
        
        // 启动文件监控
        this.startFileWatcher(projectPath, sessionId);
      }
    } catch (error) {
      // 静默失败，不影响MCP服务器启动
    }
  }
  
  private async findOrCreateActiveSession(projectPath: string): Promise<string | null> {
    try {
      // 首先获取或创建项目
      const project = await this.sessionManager.getOrCreateProject(projectPath);
      
      // 查找活跃会话
      const activeSessions = this.db.getActiveSessions(project.id);
      
      // 如果有活跃的MCP自动会话，直接使用
      const autoSession = activeSessions.find(s => s.tool_used === 'mcp-auto');
      if (autoSession) {
        return autoSession.id;
      }
      
      // 如果没有自动会话，但有其他活跃会话，也可以使用
      if (activeSessions.length > 0) {
        return activeSessions[0].id;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
  
  private startFileWatcher(projectPath: string, sessionId: string): void {
    // 简化的文件监控器
    const patterns = [
      '**/*.{js,ts,jsx,tsx,py,go,rs,java,kt}',
      '**/package.json',
      '**/*.md'
    ];
    
    try {
      const { watch } = require('chokidar');
      
      const watcher = watch(patterns, {
        cwd: projectPath,
        ignored: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/.git/**',
          '**/*.log'
        ],
        persistent: false, // 不阻止进程退出
        ignoreInitial: true
      });
      
      watcher
        .on('change', (filePath: string) => {
          this.handleAutoFileChange(sessionId, 'change', filePath, projectPath);
        })
        .on('add', (filePath: string) => {
          this.handleAutoFileChange(sessionId, 'add', filePath, projectPath);
        });
        
    } catch (error) {
      // chokidar不可用，静默失败
    }
  }
  
  private async handleAutoFileChange(sessionId: string, action: string, filePath: string, projectPath: string): Promise<void> {
    try {
      const fullPath = join(projectPath, filePath);
      let content = '';
      
      if (existsSync(fullPath)) {
        const fileContent = readFileSync(fullPath, 'utf8');
        // 限制内容长度
        content = fileContent.length > 2000 
          ? fileContent.substring(0, 2000) + '\n... (truncated)'
          : fileContent;
      }
      
      await this.handleRecordContext({
        session_id: sessionId,
        type: ContextType.CODE,
        content: `[AUTO-${action.toUpperCase()}] ${filePath}\n\n${content}`,
        file_path: filePath,
        tags: ['auto', action, filePath.split('.').pop() || 'unknown']
      });
    } catch (error) {
      // 静默失败
    }
  }
  
  private async createInitialProjectContext(sessionId: string, projectPath: string): Promise<void> {
    try {
      // 检查是否已有上下文记录
      const existingContexts = this.db.getContextsBySession(sessionId, 1);
      if (existingContexts.length > 0) {
        return; // 已有记录，无需创建初始内容
      }
      
      // 获取项目信息
      const projectName = require('path').basename(projectPath);
      const project = await this.sessionManager.getOrCreateProject(projectPath);
      
      const welcomeContent = `# DevMind Memory Initialized

Welcome to **${projectName}** development session!

## Project Details
- **Path**: ${projectPath}
- **Language**: ${project?.language || 'Auto-detected'}
- **Framework**: ${project?.framework || 'N/A'}
- **Session Started**: ${new Date().toLocaleString()}

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
        tags: ['initialization', 'welcome', 'project-info', 'auto-generated'],
        metadata: {
          created_by: 'devmind-auto',
          is_initial: true,
          project_name: projectName
        }
      });
    } catch (error) {
      // 静默失败，不影响项目监控启动
    }
  }

  // Context management handlers
  private async handleListContexts(args: { session_id?: string; project_id?: string; limit?: number }) {
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
          const sessionContexts = this.db.getContextsBySession(session.id, limit);
          contexts.push(...sessionContexts);
        }
        // Sort by created_at and limit
        contexts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        contexts = contexts.slice(0, limit);
      } else {
        throw new McpError(ErrorCode.InvalidParams, 'Either session_id or project_id is required');
      }
      
      // Format contexts for display
      const formattedContexts = contexts.map(ctx => ({
        id: ctx.id,
        type: ctx.type,
        content_preview: ctx.content.substring(0, 100) + (ctx.content.length > 100 ? '...' : ''),
        tags: ctx.tags ? ctx.tags.split(',').filter((t: string) => t.trim()) : [],
        quality_score: ctx.quality_score,
        created_at: ctx.created_at,
        file_path: ctx.file_path,
        session_id: ctx.session_id
      }));
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${formattedContexts.length} contexts:\n\n` +
                  formattedContexts.map((ctx, i) => 
                    `${i + 1}. **ID**: ${ctx.id}\n` +
                    `   **Type**: ${ctx.type}\n` +
                    `   **Content**: ${ctx.content_preview}\n` +
                    `   **Tags**: ${ctx.tags.join(', ') || 'None'}\n` +
                    `   **Quality**: ${ctx.quality_score}\n` +
                    `   **Created**: ${ctx.created_at}\n` +
                    `   **File**: ${ctx.file_path || 'N/A'}\n`
                  ).join('\n')
          }
        ],
        _meta: {
          total_contexts: formattedContexts.length,
          contexts: formattedContexts
        }
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to list contexts: ${error}` }],
        isError: true
      };
    }
  }
  
  private async handleDeleteContext(args: { context_id: string }) {
    try {
      // First check if context exists
      const context = this.db.getContextById(args.context_id);
      if (!context) {
        throw new McpError(ErrorCode.InvalidParams, `Context with ID ${args.context_id} not found`);
      }
      
      // Delete the context
      const deleted = this.db.deleteContext(args.context_id);
      
      if (deleted) {
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted context: ${args.context_id}\n` +
                    `Type: ${context.type}\n` +
                    `Content: ${context.content.substring(0, 100)}...`
            }
          ],
          _meta: {
            deleted_context_id: args.context_id,
            success: true
          }
        };
      } else {
        throw new Error('Delete operation failed');
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to delete context: ${error}` }],
        isError: true
      };
    }
  }
  
  private async handleUpdateContext(args: { 
    context_id: string;
    content?: string;
    tags?: string[];
    quality_score?: number;
    metadata?: object;
  }) {
    try {
      // First check if context exists
      const context = this.db.getContextById(args.context_id);
      if (!context) {
        throw new McpError(ErrorCode.InvalidParams, `Context with ID ${args.context_id} not found`);
      }
      
      // Prepare updates
      const updates: any = {};
      if (args.content !== undefined) updates.content = args.content;
      if (args.tags !== undefined) updates.tags = args.tags.join(',');
      if (args.quality_score !== undefined) updates.quality_score = args.quality_score;
      if (args.metadata !== undefined) updates.metadata = args.metadata;
      
      // Update the context
      const updated = this.db.updateContext(args.context_id, updates);
      
      if (updated) {
        const updatedContext = this.db.getContextById(args.context_id);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully updated context: ${args.context_id}\n` +
                    `Type: ${updatedContext?.type}\n` +
                    `Updated fields: ${Object.keys(updates).join(', ')}\n` +
                    `Content: ${updatedContext?.content.substring(0, 100)}...`
            }
          ],
          _meta: {
            updated_context_id: args.context_id,
            updated_fields: Object.keys(updates),
            success: true
          }
        };
      } else {
        throw new Error('Update operation failed');
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to update context: ${error}` }],
        isError: true
      };
    }
  }
  
  private async handleDeleteSession(args: { session_id: string }) {
    try {
      // First check if session exists and get context count
      const session = this.db.getSession(args.session_id);
      if (!session) {
        throw new McpError(ErrorCode.InvalidParams, `Session with ID ${args.session_id} not found`);
      }
      
      const contexts = this.db.getContextsBySession(args.session_id);
      const contextCount = contexts.length;
      
      // Delete the session (this will cascade delete all contexts due to foreign key constraint)
      const deleted = this.db.deleteSession(args.session_id);
      
      if (deleted) {
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted session: ${args.session_id}\n` +
                    `Name: ${session.name}\n` +
                    `Contexts deleted: ${contextCount}\n` +
                    `⚠️  This action cannot be undone!`
            }
          ],
          _meta: {
            deleted_session_id: args.session_id,
            deleted_contexts_count: contextCount,
            success: true
          }
        };
      } else {
        throw new Error('Delete operation failed');
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to delete session: ${error}` }],
        isError: true
      };
    }
  }

  async close(): Promise<void> {
    this.db.close();
    await this.server.close();
  }
}
