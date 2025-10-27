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
 * 主函数
 */
async function main() {
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

// 无条件启动，因为MCP客户端会直接调用这个文件
main();

export { AiMemoryMcpServer };