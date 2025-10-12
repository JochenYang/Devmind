#!/usr/bin/env node

import { Command } from 'commander';
import { DatabaseManager } from './database.js';
import { SessionManager } from './session-manager.js';
import { ContentExtractor } from './content-extractor.js';
import { AiMemoryConfig } from './types.js';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

// 动态获取版本号
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const VERSION = packageJson.version;

const program = new Command();

// 默认配置
const defaultConfig: AiMemoryConfig = {
  database_path: join(homedir(), '.devmind', 'memory.db'),
  max_contexts_per_session: 1000,
  quality_threshold: 0.3,
  ignored_patterns: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '*.log',
    '*.tmp'
  ],
  included_extensions: [
    '.js', '.ts', '.jsx', '.tsx',
    '.py', '.go', '.rs', '.java', '.kt',
    '.php', '.rb', '.c', '.cpp', '.cs',
    '.swift', '.dart', '.md', '.txt'
  ]
};

program
  .name('devmind-mcp')
  .description('DevMind MCP - AI开发者的智能大脑，提供跨工具的项目上下文记忆系统')
  .version(VERSION);


// 初始化命令
program
  .command('init')
  .description('Initialize AI Memory configuration')
  .option('--config-path <path>', 'Config file path', '.devmind.json')
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
  .command('stats')
  .description('Show memory database statistics')
  .option('--config <path>', 'Config file path', '.devmind.json')
  .action((options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);
    
    const stats = db.getStats();
    console.log('DevMind Statistics:');
    console.log(`  Projects: ${stats.total_projects}`);
    console.log(`  Sessions: ${stats.total_sessions} (${stats.active_sessions} active)`);
    console.log(`  Contexts: ${stats.total_contexts}`);
    
    db.close();
  });

// 项目命令
program
  .command('project')
  .description('Manage projects')
  .argument('<action>', 'Action: list, create, info')
  .argument('[path]', 'Project path (for create/info)')
  .option('--config <path>', 'Config file path', '.devmind.json')
  .action(async (action, path, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);
    const sessionManager = new SessionManager(db, config);
    
    switch (action) {
      case 'create':
        if (!path) {
          console.error('Project path is required for create action');
          process.exit(1);
        }
        try {
          const project = await sessionManager.getOrCreateProject(path);
          console.log(`Created/found project: ${project.name} (${project.id})`);
          console.log(`  Language: ${project.language}`);
          console.log(`  Framework: ${project.framework || 'Unknown'}`);
          console.log(`  Path: ${project.path}`);
        } catch (error) {
          console.error(`Failed to create project: ${error}`);
        }
        break;
        
      case 'info':
        if (!path) {
          console.error('Project path is required for info action');
          process.exit(1);
        }
        const project = db.getProjectByPath(path);
        if (project) {
          console.log(`Project: ${project.name}`);
          console.log(`  ID: ${project.id}`);
          console.log(`  Language: ${project.language}`);
          console.log(`  Framework: ${project.framework || 'Unknown'}`);
          console.log(`  Path: ${project.path}`);
          console.log(`  Created: ${project.created_at}`);
          console.log(`  Last accessed: ${project.last_accessed}`);
          console.log(`  Git remote: ${project.git_remote_url || 'None'}`);
          
          // Show active sessions
          const activeSessions = db.getActiveSessions(project.id);
          if (activeSessions.length > 0) {
            console.log(`  Active sessions: ${activeSessions.length}`);
            activeSessions.forEach(session => {
              console.log(`    - ${session.name} (${session.tool_used})`);
            });
          }
        } else {
          console.log('Project not found');
        }
        break;
        
      default:
        console.error('Unknown action. Use: list, create, info');
    }
    
    db.close();
  });

