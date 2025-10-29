#!/usr/bin/env node

import { watch } from "chokidar";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { AiMemoryMcpServer } from "./mcp-server.js";
import { ContextType } from "./types.js";
import { ContentExtractor } from "./content-extractor.js";
import { createGitDiffParser, GitDiffParser } from "./utils/git-diff-parser.js";
import { languageDetector } from "./utils/language-detector.js";
import { PidManager } from "./utils/pid-manager.js";

const execAsync = promisify(exec);

export class DevMindDaemon {
  private server: AiMemoryMcpServer;
  private contentExtractor: ContentExtractor;
  private gitDiffParser: GitDiffParser | null = null;
  private sessionId: string | null = null;
  private projectPath: string;
  private watchers: any[] = [];
  private isRunning = false;
  private enableTerminalMonitoring: boolean;
  private projectLanguage: "zh" | "en";
  private pidManager: PidManager;

  constructor(projectPath: string, options?: { noTerminal?: boolean }) {
    this.projectPath = projectPath;
    this.contentExtractor = new ContentExtractor();
    this.enableTerminalMonitoring = !options?.noTerminal;
    this.pidManager = new PidManager(projectPath);

    // 检测项目语言
    this.projectLanguage = languageDetector.detectProjectLanguage(projectPath);
    console.log(
      `📝 检测到项目语言: ${this.projectLanguage === "zh" ? "中文" : "English"}`
    );

    // 初始化 Git Diff 解析器
    try {
      this.gitDiffParser = createGitDiffParser(projectPath, {
        enable_line_range_detection: true,
        merge_adjacent_lines: true,
      });
    } catch (error) {
      console.log(
        "⚠️  Git diff parser initialization failed, line range detection disabled"
      );
      this.gitDiffParser = null;
    }

    // 初始化MCP服务器
    this.server = new AiMemoryMcpServer({
      database_path: join(projectPath, ".devmind", "memory.db"),
      vector_search: {
        enabled: true,
        model_name: "Xenova/all-MiniLM-L6-v2",
        dimensions: 384,
        similarity_threshold: 0.5,
        hybrid_weight: 0.7,
        cache_embeddings: true,
      },
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("DevMind daemon already running");
      return;
    }

    // 检查是否已有守护进程在运行
    const status = this.pidManager.getStatus();
    if (status.running) {
      console.log(
        `⚠️  守护进程已在运行 (PID: ${status.pid}, 运行时间: ${status.uptime})`
      );
      console.log("   使用 'devmind stop' 停止现有守护进程");
      process.exit(1);
    }

    console.log(`🚀 启动DevMind守护进程: ${this.projectPath}`);

    // 写入 PID 文件
    this.pidManager.writePid(process.pid);

    try {
      // 创建或获取会话
      await this.initializeSession();

      // 启动各种监控器
      await this.startFileWatcher();
      await this.startGitWatcher();

      if (this.enableTerminalMonitoring) {
        await this.startTerminalWatcher();
      } else {
        console.log("⚠️  终端监控已禁用 (--no-terminal)");
      }

      this.isRunning = true;
      console.log("✅ DevMind守护进程启动成功");

      // 保持进程运行
      process.on("SIGINT", () => this.stop());
      process.on("SIGTERM", () => this.stop());
    } catch (error) {
      console.error("❌ 守护进程启动失败:", error);
      throw error;
    }
  }

  private async initializeSession(): Promise<void> {
    try {
      const result = await this.server["handleCreateSession"]({
        project_path: this.projectPath,
        tool_used: "daemon",
        name: `自动监控会话 - ${new Date().toLocaleString()}`,
      });

      if (!result.isError && result._meta?.session_id) {
        this.sessionId = result._meta.session_id;
        console.log(`📝 会话创建成功: ${this.sessionId}`);
      } else {
        throw new Error("Failed to create session");
      }
    } catch (error) {
      console.error("会话初始化失败:", error);
      throw error;
    }
  }

  private async startFileWatcher(): Promise<void> {
    const patterns = [
      "**/*.{js,ts,jsx,tsx,py,go,rs,java,kt,php,rb,c,cpp,cs,swift,dart}",
      "**/*.{json,yaml,yml,md,txt}",
      "**/package.json",
      "**/tsconfig.json",
      "**/webpack.config.js",
      "**/.env*",
    ];

    const watcher = watch(patterns, {
      cwd: this.projectPath,
      ignored: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/.cache/**", // 缓存目录
        "**/.next/**", // Next.js缓存
        "**/.nuxt/**", // Nuxt.js缓存
        "**/.vite/**", // Vite缓存
        "**/.turbo/**", // Turbo缓存
        "**/coverage/**", // 测试覆盖率
        "**/.devmind/**", // DevMind自己的目录
        "**/.*", // 隐藏文件
        "**/*.log",
        "**/*.tmp",
        "**/*.lock", // 锁文件
        "**/package-lock.json", // npm锁文件
        "**/yarn.lock", // yarn锁文件
        "**/pnpm-lock.yaml", // pnpm锁文件
      ],
      persistent: true,
      ignoreInitial: true,
    });

    watcher
      .on("add", (path) => this.handleFileChange("add", path))
      .on("change", (path) => this.handleFileChange("change", path))
      .on("unlink", (path) => this.handleFileChange("delete", path));

    this.watchers.push(watcher);
    console.log("📁 文件监控器启动");
  }

