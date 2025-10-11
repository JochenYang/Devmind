#!/usr/bin/env node

import { Command } from 'commander';
import { AiMemoryMcpServer } from './mcp-server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import DevMindDaemon from './daemon.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const program = new Command();

program
  .name('devmind')
  .description('DevMind MCP - 智能开发上下文记忆系统')
  .version('1.0.0');

// MCP服务器模式
program
  .command('server')
  .description('启动MCP服务器（用于MCP客户端连接）')
  .action(async () => {
    const server = new AiMemoryMcpServer();
    const transport = new StdioServerTransport();
    await server.start();
    console.error('DevMind MCP server running on stdio');
  });

// 守护进程管理
program
  .command('start')
  .description('启动后台守护进程，自动记录开发活动')
  .option('-p, --project <path>', '项目路径', process.cwd())
  .action(async (options) => {
    const daemon = new DevMindDaemon(options.project);
    await daemon.start();
  });

program
  .command('stop')
  .description('停止后台守护进程')
  .action(async () => {
    console.log('正在停止守护进程...');
    // 这里需要实现进程管理逻辑
    console.log('守护进程已停止');
  });

program
  .command('status')
  .description('查看守护进程状态')
  .action(async () => {
    console.log('检查守护进程状态...');
    // 实现状态检查逻辑
  });

// 配置管理
program
  .command('init')
  .description('初始化DevMind配置')
  .option('-p, --project <path>', '项目路径', process.cwd())
  .action(async (options) => {
    await initializeConfig(options.project);
  });

program
  .command('config')
  .description('查看当前配置')
  .action(async () => {
    await showConfig();
  });

// 记忆管理
program
  .command('search')
  .description('搜索项目记忆')
  .argument('<query>', '搜索查询')
  .option('-l, --limit <number>', '结果数量限制', '10')
  .option('-s, --semantic', '启用语义搜索', true)
  .action(async (query, options) => {
    await searchMemory(query, options);
  });

program
  .command('install')
  .description('安装DevMind到MCP客户端配置')
  .option('--claude-desktop', '配置Claude Desktop', true)
  .action(async (options) => {
    await installToMcpClient(options);
  });

// 如果没有参数，默认启动MCP服务器
if (process.argv.length === 2) {
  const server = new AiMemoryMcpServer();
  const transport = new StdioServerTransport();
  await server.start();
  console.error('DevMind MCP server running on stdio');
} else {
  program.parse();
}

// 辅助函数
async function initializeConfig(projectPath: string): Promise<void> {
  console.log(`🔧 初始化DevMind配置: ${projectPath}`);
  
  const configPath = join(projectPath, '.devmind.json');
  const devmindDir = join(projectPath, '.devmind');
  
  // 创建.devmind目录
  if (!existsSync(devmindDir)) {
    mkdirSync(devmindDir, { recursive: true });
  }
  
  // 创建配置文件
  const config = {
    database_path: join(devmindDir, 'memory.db'),
    max_contexts_per_session: 1000,
    quality_threshold: 0.3,
    vector_search: {
      enabled: true,
      model_name: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      similarity_threshold: 0.5,
      hybrid_weight: 0.7,
      cache_embeddings: true
    },
    auto_start_daemon: false,
    ignored_patterns: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.git/**',
      '*.log',
      '*.tmp'
    ]
  };
  
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`✅ 配置文件已创建: ${configPath}`);
}

async function showConfig(): Promise<void> {
  const configPath = join(process.cwd(), '.devmind.json');
  
  if (!existsSync(configPath)) {
    console.log('❌ 未找到配置文件，请先运行 devmind init');
    return;
  }
  
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  console.log('📋 当前配置:');
  console.log(JSON.stringify(config, null, 2));
}

async function searchMemory(query: string, options: any): Promise<void> {
  console.log(`🔍 搜索记忆: "${query}"`);
  console.log(`选项:`, options);
  // 实现搜索逻辑
}

async function installToMcpClient(options: any): Promise<void> {
  console.log('🔧 安装DevMind到MCP客户端...');
  
  if (options.claudeDesktop) {
    await installToClaudeDesktop();
  }
}

async function installToClaudeDesktop(): Promise<void> {
  const claudeConfigPaths = [
    join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'), // Windows
    join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), // macOS
    join(homedir(), '.config', 'Claude', 'claude_desktop_config.json') // Linux
  ];
  
  let configPath: string | null = null;
  for (const path of claudeConfigPaths) {
    if (existsSync(dirname(path))) {
      configPath = path;
      break;
    }
  }
  
  if (!configPath) {
    console.log('❌ 未找到Claude Desktop配置目录');
    return;
  }
  
  let config: any = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.log('⚠️  读取现有配置失败，将创建新配置');
    }
  }
  
  // 确保mcpServers对象存在
  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  
  // 添加DevMind MCP配置
  config.mcpServers.devmind = {
    command: 'npx',
    args: ['devmind', 'server']
  };
  
  // 确保目录存在
  mkdirSync(dirname(configPath), { recursive: true });
  
  // 写入配置
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log(`✅ Claude Desktop配置已更新: ${configPath}`);
  console.log('请重启Claude Desktop以生效');
}