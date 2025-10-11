#!/usr/bin/env node

import { watch } from 'chokidar';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { AiMemoryMcpServer } from './mcp-server.js';
import { ContextType } from './types.js';
import { ContentExtractor } from './content-extractor.js';

const execAsync = promisify(exec);

export class DevMindDaemon {
  private server: AiMemoryMcpServer;
  private contentExtractor: ContentExtractor;
  private sessionId: string | null = null;
  private projectPath: string;
  private watchers: any[] = [];
  private isRunning = false;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.contentExtractor = new ContentExtractor();
    
    // 初始化MCP服务器
    this.server = new AiMemoryMcpServer({
      database_path: join(projectPath, '.devmind', 'memory.db'),
      vector_search: {
        enabled: true,
        model_name: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        similarity_threshold: 0.5,
        hybrid_weight: 0.7,
        cache_embeddings: true,
      }
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('DevMind daemon already running');
      return;
    }

    console.log(`🚀 启动DevMind守护进程: ${this.projectPath}`);
    
    try {
      // 创建或获取会话
      await this.initializeSession();
      
      // 启动各种监控器
      await this.startFileWatcher();
      await this.startGitWatcher();
      await this.startTerminalWatcher();
      
      this.isRunning = true;
      console.log('✅ DevMind守护进程启动成功');
      
      // 保持进程运行
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());
      
    } catch (error) {
      console.error('❌ 守护进程启动失败:', error);
      throw error;
    }
  }

  private async initializeSession(): Promise<void> {
    try {
      const result = await this.server['handleCreateSession']({
        project_path: this.projectPath,
        tool_used: 'daemon',
        name: `自动监控会话 - ${new Date().toLocaleString()}`
      });

      if (!result.isError && result._meta?.session_id) {
        this.sessionId = result._meta.session_id;
        console.log(`📝 会话创建成功: ${this.sessionId}`);
      } else {
        throw new Error('Failed to create session');
      }
    } catch (error) {
      console.error('会话初始化失败:', error);
      throw error;
    }
  }

  private async startFileWatcher(): Promise<void> {
    const patterns = [
      '**/*.{js,ts,jsx,tsx,py,go,rs,java,kt,php,rb,c,cpp,cs,swift,dart}',
      '**/*.{json,yaml,yml,md,txt}',
      '**/package.json',
      '**/tsconfig.json',
      '**/webpack.config.js',
      '**/.env*'
    ];

    const watcher = watch(patterns, {
      cwd: this.projectPath,
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/.*', // 隐藏文件
        '**/*.log',
        '**/*.tmp'
      ],
      persistent: true,
      ignoreInitial: true
    });

    watcher
      .on('add', (path) => this.handleFileChange('add', path))
      .on('change', (path) => this.handleFileChange('change', path))
      .on('unlink', (path) => this.handleFileChange('delete', path));

    this.watchers.push(watcher);
    console.log('📁 文件监控器启动');
  }

  private async handleFileChange(action: string, filePath: string): Promise<void> {
    if (!this.sessionId) return;

    try {
      const fullPath = join(this.projectPath, filePath);
      let content = '';
      let contextType = ContextType.CODE;

      if (action !== 'delete' && existsSync(fullPath)) {
        try {
          content = readFileSync(fullPath, 'utf8');
          
          // 限制内容长度
          if (content.length > 5000) {
            content = content.substring(0, 5000) + '\n... (truncated)';
          }

          // 根据文件类型确定上下文类型
          if (filePath.includes('package.json') || filePath.includes('config')) {
            contextType = ContextType.CONFIGURATION;
          } else if (filePath.endsWith('.md') || filePath.endsWith('.txt')) {
            contextType = ContextType.DOCUMENTATION;
          }
        } catch (readError) {
          content = `无法读取文件内容: ${readError}`;
        }
      } else {
        content = `文件已删除: ${filePath}`;
      }

      // 记录上下文
      await this.recordContext({
        type: contextType,
        content: `[${action.toUpperCase()}] ${filePath}\n\n${content}`,
        file_path: filePath,
        tags: [action, 'file-change', this.getFileExtension(filePath)]
      });

    } catch (error) {
      console.error(`处理文件变更失败 ${filePath}:`, error);
    }
  }

  private async startGitWatcher(): Promise<void> {
    // 检查是否是Git仓库
    if (!existsSync(join(this.projectPath, '.git'))) {
      console.log('⚠️  非Git仓库，跳过Git监控');
      return;
    }

    // 监控Git操作的简单方式：定期检查最新提交
    setInterval(async () => {
      try {
        const { stdout } = await execAsync('git log --oneline -1', { 
          cwd: this.projectPath 
        });
        
        // 这里可以增强为更详细的Git操作检测
        // 目前只是基础实现
      } catch (error) {
        // Git命令失败，可能没有提交
      }
    }, 30000); // 每30秒检查一次

    console.log('🔄 Git监控器启动');
  }

  private async startTerminalWatcher(): Promise<void> {
    // 注意：真实的终端监控需要更复杂的实现
    // 这里提供基础框架，实际部署时可能需要平台特定的解决方案
    console.log('💻 终端监控器启动（基础版本）');
  }

  private async recordContext(params: {
    type: ContextType;
    content: string;
    file_path?: string;
    tags?: string[];
  }): Promise<void> {
    if (!this.sessionId) return;

    try {
      await this.server['handleRecordContext']({
        session_id: this.sessionId,
        type: params.type,
        content: params.content,
        file_path: params.file_path,
        tags: params.tags || []
      });

      console.log(`📝 记录上下文: ${params.file_path || 'N/A'}`);
    } catch (error) {
      console.error('记录上下文失败:', error);
    }
  }

  private getFileExtension(filePath: string): string {
    const ext = filePath.split('.').pop();
    return ext || 'unknown';
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 停止DevMind守护进程...');
    
    // 关闭所有监控器
    this.watchers.forEach(watcher => {
      if (watcher.close) {
        watcher.close();
      }
    });

    // 结束会话
    if (this.sessionId) {
      try {
        await this.server['handleEndSession']({ session_id: this.sessionId });
        console.log('📝 会话已结束');
      } catch (error) {
        console.error('结束会话失败:', error);
      }
    }

    this.isRunning = false;
    console.log('✅ DevMind守护进程已停止');
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// 命令行启动
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectPath = process.argv[2] || process.cwd();
  
  const daemon = new DevMindDaemon(projectPath);
  daemon.start().catch(error => {
    console.error('守护进程启动失败:', error);
    process.exit(1);
  });
}

export default DevMindDaemon;