  private async handleFileChange(
    action: string,
    filePath: string
  ): Promise<void> {
    if (!this.sessionId) return;

    try {
      const fullPath = join(this.projectPath, filePath);
      let content = "";
      let contextType = ContextType.CODE;
      let lineRanges: Array<[number, number]> | undefined;

      // Git diff 分析获取行范围
      if (this.gitDiffParser && action !== "delete") {
        try {
          const diffResult = await this.gitDiffParser.analyzeFileChange(
            filePath
          );
          if (diffResult && diffResult.line_ranges.length > 0) {
            lineRanges = diffResult.line_ranges;

            // 如果变更过多，记录日志
            if (diffResult.total_changes > 50) {
              console.log(
                `📊 Large file change detected: ${filePath} (${diffResult.total_changes} lines, ${lineRanges.length} ranges)`
              );
            }
          }
        } catch (diffError) {
          console.error(`Git diff analysis failed for ${filePath}:`, diffError);
        }
      }

      if (action !== "delete" && existsSync(fullPath)) {
        try {
          content = readFileSync(fullPath, "utf8");

          // 限制内容长度
          if (content.length > 5000) {
            content = content.substring(0, 5000) + "\n... (truncated)";
          }

          // 根据文件类型确定上下文类型
          if (
            filePath.includes("package.json") ||
            filePath.includes("config")
          ) {
            contextType = ContextType.CONFIGURATION;
          } else if (filePath.endsWith(".md") || filePath.endsWith(".txt")) {
            contextType = ContextType.DOCUMENTATION;
          }
        } catch (readError) {
          const errorMsg = languageDetector.getLocalizedText(
            this.projectLanguage,
            "cannot_read_file"
          );
          content = `${errorMsg}: ${readError}`;
        }
      } else {
        const deletedMsg = languageDetector.getLocalizedText(
          this.projectLanguage,
          "file_deleted"
        );
        content = `${deletedMsg}: ${filePath}`;
      }

      // 记录上下文（包含行范围）
      await this.recordContext({
        type: contextType,
        content: `[${action.toUpperCase()}] ${filePath}\n\n${content}`,
        file_path: filePath,
        line_ranges: lineRanges,
        tags: [action, "file-change", this.getFileExtension(filePath)],
      });
    } catch (error) {
      console.error(`处理文件变更失败 ${filePath}:`, error);
    }
  }

  private async startGitWatcher(): Promise<void> {
    // 检查是否是Git仓库
    if (!existsSync(join(this.projectPath, ".git"))) {
      console.log("⚠️  非Git仓库，跳过Git监控");
      return;
    }

    // 监控 .git/refs/heads 目录以检测新的 commit
    const gitRefsPath = join(this.projectPath, ".git", "refs", "heads");

    if (!existsSync(gitRefsPath)) {
      console.log("⚠️  Git refs 目录不存在，跳过Git监控");
      return;
    }

    const watcher = watch(gitRefsPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 1,
    });

