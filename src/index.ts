#!/usr/bin/env node

import { AiMemoryMcpServer } from './mcp-server.js';
import { AiMemoryConfig } from './types.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 加载配置文件
 */
function loadConfig(): AiMemoryConfig {
  const configPaths = [
    '.devmind.json',
    join(process.cwd(), '.devmind.json'),
    join(process.env.HOME || process.env.USERPROFILE || '', '.devmind', 'config.json')
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const configContent = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent) as AiMemoryConfig;
        return config;
      } catch (error) {
        // Silently continue to next config path
      }
    }
  }

  return {};
}

/**
 * 解析命令行参数
 */
function parseArgs(): { version?: boolean; help?: boolean } {
  const args: { version?: boolean; help?: boolean } = {};
  const cliArgs = process.argv.slice(2);

  for (const arg of cliArgs) {
    switch (arg) {
      case '--version':
      case '-v':
        args.version = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  return args;
}

/**
 * 主函数
 */
async function main() {
  // 先处理命令行参数
  const args = parseArgs();

  // 获取包版本
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
  );

  if (args.version) {
    console.log(packageJson.version);
    process.exit(0);
  }

  if (args.help) {
    console.log(`
DevMind MCP - AI Assistant Memory System
Version: ${packageJson.version}

Usage:
  npx devmind-mcp [options]

Options:
  -v, --version    Show version number
  -h, --help       Show help information

For more information, visit: https://github.com/JochenYang/Devmind-MCP
`);
    process.exit(0);
  }

  let server: AiMemoryMcpServer | null = null;

  // 优雅退出函数
  const gracefulShutdown = async (signal: string) => {
    console.error(`\n收到 ${signal} 信号，正在关闭服务器...`);
    if (server) {
      try {
        await server.close();
        console.error('服务器已优雅关闭');
      } catch (error) {
        console.error('关闭服务器时出错:', error);
      }
    }
    process.exit(0);
  };
  
  try {
    const config = loadConfig();
    server = new AiMemoryMcpServer(config);
    
    // 处理进程退出信号 (支持多种信号)
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
    
    // Windows 特有的退出事件
    if (process.platform === 'win32') {
      process.on('message', (msg) => {
        if (msg === 'shutdown') {
          gracefulShutdown('shutdown message');
        }
      });
    }
    
    // 捕获未处理的异常
    process.on('uncaughtException', async (error) => {
      console.error('未捕获的异常:', error);
      await gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('未处理的Promise拒绝:', reason);
      await gracefulShutdown('unhandledRejection');
    });

    // 启动服务器
    await server.start();
    
  } catch (error) {
    console.error('MCP服务器启动失败:', error);
    if (server) {
      try {
        await server.close();
      } catch (closeError) {
        console.error('清理资源失败:', closeError);
      }
    }
    process.exit(1);
  }
}

// 启动主程序（自动处理命令行参数）
main();

export { AiMemoryMcpServer };