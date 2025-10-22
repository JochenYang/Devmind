import Database from "better-sqlite3";
import {
  Project,
  Session,
  Context,
  Relationship,
  ContextType,
  RelationType,
} from "./types.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initializeTables();
    this.createIndexes();
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
    return result.changes > 0;
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

  searchContexts(
    query: string,
    projectId?: string,
    limit: number = 20
  ): Context[] {
    let sql = `
      SELECT c.* FROM contexts c
      JOIN contexts_fts fts ON c.rowid = fts.rowid
    `;

    const params: any[] = [query];

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
   * @returns 所有上下文数组
   */
  getAllContexts(): Context[] {
    const stmt = this.db.prepare(
      "SELECT * FROM contexts ORDER BY created_at DESC"
    );
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
}
