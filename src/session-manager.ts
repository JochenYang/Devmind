import { createHash } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname, basename } from "path";
import simpleGit from "simple-git";
import { DatabaseManager } from "./database.js";
import {
  Project,
  Session,
  SessionCreateParams,
  AiMemoryConfig,
} from "./types.js";
import { normalizeProjectPath } from "./utils/path-normalizer.js";
import { findProjectRoot } from "./utils/project-root-finder.js";

export class SessionManager {
  private db: DatabaseManager;
  private config: AiMemoryConfig;
  private activeSessions: Map<string, string> = new Map(); // projectPath -> sessionId
  private sessionCache: Map<string, any> = new Map(); // sessionId -> sessionData
  private lastAccessedProject: string | null = null; // 追踪最近访问的项目

  constructor(db: DatabaseManager, config: AiMemoryConfig) {
    this.db = db;
    this.config = config;
    this.initializeSessionCache();
  }

  /**
   * 初始化会话缓存
   */
  private initializeSessionCache(): void {
    // 预加载所有活跃会话到缓存
    try {
      const projects = this.db.getAllProjects();
      projects.forEach((project: any) => {
        const activeSessions = this.db.getActiveSessions(project.id);
        // 🔧 修复：使用规范化后的路径作为缓存键
        const normalizedPath = normalizeProjectPath(project.path);
        activeSessions.forEach(session => {
          this.activeSessions.set(normalizedPath, session.id);
          this.sessionCache.set(session.id, session);
          this.lastAccessedProject = normalizedPath;
        });
      });
      console.error(`[SessionManager] Preloaded ${this.activeSessions.size} active sessions`);
    } catch (error) {
      console.error('[SessionManager] Failed to preload sessions:', error);
    }
  }

  /**
   * 根据项目路径创建或获取项目
   */
  async getOrCreateProject(projectPath: string): Promise<Project> {
    // 1. 查找真实的项目根目录（向上查找 .git、package.json 等标识）
    const projectRoot = findProjectRoot(projectPath);
    const normalizedPath = normalizeProjectPath(projectRoot);
    
    console.error(`[SessionManager] Project path resolution: ${projectPath} -> ${normalizedPath}`);
    
    let project = this.db.getProjectByPath(normalizedPath);

    if (!project) {
      const projectInfo = await this.analyzeProject(normalizedPath);
      const projectId = this.db.createProject({
        name: projectInfo.name,
        path: normalizedPath,
        git_remote_url: projectInfo.gitRemoteUrl,
        language: projectInfo.language,
        framework: projectInfo.framework,
        metadata: JSON.stringify(projectInfo.metadata),
      });

      project = this.db.getProjectByPath(normalizedPath)!;
    } else {
      this.db.updateProjectAccess(project.id);
    }

    return project;
  }

  /**
   * 创建新的开发会话或复用现有活跃会话（增强版）
   * @param params 会话创建参数
   * @param params.force 是否强制创建新会话（默认false，会复用现有活跃会话）
   * @param params.autoDetectTool 是否自动检测工具类型（默认true）
   */
  async createSession(
    params: SessionCreateParams & { force?: boolean; autoDetectTool?: boolean }
  ): Promise<string> {
    // 自动检测项目路径（如果不提供）
    let projectPath = params.project_path;
    if (!projectPath) {
      projectPath = this.autoDetectProjectPath() || process.cwd();
      console.error(`[SessionManager] Auto-detected project path: ${projectPath}`);
    }

    const project = await this.getOrCreateProject(projectPath);

    // 自动检测工具类型（如果启用且未提供）
    let toolUsed = params.tool_used;
    if (params.autoDetectTool !== false && !toolUsed) {
      toolUsed = this.detectCurrentTool();
      console.error(`[SessionManager] Auto-detected tool: ${toolUsed}`);
    }

      // 检查是否已有活跃会话（确保项目隔离）
      const activeSessions = this.db.getActiveSessions(project.id);

      // 重要：移除智能会话复用逻辑
      // 每个项目应该有独立的主会话，不能跨项目复用
      // 只有在force=true时才允许复用（用于特殊场景）
      if (!params.force && activeSessions.length > 0) {
        console.error(`[DevMind] Project isolation: Found ${activeSessions.length} existing sessions for project ${project.id}, creating new session to maintain independence`);
        
        // 可选：结束所有旧会话，确保彻底的项目隔离
        console.error(`[DevMind] Ending ${activeSessions.length} old sessions to ensure clean project state`);
        activeSessions.forEach(session => {
          this.db.endSession(session.id);
        });
      }

    // 只有在强制创建或没有活跃会话时，才结束旧会话并创建新会话
    if (params.force && activeSessions.length > 0) {
      console.error(
        `[DevMind] Force creating new session, ending ${activeSessions.length} active session(s)`
      );
      activeSessions.forEach((session) => {
        this.db.endSession(session.id);
      });
    }

    // 创建新会话
    const sessionName =
      params.name || this.generateSessionName(params.tool_used);
    const initialMetadata = {
      ...(params.metadata || {}),
      tools_used: [params.tool_used],
      created_by: params.tool_used,
      created_at: new Date().toISOString(),
    };

    const sessionId = this.db.createSession({
      project_id: project.id,
      name: sessionName,
      tool_used: params.tool_used,
      status: "active",
      metadata: JSON.stringify(initialMetadata),
    });

    this.activeSessions.set(normalizeProjectPath(project.path), sessionId);
    console.error(
      `[DevMind] Created new session: ${sessionId} (${params.tool_used})`
    );

    return sessionId;
  }

