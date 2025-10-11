import Database from 'better-sqlite3';
import { Project, Session, Context, Relationship, ContextType, RelationType } from './types.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_path ON projects (path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions (project_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_contexts_session ON contexts (session_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_contexts_type ON contexts (type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_contexts_file ON contexts (file_path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_contexts_quality ON contexts (quality_score)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_contexts_embedding_version ON contexts (embedding_version)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_contexts_embedding_model ON contexts (embedding_model)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships (from_context_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships (to_context_id)`);
    
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
  createProject(project: Omit<Project, 'id' | 'created_at' | 'last_accessed'>): string {
    const id = this.generateId();
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, path, git_remote_url, language, framework, created_at, last_accessed, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, project.name, project.path, project.git_remote_url, 
             project.language, project.framework, now, now, project.metadata || '{}');
    
    return id;
  }

  getProjectByPath(path: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE path = ?');
    return stmt.get(path) as Project | null;
  }

  updateProjectAccess(projectId: string): void {
    const stmt = this.db.prepare('UPDATE projects SET last_accessed = ? WHERE id = ?');
    stmt.run(new Date().toISOString(), projectId);
  }

  // Session operations
  createSession(session: Omit<Session, 'id' | 'started_at'>): string {
    const id = this.generateId();
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, project_id, name, started_at, tool_used, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, session.project_id, session.name, now, 
             session.tool_used, session.status || 'active', session.metadata || '{}');
    
    return id;
  }

  getSession(sessionId: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(sessionId) as Session | null;
  }

  getActiveSessions(projectId: string): Session[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions 
      WHERE project_id = ? AND status = 'active'
      ORDER BY started_at DESC
    `);
    return stmt.all(projectId) as Session[];
  }

  endSession(sessionId: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET status = 'completed', ended_at = ? 
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), sessionId);
  }

  // Context operations
  createContext(context: Omit<Context, 'id' | 'created_at'>): string {
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
      id, context.session_id, context.type, context.content,
      context.file_path, context.line_start, context.line_end,
      context.language, context.tags, context.quality_score,
      now, context.embedding, context.embedding_text, 
      context.embedding_version || 'v1.0', context.metadata || '{}'
    );
    
    return id;
  }

  getContextsBySession(sessionId: string, limit?: number): Context[] {
    const sql = `
      SELECT * FROM contexts 
      WHERE session_id = ? 
      ORDER BY created_at DESC
      ${limit ? 'LIMIT ?' : ''}
    `;
    
    const stmt = this.db.prepare(sql);
    const params = limit ? [sessionId, limit] : [sessionId];
    return stmt.all(...params) as Context[];
  }

  getContextById(contextId: string): Context | null {
    const stmt = this.db.prepare('SELECT * FROM contexts WHERE id = ?');
    return stmt.get(contextId) as Context | null;
  }

  deleteContext(contextId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM contexts WHERE id = ?');
    const result = stmt.run(contextId);
    return result.changes > 0;
  }

  updateContext(contextId: string, updates: Partial<Pick<Context, 'content' | 'tags' | 'quality_score' | 'metadata'>>): boolean {
    const fields = [];
    const values = [];
    
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(updates.tags);
    }
    if (updates.quality_score !== undefined) {
      fields.push('quality_score = ?');
      values.push(updates.quality_score);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(typeof updates.metadata === 'string' ? updates.metadata : JSON.stringify(updates.metadata));
    }
    
    if (fields.length === 0) return false;
    
    const sql = `UPDATE contexts SET ${fields.join(', ')} WHERE id = ?`;
    values.push(contextId);
    
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  deleteSession(sessionId: string): boolean {
    // 由于外键约束，删除session会自动删除相关contexts
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  searchContexts(query: string, projectId?: string, limit: number = 20): Context[] {
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
  updateContextEmbedding(contextId: string, embedding: number[], embeddingText: string, version: string = 'v1.0'): void {
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

  getContextsForVectorSearch(projectId?: string, sessionId?: string): Context[] {
    let sql = `
      SELECT c.* FROM contexts c
    `;
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (projectId) {
      sql += ` JOIN sessions s ON c.session_id = s.id`;
      conditions.push('s.project_id = ?');
      params.push(projectId);
    }
    
    if (sessionId) {
      conditions.push('c.session_id = ?');
      params.push(sessionId);
    }
    
    conditions.push('c.embedding_text IS NOT NULL');
    conditions.push("c.embedding_text != ''");
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ` ORDER BY c.created_at DESC`;
    
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Context[];
  }

  getEmbeddingStats(): { total: number; withEmbedding: number; embeddingModels: Array<{model: string; count: number}> } {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM contexts');
    const withEmbeddingStmt = this.db.prepare("SELECT COUNT(*) as count FROM contexts WHERE embedding_text IS NOT NULL AND embedding_text != ''");
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
      embeddingModels: modelsStmt.all() as Array<{model: string; count: number}>
    };
  }

  // Relationship operations
  createRelationship(relationship: Omit<Relationship, 'id' | 'created_at'>): string {
    const id = this.generateId();
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO relationships (id, from_context_id, to_context_id, type, strength, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, relationship.from_context_id, relationship.to_context_id,
             relationship.type, relationship.strength, now);
    
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

  // Database maintenance
  vacuum(): void {
    this.db.exec('VACUUM');
  }

  isConnected(): boolean {
    return this.db && this.db.open;
  }

  close(): void {
    this.db.close();
  }

  // Statistics
  getStats() {
    const projectCount = this.db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
    const sessionCount = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    const contextCount = this.db.prepare('SELECT COUNT(*) as count FROM contexts').get() as { count: number };
    const activeSessionCount = this.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?').get('active') as { count: number };
    
    return {
      total_projects: projectCount.count,
      total_sessions: sessionCount.count,
      total_contexts: contextCount.count,
      active_sessions: activeSessionCount.count
    };
  }
}