    watcher.on("change", async (branchFile) => {
      try {
        // 获取最新的 commit 信息
        const { stdout: logOutput } = await execAsync(
          'git log -1 --pretty=format:"%H|%s|%an|%ae|%ad"',
          { cwd: this.projectPath }
        );

        const [hash, message, author, email, date] = logOutput.split("|");

        // 验证hash格式 - Git commit hash是40位十六进制
        const hashPattern = /^[0-9a-f]{7,40}$/i;
        if (!hashPattern.test(hash)) {
          console.error(`[DevMind] 无效的Git hash格式: ${hash}`);
          return;
        }

        // 获取变更文件列表 - 使用execFile避免命令注入
        const { execFile } = await import("child_process");
        const { promisify } = await import("util");
        const execFileAsync = promisify(execFile);

        const { stdout: filesOutput } = await execFileAsync(
          "git",
          ["diff-tree", "--no-commit-id", "--name-only", "-r", hash],
          { cwd: this.projectPath }
        );

        const changedFiles =
          filesOutput
            ?.trim()
            .split("\n")
            .filter((f: string) => f) || [];

        // 构建 commit 内容
        const commitContent = [
          `[GIT COMMIT] ${message}`,
          "",
          `Author: ${author} <${email}>`,
          `Hash: ${hash}`,
          `Date: ${date}`,
          `Branch: ${branchFile}`,
          "",
          `Files changed (${changedFiles.length}):`,
          ...changedFiles.map((f) => `  - ${f}`),
        ].join("\n");

        // 记录 commit 信息
        await this.recordContext({
          type: ContextType.COMMIT,
          content: commitContent,
          tags: ["git", "commit", branchFile.replace(/\//g, "-")],
        });

        console.log(
          `📝 记录Git提交: ${message.substring(0, 50)}${
            message.length > 50 ? "..." : ""
          }`
        );
      } catch (error) {
        console.error("Git监控错误:", error);
      }
    });

    this.watchers.push(watcher);
    console.log("🔄 Git监控器启动");
  }

  private async startTerminalWatcher(): Promise<void> {
    const { homedir } = await import("os");
    const { statSync } = await import("fs");

    const homeDir = homedir();
    const historyFiles = [
      join(homeDir, ".bash_history"),
      join(homeDir, ".zsh_history"),
    ];

    // 找到存在的 history 文件
    const historyFile = historyFiles.find((f) => existsSync(f));
    if (!historyFile) {
      console.log("⚠️  未找到shell history文件，跳过终端监控");
      return;
    }

    // 命令白名单
    const whitelist = [
      "npm",
      "yarn",
      "pnpm",
      "git",
      "node",
      "python",
      "python3",
      "pip",
      "make",
      "docker",
      "test",
      "cargo",
      "go",
      "mvn",
      "gradle",
    ];

    // 敏感信息正则
    const sensitivePatterns = [
      /password[=:\s]+\S+/gi,
      /token[=:\s]+\S+/gi,
      /api[_-]?key[=:\s]+\S+/gi,
      /secret[=:\s]+\S+/gi,
      /auth[=:\s]+\S+/gi,
    ];

    let lastSize = 0;
    try {
      const stats = statSync(historyFile);
      lastSize = stats.size;
    } catch (error) {
      console.log("⚠️  无法读取history文件状态，跳过终端监控");
      return;
    }

    // 每 5 秒检查一次
    const intervalId = setInterval(() => {
      try {
        const stats = statSync(historyFile);
        if (stats.size > lastSize) {
          const content = readFileSync(historyFile, "utf-8");
          const lines = content.split("\n");

          // 估算新增的行数（粗略计算）
          const avgLineLength = 50; // 假设平均每行50字符
          const newLinesCount = Math.ceil(
            (stats.size - lastSize) / avgLineLength
          );
          const newLines = lines.slice(-Math.max(newLinesCount, 10));

          newLines.forEach((line) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            // 检查白名单
            const isWhitelisted = whitelist.some((cmd) =>
              trimmedLine.startsWith(cmd)
            );
            if (!isWhitelisted) return;

            // 过滤敏感信息
            let filtered = trimmedLine;
            sensitivePatterns.forEach((pattern) => {
              filtered = filtered.replace(pattern, "[REDACTED]");
            });

            // 记录命令
            this.recordContext({
              type: ContextType.CONFIGURATION,
              content: `[TERMINAL] ${filtered}`,
              tags: ["terminal", "command"],
            }).catch((error) => {
              console.error("记录终端命令失败:", error);
            });
          });

          lastSize = stats.size;
        }
      } catch (error) {
        // 静默失败，避免干扰主进程
      }
    }, 5000);

    // 保存 interval ID 以便清理
    this.watchers.push({ close: () => clearInterval(intervalId) });

    console.log(`💻 终端监控器启动 (监控: ${historyFile})`);
  }

