/**
 * DevMind MCP 项目初始化文档生成器
 *
 * 生成项目全面文档
 * 用于AI助手快速理解项目结构和上下文
 */

import { ProjectAnalyzer } from "../tools/ProjectAnalyzer.js";
import { FileScanner } from "../tools/FileScanner.js";
import { ContentExtractor } from "../tools/ContentExtractor.js";
import {
  DEFAULT_INDEXING_CONFIG,
  DEFAULT_COMPRESSION_CONFIG,
  IndexingConfig,
  ContentCompressionConfig,
} from "../types/IndexingTypes.js";
import { DatabaseManager } from "../../database.js";
import * as path from "path";
import * as fs from "fs/promises";

/**
 * 项目初始化文档结构
 */
export interface ProjectInitDoc {
  // 基础信息
  projectName: string;
  projectPath: string;
  description: string;
  generatedAt: string;

  // 项目概览
  overview: {
    type: string;
    language: string;
    framework?: string;
    runtime?: string;
    packageManager?: string;
    version?: string;
    repository?: string;
  };

  // 技术栈
  techStack: {
    languages: string[];
    frameworks: string[];
    databases?: string[];
    cloudServices?: string[];
    devTools: string[];
    testingTools?: string[];
  };

  // 项目结构
  structure: {
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
    mainEntryPoints: string[];
    configFiles: string[];
    testDirectories?: string[];
    documentationFiles?: string[];
    keyDirectories: Array<{
      path: string;
      description: string;
      fileCount: number;
    }>;
  };

  // 依赖关系
  dependencies: {
    production: Record<string, string>;
    development: Record<string, string>;
    totalCount: number;
    keyDependencies: Array<{
      name: string;
      version: string;
      purpose: string;
    }>;
  };

  // 代码统计
  codeStatistics: {
    totalLines: number;
    codeLines: number;
    commentLines: number;
    blankLines: number;
    filesByLanguage: Record<string, number>;
    linesByLanguage: Record<string, number>;
  };

  // 架构洞察
  architecture: {
    patterns: string[];
    designPrinciples: string[];
    projectPhase:
      | "initialization"
      | "development"
      | "testing"
      | "production"
      | "maintenance";
    suggestions: string[];
  };

  // 快速开始指南
  quickStart: {
    installation: string[];
    developmentSetup: string[];
    buildCommands?: string[];
    testCommands?: string[];
    deploymentGuide?: string[];
  };

  // AI助手指引
  aiGuidelines: {
    projectConventions: string[];
    codingStandards: string[];
    importantFiles: Array<{
      file: string;
      reason: string;
    }>;
    commonTasks: Array<{
      task: string;
      approach: string;
    }>;
    warnings: string[];
  };

  // 项目健康度
  healthCheck: {
    score: number; // 0-100
    strengths: string[];
    improvements: string[];
    risks: string[];
  };
}

/**
 * 项目初始化文档生成器
 */
export class ProjectInitDocGenerator {
  private projectAnalyzer: ProjectAnalyzer;
  private fileScanner: FileScanner;
  private contentExtractor: ContentExtractor;
  private indexingConfig: IndexingConfig;
  private compressionConfig: ContentCompressionConfig;

  constructor(
    indexingConfig?: IndexingConfig,
    compressionConfig?: ContentCompressionConfig
  ) {
    this.indexingConfig = indexingConfig || { ...DEFAULT_INDEXING_CONFIG };
    this.compressionConfig = compressionConfig || {
      ...DEFAULT_COMPRESSION_CONFIG,
    };

    this.projectAnalyzer = new ProjectAnalyzer();
    this.fileScanner = new FileScanner(this.indexingConfig);
    this.contentExtractor = new ContentExtractor(this.compressionConfig);
  }

