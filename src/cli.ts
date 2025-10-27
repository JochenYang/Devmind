#!/usr/bin/env node

import { Command } from "commander";
import { DatabaseManager } from "./database.js";
import { SessionManager } from "./session-manager.js";
import { ContentExtractor } from "./content-extractor.js";
import { MemoryGraphGenerator } from "./memory-graph-generator.js";
import { QualityScoreCalculator } from "./quality-score-calculator.js";
import { AiMemoryConfig } from "./types.js";
import { join, dirname } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, statSync } from "fs";
import { fileURLToPath } from "url";

// 动态获取版本号
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const VERSION = packageJson.version;

const program = new Command();

// 默认配置
const defaultConfig: AiMemoryConfig = {
  database_path: join(homedir(), ".devmind", "memory.db"),
  max_contexts_per_session: 1000,
  quality_threshold: 0.3,
  ignored_patterns: [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "*.log",
    "*.tmp",
  ],
  included_extensions: [
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".php",
    ".rb",
    ".c",
    ".cpp",
    ".cs",
    ".swift",
    ".dart",
    ".md",
    ".txt",
  ],
};

program
  .name("devmind-mcp")
  .description(
    "DevMind MCP - AI开发者的智能大脑，提供跨工具的项目上下文记忆系统"
  )
  .version(VERSION);

