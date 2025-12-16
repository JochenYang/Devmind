/**
 * IgnoreProcessor - 处理 .gitignore 和 .augmentignore 忽略规则
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { IgnoreRule, DEFAULT_EXCLUDE_PATTERNS } from './types.js';
import ignore from 'ignore';

export class IgnoreProcessor {
  private gitignoreCache = new Map<string, any>();

  /**
   * 加载项目的忽略规则
   */
  async loadIgnoreRules(projectPath: string): Promise<IgnoreRule[]> {
    const rules: IgnoreRule[] = [];

    // 1. 内置规则（最低优先级）
    rules.push({
      source: 'built-in',
      patterns: DEFAULT_EXCLUDE_PATTERNS,
      priority: 0
    });

    // 2. .gitignore 规则
    const gitignorePath = join(projectPath, '.gitignore');
    if (existsSync(gitignorePath)) {
      try {
        const content = readFileSync(gitignorePath, 'utf-8');
        const ig = ignore().add(content);
        this.gitignoreCache.set(projectPath, ig);

        rules.push({
          source: '.gitignore',
          patterns: this.parseIgnoreFile(gitignorePath),
          priority: 1
        });
      } catch (error) {
        console.warn(`[ContextEngine] Failed to load .gitignore: ${error}`);
      }
    }

    // 3. .augmentignore 规则（最高优先级）
    const augmentignorePath = join(projectPath, '.augmentignore');
    if (existsSync(augmentignorePath)) {
      try {
        const content = readFileSync(augmentignorePath, 'utf-8');
        const ig = ignore().add(content);

        rules.push({
          source: '.augmentignore',
          patterns: this.parseIgnoreFile(augmentignorePath),
          priority: 2
        });
      } catch (error) {
        console.warn(`[ContextEngine] Failed to load .augmentignore: ${error}`);
      }
    }

    return rules;
  }

  /**
   * 检查文件是否应该被忽略
   */
  shouldIgnore(filePath: string, rules: IgnoreRule[]): { ignored: boolean; reason?: string } {
    // 统一路径分隔符
    const normalizedPath = filePath.replace(/\\/g, '/');

    // 按优先级排序
    const sortedRules = rules.sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      for (const pattern of rule.patterns) {
        if (this.matchPattern(normalizedPath, pattern)) {
          return {
            ignored: true,
            reason: `${rule.source}: ${pattern}`
          };
        }
      }
    }

    return { ignored: false };
  }

  /**
   * 解析忽略文件内容
   */
  private parseIgnoreFile(filePath: string): string[] {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    } catch (error) {
      console.warn(`[ContextEngine] Failed to parse ignore file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 模式匹配
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    // 统一分隔符
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // 使用 ignore 库进行匹配
    const ig = (ignore as any)({ ignorecase: true });
    ig.add(normalizedPattern);

    return ig.ignores(normalizedPath);
  }

  /**
   * 检测文件类型
   */
  detectFileType(filePath: string): { language: string; fileType: 'code' | 'doc' | 'config' | 'other' } {
    const ext = this.getFileExtension(filePath);

    // 动态导入 SUPPORTED_LANGUAGES
    const SUPPORTED_LANGUAGES = {
      'typescript': { language: 'TypeScript', fileType: 'code' as const, extensions: ['.ts', '.tsx'] },
      'javascript': { language: 'JavaScript', fileType: 'code' as const, extensions: ['.js', '.jsx', '.mjs'] },
      'python': { language: 'Python', fileType: 'code' as const, extensions: ['.py'] },
      'java': { language: 'Java', fileType: 'code' as const, extensions: ['.java'] },
      'go': { language: 'Go', fileType: 'code' as const, extensions: ['.go'] },
      'rust': { language: 'Rust', fileType: 'code' as const, extensions: ['.rs'] },
      'csharp': { language: 'C#', fileType: 'code' as const, extensions: ['.cs'] },
      'cpp': { language: 'C++', fileType: 'code' as const, extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h'] },
      'c': { language: 'C', fileType: 'code' as const, extensions: ['.c', '.h'] },
      'php': { language: 'PHP', fileType: 'code' as const, extensions: ['.php'] },
      'ruby': { language: 'Ruby', fileType: 'code' as const, extensions: ['.rb'] },
      'swift': { language: 'Swift', fileType: 'code' as const, extensions: ['.swift'] },
      'kotlin': { language: 'Kotlin', fileType: 'code' as const, extensions: ['.kt'] },
      'scala': { language: 'Scala', fileType: 'code' as const, extensions: ['.scala'] },
      'shell': { language: 'Shell', fileType: 'code' as const, extensions: ['.sh', '.bash', '.zsh'] },
      'sql': { language: 'SQL', fileType: 'code' as const, extensions: ['.sql'] },
      'json': { language: 'JSON', fileType: 'config' as const, extensions: ['.json'] },
      'yaml': { language: 'YAML', fileType: 'config' as const, extensions: ['.yaml', '.yml'] },
      'xml': { language: 'XML', fileType: 'config' as const, extensions: ['.xml'] },
      'markdown': { language: 'Markdown', fileType: 'doc' as const, extensions: ['.md', '.markdown'] },
      'html': { language: 'HTML', fileType: 'doc' as const, extensions: ['.html', '.htm'] },
      'css': { language: 'CSS', fileType: 'doc' as const, extensions: ['.css', '.scss', '.sass'] },
    };

    for (const info of Object.values(SUPPORTED_LANGUAGES)) {
      if (info.extensions.includes(ext)) {
        return {
          language: info.language,
          fileType: info.fileType
        };
      }
    }

    return {
      language: 'Unknown',
      fileType: 'other'
    };
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(filePath: string): string {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    return ext.toLowerCase();
  }

  /**
   * 检查是否为二进制文件
   */
  isBinaryFile(filePath: string): boolean {
    const binaryExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
      '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
      '.woff', '.woff2', '.ttf', '.otf', '.eot'
    ];

    const ext = this.getFileExtension(filePath);
    return binaryExtensions.includes(ext);
  }
}
