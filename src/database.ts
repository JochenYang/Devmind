import Database from "better-sqlite3";
import {
  Project,
  Session,
  Context,
  Relationship,
  ContextType,
  RelationType,
} from "./types.js";
import { ContextFileManager } from "./context-file-manager.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseManager {
  private db: Database.Database;
  private _contextFileManager?: ContextFileManager;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // Enable foreign key constraints
    this.db.pragma("foreign_keys = ON");
    this.initializeTables();
    this.createIndexes();

    // 自动迁移到多文件支持
    if (this.needsContextFilesMigration()) {
      console.error("[DevMind] Migrating to multi-file support...");
      this.migrateToContextFiles();
      console.error("[DevMind] Migration completed successfully");
    }
  }

  // 延迟初始化 ContextFileManager
  private get contextFileManager(): ContextFileManager {
    if (!this._contextFileManager) {
      this._contextFileManager = new ContextFileManager(this);
    }
    return this._contextFileManager;
  }

  private initializeTables() {
    // Projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        git_remote_url TEXT,
        language TEXT NOT NULL,
        framework TEXT,
        created_at TEXT NOT NULL,
        last_accessed TEXT NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        tool_used TEXT NOT NULL,
        status TEXT CHECK(status IN ('active', 'completed', 'paused')) DEFAULT 'active',
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
      )
    `);

    // Contexts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        file_path TEXT,
        line_start INTEGER,
        line_end INTEGER,
        language TEXT,
        tags TEXT DEFAULT '',
        quality_score REAL DEFAULT 0.5,
        created_at TEXT NOT NULL,
        embedding BLOB,
        embedding_text TEXT,
        embedding_version TEXT DEFAULT 'v1.0',
        embedding_model TEXT DEFAULT 'Xenova/all-MiniLM-L6-v2',
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    // Relationships table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        from_context_id TEXT NOT NULL,
        to_context_id TEXT NOT NULL,
        type TEXT NOT NULL,
        strength REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (from_context_id) REFERENCES contexts (id) ON DELETE CASCADE,
        FOREIGN KEY (to_context_id) REFERENCES contexts (id) ON DELETE CASCADE,
        UNIQUE(from_context_id, to_context_id, type)
      )
    `);

    // File Index table (Codebase indexing)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_index (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        content TEXT NOT NULL,
        language TEXT,
        file_type TEXT,
        size INTEGER NOT NULL,
        modified_time TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        hash TEXT NOT NULL,
        tags TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE,
        UNIQUE(project_id, relative_path)
      )
    `);

    // Context Files table (多文件关联)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS context_files (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        change_type TEXT CHECK(change_type IN ('add', 'modify', 'delete', 'refactor', 'rename')),
        line_ranges TEXT,
        diff_stats TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (context_id) REFERENCES contexts (id) ON DELETE CASCADE
      )
    `);

    // Learning parameters table (智能记忆学习参数)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learning_parameters (
        id TEXT PRIMARY KEY,
        parameter_type TEXT NOT NULL CHECK(parameter_type IN ('threshold', 'weight', 'pattern')),
        parameter_name TEXT NOT NULL,
        parameter_value REAL NOT NULL,
        updated_at TEXT NOT NULL,
        update_reason TEXT,
        previous_value REAL,
        UNIQUE(parameter_type, parameter_name)
      )
    `);

    // User feedback table (用户反馈学习)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        feedback_action TEXT NOT NULL CHECK(feedback_action IN ('accepted', 'rejected', 'modified')),
        process_type TEXT,
        value_score REAL,
        user_comment TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (context_id) REFERENCES contexts (id) ON DELETE CASCADE
      )
    `);

    // 数据库迁移：添加 auto_memory_metadata 字段
    this.migrateDatabase();
  }

  /**
   * 数据库迁移逻辑
   */
  private migrateDatabase() {
    try {
      // 检查 contexts 表是否有 auto_memory_metadata 字段
      const tableInfo = this.db
        .prepare("PRAGMA table_info(contexts)")
        .all() as Array<{ name: string }>;

      const hasAutoMemoryMetadata = tableInfo.some(
        (col) => col.name === "auto_memory_metadata"
      );

      if (!hasAutoMemoryMetadata) {
        console.log(
          "[DevMind] Migrating database: Adding auto_memory_metadata field to contexts table..."
        );
        this.db.exec(`
          ALTER TABLE contexts 
          ADD COLUMN auto_memory_metadata TEXT DEFAULT NULL
        `);
        console.log("[DevMind] Database migration completed successfully.");
      }
    } catch (error) {
      console.error("[DevMind] Database migration failed:", error);
      // 不抛出错误，允许系统继续运行
    }
  }

  private createIndexes() {
    // 性能优化索引
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_projects_path ON projects (path)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions (project_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_contexts_session ON contexts (session_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_contexts_type ON contexts (type)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_contexts_file ON contexts (file_path)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_contexts_quality ON contexts (quality_score)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_contexts_embedding_version ON contexts (embedding_version)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_contexts_embedding_model ON contexts (embedding_model)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships (from_context_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships (to_context_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_context_files_context ON context_files (context_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_context_files_path ON context_files (file_path)`
    );

    // File Index indexes
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_file_index_project ON file_index (project_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_file_index_session ON file_index (session_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_file_index_path ON file_index (relative_path)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_file_index_language ON file_index (language)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_file_index_modified ON file_index (modified_time)`
    );

    // 智能记忆相关索引
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_learning_param_type ON learning_parameters (parameter_type)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_feedback_context ON user_feedback (context_id)`
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_feedback_action ON user_feedback (feedback_action)`
    );

    // 全文搜索索引
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS contexts_fts USING fts5(
        id,
        content,
        tags,
        content='contexts',
        content_rowid='rowid'
      )
    `);

    // 触发器保持FTS同步
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS contexts_ai AFTER INSERT ON contexts BEGIN
        INSERT INTO contexts_fts(rowid, id, content, tags) 
        VALUES (new.rowid, new.id, new.content, new.tags);
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS contexts_ad AFTER DELETE ON contexts BEGIN
        INSERT INTO contexts_fts(contexts_fts, rowid, id, content, tags) 
        VALUES('delete', old.rowid, old.id, old.content, old.tags);
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS contexts_au AFTER UPDATE ON contexts BEGIN
        INSERT INTO contexts_fts(contexts_fts, rowid, id, content, tags) 
        VALUES('delete', old.rowid, old.id, old.content, old.tags);
        INSERT INTO contexts_fts(rowid, id, content, tags) 
        VALUES (new.rowid, new.id, new.content, new.tags);
      END;
    `);
  }

  // Project operations
  createProject(
    project: Omit<Project, "id" | "created_at" | "last_accessed">
  ): string {
    const id = this.generateId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, path, git_remote_url, language, framework, created_at, last_accessed, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      project.name,
      project.path,
      project.git_remote_url,
      project.language,
      project.framework,
      now,
      now,
      project.metadata || "{}"
    );

    return id;
  }

  getProjectByPath(path: string): Project | null {
    const stmt = this.db.prepare("SELECT * FROM projects WHERE path = ?");
    return stmt.get(path) as Project | null;
  }

  getProject(projectId: string): Project | null {
    const stmt = this.db.prepare("SELECT * FROM projects WHERE id = ?");
    return stmt.get(projectId) as Project | null;
  }

  updateProjectAccess(projectId: string): void {
    const stmt = this.db.prepare(
      "UPDATE projects SET last_accessed = ? WHERE id = ?"
    );
    stmt.run(new Date().toISOString(), projectId);
  }

  getContextsByProject(projectId: string): Context[] {
    const stmt = this.db.prepare(`
      SELECT c.* FROM contexts c
      JOIN sessions s ON c.session_id = s.id
      WHERE s.project_id = ?
      ORDER BY c.created_at DESC
    `);
    return stmt.all(projectId) as Context[];
  }

  getSessionsByProject(projectId: string): Session[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE project_id = ?
      ORDER BY started_at DESC
    `);
    return stmt.all(projectId) as Session[];
  }

  getAllProjects(limit?: number): Project[] {
    const sql = `
      SELECT * FROM projects
      ORDER BY last_accessed DESC, created_at DESC
      ${limit ? "LIMIT ?" : ""}
    `;
    const stmt = this.db.prepare(sql);
    return (limit ? stmt.all(limit) : stmt.all()) as Project[];
  }

  /**
   * Get empty projects (projects with no contexts)
   */
  getEmptyProjects(): Array<Project & { session_count: number }> {
    const stmt = this.db.prepare(`
      SELECT 
        p.*,
        COUNT(DISTINCT s.id) as session_count
      FROM projects p
      LEFT JOIN sessions s ON p.id = s.project_id
      LEFT JOIN contexts c ON s.id = c.session_id
      GROUP BY p.id
      HAVING COUNT(c.id) = 0
      ORDER BY p.last_accessed DESC
    `);
    return stmt.all() as Array<Project & { session_count: number }>;
  }

  /**
   * Delete a project and all its sessions/contexts
   */
  deleteProject(projectId: string): {
    success: boolean;
    deleted_sessions: number;
    deleted_contexts: number;
  } {
    const transaction = this.db.transaction(() => {
      // Get counts before deletion
      const sessions = this.getSessionsByProject(projectId);
      let totalContexts = 0;

      for (const session of sessions) {
        const contexts = this.getContextsBySession(session.id);
        totalContexts += contexts.length;
      }

      // Delete project (cascade will delete sessions and contexts)
      const stmt = this.db.prepare("DELETE FROM projects WHERE id = ?");
      stmt.run(projectId);

      return {
        success: true,
        deleted_sessions: sessions.length,
        deleted_contexts: totalContexts,
      };
    });

    return transaction();
  }

  /**
   * Delete multiple projects in batch
   */
  deleteProjects(projectIds: string[]): {
    success: boolean;
    deleted_projects: number;
    deleted_sessions: number;
    deleted_contexts: number;
  } {
    const transaction = this.db.transaction(() => {
      let totalSessions = 0;
      let totalContexts = 0;

      for (const projectId of projectIds) {
        const sessions = this.getSessionsByProject(projectId);
        totalSessions += sessions.length;

        for (const session of sessions) {
          const contexts = this.getContextsBySession(session.id);
          totalContexts += contexts.length;
        }
      }

      // Delete all projects
      const placeholders = projectIds.map(() => "?").join(",");
      const stmt = this.db.prepare(
        `DELETE FROM projects WHERE id IN (${placeholders})`
      );
      stmt.run(...projectIds);

      return {
        success: true,
        deleted_projects: projectIds.length,
        deleted_sessions: totalSessions,
        deleted_contexts: totalContexts,
      };
    });

    return transaction();
  }

  getProjectSessions(projectId: string): Session[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE project_id = ?
      ORDER BY started_at DESC
    `);
    return stmt.all(projectId) as Session[];
  }

  getProjectContextsCount(projectId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM contexts c
      JOIN sessions s ON c.session_id = s.id
      WHERE s.project_id = ?
    `);
    const result = stmt.get(projectId) as { count: number };
    return result.count;
  }

  // Session operations
  createSession(session: Omit<Session, "id" | "started_at">): string {
    const id = this.generateId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, project_id, name, started_at, tool_used, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      session.project_id,
      session.name,
      now,
      session.tool_used,
      session.status || "active",
      session.metadata || "{}"
    );

    return id;
  }

  getSession(
    sessionId: string
  ): (Session & { started_at_local?: string; ended_at_local?: string }) | null {
    const stmt = this.db.prepare("SELECT * FROM sessions WHERE id = ?");
    const session = stmt.get(sessionId) as Session | null;
    return session ? this.enrichSessionWithLocalTime(session) : null;
  }

  getActiveSessions(
    projectId: string
  ): Array<Session & { started_at_local?: string; ended_at_local?: string }> {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE project_id = ? AND status = 'active'
      ORDER BY started_at DESC
    `);
    const sessions = stmt.all(projectId) as Session[];
    return sessions.map((s) => this.enrichSessionWithLocalTime(s));
  }

  endSession(sessionId: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET status = 'completed', ended_at = ?
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), sessionId);
  }

  updateSession(
    sessionId: string,
    updates: Partial<Pick<Session, "name" | "tool_used" | "metadata">>
  ): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.tool_used !== undefined) {
      fields.push("tool_used = ?");
      values.push(updates.tool_used);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(
        typeof updates.metadata === "string"
          ? updates.metadata
          : JSON.stringify(updates.metadata)
      );
    }

    if (fields.length === 0) {
      return false; // 没有更新内容
    }

    values.push(sessionId);
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET ${fields.join(", ")}
      WHERE id = ?
    `);
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  reactivateSession(sessionId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET status = 'active', ended_at = NULL 
      WHERE id = ?
    `);
    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  getProjectMainSession(
    projectId: string
  ): (Session & { started_at_local?: string; ended_at_local?: string }) | null {
    // 查找项目的最早会话作为主会话
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE project_id = ?
      ORDER BY started_at ASC
      LIMIT 1
    `);
    const session = stmt.get(projectId) as Session | null;
    return session ? this.enrichSessionWithLocalTime(session) : null;
  }

  // Context operations
  createContext(context: Omit<Context, "id" | "created_at">): string {
    // 防止并发重复记录：检查最近5秒内是否有相同内容
    const dedupeCheck = this.db.prepare(`
      SELECT id FROM contexts
      WHERE session_id = ?
        AND type = ?
        AND content = ?
        AND created_at > datetime('now', '-5 seconds')
      LIMIT 1
    `);

    const existing = dedupeCheck.get(
      context.session_id,
      context.type,
      context.content
    ) as { id: string } | undefined;

    if (existing) {
      // 已存在相同记录，返回现有ID，避免重复
      console.log(
        `[Database] Skipped duplicate context (existing: ${existing.id})`
      );
      return existing.id;
    }

    const id = this.generateId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO contexts (
        id, session_id, type, content, file_path, line_start, line_end,
        language, tags, quality_score, created_at, embedding, 
        embedding_text, embedding_version, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      context.session_id,
      context.type,
      context.content,
      context.file_path,
      context.line_start,
      context.line_end,
      context.language,
      context.tags,
      context.quality_score,
      now,
      context.embedding,
      context.embedding_text,
      context.embedding_version || "v1.0",
      context.metadata || "{}"
    );

    // 如果有 file_path，自动创建文件关联
    if (context.file_path && this.contextFileManager) {
      const lineRanges =
        context.line_start && context.line_end
          ? [[context.line_start, context.line_end]]
          : undefined;

      this.contextFileManager.addFiles(id, [
        {
          file_path: context.file_path,
          change_type: undefined,
          line_ranges: lineRanges,
          diff_stats: undefined,
        },
      ]);
    }

    return id;
  }

  getContextsBySession(
    sessionId: string,
    limit?: number
  ): Array<Context & { created_at_local?: string }> {
    const sql = `
      SELECT * FROM contexts
      WHERE session_id = ?
      ORDER BY created_at DESC
      ${limit ? "LIMIT ?" : ""}
    `;

    const stmt = this.db.prepare(sql);
    const params = limit ? [sessionId, limit] : [sessionId];
    const contexts = stmt.all(...params) as Context[];
    return contexts.map((c) => this.enrichContextWithLocalTime(c));
  }

  getContextById(
    contextId: string
  ): (Context & { created_at_local?: string }) | null {
    const stmt = this.db.prepare("SELECT * FROM contexts WHERE id = ?");
    const context = stmt.get(contextId) as Context | null;
    return context ? this.enrichContextWithLocalTime(context) : null;
  }

  deleteContext(contextId: string): boolean {
    const stmt = this.db.prepare("DELETE FROM contexts WHERE id = ?");
    const result = stmt.run(contextId);

    // 每删除10个上下文后自动清理数据库
    if (result.changes > 0) {
      this.incrementDeleteCounter();
    }

    return result.changes > 0;
  }

  private deleteCounter = 0;
  private incrementDeleteCounter(): void {
    this.deleteCounter++;
    if (this.deleteCounter >= 10) {
      this.deleteCounter = 0;
      // 异步执行 VACUUM，不阻塞删除操作
      setImmediate(() => {
        try {
          this.vacuum();
        } catch (error) {
          // 静默失败，不影响主流程
        }
      });
    }
  }

  updateContext(
    contextId: string,
    updates: Partial<
      Pick<Context, "content" | "tags" | "quality_score" | "metadata">
    >
  ): boolean {
    const fields = [];
    const values = [];

    if (updates.content !== undefined) {
      fields.push("content = ?");
      values.push(updates.content);
    }
    if (updates.tags !== undefined) {
      fields.push("tags = ?");
      values.push(updates.tags);
    }
    if (updates.quality_score !== undefined) {
      fields.push("quality_score = ?");
      values.push(updates.quality_score);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(
        typeof updates.metadata === "string"
          ? updates.metadata
          : JSON.stringify(updates.metadata)
      );
    }

    if (fields.length === 0) return false;

    const sql = `UPDATE contexts SET ${fields.join(", ")} WHERE id = ?`;
    values.push(contextId);

    const stmt = this.db.prepare(sql);
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * 增加context的引用计数 (用于质量评分)
   */
  incrementContextReference(contextId: string): boolean {
    const context = this.getContextById(contextId);
    if (!context) return false;

    const metadata = context.metadata ? JSON.parse(context.metadata) : {};
    const qualityMetrics = metadata.quality_metrics || {};

    qualityMetrics.reference_count = (qualityMetrics.reference_count || 0) + 1;
    qualityMetrics.last_accessed = new Date().toISOString();
    metadata.quality_metrics = qualityMetrics;

    return this.updateContext(contextId, {
      metadata: JSON.stringify(metadata),
    });
  }

  /**
   * 记录context被搜索命中 (用于质量评分)
   */
  recordContextSearch(contextId: string): boolean {
    const context = this.getContextById(contextId);
    if (!context) return false;

    const metadata = context.metadata ? JSON.parse(context.metadata) : {};
    const qualityMetrics = metadata.quality_metrics || {};

    qualityMetrics.search_count = (qualityMetrics.search_count || 0) + 1;
    qualityMetrics.last_accessed = new Date().toISOString();
    metadata.quality_metrics = qualityMetrics;

    return this.updateContext(contextId, {
      metadata: JSON.stringify(metadata),
    });
  }

  deleteSession(sessionId: string): boolean {
    // 由于外键约束，删除session会自动删除相关contexts
    const stmt = this.db.prepare("DELETE FROM sessions WHERE id = ?");
    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  /**
   * 清理 FTS5 查询字符串，移除或转义特殊字符
   * FTS5 特殊字符：- ( ) " * ^ $ [ ] { } 等
   */
  private sanitizeFTS5Query(query: string): string {
    if (!query || query.trim().length === 0) {
      return "";
    }

    // 移除或转义 FTS5 特殊字符
    // 保留：字母、数字、空格、中文字符、下划线
    let sanitized = query
      // 移除 FTS5 操作符字符
      .replace(/[-()"\*\^\$\[\]\{\}]/g, " ")
      // 移除多余的空格
      .replace(/\s+/g, " ")
      .trim();

    // 如果清理后为空，返回原始查询的字母数字部分
    if (sanitized.length === 0) {
      sanitized = query.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_]/g, " ").trim();
    }

    // 如果仍然为空，返回通配符（匹配所有）
    if (sanitized.length === 0) {
      return "*";
    }

    return sanitized;
  }

  searchContexts(
    query: string,
    projectId?: string,
    limit: number = 20
  ): Context[] {
    // 清理查询字符串，防止 FTS5 语法错误
    const sanitizedQuery = this.sanitizeFTS5Query(query);

    // 如果清理后的查询为空或只是通配符，使用普通查询
    if (!sanitizedQuery || sanitizedQuery === "*") {
      return this.searchContextsWithoutFTS(projectId, limit);
    }

    let sql = `
      SELECT c.* FROM contexts c
      JOIN contexts_fts fts ON c.rowid = fts.rowid
    `;

    const params: any[] = [sanitizedQuery];

    if (projectId) {
      sql += `
        JOIN sessions s ON c.session_id = s.id
        WHERE contexts_fts MATCH ? AND s.project_id = ?
      `;
      params.push(projectId);
    } else {
      sql += ` WHERE contexts_fts MATCH ?`;
    }

    sql += ` ORDER BY c.quality_score DESC LIMIT ?`;
    params.push(limit);

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as Context[];
    } catch (error) {
      // 如果 FTS5 查询仍然失败，降级到普通查询
      console.warn(
        `FTS5 query failed for "${sanitizedQuery}", falling back to non-FTS search:`,
        error
      );
      return this.searchContextsWithoutFTS(projectId, limit);
    }
  }

  /**
   * 不使用 FTS5 的备用查询方法
   */
  private searchContextsWithoutFTS(
    projectId?: string,
    limit: number = 20
  ): Context[] {
    let sql = `SELECT c.* FROM contexts c`;
    const params: any[] = [];

    if (projectId) {
      sql += `
        JOIN sessions s ON c.session_id = s.id
        WHERE s.project_id = ?
      `;
      params.push(projectId);
    }

    sql += ` ORDER BY c.created_at DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Context[];
  }

  // 向量搜索相关方法
  updateContextEmbedding(
    contextId: string,
    embedding: number[],
    embeddingText: string,
    version: string = "v1.0"
  ): void {
    const stmt = this.db.prepare(`
      UPDATE contexts 
      SET embedding = ?, embedding_text = ?, embedding_version = ?
      WHERE id = ?
    `);

    // 将embedding数组序列化为BLOB
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
    stmt.run(embeddingBuffer, embeddingText, version, contextId);
  }

  getContextsWithoutEmbedding(limit: number = 100): Context[] {
    const stmt = this.db.prepare(`
      SELECT * FROM contexts 
      WHERE embedding_text IS NULL OR embedding_text = ''
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Context[];
  }

  getContextsForVectorSearch(
    projectId?: string,
    sessionId?: string
  ): Context[] {
    let sql = `
      SELECT c.* FROM contexts c
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (projectId) {
      sql += ` JOIN sessions s ON c.session_id = s.id`;
      conditions.push("s.project_id = ?");
      params.push(projectId);
    }

    if (sessionId) {
      conditions.push("c.session_id = ?");
      params.push(sessionId);
    }

    conditions.push("c.embedding_text IS NOT NULL");
    conditions.push("c.embedding_text != ''");

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += ` ORDER BY c.created_at DESC`;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Context[];
  }

  /**
   * 获取用于向量搜索的代码库索引文件
   */
  getFileIndexForVectorSearch(
    projectId?: string,
    sessionId?: string
  ): Array<{
    id: string;
    project_id: string;
    session_id: string;
    file_path: string;
    relative_path: string;
    content: string;
    language?: string;
    file_type?: string;
    size: number;
    modified_time: string;
    indexed_at: string;
    hash: string;
    tags: string;
    metadata: string;
  }> {
    let sql = `
      SELECT fi.* FROM file_index fi
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (projectId) {
      conditions.push("fi.project_id = ?");
      params.push(projectId);
    }

    if (sessionId) {
      conditions.push("fi.session_id = ?");
      params.push(sessionId);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += ` ORDER BY fi.modified_time DESC`;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Array<{
      id: string;
      project_id: string;
      session_id: string;
      file_path: string;
      relative_path: string;
      content: string;
      language?: string;
      file_type?: string;
      size: number;
      modified_time: string;
      indexed_at: string;
      hash: string;
      tags: string;
      metadata: string;
    }>;
  }

  getEmbeddingStats(): {
    total: number;
    withEmbedding: number;
    embeddingModels: Array<{ model: string; count: number }>;
  } {
    const totalStmt = this.db.prepare("SELECT COUNT(*) as count FROM contexts");
    const withEmbeddingStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM contexts WHERE embedding_text IS NOT NULL AND embedding_text != ''"
    );
    const modelsStmt = this.db.prepare(`
      SELECT embedding_model as model, COUNT(*) as count 
      FROM contexts 
      WHERE embedding_text IS NOT NULL AND embedding_text != ''
      GROUP BY embedding_model
      ORDER BY count DESC
    `);

    return {
      total: (totalStmt.get() as { count: number }).count,
      withEmbedding: (withEmbeddingStmt.get() as { count: number }).count,
      embeddingModels: modelsStmt.all() as Array<{
        model: string;
        count: number;
      }>,
    };
  }

  // Relationship operations
  createRelationship(
    relationship: Omit<Relationship, "id" | "created_at">
  ): string {
    const id = this.generateId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO relationships (id, from_context_id, to_context_id, type, strength, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      relationship.from_context_id,
      relationship.to_context_id,
      relationship.type,
      relationship.strength,
      now
    );

    return id;
  }

  getRelatedContexts(contextId: string, type?: RelationType): Context[] {
    let sql = `
      SELECT c.* FROM contexts c
      JOIN relationships r ON c.id = r.to_context_id
      WHERE r.from_context_id = ?
    `;

    const params: any[] = [contextId];

    if (type) {
      sql += ` AND r.type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY r.strength DESC`;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Context[];
  }

  // Utility methods
  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * 将UTC时间转换为本地可读时间
   * @param utcTime ISO格式的UTC时间字符串
   * @returns 本地时间字符串，格式：YYYY-MM-DD HH:mm:ss
   */
  private formatLocalTime(utcTime: string): string {
    try {
      const date = new Date(utcTime);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return utcTime; // 如果转换失败，返回原始值
    }
  }

  /**
   * 为Session对象添加格式化的本地时间字段
   */
  private enrichSessionWithLocalTime(
    session: Session
  ): Session & { started_at_local?: string; ended_at_local?: string } {
    return {
      ...session,
      started_at_local: this.formatLocalTime(session.started_at),
      ended_at_local: session.ended_at
        ? this.formatLocalTime(session.ended_at)
        : undefined,
    };
  }

  /**
   * 为Context对象添加格式化的本地时间字段
   */
  private enrichContextWithLocalTime(
    context: Context
  ): Context & { created_at_local?: string } {
    return {
      ...context,
      created_at_local: this.formatLocalTime(context.created_at),
    };
  }

  // Optimization methods
  /**
   * 查找重复的上下文（内容完全相同）
   * @param projectId 项目ID
   * @returns 重复的上下文数组（保留质量分数较低的）
   */
  findDuplicateContexts(projectId: string): Context[] {
    const stmt = this.db.prepare(`
      SELECT c1.* FROM contexts c1
      JOIN contexts c2 ON c1.id < c2.id AND c1.content = c2.content
      JOIN sessions s1 ON c1.session_id = s1.id
      JOIN sessions s2 ON c2.session_id = s2.id
      WHERE s1.project_id = ? AND s2.project_id = ?
      AND c1.quality_score <= c2.quality_score
      ORDER BY c1.created_at DESC
    `);
    return stmt.all(projectId, projectId) as Context[];
  }

  /**
   * 查找低质量的上下文
   * @param projectId 项目ID
   * @param threshold 质量分数阈值（低于此值的被认为是低质量）
   * @param daysOld 天数（超过此天数未访问的被认为是过期的）
   * @returns 低质量上下文数组
   */
  getLowQualityContexts(
    projectId: string,
    threshold: number,
    daysOld: number
  ): Context[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const stmt = this.db.prepare(`
      SELECT c.* FROM contexts c
      JOIN sessions s ON c.session_id = s.id
      WHERE s.project_id = ?
      AND c.quality_score < ?
      AND c.created_at < ?
      ORDER BY c.quality_score ASC, c.created_at ASC
    `);
    return stmt.all(
      projectId,
      threshold,
      cutoffDate.toISOString()
    ) as Context[];
  }

  /**
   * 批量删除上下文
   * @param ids 要删除的上下文ID数组
   * @returns 删除的数量
   */
  deleteContextsBatch(ids: string[]): number {
    if (ids.length === 0) return 0;

    const stmt = this.db.prepare("DELETE FROM contexts WHERE id = ?");
    const transaction = this.db.transaction((contextIds: string[]) => {
      let deletedCount = 0;
      for (const id of contextIds) {
        const result = stmt.run(id);
        deletedCount += result.changes;
      }
      return deletedCount;
    });

    return transaction(ids);
  }

  // === File Index Operations ===

  /**
   * 添加文件到索引
   */
  addFileToIndex(params: {
    id: string;
    project_id: string;
    session_id: string;
    file_path: string;
    relative_path: string;
    content: string;
    language?: string;
    file_type?: string;
    size: number;
    modified_time: string;
    hash: string;
    tags?: string;
    metadata?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_index (
        id, project_id, session_id, file_path, relative_path, content,
        language, file_type, size, modified_time, indexed_at, hash,
        tags, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      params.id,
      params.project_id,
      params.session_id,
      params.file_path,
      params.relative_path,
      params.content,
      params.language,
      params.file_type,
      params.size,
      params.modified_time,
      new Date().toISOString(),
      params.hash,
      params.tags || '',
      params.metadata || '{}'
    );
  }

  /**
   * 获取项目的索引文件
   */
  getProjectIndexFiles(projectId: string): Array<{
    id: string;
    file_path: string;
    relative_path: string;
    language: string;
    file_type: string;
    size: number;
    indexed_at: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT id, file_path, relative_path, language, file_type, size, indexed_at
      FROM file_index
      WHERE project_id = ?
      ORDER BY relative_path
    `);
    return stmt.all(projectId) as any[];
  }

  /**
   * 删除项目的索引
   */
  deleteProjectIndex(projectId: string): { deleted_files: number; deleted_sessions: number } {
    // 删除相关的索引文件
    const deleteFilesStmt = this.db.prepare("DELETE FROM file_index WHERE project_id = ?");
    const fileResult = deleteFilesStmt.run(projectId);

    // 删除相关的索引会话
    const deleteSessionsStmt = this.db.prepare(`
      DELETE FROM sessions
      WHERE project_id = ?
        AND tool_used = 'codebase-indexer'
    `);
    const sessionResult = deleteSessionsStmt.run(projectId);

    return {
      deleted_files: fileResult.changes,
      deleted_sessions: sessionResult.changes
    };
  }

  // Backup and restore methods
  /**
   * 获取所有会话
   * @returns 所有会话数组
   */
  getAllSessions(): Session[] {
    const stmt = this.db.prepare(
      "SELECT * FROM sessions ORDER BY started_at DESC"
    );
    return stmt.all() as Session[];
  }

  /**
   * 获取所有上下文
   * @param limit 限制返回数量（可选）
   * @returns 所有上下文数组
   */
  getAllContexts(limit?: number): Context[] {
    let sql = "SELECT * FROM contexts ORDER BY created_at DESC";
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    const stmt = this.db.prepare(sql);
    return stmt.all() as Context[];
  }

  /**
   * 获取所有关系
   * @returns 所有关系数组
   */
  getAllRelationships(): Relationship[] {
    const stmt = this.db.prepare(
      "SELECT * FROM relationships ORDER BY created_at DESC"
    );
    return stmt.all() as Relationship[];
  }

  /**
   * 清空所有数据（用于恢复备份前）
   * 按照外键依赖顺序删除：relationships -> contexts -> sessions -> projects
   */
  clearAllData(): void {
    const transaction = this.db.transaction(() => {
      this.db.exec("DELETE FROM relationships");
      this.db.exec("DELETE FROM contexts");
      this.db.exec("DELETE FROM sessions");
      this.db.exec("DELETE FROM projects");
    });
    transaction();
  }

  /**
   * 恢复项目数据（保留原始ID和时间戳）
   */
  restoreProject(project: Project): void {
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, path, git_remote_url, language, framework, created_at, last_accessed, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      project.id,
      project.name,
      project.path,
      project.git_remote_url,
      project.language,
      project.framework,
      project.created_at,
      project.last_accessed,
      project.metadata || "{}"
    );
  }

  /**
   * 恢复会话数据（保留原始ID和时间戳）
   */
  restoreSession(session: Session): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, project_id, name, started_at, ended_at, tool_used, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.project_id,
      session.name,
      session.started_at,
      session.ended_at,
      session.tool_used,
      session.status,
      session.metadata || "{}"
    );
  }

  /**
   * 恢复上下文数据（保留原始ID和时间戳）
   */
  restoreContext(context: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO contexts (
        id, session_id, type, content, file_path, line_start, line_end,
        language, tags, quality_score, created_at, embedding,
        embedding_text, embedding_version, embedding_model, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Convert embedding array back to Buffer if needed
    let embeddingBuffer: Buffer | Float64Array | null = null;
    if (context.embedding) {
      if (context.embedding.data && Array.isArray(context.embedding.data)) {
        // Embedding is a Buffer object with {type, data} structure
        embeddingBuffer = Buffer.from(context.embedding.data);
      } else if (Array.isArray(context.embedding)) {
        // Embedding is a plain array
        embeddingBuffer = Buffer.from(context.embedding);
      } else if (Buffer.isBuffer(context.embedding)) {
        // Embedding is already a Buffer
        embeddingBuffer = context.embedding;
      }
    }

    // Ensure all parameters have values (use null/default for missing fields)
    const params = [
      context.id,
      context.session_id,
      context.type,
      context.content,
      context.file_path !== undefined ? context.file_path : null,
      context.line_start !== undefined ? context.line_start : null,
      context.line_end !== undefined ? context.line_end : null,
      context.language !== undefined ? context.language : null,
      context.tags !== undefined ? context.tags : "",
      context.quality_score !== undefined ? context.quality_score : 0.5,
      context.created_at,
      embeddingBuffer,
      context.embedding_text !== undefined ? context.embedding_text : null,
      context.embedding_version !== undefined
        ? context.embedding_version
        : "v1.0",
      context.embedding_model !== undefined
        ? context.embedding_model
        : "Xenova/all-MiniLM-L6-v2",
      typeof context.metadata === "string"
        ? context.metadata
        : context.metadata
        ? JSON.stringify(context.metadata)
        : "{}",
    ];

    stmt.run(...params);
  }

  /**
   * 恢复关系数据（保留原始ID和时间戳）
   */
  restoreRelationship(relationship: Relationship): void {
    const stmt = this.db.prepare(`
      INSERT INTO relationships (id, from_context_id, to_context_id, type, strength, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      relationship.id,
      relationship.from_context_id,
      relationship.to_context_id,
      relationship.type,
      relationship.strength,
      relationship.created_at
    );
  }

  // Database maintenance
  vacuum(): void {
    this.db.exec("VACUUM");
  }

  isConnected(): boolean {
    return this.db && this.db.open;
  }

  close(): void {
    this.db.close();
  }

  // Statistics
  getStats() {
    const projectCount = this.db
      .prepare("SELECT COUNT(*) as count FROM projects")
      .get() as { count: number };
    const sessionCount = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions")
      .get() as { count: number };
    const contextCount = this.db
      .prepare("SELECT COUNT(*) as count FROM contexts")
      .get() as { count: number };
    const activeSessionCount = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE status = ?")
      .get("active") as { count: number };

    return {
      total_projects: projectCount.count,
      total_sessions: sessionCount.count,
      total_contexts: contextCount.count,
      active_sessions: activeSessionCount.count,
    };
  }

  /**
   * 按文件路径搜索 contexts
   */
  searchContextsByFile(
    filePath: string,
    projectId?: string,
    limit: number = 50
  ): Context[] {
    let query = `
      SELECT DISTINCT c.* 
      FROM contexts c
      INNER JOIN context_files cf ON c.id = cf.context_id
      WHERE cf.file_path = ?
    `;

    const params: any[] = [filePath];

    if (projectId) {
      query += ` AND c.session_id IN (SELECT id FROM sessions WHERE project_id = ?)`;
      params.push(projectId);
    }

    query += ` ORDER BY c.created_at DESC LIMIT ?`;
    params.push(limit);

    return this.db.prepare(query).all(...params) as Context[];
  }

  /**
   * 获取文件修改历史
   */
  getFileHistory(filePath: string): Array<{
    context_id: string;
    change_type: string;
    created_at: string;
    content_preview: string;
  }> {
    const query = `
      SELECT 
        cf.context_id,
        cf.change_type,
        cf.created_at,
        SUBSTR(c.content, 1, 200) as content_preview
      FROM context_files cf
      INNER JOIN contexts c ON cf.context_id = c.id
      WHERE cf.file_path = ?
      ORDER BY cf.created_at DESC
      LIMIT 50
    `;

    return this.db.prepare(query).all(filePath) as Array<{
      context_id: string;
      change_type: string;
      created_at: string;
      content_preview: string;
    }>;
  }

  /**
   * 检查是否需要迁移到 context_files 表
   */
  private needsContextFilesMigration(): boolean {
    try {
      const result = this.db
        .prepare("SELECT COUNT(*) as count FROM context_files")
        .get() as { count: number };

      // 如果 context_files 表为空，检查是否有需要迁移的数据
      if (result.count === 0) {
        const contextsResult = this.db
          .prepare(
            "SELECT COUNT(*) as count FROM contexts WHERE file_path IS NOT NULL OR metadata LIKE '%files_changed%'"
          )
          .get() as { count: number };
        return contextsResult.count > 0;
      }

      return false;
    } catch (error) {
      // 表不存在或其他错误，不需要迁移
      return false;
    }
  }

  /**
   * 迁移现有数据到 context_files 表
   */
  private migrateToContextFiles(): void {
    const contexts = this.db
      .prepare("SELECT id, file_path, metadata, created_at FROM contexts")
      .all() as Array<{
      id: string;
      file_path: string | null;
      metadata: string;
      created_at: string;
    }>;

    const insertStmt = this.db.prepare(`
      INSERT INTO context_files (id, context_id, file_path, change_type, line_ranges, diff_stats, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // 使用事务批量插入
    const transaction = this.db.transaction((contexts) => {
      for (const context of contexts) {
        try {
          const metadata = JSON.parse(context.metadata || "{}");

          // 1. 迁移 metadata.files_changed
          if (metadata.files_changed && Array.isArray(metadata.files_changed)) {
            for (const file of metadata.files_changed) {
              // 跳过没有 file_path 的条目
              if (!file.file_path) continue;

              insertStmt.run(
                this.generateId(),
                context.id,
                file.file_path,
                file.change_type || null,
                file.line_ranges ? JSON.stringify(file.line_ranges) : null,
                file.diff_stats ? JSON.stringify(file.diff_stats) : null,
                context.created_at
              );
            }
          }
          // 2. 迁移单个 file_path（如果没有 files_changed）
          else if (context.file_path) {
            insertStmt.run(
              this.generateId(),
              context.id,
              context.file_path,
              metadata.change_type || null,
              null,
              null,
              context.created_at
            );
          }
        } catch (error) {
          console.error(
            `[DevMind] Failed to migrate context ${context.id}:`,
            error
          );
        }
      }
    });

    transaction(contexts);
  }
}