  /**
   * 获取项目的当前活跃会话（增强版 - 支持自动推断）
   * @param projectPath 项目路径（可选，如果不提供会自动推断）
   * @returns 会话ID或null
   */
  async getCurrentSession(projectPath?: string): Promise<string | null> {
    // 如果没有提供projectPath，尝试自动推断
    if (!projectPath) {
      projectPath = this.autoDetectProjectPath();
      console.error(`[SessionManager] Auto-detected project path: ${projectPath}`);
    }

    if (!projectPath) {
      console.error('[SessionManager] No project path available and auto-detection failed');
      return null;
    }

    // 查找真实的项目根目录
    const projectRoot = findProjectRoot(projectPath);
    const normalizedPath = normalizeProjectPath(projectRoot);

    // 更新最近访问的项目
    this.lastAccessedProject = normalizedPath;

    // 先检查内存中的活跃会话
    if (this.activeSessions.has(normalizedPath)) {
      const sessionId = this.activeSessions.get(normalizedPath)!;
      const session = this.sessionCache.get(sessionId) || this.db.getSession(sessionId);
      if (session && session.status === "active") {
        return sessionId;
      } else {
        this.activeSessions.delete(normalizedPath);
        this.sessionCache.delete(sessionId);
      }
    }

    // 从数据库中查找活跃会话
    const project = this.db.getProjectByPath(normalizedPath);
    if (project) {
      const activeSessions = this.db.getActiveSessions(project.id);
      if (activeSessions.length > 0) {
        const sessionId = activeSessions[0].id;
        this.activeSessions.set(normalizedPath, sessionId);
        this.sessionCache.set(sessionId, activeSessions[0]);
        return sessionId;
      }
    }

    return null;
  }

  /**
   * 自动检测当前项目路径（多源推断）
   * @returns 检测到的项目路径或undefined
   */
  private autoDetectProjectPath(): string | undefined {
    // 优先级顺序（改进版 v2.5.0）
    const potentialPaths = [
      process.env.INIT_CWD,      // npm/npx初始目录
      process.env.PWD,            // Unix工作目录
      process.env.CD,             // Windows当前目录
      process.cwd(),              // Node.js当前目录
    ].filter(Boolean) as string[];

    // 多项目检测：尝试找到最匹配的项目
    let bestMatch: string | undefined;
    let maxScore = 0;

    for (const dir of potentialPaths) {
      try {
        if (!existsSync(dir)) continue;

        const projectRoot = findProjectRoot(dir);
        const normalizedPath = normalizeProjectPath(projectRoot);

        // 计算匹配分数
        let score = 0;
        const project = this.db.getProjectByPath(normalizedPath);

        // 如果项目已存在，加分
        if (project) {
          score += 10;
          // 如果是最近访问的项目，额外加分
          if (this.lastAccessedProject === normalizedPath) {
            score += 20;
          }
        }

        // 如果目录有 .git，加分
        try {
          if (existsSync(`${projectRoot}/.git`)) {
            score += 5;
          }
        } catch (e) {
          // 忽略错误
        }

        console.log(`[SessionManager] Project detection score for ${normalizedPath}: ${score}`);

        if (score > maxScore) {
          maxScore = score;
          bestMatch = normalizedPath;
        }
      } catch (error) {
        // 跳过无法访问的目录
        continue;
      }
    }

    if (bestMatch) {
      console.log(`[SessionManager] Auto-detected project path (score: ${maxScore}): ${bestMatch}`);
      return bestMatch;
    }

    // 兜底：返回规范化后的当前目录
    const fallbackDir = normalizeProjectPath(process.cwd());
    console.warn(`[SessionManager] No suitable project found, using fallback: ${fallbackDir}`);
    return fallbackDir;
  }

