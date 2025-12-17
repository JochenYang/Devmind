/**
 * ContextEngine - 上下文引擎主入口
 */

import { FileScanner } from "./FileScanner.js";
import { IgnoreProcessor } from "./IgnoreProcessor.js";
import { ScanOptions, ScanResult, IndexResult } from "./types.js";
import { existsSync } from "fs";
import { resolve } from "path";
import { DatabaseManager } from "../database.js";
import { SessionManager } from "../session-manager.js";
import { createHash } from "crypto";

export class ContextEngine {
  private fileScanner: FileScanner;
  private ignoreProcessor: IgnoreProcessor;
  private db: DatabaseManager;
  private sessionManager: SessionManager;

  constructor(db: DatabaseManager, sessionManager: SessionManager) {
    this.fileScanner = new FileScanner();
    this.ignoreProcessor = new IgnoreProcessor();
    this.db = db;
    this.sessionManager = sessionManager;
  }

  /**
   * 索引代码库
   */
  async indexCodebase(
    projectPath: string,
    options: ScanOptions = {}
  ): Promise<IndexResult> {
    const startTime = Date.now();
    const normalizedPath = this.normalizeProjectPath(projectPath);

    console.log(
      `[ContextEngine] Starting to index codebase: ${normalizedPath}`
    );

    const results: IndexResult = {
      totalFiles: 0,
      successFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      duration: 0,
      errors: [],
    };

    try {
      // 1. 扫描文件
      const scannedFiles = await this.fileScanner.scanDirectory(
        normalizedPath,
        options
      );
      results.totalFiles = scannedFiles.length;

      console.log(
        `[ContextEngine] Found ${scannedFiles.length} files to index`
      );

      // 2. 获取或创建项目
      const project = await this.sessionManager.getOrCreateProject(
        normalizedPath
      );

      // 3. 查找或创建索引会话 (每个项目只有一个持久索引会话)
      let sessionId = this.findIndexingSession(project.id);

      if (sessionId) {
        console.log(
          `[ContextEngine] Reusing existing indexing session: ${sessionId}`
        );
      } else {
        // 创建新的索引会话
        sessionId = await this.sessionManager.createSession({
          project_path: normalizedPath,
          tool_used: "codebase-indexer",
          name: `Codebase Index (Auto-managed)`,
          metadata: {
            auto_managed: true,
            indexing_session: true,
            created_at: new Date().toISOString(),
          },
        });
        console.log(
          `[ContextEngine] Created new indexing session: ${sessionId}`
        );
      }

      // 3. 处理每个文件
      for (const file of scannedFiles) {
        try {
          await this.indexFile(file, sessionId, project.id);
          results.successFiles++;
        } catch (error) {
          results.failedFiles++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          results.errors?.push(`${file.relativePath}: ${errorMessage}`);
          console.error(
            `[ContextEngine] Failed to index ${file.relativePath}:`,
            error
          );
        }
      }

      results.duration = Date.now() - startTime;

      console.log(`[ContextEngine] Index complete:`);
      console.log(`  - Total files: ${results.totalFiles}`);
      console.log(`  - Success: ${results.successFiles}`);
      console.log(`  - Failed: ${results.failedFiles}`);
      console.log(`  - Duration: ${results.duration}ms`);

      return results;
    } catch (error) {
      console.error("[ContextEngine] Index failed:", error);
      throw error;
    }
  }

  /**
   * 索引单个文件
   */
  private async indexFile(
    file: ScanResult,
    sessionId: string,
    projectId: string
  ): Promise<void> {
    try {
      // 生成文件哈希
      const hash = createHash("sha256").update(file.content).digest("hex");

      // 添加到 file_index 表
      this.db.addFileToIndex({
        id: `${sessionId}_${file.relativePath}`,
        project_id: projectId,
        session_id: sessionId,
        file_path: file.filePath,
        relative_path: file.relativePath,
        content: file.content,
        language: file.language,
        file_type: file.language || "unknown",
        size: file.size,
        modified_time: file.modifiedTime.toISOString(),
        hash,
        tags: `indexed,codebase,${file.language || "unknown"}`,
        metadata: JSON.stringify({
          indexed_file: true,
          file_type: "code",
          relative_path: file.relativePath,
          size: file.size,
          modified_time: file.modifiedTime.toISOString(),
        }),
      });

      console.log(
        `[ContextEngine] Indexed: ${file.relativePath} (${file.language})`
      );
    } catch (error) {
      console.error(
        `[ContextEngine] Failed to index ${file.relativePath}:`,
        error
      );
      throw error;
    }
  }

  /**
   * 检测文件类型
   */
  detectFileType(filePath: string): {
    language: string;
    fileType: "code" | "doc" | "config" | "other";
  } {
    return this.ignoreProcessor.detectFileType(filePath);
  }

  /**
   * 检查文件是否应该被忽略
   */
  async shouldIgnore(filePath: string, projectPath: string): Promise<boolean> {
    const ignoreRules = await this.ignoreProcessor.loadIgnoreRules(projectPath);
    const result = this.ignoreProcessor.shouldIgnore(filePath, ignoreRules);
    return result.ignored;
  }

  /**
   * 删除项目索引
   */
  async deleteCodebaseIndex(
    projectPath: string
  ): Promise<{ deleted_files: number; deleted_sessions: number }> {
    const normalizedPath = this.normalizeProjectPath(projectPath);

    console.log(`[ContextEngine] Deleting codebase index: ${normalizedPath}`);

    try {
      // 获取或创建项目
      const project = await this.sessionManager.getOrCreateProject(
        normalizedPath
      );

      // 删除索引文件和相关会话
      const result = this.db.deleteProjectIndex(project.id);

      console.log(
        `[ContextEngine] Deleted ${result.deleted_files} files and ${result.deleted_sessions} sessions`
      );

      return result;
    } catch (error) {
      console.error("[ContextEngine] Failed to delete codebase index:", error);
      throw error;
    }
  }

  /**
   * 查找项目的索引会话
   */
  private findIndexingSession(projectId: string): string | null {
    try {
      const sessions = this.db.getProjectSessions(projectId);
      const indexingSession = sessions.find(
        (s: any) => s.tool_used === "codebase-indexer" && s.status === "active"
      );
      return indexingSession ? indexingSession.id : null;
    } catch (error) {
      console.error("[ContextEngine] Failed to find indexing session:", error);
      return null;
    }
  }

  /**
   * 标准化项目路径
   */
  private normalizeProjectPath(projectPath: string): string {
    let normalized = resolve(projectPath);

    // Windows 平台大小写统一
    if (process.platform === "win32") {
      normalized = normalized.toLowerCase();
    }

    // 验证路径是否存在
    if (!existsSync(normalized)) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    return normalized;
  }
}

export default ContextEngine;