// 会话命令
program
  .command('session')
  .description('Manage sessions')
  .argument('<action>', 'Action: create, end, list, info')
  .argument('[path_or_id]', 'Project path (for create/list) or session ID (for end/info)')
  .option('--config <path>', 'Config file path', '.devmind.json')
  .option('--tool <name>', 'Tool name', 'cli')
  .option('--name <name>', 'Session name')
  .action(async (action, pathOrId, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);
    const sessionManager = new SessionManager(db, config);
    
    switch (action) {
      case 'create':
        if (!pathOrId) {
          console.error('Project path is required for create action');
          process.exit(1);
        }
        try {
          const sessionId = await sessionManager.createSession({
            project_path: pathOrId,
            tool_used: options.tool,
            name: options.name
          });
          console.log(`Created session: ${sessionId}`);
        } catch (error) {
          console.error(`Failed to create session: ${error}`);
        }
        break;
        
      case 'end':
        if (!pathOrId) {
          console.error('Session ID is required for end action');
          process.exit(1);
        }
        try {
          sessionManager.endSession(pathOrId);
          console.log(`Ended session: ${pathOrId}`);
        } catch (error) {
          console.error(`Failed to end session: ${error}`);
        }
        break;
        
      case 'info':
        if (!pathOrId) {
          console.error('Session ID is required for info action');
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
          console.log(`  Ended: ${session.ended_at || 'Still active'}`);
          
          // Show contexts count
          const contexts = db.getContextsBySession(session.id);
          console.log(`  Contexts: ${contexts.length}`);
        } else {
          console.log('Session not found');
        }
        break;
        
      default:
        console.error('Unknown action. Use: create, end, list, info');
    }
    
    db.close();
  });

// 搜索命令
program
  .command('search')
  .description('Search contexts')
  .argument('<query>', 'Search query')
  .option('--config <path>', 'Config file path', '.devmind.json')
  .option('--project <id>', 'Project ID to search in')
  .option('--limit <number>', 'Maximum number of results', '10')
  .action((query, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);
    
    const limit = parseInt(options.limit);
    const contexts = db.searchContexts(query, options.project, limit);
    
    console.log(`Found ${contexts.length} contexts for query: "${query}"`);
    contexts.forEach((context, index) => {
      console.log(`\n${index + 1}. Context ID: ${context.id}`);
      console.log(`   Type: ${context.type}`);
      console.log(`   File: ${context.file_path || 'N/A'}`);
      console.log(`   Quality: ${context.quality_score.toFixed(2)}`);
      console.log(`   Tags: ${context.tags || 'None'}`);
      console.log(`   Content: ${context.content.substring(0, 200)}${context.content.length > 200 ? '...' : ''}`);
    });
    
    db.close();
  });

// 提取命令
program
  .command('extract')
  .description('Extract context from file')
  .argument('<file>', 'File path')
  .option('--config <path>', 'Config file path', '.devmind.json')
  .option('--session <id>', 'Session ID to record in')
  .option('--record', 'Record extracted contexts')
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
            tags: context.tags.join(','),
            quality_score: context.quality_score,
            metadata: JSON.stringify(context.metadata),
          });
          
          console.log(`  ${index + 1}. Recorded as ${contextId} (quality: ${context.quality_score.toFixed(2)})`);
        });
        
        db.close();
      } else {
        contexts.forEach((context, index) => {
          console.log(`  ${index + 1}. Type: ${context.type}, Quality: ${context.quality_score.toFixed(2)}`);
          console.log(`      Tags: ${context.tags.join(', ')}`);
          console.log(`      Content: ${context.content.substring(0, 100)}${context.content.length > 100 ? '...' : ''}`);
        });
      }
    } catch (error) {
      console.error(`Failed to extract from file: ${error}`);
    }
  });

// 数据库维护命令
program
  .command('maintenance')
  .description('Database maintenance operations')
  .argument('<action>', 'Action: vacuum, backup')
  .option('--config <path>', 'Config file path', '.devmind.json')
  .action((action, options) => {
    const config = loadConfig(options.config);
    const db = new DatabaseManager(config.database_path!);
    
    switch (action) {
      case 'vacuum':
        console.log('Running database vacuum...');
        db.vacuum();
        console.log('Database vacuum completed');
        break;
        
      default:
        console.error('Unknown action. Use: vacuum, backup');
    }
    
    db.close();
  });

function loadConfig(configPath: string): AiMemoryConfig {
  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, 'utf-8');
      return { ...defaultConfig, ...JSON.parse(configContent) };
    } catch (error) {
      console.error(`Failed to parse config file: ${error}`);
      return defaultConfig;
    }
  }
  return defaultConfig;
}

// 如果没有提供任何命令或参数，启动MCP服务器
if (process.argv.length <= 2) {
  // 启动MCP服务器
  import('./index.js').then(() => {
    // MCP服务器会自动启动并处理stdio
  }).catch(console.error);
} else {
  program.parse();
}