  /**
   * 自动检测当前使用的工具类型
   * @returns 工具类型字符串
   */
  private detectCurrentTool(): string {
    // 尝试从环境变量检测
    const toolFromEnv = process.env.DEVMIND_TOOL_TYPE ||
                       process.env.VSCODE_INJECTION_PATH ||
                       process.env.CURSOR_PATH ||
                       process.env.CLIENT_NAME;

    if (toolFromEnv) {
      // 转换为标准工具名称
      if (toolFromEnv.includes('vscode') || toolFromEnv.includes('VSCode')) {
        return 'vscode';
      } else if (toolFromEnv.includes('cursor') || toolFromEnv.includes('Cursor')) {
        return 'cursor';
      } else if (toolFromEnv.includes('claude') || toolFromEnv.includes('Claude')) {
        return 'claude-desktop';
      }
    }

    // 检测运行方式
    const execPath = process.execPath || '';
    if (execPath.includes('code') || execPath.includes('Code')) {
      return 'vscode';
    } else if (execPath.includes('cursor') || execPath.includes('Cursor')) {
      return 'cursor';
    }

    // 默认返回通用工具
    return 'cli';
  }

  /**
   * 获取缓存的会话数据
   */
  getCachedSession(sessionId: string): any {
    return this.sessionCache.get(sessionId);
  }

  /**
   * 更新会话缓存
   */
  updateSessionCache(sessionId: string, sessionData: any): void {
    this.sessionCache.set(sessionId, sessionData);
  }

  /**
   * 获取最近访问的项目路径
   */
  getLastAccessedProject(): string | null {
    return this.lastAccessedProject;
  }

  /**
   * 清除过期的会话缓存
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时

    for (const [sessionId, session] of this.sessionCache.entries()) {
      if (session.ended_at) {
        const endedAt = new Date(session.ended_at).getTime();
        if (now - endedAt > maxAge) {
          this.sessionCache.delete(sessionId);
          // 也要从activeSessions中移除
          for (const [path, sId] of this.activeSessions.entries()) {
            if (sId === sessionId) {
              this.activeSessions.delete(path);
              break;
            }
          }
        }
      }
    }

    console.error(`[SessionManager] Cache cleanup completed. Active sessions: ${this.sessionCache.size}`);
  }

  /**
   * 结束会话
   */
  endSession(sessionId: string): void {
    this.db.endSession(sessionId);

    // 从内存中移除
    for (const [path, sId] of this.activeSessions.entries()) {
      if (sId === sessionId) {
        this.activeSessions.delete(path);
        break;
      }
    }
  }

