/**
 * FileScanner - 文件扫描器
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, relative, basename } from 'path';
import { IgnoreProcessor } from './IgnoreProcessor.js';
import { ScanOptions, ScanResult } from './types.js';

export class FileScanner {
  private ignoreProcessor: IgnoreProcessor;

  constructor() {
    this.ignoreProcessor = new IgnoreProcessor();
  }

  /**
   * 扫描目录中的所有文件
   */
  async scanDirectory(
    rootPath: string,
    options: ScanOptions = {}
  ): Promise<ScanResult[]> {
    console.log(`[ContextEngine] Starting scan: ${rootPath}`);

    // 加载忽略规则
    const ignoreRules = await this.ignoreProcessor.loadIgnoreRules(rootPath);
    console.log(`[ContextEngine] Loaded ${ignoreRules.length} ignore rule sets`);

    // 扫描文件
    const files = await this.walkDirectory(rootPath, rootPath, ignoreRules, options);

    console.log(`[ContextEngine] Scan complete: ${files.length} files found`);

    return files;
  }

  /**
   * 递归遍历目录
   */
  private async walkDirectory(
    rootPath: string,
    currentPath: string,
    ignoreRules: any[],
    options: ScanOptions
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        const relativePath = relative(rootPath, fullPath);

        // 检查是否应该忽略
        const ignoreResult = this.ignoreProcessor.shouldIgnore(relativePath, ignoreRules);
        if (ignoreResult.ignored) {
          continue;
        }

        if (entry.isDirectory()) {
          // 递归扫描子目录
          const subFiles = await this.walkDirectory(
            rootPath,
            fullPath,
            ignoreRules,
            options
          );
          results.push(...subFiles);
        } else if (entry.isFile()) {
          // 处理文件
          const fileResult = await this.processFile(
            rootPath,
            fullPath,
            relativePath,
            options
          );
          if (fileResult) {
            results.push(fileResult);
          }
        }
      }
    } catch (error) {
      console.warn(`[ContextEngine] Failed to read directory ${currentPath}:`, error);
    }

    return results;
  }

  /**
   * 处理单个文件
   */
  private async processFile(
    rootPath: string,
    fullPath: string,
    relativePath: string,
    options: ScanOptions
  ): Promise<ScanResult | null> {
    try {
      // 获取文件统计信息
      const fileStat = await stat(fullPath);

      // 检查文件大小
      if (options.maxFileSize && fileStat.size > options.maxFileSize * 1024 * 1024) {
        console.log(`[ContextEngine] Skipping large file: ${relativePath} (${fileStat.size} bytes)`);
        return null;
      }

      // 检查文件扩展名
      if (options.includeExtensions && options.includeExtensions.length > 0) {
        const ext = this.getFileExtension(fullPath);
        if (!options.includeExtensions.includes(ext)) {
          return null;
        }
      }

      // 检查是否跳过大型目录
      if (options.skipLargeDirs) {
        for (const dir of options.skipLargeDirs) {
          if (relativePath.includes(dir)) {
            return null;
          }
        }
      }

      // 检查是否为二进制文件
      if (this.ignoreProcessor.isBinaryFile(fullPath)) {
        console.log(`[ContextEngine] Skipping binary file: ${relativePath}`);
        return null;
      }

      // 读取文件内容
      const content = await readFile(fullPath, 'utf-8');

      // 检测语言类型
      const { language, fileType } = this.ignoreProcessor.detectFileType(fullPath);

      return {
        filePath: fullPath,
        relativePath,
        content,
        size: fileStat.size,
        language,
        isBinary: false,
        modifiedTime: fileStat.mtime
      };
    } catch (error) {
      console.warn(`[ContextEngine] Failed to process file ${relativePath}:`, error);
      return null;
    }
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(filePath: string): string {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    return ext.toLowerCase();
  }

  /**
   * 检查文件是否应该被处理
   */
  private shouldProcessFile(filePath: string, options: ScanOptions): boolean {
    // 检查扩展名
    if (options.includeExtensions && options.includeExtensions.length > 0) {
      const ext = this.getFileExtension(filePath);
      if (!options.includeExtensions.includes(ext)) {
        return false;
      }
    }

    // 检查是否跳过大型目录
    if (options.skipLargeDirs) {
      for (const dir of options.skipLargeDirs) {
        if (filePath.includes(dir)) {
          return false;
        }
      }
    }

    return true;
  }
}
