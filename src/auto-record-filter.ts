import { createHash } from 'crypto';

export interface FilterOptions {
  minChangeInterval?: number;
  minContentLength?: number;
  maxContentLength?: number;
  supportedExtensions?: string[];
}

/**
 * 智能过滤器用于自动记录
 * 功能:
 * - 去重检查(基于内容hash)
 * - 频率控制(防止同一文件频繁记录)
 * - 内容质量评估
 * - 文件类型过滤
 */
export class AutoRecordFilter {
  private recentChanges: Map<string, { hash: string, timestamp: number }>;
  private options: Required<FilterOptions>;

  constructor(options: FilterOptions = {}) {
    this.recentChanges = new Map();
    this.options = {
      minChangeInterval: options.minChangeInterval || 30000, // 30秒
      minContentLength: options.minContentLength || 50,
      maxContentLength: options.maxContentLength || 50000, // 50KB
      supportedExtensions: options.supportedExtensions || [
        '.js', '.ts', '.jsx', '.tsx',
        '.py', '.go', '.rs', '.java', '.kt',
        '.php', '.rb', '.c', '.cpp', '.cs',
        '.swift', '.dart', '.md', '.json', '.yaml', '.yml'
      ]
    };

    // 定期清理旧记录（避免内存泄漏）
    setInterval(() => this.cleanup(), 300000); // 5分钟清理一次
  }

  /**
   * 判断是否应该记录此文件变更
   */
  shouldRecord(filePath: string, content: string): boolean {
    // 1. 文件类型检查
    if (!this.isSupportedFile(filePath)) {
      return false;
    }

    // 2. 内容长度检查
    if (content.length < this.options.minContentLength) {
      return false; // 内容太短
    }
    if (content.length > this.options.maxContentLength) {
      return false; // 内容太长（可能是生成文件或打包文件）
    }

    // 3. 去重检查
    const contentHash = this.hashContent(content);
    const recent = this.recentChanges.get(filePath);

    if (recent) {
      // 3.1 内容hash相同 = 无变化
      if (recent.hash === contentHash) {
        return false;
      }

      // 3.2 时间间隔检查
      const timeSinceLastChange = Date.now() - recent.timestamp;
      if (timeSinceLastChange < this.options.minChangeInterval) {
        return false; // 变更过于频繁
      }
    }

    // 4. 内容质量检查
    if (!this.hasSignificantContent(content)) {
      return false;
    }

    // ✅ 通过所有检查，更新缓存
    this.recentChanges.set(filePath, {
      hash: contentHash,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 检查文件扩展名是否受支持
   */
  private isSupportedFile(filePath: string): boolean {
    return this.options.supportedExtensions.some(ext =>
      filePath.endsWith(ext)
    );
  }

  /**
   * 检查是否有实质性内容
   * 过滤掉空文件、只有注释的文件等
   */
  private hasSignificantContent(content: string): boolean {
    // 分割成行
    const lines = content.split('\n');
    const trimmedContent = content.trim();

    // 检测Markdown文件（以 # 开头或包含多个 ## 标记）
    const isMarkdown = trimmedContent.startsWith('#') || 
                      (trimmedContent.match(/^#{1,6}\s/gm) || []).length >= 2;

    if (isMarkdown) {
      // Markdown文件：只过滤空行和代码块标记
      const meaningfulLines = lines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => !line.startsWith('```'));  // 代码块标记
      
      // Markdown至少需要5行内容（标题+内容）
      return meaningfulLines.length >= 5;
    }

    // 非Markdown文件：原有逻辑
    const meaningfulLines = lines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !line.startsWith('//'))     // 单行注释
      .filter(line => !line.startsWith('#'))      // Python/Shell注释
      .filter(line => !line.startsWith('/*'))     // 多行注释开始
      .filter(line => !line.startsWith('*'))      // 多行注释中间
      .filter(line => !line.startsWith('*/'))     // 多行注释结束
      .filter(line => line !== '{' && line !== '}'); // 仅有大括号

    // 至少需要3行有意义的代码
    return meaningfulLines.length >= 3;
  }

  /**
   * 生成内容hash用于去重
   */
  private hashContent(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * 清理过期的缓存记录
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1小时

    for (const [path, record] of this.recentChanges.entries()) {
      if (now - record.timestamp > maxAge) {
        this.recentChanges.delete(path);
      }
    }
  }

  /**
   * 重置过滤器状态
   */
  reset(): void {
    this.recentChanges.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): { trackedFiles: number, oldestRecord: number | null } {
    let oldestTimestamp: number | null = null;

    for (const record of this.recentChanges.values()) {
      if (oldestTimestamp === null || record.timestamp < oldestTimestamp) {
        oldestTimestamp = record.timestamp;
      }
    }

    return {
      trackedFiles: this.recentChanges.size,
      oldestRecord: oldestTimestamp
    };
  }
}
