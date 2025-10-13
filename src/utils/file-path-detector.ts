/**
 * 智能文件路径检测器
 * 
 * 用于在记录上下文时自动推断文件路径，提升记忆质量
 * 
 * 检测策略：
 * 1. Git 状态 - 检测最近修改/新增的文件
 * 2. 内容分析 - 从代码内容中提取可能的文件路径
 * 3. 上下文推断 - 从最近的对话中提取文件信息
 */

import simpleGit, { SimpleGit } from 'simple-git';
import { existsSync } from 'fs';
import { join, relative } from 'path';

export interface FilePathSuggestion {
  path: string;
  confidence: number; // 0-1 置信度
  source: 'git-modified' | 'git-staged' | 'git-untracked' | 'content-analysis' | 'context-inference';
  reason: string;
}

export interface PathDetectionOptions {
  projectPath: string;
  content: string;
  recentContexts?: Array<{
    file_path?: string;
    content: string;
    created_at: string;
  }>;
}

export class FilePathDetector {
  private git: SimpleGit;
  
  constructor(private projectPath: string) {
    this.git = simpleGit(projectPath);
  }

  /**
   * 检测并建议文件路径
   */
  async detectFilePath(options: PathDetectionOptions): Promise<FilePathSuggestion[]> {
    const suggestions: FilePathSuggestion[] = [];

    // 1. Git 状态检测
    const gitSuggestions = await this.detectFromGitStatus();
    suggestions.push(...gitSuggestions);

    // 2. 内容分析
    const contentSuggestions = this.detectFromContent(options.content);
    suggestions.push(...contentSuggestions);

    // 3. 上下文推断
    if (options.recentContexts && options.recentContexts.length > 0) {
      const contextSuggestions = this.detectFromRecentContexts(options.recentContexts);
      suggestions.push(...contextSuggestions);
    }

    // 按置信度排序并去重
    return this.deduplicateAndSort(suggestions);
  }

  /**
   * 从 Git 状态检测最近修改的文件
   */
  private async detectFromGitStatus(): Promise<FilePathSuggestion[]> {
    const suggestions: FilePathSuggestion[] = [];

    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        return suggestions;
      }

      const status = await this.git.status();

      // 已暂存的文件（最高优先级）
      for (const file of status.staged) {
        suggestions.push({
          path: join(this.projectPath, file),
          confidence: 0.95,
          source: 'git-staged',
          reason: 'File is staged for commit'
        });
      }

      // 已修改但未暂存的文件
      for (const file of status.modified) {
        suggestions.push({
          path: join(this.projectPath, file),
          confidence: 0.85,
          source: 'git-modified',
          reason: 'File is modified'
        });
      }

