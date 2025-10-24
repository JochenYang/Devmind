import { DatabaseManager } from "./database.js";
import { Context } from "./types.js";

export interface ContextFile {
  id: string;
  context_id: string;
  file_path: string;
  change_type?: "add" | "modify" | "delete" | "refactor" | "rename";
  line_ranges?: number[][];
  diff_stats?: {
    additions: number;
    deletions: number;
    changes: number;
  };
  created_at: string;
}

export class ContextFileManager {
  constructor(private db: DatabaseManager) {}

  /**
   * 为 context 添加文件关联
   */
  addFiles(
    contextId: string,
    files: Array<Omit<ContextFile, "id" | "context_id" | "created_at">>
  ): void {
    const stmt = (this.db as any).db.prepare(`
      INSERT INTO context_files (id, context_id, file_path, change_type, line_ranges, diff_stats, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const createdAt = new Date().toISOString();

    for (const file of files) {
      stmt.run(
        (this.db as any).generateId(),
        contextId,
        file.file_path,
        file.change_type || null,
        file.line_ranges ? JSON.stringify(file.line_ranges) : null,
        file.diff_stats ? JSON.stringify(file.diff_stats) : null,
        createdAt
      );
    }
  }

  /**
   * 获取 context 关联的所有文件
   */
  getFilesByContext(contextId: string): ContextFile[] {
    const stmt = (this.db as any).db.prepare(`
      SELECT * FROM context_files WHERE context_id = ?
    `);

    const rows = stmt.all(contextId) as any[];

    return rows.map((row) => ({
      id: row.id,
      context_id: row.context_id,
      file_path: row.file_path,
      change_type: row.change_type,
      line_ranges: row.line_ranges ? JSON.parse(row.line_ranges) : undefined,
      diff_stats: row.diff_stats ? JSON.parse(row.diff_stats) : undefined,
      created_at: row.created_at,
    }));
  }

  /**
   * 查找涉及特定文件的所有 contexts
   */
  getContextsByFile(filePath: string, limit: number = 50): Context[] {
    const stmt = (this.db as any).db.prepare(`
      SELECT DISTINCT c.* 
      FROM contexts c
      INNER JOIN context_files cf ON c.id = cf.context_id
      WHERE cf.file_path = ?
      ORDER BY c.created_at DESC
      LIMIT ?
    `);

    return stmt.all(filePath, limit) as Context[];
  }

  /**
   * 获取文件修改统计
   */
  getFileStats(filePath: string): {
    modification_count: number;
    last_modified: string;
    related_contexts: number;
  } {
    const stmt = (this.db as any).db.prepare(`
      SELECT 
        COUNT(*) as modification_count,
        MAX(created_at) as last_modified,
        COUNT(DISTINCT context_id) as related_contexts
      FROM context_files
      WHERE file_path = ?
    `);

    const result = stmt.get(filePath) as any;

    return {
      modification_count: result.modification_count || 0,
      last_modified: result.last_modified || "",
      related_contexts: result.related_contexts || 0,
    };
  }

  /**
   * 删除 context 的所有文件关联
   */
  deleteFilesByContext(contextId: string): number {
    const stmt = (this.db as any).db.prepare(`
      DELETE FROM context_files WHERE context_id = ?
    `);

    const result = stmt.run(contextId);
    return result.changes;
  }
}