// 初始化命令
program
  .command("init")
  .description("Initialize AI Memory configuration")
  .option("--config-path <path>", "Config file path", ".devmind.json")
  .action((options) => {
    const configPath = options.configPath;

    if (existsSync(configPath)) {
      console.log(`Config file already exists: ${configPath}`);
      return;
    }

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created config file: ${configPath}`);
  });

// 统计命令
program
  .command("stats")
  .description("Show memory database statistics")
  .option("--config <path>", "Config file path", ".devmind.json")
  .action((options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);

    const stats = db.getStats();
    console.log("DevMind Statistics:");
    console.log(`  Projects: ${stats.total_projects}`);
    console.log(
      `  Sessions: ${stats.total_sessions} (${stats.active_sessions} active)`
    );
    console.log(`  Contexts: ${stats.total_contexts}`);

    db.close();
  });

// 项目命令
program
  .command("project")
  .description("Manage projects")
  .argument("<action>", "Action: list, create, info")
  .argument("[path]", "Project path (for create/info)")
  .option("--config <path>", "Config file path", ".devmind.json")
  .action(async (action, path, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);
    const sessionManager = new SessionManager(db, config);

    switch (action) {
      case "create":
        if (!path) {
          console.error("Project path is required for create action");
          process.exit(1);
        }
        try {
          const project = await sessionManager.getOrCreateProject(path);
          console.log(`Created/found project: ${project.name} (${project.id})`);
          console.log(`  Language: ${project.language}`);
          console.log(`  Framework: ${project.framework || "Unknown"}`);
          console.log(`  Path: ${project.path}`);
        } catch (error) {
          console.error(`Failed to create project: ${error}`);
        }
        break;

      case "info":
        if (!path) {
          console.error("Project path is required for info action");
          process.exit(1);
        }
        const project = db.getProjectByPath(path);
        if (project) {
          console.log(`Project: ${project.name}`);
          console.log(`  ID: ${project.id}`);
          console.log(`  Language: ${project.language}`);
          console.log(`  Framework: ${project.framework || "Unknown"}`);
          console.log(`  Path: ${project.path}`);
          console.log(`  Created: ${project.created_at}`);
          console.log(`  Last accessed: ${project.last_accessed}`);
          console.log(`  Git remote: ${project.git_remote_url || "None"}`);

          // Show active sessions
          const activeSessions = db.getActiveSessions(project.id);
          if (activeSessions.length > 0) {
            console.log(`  Active sessions: ${activeSessions.length}`);
            activeSessions.forEach((session) => {
              console.log(`    - ${session.name} (${session.tool_used})`);
            });
          }
        } else {
          console.log("Project not found");
        }
        break;

      default:
        console.error("Unknown action. Use: list, create, info");
    }

    db.close();
  });

// 会话命令
program
  .command("session")
  .description("Manage sessions")
  .argument("<action>", "Action: create, end, list, info")
  .argument(
    "[path_or_id]",
    "Project path (for create/list) or session ID (for end/info)"
  )
  .option("--config <path>", "Config file path", ".devmind.json")
  .option("--tool <name>", "Tool name", "cli")
  .option("--name <name>", "Session name")
  .action(async (action, pathOrId, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);
    const sessionManager = new SessionManager(db, config);

    switch (action) {
      case "create":
        if (!pathOrId) {
          console.error("Project path is required for create action");
          process.exit(1);
        }
        try {
          const sessionId = await sessionManager.createSession({
            project_path: pathOrId,
            tool_used: options.tool,
            name: options.name,
          });
          console.log(`Created session: ${sessionId}`);
        } catch (error) {
          console.error(`Failed to create session: ${error}`);
        }
        break;

      case "end":
        if (!pathOrId) {
          console.error("Session ID is required for end action");
          process.exit(1);
        }
        try {
          sessionManager.endSession(pathOrId);
          console.log(`Ended session: ${pathOrId}`);
        } catch (error) {
          console.error(`Failed to end session: ${error}`);
        }
        break;

      case "info":
        if (!pathOrId) {
          console.error("Session ID is required for info action");
          process.exit(1);
        }
        const session = db.getSession(pathOrId);
        if (session) {
          console.log(`Session: ${session.name}`);
          console.log(`  ID: ${session.id}`);
          console.log(`  Project: ${session.project_id}`);
          console.log(`  Tool: ${session.tool_used}`);
          console.log(`  Status: ${session.status}`);
          console.log(`  Started: ${session.started_at}`);
          console.log(`  Ended: ${session.ended_at || "Still active"}`);

          // Show contexts count
          const contexts = db.getContextsBySession(session.id);
          console.log(`  Contexts: ${contexts.length}`);
        } else {
          console.log("Session not found");
        }
        break;

      default:
        console.error("Unknown action. Use: create, end, list, info");
    }

    db.close();
  });

// 搜索命令
program
  .command("search")
  .description("Search contexts")
  .argument("<query>", "Search query")
  .option("--config <path>", "Config file path", ".devmind.json")
  .option("--project <id>", "Project ID to search in")
  .option("--limit <number>", "Maximum number of results", "10")
  .action((query, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);

    const limit = parseInt(options.limit);
    const contexts = db.searchContexts(query, options.project, limit);

    console.log(`Found ${contexts.length} contexts for query: "${query}"`);
    contexts.forEach((context, index) => {
      console.log(`\n${index + 1}. Context ID: ${context.id}`);
      console.log(`   Type: ${context.type}`);
      console.log(`   File: ${context.file_path || "N/A"}`);
      console.log(`   Quality: ${context.quality_score.toFixed(2)}`);
      console.log(`   Tags: ${context.tags || "None"}`);
      console.log(
        `   Content: ${context.content.substring(0, 200)}${
          context.content.length > 200 ? "..." : ""
        }`
      );
    });

    db.close();
  });

// 提取命令
program
  .command("extract")
  .description("Extract context from file")
  .argument("<file>", "File path")
  .option("--config <path>", "Config file path", ".devmind.json")
  .option("--session <id>", "Session ID to record in")
  .option("--record", "Record extracted contexts")
  .action((file, options) => {
    const config = loadConfig(options.config);
    const extractor = new ContentExtractor();

    try {
      const contexts = extractor.extractFromFile(file);
      console.log(`Extracted ${contexts.length} contexts from ${file}`);

      if (options.record && options.session) {
        const db = new DatabaseManager(config.database_path!);

        contexts.forEach((context, index) => {
          const contextId = db.createContext({
            session_id: options.session,
            type: context.type,
            content: context.content,
            file_path: context.file_path,
            line_start: context.line_start,
            line_end: context.line_end,
            language: context.language,
            tags: context.tags.join(","),
            quality_score: context.quality_score,
            metadata: JSON.stringify(context.metadata),
          });

          console.log(
            `  ${
              index + 1
            }. Recorded as ${contextId} (quality: ${context.quality_score.toFixed(
              2
            )})`
          );
        });

        db.close();
      } else {
        contexts.forEach((context, index) => {
          console.log(
            `  ${index + 1}. Type: ${
              context.type
            }, Quality: ${context.quality_score.toFixed(2)}`
          );
          console.log(`      Tags: ${context.tags.join(", ")}`);
          console.log(
            `      Content: ${context.content.substring(0, 100)}${
              context.content.length > 100 ? "..." : ""
            }`
          );
        });
      }
    } catch (error) {
      console.error(`Failed to extract from file: ${error}`);
    }
  });

// 记忆图谱导出命令
program
  .command("graph")
  .description("Export memory graph visualization")
  .argument("<project-id>", "Project ID")
  .option("--config <path>", "Config file path", ".devmind.json")
  .option("--output <path>", "Output file path")
  .option("--max-nodes <number>", "Maximum number of nodes (0 = all)", "0")
  .option(
    "--type <type>",
    "Filter by context type (all, solution, error, code, documentation, conversation)"
  )
  .action(async (projectId, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);
    const graphGen = new MemoryGraphGenerator(db);

    try {
      console.log(`\n🎨 Generating memory graph for project: ${projectId}`);

      const result = await graphGen.generateGraph(projectId, {
        max_nodes: parseInt(options.maxNodes),
        focus_type: options.type || "all",
        output_path: options.output,
      });

      console.log(`\n✅ HTML graph generated: ${result.file_path}`);
      console.log(`\n🌐 Open in browser to view interactive visualization`);
    } catch (error) {
      console.error(`\n❌ Failed to generate graph: ${error}`);
      process.exit(1);
    }

    db.close();
  });

// 质量评分更新命令
program
  .command("quality")
  .description("Update quality scores for contexts")
  .option("--config <path>", "Config file path", ".devmind.json")
  .option("--project <id>", "Project ID to filter")
  .option("--limit <number>", "Maximum contexts to update", "100")
  .option("--force", "Force update all contexts")
  .action(async (options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);
    const calculator = new QualityScoreCalculator();

    try {
      console.log("\n🚀 Updating quality scores...");

      // 获取需要更新的contexts
      const limit = parseInt(options.limit);
      const contexts = options.project
        ? db.getContextsByProject(options.project)
        : db.searchContexts("*", undefined, limit > 0 ? limit : 1000);

      let updated = 0;
      let failed = 0;
      let totalQuality = 0;

      contexts.forEach((context: any) => {
        try {
          const metrics = calculator.calculateQualityMetrics(context);
          const updatedMetadata =
            calculator.updateContextQualityMetrics(context);

          db.updateContext(context.id, {
            quality_score: metrics.overall,
            metadata: updatedMetadata,
          });

          updated++;
          totalQuality += metrics.overall;
        } catch (err) {
          failed++;
          console.error(`   Failed to update context ${context.id}: ${err}`);
        }
      });

      console.log(`\n✅ Updated ${updated} contexts`);
      console.log(`   Failed: ${failed}`);

      if (updated > 0) {
        const avgQuality = totalQuality / updated;
        console.log(`\n📊 Average quality score: ${avgQuality.toFixed(3)}`);
      }
    } catch (error) {
      console.error(`\n❌ Failed to update quality scores: ${error}`);
      process.exit(1);
    }

    db.close();
  });

// 项目内存优化命令
program
  .command("optimize")
  .description("Optimize project memory storage")
  .argument("<project-id>", "Project ID")
  .option("--config <path>", "Config file path", ".devmind.json")
  .option("--dry-run", "Preview without applying changes")
  .action(async (projectId, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);

    try {
      const dryRun = options.dryRun || false;

      console.log(
        `\n🔧 ${dryRun ? "Analyzing" : "Optimizing"} project memory...`
      );
      console.log(`   Project: ${projectId}`);

      // 验证项目是否存在
      const project = db.getProject(projectId);
      if (!project) {
        console.error(`\n❌ Project not found: ${projectId}`);
        process.exit(1);
      }

      // 1. 查找重复上下文
      console.log("\n🔍 Finding duplicate contexts...");
      const duplicates = db.findDuplicateContexts(projectId);
      console.log(`   Found ${duplicates.length} duplicate contexts`);

      // 2. 查找低质量上下文（quality_score < 0.3 且超过 60 天未访问）
      console.log("\n🔍 Finding low quality contexts...");
      const lowQuality = db.getLowQualityContexts(projectId, 0.3, 60);
      console.log(`   Found ${lowQuality.length} low quality contexts`);

      // 3. 合并待删除列表
      const toDelete = [...duplicates, ...lowQuality];
      const uniqueToDelete = Array.from(new Set(toDelete.map((c) => c.id))).map(
        (id) => toDelete.find((c) => c.id === id)!
      );

      // 4. 计算节省的空间（估算）
      let totalSize = 0;
      uniqueToDelete.forEach((context) => {
        // 估算每个上下文的大小（内容 + 元数据 + embedding）
        const contentSize = context.content.length;
        const metadataSize = context.metadata
          ? JSON.stringify(context.metadata).length
          : 0;
        const embeddingSize = context.embedding ? 384 * 4 : 0; // 384维向量，每个float 4字节
        totalSize += contentSize + metadataSize + embeddingSize;
      });

      const sizeInKB = (totalSize / 1024).toFixed(2);
      const sizeInMB = (totalSize / 1024 / 1024).toFixed(2);

      // 5. 显示统计信息
      console.log("\n📊 Optimization Summary:");
      console.log(`   Total contexts to remove: ${uniqueToDelete.length}`);
      console.log(`   - Duplicates: ${duplicates.length}`);
      console.log(`   - Low quality: ${lowQuality.length}`);
      console.log(
        `   Estimated space savings: ${
          parseFloat(sizeInMB) > 1 ? sizeInMB + " MB" : sizeInKB + " KB"
        }`
      );

      // 6. 如果不是 dry-run，执行删除
      if (!dryRun) {
        if (uniqueToDelete.length > 0) {
          console.log("\n🗑️  Deleting contexts...");
          const deleted = db.deleteContextsBatch(
            uniqueToDelete.map((c) => c.id)
          );
          console.log(`   Deleted ${deleted} contexts`);
          console.log("\n✅ Optimization completed successfully!");
        } else {
          console.log(
            "\n✅ No contexts to delete. Memory is already optimized!"
          );
        }
      } else {
        console.log(
          "\n💡 This was a dry run. Use without --dry-run to apply changes."
        );

        // 显示一些示例将被删除的上下文
        if (uniqueToDelete.length > 0) {
          console.log("\n📋 Sample contexts that would be deleted:");
          uniqueToDelete.slice(0, 5).forEach((context, index) => {
            console.log(
              `   ${index + 1}. [${
                context.type
              }] Quality: ${context.quality_score.toFixed(2)}`
            );
            console.log(`      File: ${context.file_path || "N/A"}`);
            console.log(
              `      Content: ${context.content.substring(0, 80)}${
                context.content.length > 80 ? "..." : ""
              }`
            );
          });

          if (uniqueToDelete.length > 5) {
            console.log(`   ... and ${uniqueToDelete.length - 5} more`);
          }
        }
      }
    } catch (error) {
      console.error(`\n❌ Failed to optimize: ${error}`);
      process.exit(1);
    }

    db.close();
  });

// 数据库维护命令
program
  .command("maintenance")
  .description("Database maintenance operations")
  .argument("<action>", "Action: vacuum, backup, restore")
  .argument("[backup-file]", "Backup file path (for restore)")
  .option("--config <path>", "Config file path", ".devmind.json")
  .option("--output <path>", "Output file path for backup")
  .option("--force", "Force restore without confirmation")
  .action(async (action, backupFile, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);

    switch (action) {
      case "vacuum":
        console.log("Running database vacuum...");
        db.vacuum();
        console.log("Database vacuum completed");
        break;

      case "backup":
        try {
          console.log("\n💾 Creating database backup...");

          // 生成默认输出路径
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const defaultOutput = `devmind-backup-${timestamp}.json`;
          const outputPath = options.output || defaultOutput;

          // 导出所有数据
          console.log("   Exporting projects...");
          const projects = db.getAllProjects();

          console.log("   Exporting sessions...");
          const sessions = db.getAllSessions();

          console.log("   Exporting contexts...");
          const contexts = db.getAllContexts();

          console.log("   Exporting relationships...");
          const relationships = db.getAllRelationships();

          // 构建备份数据对象
          const backupData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            database_path: config.database_path,
            data: {
              projects,
              sessions,
              contexts,
              relationships,
            },
            stats: {
              total_projects: projects.length,
              total_sessions: sessions.length,
              total_contexts: contexts.length,
              total_relationships: relationships.length,
            },
          };

          // 序列化为 JSON 并保存到文件
          console.log(`   Writing to ${outputPath}...`);
          const jsonContent = JSON.stringify(backupData, null, 2);
          writeFileSync(outputPath, jsonContent, "utf-8");

          // 计算文件大小
          const fileStats = statSync(outputPath);
          const sizeInBytes = fileStats.size;
          const sizeInKB = (sizeInBytes / 1024).toFixed(2);
          const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);

          // 输出备份信息
          console.log("\n✅ Backup completed successfully!");
          console.log(`\n📁 Backup file: ${outputPath}`);
          console.log(
            `📊 File size: ${
              parseFloat(sizeInMB) > 1 ? sizeInMB + " MB" : sizeInKB + " KB"
            }`
          );
          console.log("\n📈 Backup contents:");
          console.log(`   Projects: ${projects.length}`);
          console.log(`   Sessions: ${sessions.length}`);
          console.log(`   Contexts: ${contexts.length}`);
          console.log(`   Relationships: ${relationships.length}`);
        } catch (error) {
          console.error(`\n❌ Failed to create backup: ${error}`);
          process.exit(1);
        }
        break;

      case "restore":
        try {
          if (!backupFile) {
            console.error("\n❌ Backup file path is required for restore");
            console.error(
              "   Usage: devmind maintenance restore <backup-file>"
            );
            process.exit(1);
          }

          if (!existsSync(backupFile)) {
            console.error(`\n❌ Backup file not found: ${backupFile}`);
            process.exit(1);
          }

          console.log("\n⚠️  WARNING: This will overwrite all existing data!");
          console.log(`   Restoring from: ${backupFile}`);

          // 提示用户确认（除非使用 --force）
          if (!options.force) {
            console.log(
              "\n   Type 'yes' to continue or anything else to cancel:"
            );
            // 使用同步方式读取用户输入
            const readline = await import("readline");
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });

            const answer = await new Promise<string>((resolve) => {
              rl.question("   > ", (ans) => {
                rl.close();
                resolve(ans);
              });
            });

            if (answer.toLowerCase() !== "yes") {
              console.log("\n❌ Restore cancelled");
              process.exit(0);
            }
          }

          console.log("\n📖 Reading backup file...");
          const backupContent = readFileSync(backupFile, "utf-8");
          const backupData = JSON.parse(backupContent);

          // 验证备份文件格式
          if (
            !backupData.data ||
            !backupData.data.projects ||
            !backupData.data.sessions ||
            !backupData.data.contexts ||
            !backupData.data.relationships
          ) {
            console.error("\n❌ Invalid backup file format");
            process.exit(1);
          }

          console.log("\n🗑️  Clearing existing data...");
          db.clearAllData();

          console.log("\n📥 Importing data...");

          // 导入 projects
          console.log("   Importing projects...");
          backupData.data.projects.forEach((project: any) => {
            db.restoreProject(project);
          });
          console.log(
            `   ✓ Imported ${backupData.data.projects.length} projects`
          );

          // 导入 sessions
          console.log("   Importing sessions...");
          backupData.data.sessions.forEach((session: any) => {
            db.restoreSession(session);
          });
          console.log(
            `   ✓ Imported ${backupData.data.sessions.length} sessions`
          );

          // 导入 contexts
          console.log("   Importing contexts...");
          backupData.data.contexts.forEach((context: any) => {
            db.restoreContext(context);
          });
          console.log(
            `   ✓ Imported ${backupData.data.contexts.length} contexts`
          );

          // 导入 relationships
          console.log("   Importing relationships...");
          backupData.data.relationships.forEach((relationship: any) => {
            db.restoreRelationship(relationship);
          });
          console.log(
            `   ✓ Imported ${backupData.data.relationships.length} relationships`
          );

          console.log("\n✅ Restore completed successfully!");
          console.log("\n📊 Restored data:");
          console.log(`   Projects: ${backupData.data.projects.length}`);
          console.log(`   Sessions: ${backupData.data.sessions.length}`);
          console.log(`   Contexts: ${backupData.data.contexts.length}`);
          console.log(
            `   Relationships: ${backupData.data.relationships.length}`
          );

          if (backupData.timestamp) {
            console.log(`\n🕐 Backup created at: ${backupData.timestamp}`);
          }
        } catch (error) {
          console.error(`\n❌ Failed to restore backup: ${error}`);
          process.exit(1);
        }
        break;

      default:
        console.error("Unknown action. Use: vacuum, backup, restore");
    }

    db.close();
  });

function loadConfig(configPath: string): AiMemoryConfig {
  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, "utf-8");
      return { ...defaultConfig, ...JSON.parse(configContent) };
    } catch (error) {
      console.error(`Failed to parse config file: ${error}`);
      return defaultConfig;
    }
  }
  return defaultConfig;
}

// Daemon 管理命令
program
  .command("start")
  .description("Start DevMind monitoring daemon")
  .option("--no-terminal", "Disable terminal command monitoring")
  .option("--project <path>", "Project path", process.cwd())
  .action(async (options) => {
    try {
      const { PidManager } = await import("./utils/pid-manager.js");
      const pidManager = new PidManager(options.project);

      // 检查是否已在运行
      const status = pidManager.getStatus();
      if (status.running) {
        console.log(`⚠️  守护进程已在运行`);
        console.log(`   PID: ${status.pid}`);
        console.log(`   运行时间: ${status.uptime}`);
        console.log(`   启动时间: ${status.startedAt}`);
        console.log(`\n   使用 'devmind stop' 停止守护进程`);
        process.exit(1);
      }

      console.log("🚀 启动 DevMind 守护进程...\n");

      // 使用 spawn 启动守护进程（后台运行）
      const { spawn } = await import("child_process");
      const { fileURLToPath } = await import("url");
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      const daemonPath = join(__dirname, "daemon.js");
      const args = [daemonPath, options.project];
      if (options.noTerminal) {
        args.push("--no-terminal");
      }

      const daemon = spawn("node", args, {
        detached: true,
        stdio: "ignore",
        cwd: options.project,
      });

      daemon.unref(); // 允许父进程退出

      // 等待一下确保守护进程启动
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 检查是否成功启动
      const newStatus = pidManager.getStatus();
      if (newStatus.running) {
        console.log("✅ 守护进程启动成功");
        console.log(`   PID: ${newStatus.pid}`);
        console.log(`   项目: ${options.project}`);
        console.log(`\n   使用 'devmind status' 查看状态`);
        console.log(`   使用 'devmind stop' 停止守护进程`);
      } else {
        console.error("❌ 守护进程启动失败");
        process.exit(1);
      }
    } catch (error) {
      console.error("❌ 启动守护进程失败:", error);
      process.exit(1);
    }
  });

program
  .command("stop")
  .description("Stop DevMind monitoring daemon")
  .option("--project <path>", "Project path", process.cwd())
  .action(async (options) => {
    try {
      const { PidManager } = await import("./utils/pid-manager.js");
      const pidManager = new PidManager(options.project);

      const status = pidManager.getStatus();
      if (!status.running) {
        console.log("ℹ️  没有运行中的守护进程");
        process.exit(0);
      }

      console.log(`🛑 停止守护进程 (PID: ${status.pid})...`);

      const killed = pidManager.killProcess();
      if (killed) {
        console.log("✅ 守护进程已停止");
      } else {
        console.error("❌ 停止守护进程失败");
        process.exit(1);
      }
    } catch (error) {
      console.error("❌ 停止守护进程失败:", error);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Check DevMind daemon status")
  .option("--project <path>", "Project path", process.cwd())
  .action(async (options) => {
    try {
      const { PidManager } = await import("./utils/pid-manager.js");
      const pidManager = new PidManager(options.project);

      const status = pidManager.getStatus();

      console.log("\n📊 DevMind 守护进程状态\n");
      console.log(`   项目: ${options.project}`);

      if (status.running) {
        console.log(`   状态: ✅ 运行中`);
        console.log(`   PID: ${status.pid}`);
        console.log(`   运行时间: ${status.uptime}`);
        console.log(`   启动时间: ${status.startedAt}`);
      } else {
        console.log(`   状态: ⭕ 未运行`);
      }

      console.log("");
    } catch (error) {
      console.error("❌ 检查状态失败:", error);
      process.exit(1);
    }
  });

// 清理残留进程
program
  .command("cleanup")
  .description("Cleanup orphaned DevMind and MCP processes")
  .option("--force", "Force kill all related processes")
  .option("--dry-run", "Show processes without killing them")
  .action(async (options) => {
    try {
      console.log("\n🗑️  检查残留的 Node.js 进程...\n");

      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      let processes: any[] = [];

      // Windows和Unix/Linux不同的命令
      if (process.platform === "win32") {
        // Windows: 使用 wmic 查找进程
        const { stdout } = await execAsync(
          'wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv',
          { maxBuffer: 1024 * 1024 * 10 }
        );

        const lines = stdout.split("\n").filter((line) => line.trim());
        for (const line of lines.slice(1)) {
          // 跳过标题行
          const parts = line.split(",");
          if (parts.length >= 3) {
            const commandLine = parts.slice(1, -1).join(",").trim();
            const pid = parts[parts.length - 1].trim();

            if (
              commandLine.includes("devmind-mcp") ||
              commandLine.includes("daemon.js") ||
              commandLine.includes(".devmind")
            ) {
              processes.push({
                pid: parseInt(pid),
                command: commandLine.substring(0, 120),
              });
            }
          }
        }
      } else {
        // Unix/Linux/Mac: 使用 ps
        const { stdout } = await execAsync(
          "ps aux | grep -E 'node.*devmind|node.*daemon.js|node.*.devmind' | grep -v grep"
        );

        const lines = stdout.split("\n").filter((line) => line.trim());
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 11) {
            const pid = parseInt(parts[1]);
            const command = parts.slice(10).join(" ");

            processes.push({
              pid,
              command: command.substring(0, 120),
            });
          }
        }
      }

      if (processes.length === 0) {
        console.log("✅ 没有发现残留的 DevMind 进程");
        return;
      }

      console.log(`🔍 发现 ${processes.length} 个 DevMind 相关进程:\n`);

      processes.forEach((proc, index) => {
        console.log(`${index + 1}. PID: ${proc.pid}`);
        console.log(`   命令: ${proc.command}`);
        console.log("");
      });

      if (options.dryRun) {
        console.log("💡 这是模拟运行，使用 --force 来实际杀死进程");
        return;
      }

      // 询问用户确认（除非使用 --force）
      if (!options.force) {
        const readline = await import("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            "⚠️  是否终止这些进程? (输入 'yes' 确认): ",
            (ans) => {
              rl.close();
              resolve(ans);
            }
          );
        });

        if (answer.toLowerCase() !== "yes") {
          console.log("\n❌ 操作已取消");
          return;
        }
      }

      console.log("\n🛑 正在终止进程...\n");

      let killed = 0;
      let failed = 0;

      for (const proc of processes) {
        try {
          if (process.platform === "win32") {
            await execAsync(`taskkill /F /PID ${proc.pid}`);
          } else {
            await execAsync(`kill -9 ${proc.pid}`);
          }
          console.log(`✅ 已终止 PID: ${proc.pid}`);
          killed++;
        } catch (error) {
          console.error(`❌ 无法终止 PID ${proc.pid}: ${error}`);
          failed++;
        }
      }

      console.log(`\n📊 清理结果:`);
      console.log(`   已终止: ${killed}`);
      console.log(`   失败: ${failed}`);

      if (killed > 0) {
        console.log("\n✅ 进程清理完成");
      }
    } catch (error) {
      console.error("❌ 清理进程失败:", error);
      process.exit(1);
    }
  });

// 如果没有提供任何命令或参数，启动MCP服务器
if (process.argv.length <= 2) {
  // 启动MCP服务器
  import("./index.js")
    .then(() => {
      // MCP服务器会自动启动并处理stdio
    })
    .catch(console.error);
} else {
  program.parse();
}