      // 新创建但未跟踪的文件
      for (const file of status.not_added.slice(0, 5)) { // 限制未跟踪文件数量
        suggestions.push({
          path: join(this.projectPath, file),
          confidence: 0.7,
          source: 'git-untracked',
          reason: 'New untracked file'
        });
      }

    } catch (error) {
      // Git 不可用或不是 Git 仓库，静默失败
      console.error('[FilePathDetector] Git detection failed:', error);
    }

    return suggestions;
  }

  /**
   * 从内容中分析可能的文件路径
   */
  private detectFromContent(content: string): FilePathSuggestion[] {
    const suggestions: FilePathSuggestion[] = [];

    // 正则匹配常见的文件路径模式
    const patterns = [
      // 相对路径: src/components/Button.tsx
      /(?:^|\s)([a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+)/g,
      // 绝对路径引用（代码中的）: './utils/helper.ts'
      /['"]\.{1,2}\/([a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+)['"]/g,
      // 文件名提及: "在 Button.tsx 中"
      /(?:在|文件|file)\s+([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const filePath = match[1];
        const fullPath = join(this.projectPath, filePath);
        
        // 验证文件是否存在
        if (existsSync(fullPath)) {
          suggestions.push({
            path: fullPath,
            confidence: 0.75,
            source: 'content-analysis',
            reason: `File path mentioned in content: "${filePath}"`
          });
        }
      }
    }

    // 检测代码特征（如果内容看起来像代码）
    if (this.looksLikeCode(content)) {
      const languageHint = this.detectLanguageFromContent(content);
      if (languageHint) {
        suggestions.push({
          path: '',
          confidence: 0.5,
          source: 'content-analysis',
          reason: `Content appears to be ${languageHint} code, but no specific file found`
        });
      }
    }

    return suggestions;
  }

  /**
   * 从最近的上下文推断文件路径
   */
  private detectFromRecentContexts(
    recentContexts: Array<{ file_path?: string; content: string; created_at: string }>
  ): FilePathSuggestion[] {
    const suggestions: FilePathSuggestion[] = [];

    // 找到最近5条有 file_path 的记录
    const contextsWithPath = recentContexts
      .filter(ctx => ctx.file_path)
      .slice(0, 5);

    contextsWithPath.forEach((ctx, index) => {
      if (ctx.file_path) {
        // 越近的记录置信度越高
        const recency = 1 - (index * 0.1);
        const confidence = Math.max(0.4, 0.6 * recency);

        suggestions.push({
          path: ctx.file_path,
          confidence,
          source: 'context-inference',
          reason: `Recently worked on this file (${index + 1} contexts ago)`
        });
      }
    });

    return suggestions;
  }

  /**
   * 去重并按置信度排序
   */
  private deduplicateAndSort(suggestions: FilePathSuggestion[]): FilePathSuggestion[] {
    const uniqueSuggestions = new Map<string, FilePathSuggestion>();

    for (const suggestion of suggestions) {
      const existing = uniqueSuggestions.get(suggestion.path);
      if (!existing || suggestion.confidence > existing.confidence) {
        uniqueSuggestions.set(suggestion.path, suggestion);
      }
    }

    return Array.from(uniqueSuggestions.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // 最多返回5个建议
  }

  /**
   * 判断内容是否看起来像代码
   */
  private looksLikeCode(content: string): boolean {
    const codeIndicators = [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /class\s+\w+/,
      /import\s+.*from/,
      /export\s+(default|const|class|function)/,
      /def\s+\w+\s*\(/,
      /public\s+\w+/,
      /<[a-zA-Z][^>]*>/,  // HTML/JSX tags
      /\{\s*[\w]+:\s*[\w]+/  // Object literals
    ];

    return codeIndicators.some(pattern => pattern.test(content));
  }

  /**
   * 从内容检测编程语言
   */
  private detectLanguageFromContent(content: string): string | null {
    const languagePatterns: Record<string, RegExp[]> = {
      'TypeScript': [/interface\s+\w+/, /type\s+\w+\s*=/, /as\s+\w+/, /:\s*(string|number|boolean)/],
      'JavaScript': [/function\s+\w+/, /const\s+\w+\s*=/, /=>\s*\{/],
      'Python': [/def\s+\w+\(/, /import\s+\w+/, /class\s+\w+:/],
      'Go': [/func\s+\w+/, /package\s+\w+/, /type\s+\w+\s+struct/],
      'Java': [/public\s+class/, /private\s+\w+/, /void\s+\w+\(/],
      'Rust': [/fn\s+\w+/, /let\s+mut/, /impl\s+\w+/],
    };

    for (const [language, patterns] of Object.entries(languagePatterns)) {
      if (patterns.some(pattern => pattern.test(content))) {
        return language;
      }
    }

    return null;
  }

  /**
   * 获取项目相对路径
   */
  getRelativePath(absolutePath: string): string {
    return relative(this.projectPath, absolutePath);
  }
}

/**
 * 创建文件路径检测器实例
 */
export function createFilePathDetector(projectPath: string): FilePathDetector {
  return new FilePathDetector(projectPath);
}