  /**
   * 分析项目结构和特征
   */
  private async analyzeProject(projectPath: string): Promise<{
    name: string;
    language: string;
    framework?: string;
    gitRemoteUrl?: string;
    metadata: Record<string, any>;
  }> {
    const projectName = basename(projectPath);
    let language = "unknown";
    let framework: string | undefined;
    let gitRemoteUrl: string | undefined;
    const metadata: Record<string, any> = {};

    // Git信息分析
    try {
      const git = simpleGit(projectPath);
      const isRepo = await git.checkIsRepo();
      if (isRepo) {
        const remotes = await git.getRemotes(true);
        if (remotes.length > 0) {
          gitRemoteUrl = remotes[0].refs.fetch;
        }

        // 获取当前分支
        try {
          const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
          metadata.currentBranch = currentBranch;
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // Not a git repo or git not available
    }

    // 项目类型和语言检测
    const detectionResult = this.detectProjectType(projectPath);
    language = detectionResult.language;
    framework = detectionResult.framework;
    Object.assign(metadata, detectionResult.metadata);

    return {
      name: projectName,
      language,
      framework,
      gitRemoteUrl,
      metadata,
    };
  }

  /**
   * 检测项目类型和编程语言
   */
  private detectProjectType(projectPath: string): {
    language: string;
    framework?: string;
    metadata: Record<string, any>;
  } {
    const metadata: Record<string, any> = {};

    // 检查配置文件
    const configFiles = [
      {
        file: "package.json",
        language: "javascript",
        parser: this.parsePackageJson,
      },
      {
        file: "pyproject.toml",
        language: "python",
        parser: this.parsePyproject,
      },
      { file: "requirements.txt", language: "python", parser: null },
      { file: "go.mod", language: "go", parser: this.parseGoMod },
      { file: "Cargo.toml", language: "rust", parser: this.parseCargoToml },
      { file: "pom.xml", language: "java", parser: null },
      { file: "build.gradle", language: "java", parser: null },
      { file: "composer.json", language: "php", parser: null },
      { file: "Gemfile", language: "ruby", parser: null },
      { file: "mix.exs", language: "elixir", parser: null },
    ];

    for (const config of configFiles) {
      const configPath = join(projectPath, config.file);
      if (existsSync(configPath)) {
        try {
          if (config.parser) {
            const parsed = config.parser(configPath);
            Object.assign(metadata, parsed.metadata);
            return {
              language: config.language,
              framework: parsed.framework,
              metadata,
            };
          } else {
            return {
              language: config.language,
              metadata,
            };
          }
        } catch (e) {
          // Continue to next detection method
        }
      }
    }

    // 基于文件扩展名检测
    const languageByExtension = this.detectLanguageByFiles(projectPath);
    if (languageByExtension !== "unknown") {
      return {
        language: languageByExtension,
        metadata,
      };
    }

    return {
      language: "unknown",
      metadata,
    };
  }

  private parsePackageJson(filePath: string): {
    framework?: string;
    metadata: Record<string, any>;
  } {
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    const metadata: Record<string, any> = {
      packageName: content.name,
      version: content.version,
      scripts: Object.keys(content.scripts || {}),
    };

    let framework: string | undefined;

    // 检测框架
    const dependencies = {
      ...content.dependencies,
      ...content.devDependencies,
    };
    if (dependencies.react) framework = "react";
    else if (dependencies.vue) framework = "vue";
    else if (dependencies.angular || dependencies["@angular/core"])
      framework = "angular";
    else if (dependencies.next) framework = "nextjs";
    else if (dependencies.nuxt) framework = "nuxt";
    else if (dependencies.express) framework = "express";
    else if (dependencies.nest || dependencies["@nestjs/core"])
      framework = "nestjs";

    metadata.dependencies = Object.keys(dependencies).slice(0, 10); // 限制数量

    return { framework, metadata };
  }

  private parsePyproject(filePath: string): {
    framework?: string;
    metadata: Record<string, any>;
  } {
    const content = readFileSync(filePath, "utf-8");
    const metadata: Record<string, any> = {};

    // 简单的TOML解析（仅提取基本信息）
    const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
    if (nameMatch) metadata.packageName = nameMatch[1];

    const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
    if (versionMatch) metadata.version = versionMatch[1];

    let framework: string | undefined;
    if (content.includes("django")) framework = "django";
    else if (content.includes("fastapi")) framework = "fastapi";
    else if (content.includes("flask")) framework = "flask";

    return { framework, metadata };
  }

  private parseGoMod(filePath: string): {
    framework?: string;
    metadata: Record<string, any>;
  } {
    const content = readFileSync(filePath, "utf-8");
    const metadata: Record<string, any> = {};

    const moduleMatch = content.match(/module\s+(.+)/);
    if (moduleMatch) metadata.moduleName = moduleMatch[1];

    const goVersionMatch = content.match(/go\s+([\d.]+)/);
    if (goVersionMatch) metadata.goVersion = goVersionMatch[1];

    let framework: string | undefined;
    if (content.includes("gin-gonic/gin")) framework = "gin";
    else if (content.includes("gorilla/mux")) framework = "gorilla";
    else if (content.includes("echo")) framework = "echo";

    return { framework, metadata };
  }

  private parseCargoToml(filePath: string): {
    framework?: string;
    metadata: Record<string, any>;
  } {
    const content = readFileSync(filePath, "utf-8");
    const metadata: Record<string, any> = {};

    const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
    if (nameMatch) metadata.packageName = nameMatch[1];

    const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
    if (versionMatch) metadata.version = versionMatch[1];

    let framework: string | undefined;
    if (content.includes("actix-web")) framework = "actix";
    else if (content.includes("warp")) framework = "warp";
    else if (content.includes("rocket")) framework = "rocket";

    return { framework, metadata };
  }

  private detectLanguageByFiles(projectPath: string): string {
    const extensionMap: Record<string, string> = {
      ".js": "javascript",
      ".ts": "typescript",
      ".jsx": "javascript",
      ".tsx": "typescript",
      ".py": "python",
      ".go": "go",
      ".rs": "rust",
      ".java": "java",
      ".kt": "kotlin",
      ".php": "php",
      ".rb": "ruby",
      ".c": "c",
      ".cpp": "cpp",
      ".cs": "csharp",
      ".swift": "swift",
      ".dart": "dart",
    };

    try {
      // 简单统计文件扩展名
      const extensionCounts: Record<string, number> = {};

      const countFiles = (dir: string, depth = 0) => {
        if (depth > 3) return; // 限制搜索深度

        try {
          const files = require("fs").readdirSync(dir);
          for (const file of files) {
            const fullPath = join(dir, file);
            const stat = statSync(fullPath);

            if (
              stat.isDirectory() &&
              !file.startsWith(".") &&
              file !== "node_modules"
            ) {
              countFiles(fullPath, depth + 1);
            } else if (stat.isFile()) {
              const ext = file.substring(file.lastIndexOf("."));
              if (extensionMap[ext]) {
                extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
              }
            }
          }
        } catch (e) {
          // Continue
        }
      };

      countFiles(projectPath);

      // 找出最常见的扩展名
      let maxCount = 0;
      let detectedLang = "unknown";

      for (const [ext, count] of Object.entries(extensionCounts)) {
        if (count > maxCount) {
          maxCount = count;
          detectedLang = extensionMap[ext];
        }
      }

      return detectedLang;
    } catch (e) {
      return "unknown";
    }
  }

  private generateSessionName(toolUsed: string): string {
    const timestamp = new Date().toISOString().slice(0, 16).replace("T", "_");
    return `${toolUsed}_${timestamp}`;
  }

  /**
   * 生成项目指纹 - 用于跨工具唯一标识
   */
  async generateProjectFingerprint(projectPath: string): Promise<string> {
    const normalizedPath = normalizeProjectPath(projectPath);
    let hashComponents: string[] = [];

    // 1. 优先级：Git远程URL
    try {
      const git = simpleGit(projectPath);
      const isRepo = await git.checkIsRepo();
      if (isRepo) {
        const remotes = await git.getRemotes(true);
        if (remotes.length > 0 && remotes[0].refs.fetch) {
          hashComponents.push(`git:${remotes[0].refs.fetch}`);
        }
      }
    } catch (e) {
      // Git不可用，继续其他方式
    }

    // 2. 主要配置文件哈希
    const configFiles = [
      "package.json",
      "pyproject.toml",
      "go.mod",
      "Cargo.toml",
      "pom.xml",
      "build.gradle",
      "composer.json",
      "Gemfile",
    ];

    for (const configFile of configFiles) {
      const configPath = join(normalizedPath, configFile);
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, "utf-8");
          const configHash = createHash("md5")
            .update(content)
            .digest("hex")
            .substring(0, 8);
          hashComponents.push(`config:${configFile}:${configHash}`);
          break; // 只使用第一个找到的配置文件
        } catch (e) {
          // 文件读取失败，继续
        }
      }
    }

    // 3. Fallback: 项目路径
    hashComponents.push(`path:${normalizedPath}`);

    // 生成最终指纹
    const fingerprint = createHash("sha256")
      .update(hashComponents.join("|"))
      .digest("hex")
      .substring(0, 16);

    return fingerprint;
  }

  /**
   * 生成项目哈希ID用于session标识 (徃用兼容)
   */
  generateProjectHash(projectPath: string, gitRemoteUrl?: string): string {
    let hashInput = normalizeProjectPath(projectPath);

    if (gitRemoteUrl) {
      hashInput = gitRemoteUrl + "|" + hashInput;
    }

    return createHash("sha256")
      .update(hashInput)
      .digest("hex")
      .substring(0, 16);
  }
}
