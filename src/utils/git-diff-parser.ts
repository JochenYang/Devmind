/**
 * Git Diff 解析器
 * 
 * 用于解析 Git diff 输出，提取文件修改的具体行号范围
 * 支持自动记录时精确追踪代码变更位置
 */

import simpleGit, { SimpleGit, DiffResult } from 'simple-git';
import { existsSync } from 'fs';

export interface LineRange {
  start: number;
  end: number;
}

export interface DiffAnalysisResult {
  file_path: string;
  line_ranges: Array<[number, number]>;
  change_type: 'added' | 'modified' | 'deleted';
  total_changes: number;
}

export interface DiffDetectionOptions {
  enable_line_range_detection?: boolean; // 是否启用（默认 true）
  merge_adjacent_lines?: boolean;         // 合并相邻行（默认 true）
}

export class GitDiffParser {
  private git: SimpleGit;
  private options: Required<DiffDetectionOptions>;

  constructor(
    private projectPath: string,
    options: DiffDetectionOptions = {}
  ) {
    this.git = simpleGit(projectPath);
    this.options = {
      enable_line_range_detection: options.enable_line_range_detection ?? true,
      merge_adjacent_lines: options.merge_adjacent_lines ?? true,
    };
  }

  /**
   * 分析文件变更，提取行范围
   */
  async analyzeFileChange(filePath: string): Promise<DiffAnalysisResult | null> {
    if (!this.options.enable_line_range_detection) {
      return null;
    }

    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        return null;
      }

      // 检查文件是否在 Git 中
      const fullPath = `${this.projectPath}/${filePath}`;
      if (!existsSync(fullPath)) {
        return {
          file_path: filePath,
          line_ranges: [],
          change_type: 'deleted',
          total_changes: 0
        };
      }

      // 获取文件状态
      const status = await this.git.status();
      const isNewFile = status.not_added.includes(filePath) || 
                        status.created.includes(filePath);

      if (isNewFile) {
        // 新文件：整个文件都是新增
        return await this.analyzeNewFile(filePath);
      }

      // 已存在文件：获取 diff
      return await this.analyzeDiff(filePath);

    } catch (error) {
      console.error('[GitDiffParser] Analysis failed:', error);
      return null;
    }
  }

  /**
   * 分析新文件
   */
  private async analyzeNewFile(filePath: string): Promise<DiffAnalysisResult> {
    try {
      const content = await this.git.show([`HEAD:${filePath}`]).catch(() => null);
      
      // 新文件，计算总行数
      const fullPath = `${this.projectPath}/${filePath}`;
      const fs = await import('fs/promises');
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      const lines = fileContent.split('\n').length;

      return {
        file_path: filePath,
        line_ranges: lines > 0 ? [[1, lines]] : [],
        change_type: 'added',
        total_changes: lines
      };
    } catch (error) {
      return {
        file_path: filePath,
        line_ranges: [],
        change_type: 'added',
        total_changes: 0
      };
    }
  }

  /**
   * 分析文件 diff
   */
  private async analyzeDiff(filePath: string): Promise<DiffAnalysisResult> {
    try {
      // 获取文件的 diff（与暂存区或工作区比较）
      const diff = await this.git.diff(['HEAD', '--', filePath]);
      
      if (!diff) {
        // 没有变更
        return {
          file_path: filePath,
          line_ranges: [],
          change_type: 'modified',
          total_changes: 0
        };
      }

      // 解析 diff 输出
      const lineRanges = this.parseDiffOutput(diff);

      return {
        file_path: filePath,
        line_ranges: lineRanges,
        change_type: 'modified',
        total_changes: lineRanges.reduce((sum, [start, end]) => sum + (end - start + 1), 0)
      };

    } catch (error) {
      console.error('[GitDiffParser] Diff analysis failed:', error);
      return {
        file_path: filePath,
        line_ranges: [],
        change_type: 'modified',
        total_changes: 0
      };
    }
  }

  /**
   * 解析 unified diff 格式输出
   * 
   * Diff 格式示例：
   * @@ -10,5 +10,7 @@ function example() {
   * -  old line
   * +  new line
   * +  another new line
   */
  private parseDiffOutput(diffText: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    const lines = diffText.split('\n');

    let currentLineNumber = 0;
    let rangeStart = 0;
    let inChangeBlock = false;

    for (const line of lines) {
      // 解析 hunk 头：@@ -10,5 +10,7 @@
      const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (hunkMatch) {
        currentLineNumber = parseInt(hunkMatch[1], 10);
        inChangeBlock = false;
        continue;
      }

      if (currentLineNumber === 0) continue;

      // 新增行：+ 开头
      if (line.startsWith('+') && !line.startsWith('+++')) {
        if (!inChangeBlock) {
          rangeStart = currentLineNumber;
          inChangeBlock = true;
        }
        currentLineNumber++;
      }
      // 删除行：- 开头（不计入新文件行号）
      else if (line.startsWith('-') && !line.startsWith('---')) {
        // 删除行不影响新文件的行号
        continue;
      }
      // 上下文行：空格开头
      else if (line.startsWith(' ')) {
        if (inChangeBlock) {
          // 结束当前变更块
          ranges.push([rangeStart, currentLineNumber - 1]);
          inChangeBlock = false;
        }
        currentLineNumber++;
      }
    }

    // 处理最后一个变更块
    if (inChangeBlock && rangeStart > 0) {
      ranges.push([rangeStart, currentLineNumber - 1]);
    }

    // 合并相邻行
    return this.options.merge_adjacent_lines 
      ? this.mergeAdjacentRanges(ranges) 
      : ranges;
  }

  /**
   * 合并相邻的行范围
   * 
   * 例如：[[10,10], [11,11], [12,12]] => [[10,12]]
   */
  private mergeAdjacentRanges(ranges: Array<[number, number]>): Array<[number, number]> {
    if (ranges.length === 0) return [];

    // 按起始行排序
    const sorted = ranges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    let current = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      
      // 如果相邻或重叠，合并
      if (next[0] <= current[1] + 1) {
        current = [current[0], Math.max(current[1], next[1])];
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  /**
   * 批量分析多个文件
   */
  async analyzeMultipleFiles(filePaths: string[]): Promise<DiffAnalysisResult[]> {
    const results: DiffAnalysisResult[] = [];

    for (const filePath of filePaths) {
      const result = await this.analyzeFileChange(filePath);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }
}

/**
 * 创建 Git Diff 解析器实例
 */
export function createGitDiffParser(
  projectPath: string,
  options?: DiffDetectionOptions
): GitDiffParser {
  return new GitDiffParser(projectPath, options);
}
