/**
 * Git Hook 安装器 - DevMind MCP
 *
 * 自动安装 Git Hook 以捕获 commit 信息并触发自动记忆，无需 AI 干预。
 *
 * 功能特性：
 * - 安装 post-commit Hook 捕获提交元数据
 * - 将 commit 信息写入 .devmind/pending-commit.json
 * - 跨平台兼容（Windows/Unix）
 * - 非侵入式：Git 不可用时静默失败
 *
 * @since v2.1.4
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  readFileSync,
} from "fs";
import { join } from "path";

export class GitHookInstaller {
  /**
   * 为项目安装 Git Hook
   *
   * @param projectPath - 项目根目录的绝对路径
   * @returns 安装成功返回 true，否则返回 false
   */
  static async installGitHooks(projectPath: string): Promise<boolean> {
    try {
      const gitDir = join(projectPath, ".git");
      const hooksDir = join(gitDir, "hooks");

      // 检查是否存在.git目录
      if (!existsSync(gitDir)) {
        console.log(
          "[DevMind] No .git directory found, skipping Git Hook installation"
        );
        return false;
      }

      // 确保"hooks"目录存在
      if (!existsSync(hooksDir)) {
        mkdirSync(hooksDir, { recursive: true });
      }

      // 创建 .devmind 目录用户存储临时文件
      const devmindDir = join(projectPath, ".devmind");
      if (!existsSync(devmindDir)) {
        mkdirSync(devmindDir, { recursive: true });
      }

      // 安装 post-commit Hook
      await this.installPostCommitHook(hooksDir, projectPath);

      console.log("[DevMind] Git Hooks installed successfully");
      return true;
    } catch (error) {
      console.error("[DevMind] Failed to install Git Hooks:", error);
      return false;
    }
  }

  /**
   * 安装 post-commit Hook 以捕获提交信息
   */
  private static async installPostCommitHook(
    hooksDir: string,
    projectPath: string
  ): Promise<void> {
    const hookPath = join(hooksDir, "post-commit");
    const isWindows = process.platform === "win32";

    // 生成钩子脚本内容
    const hookScript = this.generatePostCommitScript(projectPath, isWindows);

    // 检查 Hook 是否已存在
    if (existsSync(hookPath)) {
      const existingContent = readFileSync(hookPath, "utf8");

      // 如果 Hook 已存在，检查是否包含 DevMind 标识
      if (existingContent.includes("DevMind MCP Auto-Record")) {
        console.log("[DevMind] Git Hook already installed");
        return;
      }

      // 如果 Hook 已存在但未包含 DevMind 标识，则合并脚本
      const combinedScript = this.combineHooks(existingContent, hookScript);
      writeFileSync(hookPath, combinedScript, "utf8");
    } else {
      // Create new hook
      writeFileSync(hookPath, hookScript, "utf8");
    }

    // 设置 Hook 可执行权限（仅限 Unix）
    if (!isWindows) {
      try {
        chmodSync(hookPath, 0o755);
      } catch (error) {
        console.error("[DevMind] Failed to set hook executable:", error);
      }
    }
  }

  /**
   * 生成 post-commit Hook 脚本内容
   */
  private static generatePostCommitScript(
    projectPath: string,
    isWindows: boolean
  ): string {
    const devmindDir = join(projectPath, ".devmind");
    const pendingFile = join(devmindDir, "pending-commit.json");

    if (isWindows) {
      // Windows (Git Bash compatible)
      return `#!/bin/sh
# DevMind MCP Auto-Record Hook (v2.1.4)
# This hook is automatically managed by DevMind MCP

# Capture commit information
COMMIT_HASH=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B)
COMMIT_AUTHOR=$(git log -1 --pretty=%an)
COMMIT_DATE=$(git log -1 --pretty=%ai)
CHANGED_FILES=$(git diff-tree --no-commit-id --name-status -r HEAD | tr '\\n' '|')

# Write to DevMind pending file
cat > "${pendingFile}" << EOF
{
  "commit_hash": "\${COMMIT_HASH}",
  "message": "\${COMMIT_MSG}",
  "author": "\${COMMIT_AUTHOR}",
  "date": "\${COMMIT_DATE}",
  "changed_files": "\${CHANGED_FILES}"
}
EOF

exit 0
`;
    } else {
      // Unix/Mac
      return `#!/bin/sh
# DevMind MCP Auto-Record Hook (v2.1.4)
# This hook is automatically managed by DevMind MCP

# Capture commit information
COMMIT_HASH=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B)
COMMIT_AUTHOR=$(git log -1 --pretty=%an)
COMMIT_DATE=$(git log -1 --pretty=%ai)
CHANGED_FILES=$(git diff-tree --no-commit-id --name-status -r HEAD | tr '\\n' '|')

# Write to DevMind pending file
cat > "${pendingFile}" << EOF
{
  "commit_hash": "\${COMMIT_HASH}",
  "message": "\${COMMIT_MSG}",
  "author": "\${COMMIT_AUTHOR}",
  "date": "\${COMMIT_DATE}",
  "changed_files": "\${CHANGED_FILES}"
}
EOF

exit 0
`;
    }
  }

  /**
   * 合并现有 Hook 与 DevMind Hook
   */
  private static combineHooks(existing: string, newHook: string): string {
    return `${existing}

# === DevMind MCP Hook Appended Below ===
${newHook}
`;
  }

  /**
   * 从 pending 文件解析 commit 信息
   */
  static parseCommitInfo(jsonContent: string): CommitInfo | null {
    try {
      const data = JSON.parse(jsonContent);

      // Parse changed files
      const changedFiles: FileChange[] = [];
      if (data.changed_files) {
        const files = data.changed_files
          .split("|")
          .filter((f: string) => f.trim());
        for (const file of files) {
          const parts = file.trim().split(/\s+/);
          if (parts.length >= 2) {
            const status = parts[0];
            const path = parts[1];
            changedFiles.push({
              status: this.mapGitStatus(status),
              path,
            });
          }
        }
      }

      return {
        commitHash: data.commit_hash,
        message: data.message,
        author: data.author,
        date: data.date,
        changedFiles,
      };
    } catch (error) {
      console.error("[DevMind] Failed to parse commit info:", error);
      return null;
    }
  }

  /**
   * 将 Git 状态码映射为变更类型
   */
  private static mapGitStatus(
    status: string
  ): "add" | "modify" | "delete" | "rename" {
    switch (status.toUpperCase()) {
      case "A":
        return "add";
      case "M":
        return "modify";
      case "D":
        return "delete";
      case "R":
        return "rename";
      default:
        return "modify";
    }
  }
}

/**
 * Git Hook 捕获的提交信息
 */
export interface CommitInfo {
  commitHash: string;
  message: string;
  author: string;
  date: string;
  changedFiles: FileChange[];
}

/**
 * Git diff 中的文件变更信息
 */
export interface FileChange {
  status: "add" | "modify" | "delete" | "rename";
  path: string;
}
