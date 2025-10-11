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
  try {
    const config = loadConfig();
    const server = new AiMemoryMcpServer(config);
    
    // 处理进程退出信号
    process.on('SIGINT', async () => {
      await server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await server.close();
      process.exit(0);
    });

    // 启动服务器
    await server.start();
    
  } catch (error) {
    process.exit(1);
  }
}

// 无条件启动，因为MCP客户端会直接调用这个文件
main();

export { AiMemoryMcpServer };