  /**
   * 生成项目初始化文档
   */
  public async generateInitDoc(projectPath: string): Promise<ProjectInitDoc> {
    console.log(`🚀 开始生成项目初始化文档: ${projectPath}`);

    // 1. 扫描文件
    const files = await this.fileScanner.scan(projectPath, this.indexingConfig);

    // 2. 分析项目
    const { structure, features } = await this.projectAnalyzer.analyzeProject(
      projectPath,
      files
    );

    // 补充configFiles信息
    const configFiles = this.extractConfigFiles(files);

    // 3. 读取关键配置文件
    const packageInfo = await this.readPackageJson(projectPath);
    const gitInfo = await this.getGitInfo(projectPath);

    // 4. 分析代码统计
    const codeStats = await this.analyzeCodeStatistics(files);

    // 5. 生成架构洞察
    const architectureInsights = this.generateArchitectureInsights(
      features,
      structure,
      configFiles
    );

    // 6. 生成快速开始指南
    const quickStartGuide = this.generateQuickStartGuide(
      packageInfo,
      structure,
      configFiles
    );

    // 7. 生成AI指引
    const aiGuidelines = this.generateAIGuidelines(features, files, configFiles);

    // 8. 项目健康检查
    const healthCheck = this.performHealthCheck(structure, features, codeStats, configFiles);

    // 组装文档
    const doc: ProjectInitDoc = {
      projectName: structure.name,
      projectPath: projectPath,
      description: this.generateProjectDescription(features, structure),
      generatedAt: new Date().toISOString(),

      overview: {
        type: features.projectType,
        language: features.technicalStack.language,
        framework: features.technicalStack.framework,
        runtime: features.technicalStack.runtime,
        packageManager: this.detectPackageManager(configFiles),
        version: packageInfo?.version,
        repository: gitInfo?.remoteUrl,
      },

      techStack: {
        languages: this.extractLanguages(files),
        frameworks: features.technicalStack.framework
          ? [features.technicalStack.framework]
          : [],
        databases: features.technicalStack.database,
        cloudServices: features.technicalStack.cloudServices,
        devTools: features.technicalStack.devTools,
        testingTools: [],
      },

      structure: {
        totalFiles: structure.totalFiles,
        totalDirectories: structure.directories.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        mainEntryPoints: this.findEntryPoints(files),
        configFiles: [],
        testDirectories: this.findTestDirectories(structure.directories),
        documentationFiles: this.findDocumentationFiles(files),
        keyDirectories: this.analyzeKeyDirectories(
          structure.directories,
          files
        ),
      },

      dependencies: {
        production: packageInfo?.dependencies || {},
        development: packageInfo?.devDependencies || {},
        totalCount:
          Object.keys(packageInfo?.dependencies || {}).length +
          Object.keys(packageInfo?.devDependencies || {}).length,
        keyDependencies: this.identifyKeyDependencies(packageInfo),
      },

      codeStatistics: codeStats,
      architecture: architectureInsights,
      quickStart: quickStartGuide,
      aiGuidelines: aiGuidelines,
      healthCheck: healthCheck,
    };

    console.log(`✅ 项目初始化文档生成完成`);
    return doc;
  }