  private async recordContext(params: {
    type: ContextType;
    content: string;
    file_path?: string;
    line_ranges?: Array<[number, number]>;
    tags?: string[];
  }): Promise<void> {
    if (!this.sessionId) return;

    try {
      await this.server["handleRecordContext"]({
        session_id: this.sessionId,
        type: params.type,
        content: params.content,
        file_path: params.file_path,
        line_ranges: params.line_ranges,
        tags: params.tags || [],
      });

      const rangeInfo =
        params.line_ranges && params.line_ranges.length > 0
          ? ` (${params.line_ranges.length} ranges)`
          : "";
      console.log(`📝 记录上下文: ${params.file_path || "N/A"}${rangeInfo}`);
    } catch (error) {
      console.error("记录上下文失败:", error);
    }
  }

  private getFileExtension(filePath: string): string {
    const ext = filePath.split(".").pop();
    return ext || "unknown";
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log("🛑 停止DevMind守护进程...");

    // 关闭所有监控器 - 强制清理
    console.log(`📦 正在关闭 ${this.watchers.length} 个监控器...`);
    for (const watcher of this.watchers) {
      try {
        if (watcher && typeof watcher.close === "function") {
          await watcher.close();
        } else if (watcher && typeof watcher.unwatch === "function") {
          // chokidar watcher的备用关闭方法
          await watcher.unwatch();
        }
      } catch (error) {
        console.error("关闭监控器出错:", error);
      }
    }
    this.watchers = []; // 清空监控器数组

    // 结束会话
    if (this.sessionId) {
      try {
        await this.server["handleEndSession"]({ session_id: this.sessionId });
        console.log("📝 会话已结束");
      } catch (error) {
        console.error("结束会话失败:", error);
      }
    }

    // 关闭数据库连接
    try {
      await this.server.close();
      console.log("📄 数据库连接已关闭");
    } catch (error) {
      console.error("关闭数据库连接失败:", error);
    }

    // 删除 PID 文件
    this.pidManager.removePid();

    this.isRunning = false;
    console.log("✅ DevMind守护进程已停止");
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// 命令行启动 - 只有直接运行此文件时才启动
// 修复判断逻辑，避免作为模块导入时意外启动
if (import.meta.url.startsWith("file:")) {
  const modulePath = import.meta.url.slice(7).replace(/\\/g, "/");
  const scriptPath = process.argv[1]?.replace(/\\/g, "/");

  // 只有当前文件是直接执行的入口点时才启动
  if (scriptPath && modulePath.endsWith(scriptPath.split("/").pop() || "")) {
    const args = process.argv.slice(2);
    const projectPath =
      args.find((arg) => !arg.startsWith("--")) || process.cwd();
    const noTerminal = args.includes("--no-terminal");

    const daemon = new DevMindDaemon(projectPath, { noTerminal });
    daemon.start().catch((error) => {
      console.error("守护进程启动失败:", error);
      process.exit(1);
    });
  }
}

export default DevMindDaemon;