  /**
   * 将文档格式化为Markdown
   */
  public formatAsMarkdown(doc: ProjectInitDoc): string {
    const lines: string[] = [];

    // 标题和概述
    lines.push(`# ${doc.projectName}`);
    lines.push("");
    lines.push(doc.description);
    lines.push("");
    lines.push(`> Generated at: ${new Date(doc.generatedAt).toLocaleString()}`);
    lines.push("");

    // 项目概览
    lines.push("## 📋 Project Overview");
    lines.push("");
    lines.push(`- **Type**: ${doc.overview.type}`);
    lines.push(`- **Language**: ${doc.overview.language}`);
    if (doc.overview.framework)
      lines.push(`- **Framework**: ${doc.overview.framework}`);
    if (doc.overview.runtime)
      lines.push(`- **Runtime**: ${doc.overview.runtime}`);
    if (doc.overview.packageManager)
      lines.push(`- **Package Manager**: ${doc.overview.packageManager}`);
    if (doc.overview.version)
      lines.push(`- **Version**: ${doc.overview.version}`);
    if (doc.overview.repository)
      lines.push(`- **Repository**: ${doc.overview.repository}`);
    lines.push("");

    // 技术栈
    lines.push("## 🛠 Tech Stack");
    lines.push("");
    lines.push(`**Languages**: ${doc.techStack.languages.join(", ")}`);
    if (doc.techStack.frameworks.length > 0) {
      lines.push(`**Frameworks**: ${doc.techStack.frameworks.join(", ")}`);
    }
    if (doc.techStack.databases && doc.techStack.databases.length > 0) {
      lines.push(`**Databases**: ${doc.techStack.databases.join(", ")}`);
    }
    if (doc.techStack.cloudServices && doc.techStack.cloudServices.length > 0) {
      lines.push(
        `**Cloud Services**: ${doc.techStack.cloudServices.join(", ")}`
      );
    }
    lines.push(`**Dev Tools**: ${doc.techStack.devTools.join(", ")}`);
    lines.push("");

    // 项目结构
    lines.push("## 📁 Project Structure");
    lines.push("");
    lines.push(`- Total Files: ${doc.structure.totalFiles}`);
    lines.push(`- Total Directories: ${doc.structure.totalDirectories}`);
    lines.push(`- Total Size: ${this.formatSize(doc.structure.totalSize)}`);
    lines.push("");

    if (doc.structure.keyDirectories.length > 0) {
      lines.push("### Key Directories:");
      lines.push("");
      doc.structure.keyDirectories.forEach((dir) => {
        lines.push(
          `- **${dir.path}**: ${dir.description} (${dir.fileCount} files)`
        );
      });
      lines.push("");
    }

    if (doc.structure.mainEntryPoints.length > 0) {
      lines.push("### Entry Points:");
      lines.push("");
      doc.structure.mainEntryPoints.forEach((entry) => {
        lines.push(`- ${entry}`);
      });
      lines.push("");
    }

    // 依赖关系
    lines.push("## 📦 Dependencies");
    lines.push("");
    lines.push(`Total: ${doc.dependencies.totalCount} packages`);
    lines.push("");

    if (doc.dependencies.keyDependencies.length > 0) {
      lines.push("### Key Dependencies:");
      lines.push("");
      doc.dependencies.keyDependencies.forEach((dep) => {
        lines.push(`- **${dep.name}** (${dep.version}): ${dep.purpose}`);
      });
      lines.push("");
    }

    // 代码统计
    lines.push("## 📊 Code Statistics");
    lines.push("");
    lines.push(
      `- Total Lines: ${doc.codeStatistics.totalLines.toLocaleString()}`
    );
    lines.push(
      `- Code Lines: ${doc.codeStatistics.codeLines.toLocaleString()}`
    );
    lines.push(
      `- Comment Lines: ${doc.codeStatistics.commentLines.toLocaleString()}`
    );
    lines.push(
      `- Blank Lines: ${doc.codeStatistics.blankLines.toLocaleString()}`
    );
    lines.push("");

    // 架构洞察
    lines.push("## 🏗 Architecture Insights");
    lines.push("");
    lines.push(`**Project Phase**: ${doc.architecture.projectPhase}`);
    lines.push("");

    if (doc.architecture.patterns.length > 0) {
      lines.push("### Design Patterns:");
      doc.architecture.patterns.forEach((pattern) => {
        lines.push(`- ${pattern}`);
      });
      lines.push("");
    }

    if (doc.architecture.suggestions.length > 0) {
      lines.push("### Suggestions:");
      doc.architecture.suggestions.forEach((suggestion) => {
        lines.push(`- ${suggestion}`);
      });
      lines.push("");
    }

    // 快速开始
    lines.push("## 🚀 Quick Start");
    lines.push("");

    if (doc.quickStart.installation.length > 0) {
      lines.push("### Installation:");
      lines.push("```bash");
      doc.quickStart.installation.forEach((cmd) => {
        lines.push(cmd);
      });
      lines.push("```");
      lines.push("");
    }

    if (doc.quickStart.developmentSetup.length > 0) {
      lines.push("### Development Setup:");
      lines.push("```bash");
      doc.quickStart.developmentSetup.forEach((cmd) => {
        lines.push(cmd);
      });
      lines.push("```");
      lines.push("");
    }

    // AI助手指引
    lines.push("## 🤖 AI Assistant Guidelines");
    lines.push("");

    if (doc.aiGuidelines.projectConventions.length > 0) {
      lines.push("### Project Conventions:");
      doc.aiGuidelines.projectConventions.forEach((convention) => {
        lines.push(`- ${convention}`);
      });
      lines.push("");
    }

    if (doc.aiGuidelines.importantFiles.length > 0) {
      lines.push("### Important Files:");
      doc.aiGuidelines.importantFiles.forEach((file) => {
        lines.push(`- **${file.file}**: ${file.reason}`);
      });
      lines.push("");
    }

    if (doc.aiGuidelines.commonTasks.length > 0) {
      lines.push("### Common Tasks:");
      doc.aiGuidelines.commonTasks.forEach((task) => {
        lines.push(`- **${task.task}**: ${task.approach}`);
      });
      lines.push("");
    }

    // 项目健康度
    lines.push("## 💚 Project Health");
    lines.push("");
    lines.push(`**Health Score**: ${doc.healthCheck.score}/100`);
    lines.push("");

    if (doc.healthCheck.strengths.length > 0) {
      lines.push("### Strengths:");
      doc.healthCheck.strengths.forEach((strength) => {
        lines.push(`- ✅ ${strength}`);
      });
      lines.push("");
    }

    if (doc.healthCheck.improvements.length > 0) {
      lines.push("### Areas for Improvement:");
      doc.healthCheck.improvements.forEach((improvement) => {
        lines.push(`- ⚠️ ${improvement}`);
      });
      lines.push("");
    }

    if (doc.healthCheck.risks.length > 0) {
      lines.push("### Risks:");
      doc.healthCheck.risks.forEach((risk) => {
        lines.push(`- 🔴 ${risk}`);
      });
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 将文档保存为JSON格式
   */
  public async saveAsJson(
    doc: ProjectInitDoc,
    outputPath: string
  ): Promise<void> {
    const json = JSON.stringify(doc, null, 2);
    await fs.writeFile(outputPath, json, "utf-8");
    console.log(`💾 项目文档已保存到: ${outputPath}`);
  }

  /**
   * 将初始化文档保存到数据库
   */
  public async saveToDatabase(
    doc: ProjectInitDoc,
    sessionId: string,
    db: DatabaseManager
  ): Promise<string> {
    // 准备存储的内容 - 包含完整的项目初始化文档
    const content = JSON.stringify(doc, null, 2);

    // 准备元数据
    const metadata = {
      projectName: doc.projectName,
      projectPath: doc.projectPath,
      projectType: doc.overview.type,
      language: doc.overview.language,
      framework: doc.overview.framework,
      totalFiles: doc.structure.totalFiles,
      totalDirectories: doc.structure.totalDirectories,
      healthScore: doc.healthCheck.score,
      generatedAt: doc.generatedAt,
      documentType: 'project-init-doc'
    };

    // 创建上下文记录
    const context = {
      session_id: sessionId,
      type: 'project_overview' as any, // 使用项目概览类型
      content: content,
      file_path: doc.projectPath,
      line_start: undefined,
      line_end: undefined,
      language: doc.overview.language,
      tags: `project-init,${doc.overview.type},${doc.overview.language}${doc.overview.framework ? ',' + doc.overview.framework : ''}`,
      quality_score: 1.0, // 项目初始化文档具有最高质量分数
      embedding: undefined, // 可以稍后生成向量嵌入
      embedding_text: doc.description, // 用描述作为嵌入文本
      embedding_version: undefined,
      embedding_model: undefined,
      metadata: JSON.stringify(metadata)
    };

    // 保存到数据库
    const contextId = db.createContext(context);

    console.log(`✅ 项目初始化文档已保存到数据库 (ID: ${contextId})`);

    // 可选：同时保存Markdown格式作为单独的上下文
    const markdownContent = this.formatAsMarkdown(doc);

    const markdownContext = {
      session_id: sessionId,
      type: 'documentation' as any, // 文档类型
      content: markdownContent,
      file_path: path.join(doc.projectPath, 'PROJECT_INIT_DOC.md'),
      line_start: undefined,
      line_end: undefined,
      language: 'markdown',
      tags: `project-init-markdown,${doc.overview.type},${doc.overview.language}`,
      quality_score: 1.0,
      embedding: undefined,
      embedding_text: doc.description,
      embedding_version: undefined,
      embedding_model: undefined,
      metadata: JSON.stringify({
        ...metadata,
        format: 'markdown',
        parentContextId: contextId
      })
    };

    const markdownContextId = db.createContext(markdownContext);

    console.log(`✅ Markdown文档也已保存到数据库 (ID: ${markdownContextId})`);

    return contextId;
  }

  // 私有辅助方法

  private async readPackageJson(projectPath: string): Promise<any> {
    try {
      const packageJsonPath = path.join(projectPath, "package.json");
      const content = await fs.readFile(packageJsonPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private async getGitInfo(projectPath: string): Promise<any> {
    try {
      const gitConfigPath = path.join(projectPath, ".git", "config");
      const content = await fs.readFile(gitConfigPath, "utf-8");
      const remoteMatch = content.match(/url = (.+)/);
      return {
        isRepo: true,
        remoteUrl: remoteMatch ? remoteMatch[1] : null,
      };
    } catch {
      return null;
    }
  }

  private async analyzeCodeStatistics(files: any[]): Promise<any> {
    let totalLines = 0;
    let codeLines = 0;
    let commentLines = 0;
    let blankLines = 0;
    const filesByLanguage: Record<string, number> = {};
    const linesByLanguage: Record<string, number> = {};

    for (const file of files.slice(0, 100)) {
      // 限制分析前100个文件以提高性能
      const ext = path.extname(file.relativePath);
      const language = this.getLanguageByExtension(ext);

      if (language) {
        filesByLanguage[language] = (filesByLanguage[language] || 0) + 1;

        try {
          const content = await fs.readFile(file.absolutePath, "utf-8");
          const lines = content.split("\n");
          totalLines += lines.length;
          linesByLanguage[language] =
            (linesByLanguage[language] || 0) + lines.length;

          lines.forEach((line) => {
            const trimmed = line.trim();
            if (trimmed === "") {
              blankLines++;
            } else if (this.isCommentLine(trimmed, language)) {
              commentLines++;
            } else {
              codeLines++;
            }
          });
        } catch {
          // 忽略无法读取的文件
        }
      }
    }

    return {
      totalLines,
      codeLines,
      commentLines,
      blankLines,
      filesByLanguage,
      linesByLanguage,
    };
  }

  private generateProjectDescription(features: any, structure: any): string {
    const descriptions = [];

    if (features.projectType === "web-app") {
      descriptions.push(
        `A ${features.technicalStack.framework || "web"} application`
      );
    } else if (features.projectType === "library") {
      descriptions.push(`A ${features.technicalStack.language} library`);
    } else if (features.projectType === "api") {
      descriptions.push(`An API service`);
    } else {
      descriptions.push(`A ${features.projectType} project`);
    }

    if (features.technicalStack.framework) {
      descriptions.push(`built with ${features.technicalStack.framework}`);
    }

    if (structure.totalFiles > 100) {
      descriptions.push(
        `containing ${structure.totalFiles} files across ${structure.directories.length} directories`
      );
    }

    return descriptions.join(" ");
  }

  private detectPackageManager(configFiles: string[]): string | undefined {
    if (configFiles.includes("package-lock.json")) return "npm";
    if (configFiles.includes("yarn.lock")) return "yarn";
    if (configFiles.includes("pnpm-lock.yaml")) return "pnpm";
    if (configFiles.includes("bun.lockb")) return "bun";
    return undefined;
  }

  private extractLanguages(files: any[]): string[] {
    const languages = new Set<string>();
    files.forEach((file) => {
      const ext = path.extname(file.relativePath);
      const language = this.getLanguageByExtension(ext);
      if (language) languages.add(language);
    });
    return Array.from(languages);
  }

  private getLanguageByExtension(ext: string): string | null {
    const langMap: Record<string, string> = {
      ".js": "JavaScript",
      ".jsx": "JavaScript",
      ".ts": "TypeScript",
      ".tsx": "TypeScript",
      ".py": "Python",
      ".java": "Java",
      ".go": "Go",
      ".rs": "Rust",
      ".cpp": "C++",
      ".c": "C",
      ".cs": "C#",
      ".php": "PHP",
      ".rb": "Ruby",
      ".swift": "Swift",
      ".kt": "Kotlin",
      ".scala": "Scala",
      ".r": "R",
      ".m": "MATLAB",
      ".vue": "Vue",
      ".dart": "Dart",
    };
    return langMap[ext] || null;
  }

  private isCommentLine(line: string, language: string): boolean {
    const commentPatterns: Record<string, RegExp[]> = {
      JavaScript: [/^\/\//, /^\/\*/, /^\*/],
      TypeScript: [/^\/\//, /^\/\*/, /^\*/],
      Python: [/^#/, /^"""/],
      Java: [/^\/\//, /^\/\*/, /^\*/],
      Go: [/^\/\//, /^\/\*/, /^\*/],
      Rust: [/^\/\//, /^\/\*/, /^\*/],
      "C++": [/^\/\//, /^\/\*/, /^\*/],
      C: [/^\/\//, /^\/\*/, /^\*/],
      "C#": [/^\/\//, /^\/\*/, /^\*/],
    };

    const patterns = commentPatterns[language] || [];
    return patterns.some((pattern) => pattern.test(line));
  }

  private findEntryPoints(files: any[]): string[] {
    const entryPoints: string[] = [];
    const commonEntryFiles = [
      "index.js",
      "index.ts",
      "main.js",
      "main.ts",
      "app.js",
      "app.ts",
      "server.js",
      "server.ts",
    ];

    files.forEach((file) => {
      const fileName = path.basename(file.relativePath);
      if (commonEntryFiles.includes(fileName)) {
        entryPoints.push(file.relativePath);
      }
    });

    // 检查package.json中的main字段
    const hasPackageJson = files.some(f => path.basename(f.relativePath) === 'package.json');
    if (hasPackageJson) {
      // 这里简化处理，实际应该读取package.json
      entryPoints.push("package.json:main");
    }

    return entryPoints.slice(0, 5); // 限制最多返回5个入口点
  }

  private findTestDirectories(directories: string[]): string[] {
    return directories
      .filter(
        (dir) =>
          dir.includes("test") ||
          dir.includes("spec") ||
          dir.includes("__tests__")
      )
      .slice(0, 5);
  }

  private findDocumentationFiles(files: any[]): string[] {
    return files
      .filter((file) => {
        const fileName = path.basename(file.relativePath).toLowerCase();
        return (
          fileName.includes("readme") ||
          fileName.includes("doc") ||
          fileName.endsWith(".md")
        );
      })
      .map((file) => file.relativePath)
      .slice(0, 10);
  }

  private analyzeKeyDirectories(directories: string[], files: any[]): any[] {
    const dirInfo: Record<string, { count: number; description: string }> = {};

    // 统计每个目录的文件数
    files.forEach((file) => {
      const dir = path.dirname(file.relativePath);
      if (!dirInfo[dir]) {
        dirInfo[dir] = { count: 0, description: this.describeDirectory(dir) };
      }
      dirInfo[dir].count++;
    });

    // 选择最重要的目录
    return Object.entries(dirInfo)
      .filter(([dir, info]) => info.count > 2 && dir !== ".")
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([dir, info]) => ({
        path: dir,
        description: info.description,
        fileCount: info.count,
      }));
  }

  private describeDirectory(dir: string): string {
    const dirName = path.basename(dir).toLowerCase();

    const descriptions: Record<string, string> = {
      src: "Source code",
      lib: "Library code",
      test: "Test files",
      tests: "Test files",
      spec: "Test specifications",
      docs: "Documentation",
      dist: "Build output",
      build: "Build output",
      public: "Public assets",
      assets: "Static assets",
      config: "Configuration files",
      scripts: "Build/utility scripts",
      components: "UI components",
      pages: "Page components",
      utils: "Utility functions",
      helpers: "Helper functions",
      services: "Service layer",
      models: "Data models",
      controllers: "Controllers",
      routes: "Route definitions",
      api: "API endpoints",
      middleware: "Middleware",
      database: "Database related",
      migrations: "Database migrations",
      seeders: "Database seeders",
      types: "Type definitions",
      interfaces: "Interface definitions",
      constants: "Constants",
      styles: "Style files",
      css: "CSS files",
      sass: "SASS files",
      images: "Image assets",
      fonts: "Font files",
      vendor: "Third-party code",
      node_modules: "Dependencies",
    };

    return descriptions[dirName] || "Project files";
  }

  private identifyKeyDependencies(packageInfo: any): any[] {
    if (!packageInfo) return [];

    const keyDeps: any[] = [];
    const importantPackages: Record<string, string> = {
      react: "UI framework",
      vue: "UI framework",
      angular: "UI framework",
      express: "Web server framework",
      fastify: "Web server framework",
      koa: "Web server framework",
      next: "React framework",
      nuxt: "Vue framework",
      gatsby: "Static site generator",
      webpack: "Module bundler",
      vite: "Build tool",
      rollup: "Module bundler",
      typescript: "Type system",
      eslint: "Code linter",
      prettier: "Code formatter",
      jest: "Testing framework",
      mocha: "Testing framework",
      vitest: "Testing framework",
      axios: "HTTP client",
      lodash: "Utility library",
      moment: "Date library",
      dayjs: "Date library",
      mongoose: "MongoDB ODM",
      sequelize: "SQL ORM",
      prisma: "Database toolkit",
      redis: "Cache client",
      "socket.io": "WebSocket library",
      graphql: "Query language",
      "apollo-server": "GraphQL server",
      "@tensorflow/tfjs": "Machine learning",
      opencv4nodejs: "Computer vision",
      sharp: "Image processing",
    };

    const allDeps = {
      ...packageInfo.dependencies,
      ...packageInfo.devDependencies,
    };

    Object.entries(allDeps).forEach(([name, version]) => {
      const baseName = name.replace(/^@[^/]+\//, "").split("-")[0];
      if (importantPackages[baseName]) {
        keyDeps.push({
          name,
          version: version as string,
          purpose: importantPackages[baseName],
        });
      }
    });

    return keyDeps.slice(0, 10);
  }

  private generateArchitectureInsights(features: any, structure: any, configFiles: string[]): any {
    const patterns: string[] = [];
    const designPrinciples: string[] = [];
    const suggestions: string[] = [];

    // 检测架构模式
    if (structure.directories.some((d: string) => d.includes("controller"))) {
      patterns.push("MVC Pattern");
    }
    if (structure.directories.some((d: string) => d.includes("service"))) {
      patterns.push("Service Layer Pattern");
    }
    if (structure.directories.some((d: string) => d.includes("repository"))) {
      patterns.push("Repository Pattern");
    }
    if (structure.directories.some((d: string) => d.includes("middleware"))) {
      patterns.push("Middleware Pattern");
    }
    if (structure.directories.some((d: string) => d.includes("component"))) {
      patterns.push("Component-Based Architecture");
    }

    // 设计原则
    if (features.complexity.score < 30) {
      designPrinciples.push("Simple and straightforward design");
    } else if (features.complexity.score > 70) {
      designPrinciples.push("Modular architecture");
      designPrinciples.push("Separation of concerns");
    }

    // 确定项目阶段
    let projectPhase:
      | "initialization"
      | "development"
      | "testing"
      | "production"
      | "maintenance" = "development";
    if (structure.totalFiles < 20) {
      projectPhase = "initialization";
    } else if (
      structure.directories.some(
        (d: string) => d.includes("test") && structure.totalFiles > 50
      )
    ) {
      projectPhase = "testing";
    } else if (
      configFiles.some(
        (f: string) => f.includes("docker") || f.includes("k8s")
      )
    ) {
      projectPhase = "production";
    }

    // 生成建议
    if (!structure.directories.some((d: string) => d.includes("test"))) {
      suggestions.push("Consider adding unit tests");
    }
    if (!configFiles.includes(".gitignore")) {
      suggestions.push("Add .gitignore file");
    }
    if (!configFiles.some((f: string) => f.includes("lint"))) {
      suggestions.push("Set up code linting");
    }
    if (
      features.complexity.score > 60 &&
      !configFiles.some((f: string) => f.includes("docker"))
    ) {
      suggestions.push("Consider containerization with Docker");
    }

    return {
      patterns,
      designPrinciples,
      projectPhase,
      suggestions,
    };
  }

  private generateQuickStartGuide(packageInfo: any, structure: any, configFiles: string[]): any {
    const installation: string[] = [];
    const developmentSetup: string[] = [];
    const buildCommands: string[] = [];
    const testCommands: string[] = [];

    // 检测包管理器
    let packageManager = "npm";
    if (configFiles.includes("yarn.lock")) packageManager = "yarn";
    if (configFiles.includes("pnpm-lock.yaml"))
      packageManager = "pnpm";
    if (configFiles.includes("bun.lockb")) packageManager = "bun";

    // 安装命令
    installation.push(`# Clone the repository`);
    installation.push(`git clone <repository-url>`);
    installation.push(`cd ${structure.name}`);
    installation.push("");
    installation.push(`# Install dependencies`);
    installation.push(`${packageManager} install`);

    // 开发设置
    if (packageInfo?.scripts?.dev) {
      developmentSetup.push(`${packageManager} run dev`);
    } else if (packageInfo?.scripts?.start) {
      developmentSetup.push(`${packageManager} start`);
    } else {
      developmentSetup.push(`# Check package.json for available scripts`);
    }

    // 构建命令
    if (packageInfo?.scripts?.build) {
      buildCommands.push(`${packageManager} run build`);
    }

    // 测试命令
    if (packageInfo?.scripts?.test) {
      testCommands.push(`${packageManager} test`);
    }

    return {
      installation,
      developmentSetup,
      buildCommands: buildCommands.length > 0 ? buildCommands : undefined,
      testCommands: testCommands.length > 0 ? testCommands : undefined,
      deploymentGuide: undefined,
    };
  }

  private generateAIGuidelines(
    features: any,
    files: any[],
    configFiles: string[]
  ): any {
    const projectConventions: string[] = [];
    const codingStandards: string[] = [];
    const importantFiles: any[] = [];
    const commonTasks: any[] = [];
    const warnings: string[] = [];

    // 项目约定
    if (configFiles.includes("tsconfig.json")) {
      projectConventions.push("TypeScript is used for type safety");
    }
    if (configFiles.includes(".prettierrc")) {
      projectConventions.push("Prettier is used for code formatting");
    }
    if (configFiles.includes(".eslintrc")) {
      projectConventions.push("ESLint is used for code linting");
    }

    // 编码标准
    if (features.technicalStack.language === "TypeScript") {
      codingStandards.push("Use TypeScript types and interfaces");
      codingStandards.push('Avoid using "any" type');
    }
    if (features.technicalStack.framework === "React") {
      codingStandards.push("Use functional components with hooks");
      codingStandards.push("Follow React best practices");
    }

    // 重要文件
    const importantConfigFiles = [
      "package.json",
      "tsconfig.json",
      ".env.example",
      "README.md",
    ];
    importantConfigFiles.forEach((file) => {
      if (configFiles.includes(file)) {
        importantFiles.push({
          file,
          reason: this.getFileImportanceReason(file),
        });
      }
    });

    // 入口文件
    const entryFiles = this.findEntryPoints(files);
    if (entryFiles.length > 0) {
      importantFiles.push({
        file: entryFiles[0],
        reason: "Main entry point of the application",
      });
    }

    // 常见任务
    commonTasks.push({
      task: "Add new feature",
      approach:
        "Create feature branch, implement in appropriate directory, add tests",
    });
    commonTasks.push({
      task: "Fix bug",
      approach:
        "Reproduce issue, identify root cause, implement fix with tests",
    });
    commonTasks.push({
      task: "Improve performance",
      approach:
        "Profile application, identify bottlenecks, optimize critical paths",
    });

    // 警告
    if (files.some((f) => f.relativePath.includes(".env"))) {
      warnings.push("Never commit .env files with sensitive data");
    }
    if (!configFiles.includes(".gitignore")) {
      warnings.push("Add .gitignore to prevent committing sensitive files");
    }

    return {
      projectConventions,
      codingStandards,
      importantFiles: importantFiles.slice(0, 10),
      commonTasks,
      warnings,
    };
  }

  private getFileImportanceReason(file: string): string {
    const reasons: Record<string, string> = {
      "package.json": "Project configuration and dependencies",
      "tsconfig.json": "TypeScript configuration",
      ".env.example": "Environment variables template",
      "README.md": "Project documentation",
      "docker-compose.yml": "Docker services configuration",
      "webpack.config.js": "Webpack bundler configuration",
      "vite.config.js": "Vite build configuration",
      ".eslintrc": "ESLint rules configuration",
      ".prettierrc": "Prettier formatting configuration",
    };
    return reasons[file] || "Configuration file";
  }

  private performHealthCheck(
    structure: any,
    features: any,
    codeStats: any,
    configFiles: string[]
  ): any {
    let score = 50; // 基础分数
    const strengths: string[] = [];
    const improvements: string[] = [];
    const risks: string[] = [];

    // 正面因素
    if (configFiles.includes("README.md")) {
      score += 5;
      strengths.push("Has documentation");
    }
    if (structure.directories.some((d: string) => d.includes("test"))) {
      score += 10;
      strengths.push("Has test suite");
    }
    if (configFiles.includes(".gitignore")) {
      score += 5;
      strengths.push("Proper Git configuration");
    }
    if (configFiles.some((f: string) => f.includes("lint"))) {
      score += 5;
      strengths.push("Code linting configured");
    }
    if (features.technicalStack.language === "TypeScript") {
      score += 5;
      strengths.push("Uses TypeScript for type safety");
    }
    if (codeStats.commentLines > codeStats.codeLines * 0.1) {
      score += 5;
      strengths.push("Well-documented code");
    }

    // 负面因素
    if (!configFiles.includes("README.md")) {
      score -= 10;
      improvements.push("Add README documentation");
    }
    if (!structure.directories.some((d: string) => d.includes("test"))) {
      score -= 10;
      improvements.push("Add test coverage");
    }
    if (features.complexity.score > 80) {
      score -= 5;
      risks.push("High complexity may affect maintainability");
    }
    if (structure.totalFiles > 500) {
      improvements.push("Consider modularizing large codebase");
    }

    // 确保分数在0-100范围内
    score = Math.max(0, Math.min(100, score));

    return {
      score,
      strengths,
      improvements,
      risks,
    };
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  private extractConfigFiles(files: any[]): string[] {
    const configFileNames = [
      "package.json",
      "tsconfig.json",
      ".eslintrc",
      ".eslintrc.js",
      ".eslintrc.json",
      ".prettierrc",
      ".prettierrc.js",
      ".prettierrc.json",
      "webpack.config.js",
      "vite.config.js",
      "rollup.config.js",
      ".gitignore",
      ".env.example",
      "docker-compose.yml",
      "Dockerfile",
      ".babelrc",
      "jest.config.js",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bun.lockb"
    ];

    return files
      .filter(file => {
        const fileName = path.basename(file.relativePath);
        return configFileNames.includes(fileName);
      })
      .map(file => path.basename(file.relativePath));
  }
}
