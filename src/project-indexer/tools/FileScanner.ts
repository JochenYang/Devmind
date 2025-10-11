/**
 * DevMind MCP 智能项目索引功能 - 文件扫描器
 * 
 * 实现项目文件扫描、过滤和优先级分配功能
 */

import { 
  IFileScanner, 
  ProjectFile, 
  ProjectFileType, 
  FilePriority, 
  IndexingConfig, 
  DEFAULT_INDEXING_CONFIG 
} from '../types/IndexingTypes';
import { SecurityStrategy } from '../strategies/SecurityStrategy';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 文件扫描器实现类
 */
export class FileScanner implements IFileScanner {
  private config: IndexingConfig;
  private securityStrategy: SecurityStrategy;
  private fileTypeMapping!: Map<string, ProjectFileType>;
  private priorityMapping!: Map<ProjectFileType, FilePriority>;

  constructor(config: IndexingConfig = DEFAULT_INDEXING_CONFIG) {
    this.config = config;
    this.securityStrategy = new SecurityStrategy(config);
    this.initializeTypeMappings();
    this.initializePriorityMappings();
  }

  /**
   * 扫描项目文件
   */
  public async scan(projectPath: string, config: IndexingConfig = this.config): Promise<ProjectFile[]> {
    const startTime = Date.now();
    const allFiles: ProjectFile[] = [];
    
    try {
      // 验证项目路径
      if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
        throw new Error(`无效的项目路径: ${projectPath}`);
      }

      console.log(`开始扫描项目: ${projectPath}`);
      
      // 递归扫描文件
      await this.scanDirectory(projectPath, projectPath, allFiles, 0, config);
      
      // 应用过滤和排序
      const filteredFiles = this.filterAndSortFiles(allFiles, config);
      
      const scanTime = Date.now() - startTime;
      console.log(`文件扫描完成: 发现 ${allFiles.length} 个文件，过滤后剩余 ${filteredFiles.length} 个文件，耗时 ${scanTime}ms`);
      
      return filteredFiles;
      
    } catch (error) {
      console.error('文件扫描失败:', error);
      throw error;
    }
  }

  /**
   * 递归扫描目录
   */
  private async scanDirectory(
    currentPath: string,
    rootPath: string,
    files: ProjectFile[],
    depth: number,
    config: IndexingConfig
  ): Promise<void> {
    // 检查深度限制
    if (depth > config.maxDepth) {
      return;
    }

    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);
        
        // 检查是否应该跳过此路径
        if (this.shouldSkipPath(relativePath, config)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // 递归扫描子目录
          await this.scanDirectory(fullPath, rootPath, files, depth + 1, config);
        } else if (entry.isFile()) {
          // 处理文件
          const projectFile = await this.createProjectFile(fullPath, rootPath);
          if (projectFile) {
            files.push(projectFile);
          }
        }
      }
    } catch (error) {
      console.warn(`扫描目录失败: ${currentPath}`, error);
    }
  }

  /**
   * 创建项目文件对象
   */
  private async createProjectFile(filePath: string, rootPath: string): Promise<ProjectFile | null> {
    try {
      const stats = fs.statSync(filePath);
      const relativePath = path.relative(rootPath, filePath);
      const filename = path.basename(filePath);
      const extension = path.extname(filePath).toLowerCase();
      
      // 检查文件大小限制
      if (stats.size > this.config.maxFileSize) {
        console.warn(`文件过大，跳过: ${filePath} (${stats.size} bytes)`);
        return null;
      }
      
      const fileType = this.determineFileType(filename, extension, relativePath);
      const priority = this.determinePriority(fileType, filename);
      const isSensitive = this.securityStrategy.isSensitive(filePath);
      
      const projectFile: ProjectFile = {
        path: filePath,
        relativePath: relativePath.replace(/\\/g, '/'), // 标准化路径分隔符
        name: filename,
        extension,
        size: stats.size,
        lastModified: stats.mtime,
        priority,
        type: fileType,
        isSensitive
      };
      
      return projectFile;
      
    } catch (error) {
      console.warn(`创建文件对象失败: ${filePath}`, error);
      return null;
    }
  }

  /**
   * 判断是否应该跳过路径
   */
  private shouldSkipPath(relativePath: string, config: IndexingConfig): boolean {
    const normalizedPath = relativePath.replace(/\\/g, '/').toLowerCase();
    
    // 检查排除模式
    if (this.matchesPatterns(normalizedPath, config.excludePatterns)) {
      return true;
    }
    
    // 如果有包含模式，检查是否匹配
    if (config.includePatterns.length > 0) {
      if (!this.matchesPatterns(normalizedPath, config.includePatterns)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 模式匹配检查
   */
  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      try {
        const regexPattern = this.globToRegex(pattern);
        return new RegExp(regexPattern, 'i').test(filePath);
      } catch (error) {
        console.warn(`模式匹配错误: ${pattern}`, error);
        return false;
      }
    });
  }

  /**
   * 将glob模式转换为正则表达式
   */
  private globToRegex(glob: string): string {
    return glob
      .replace(/\*\*/g, '.*')        // ** 匹配任意路径
      .replace(/\*/g, '[^/]*')       // * 匹配除路径分隔符外的任意字符
      .replace(/\?/g, '[^/]')        // ? 匹配单个字符
      .replace(/\./g, '\\.')         // 转义点号
      .replace(/\//g, '[\\\\/]')     // 路径分隔符兼容
      .replace(/\[/g, '\\[')         // 转义左方括号
      .replace(/\]/g, '\\]');        // 转义右方括号
  }

  /**
   * 确定文件类型
   */
  private determineFileType(filename: string, extension: string, relativePath: string): ProjectFileType {
    const lowerFilename = filename.toLowerCase();
    const lowerPath = relativePath.toLowerCase();
    
    // 1. 根据文件名直接判断
    if (lowerFilename.startsWith('readme')) {
      return ProjectFileType.DOCUMENT;
    }
    
    if (lowerFilename.includes('license') || lowerFilename.includes('licence')) {
      return ProjectFileType.LICENSE;
    }
    
    if (lowerFilename.includes('changelog') || lowerFilename.includes('history')) {
      return ProjectFileType.CHANGELOG;
    }
    
    if (lowerFilename === 'package.json' || 
        lowerFilename === 'composer.json' || 
        lowerFilename === 'requirements.txt' || 
        lowerFilename === 'gemfile' ||
        lowerFilename === 'cargo.toml') {
      return ProjectFileType.CONFIG;
    }
    
    // 2. 根据扩展名判断
    if (this.fileTypeMapping.has(extension)) {
      return this.fileTypeMapping.get(extension)!;
    }
    
    // 3. 根据路径判断
    if (lowerPath.includes('config') || lowerPath.includes('settings')) {
      return ProjectFileType.CONFIG;
    }
    
    if (lowerPath.includes('doc') || lowerPath.includes('readme')) {
      return ProjectFileType.DOCUMENT;
    }
    
    if (lowerPath.includes('build') || lowerPath.includes('deploy') || lowerPath.includes('ci')) {
      return ProjectFileType.BUILD_SCRIPT;
    }
    
    // 4. 源代码文件
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.rb', '.php'];
    if (codeExtensions.includes(extension)) {
      return ProjectFileType.SOURCE_CODE;
    }
    
    return ProjectFileType.OTHER;
  }

  /**
   * 确定文件优先级
   */
  private determinePriority(fileType: ProjectFileType, filename: string): FilePriority {
    const lowerFilename = filename.toLowerCase();
    
    // 特殊文件高优先级
    if (lowerFilename.startsWith('readme') || 
        lowerFilename === 'package.json' ||
        lowerFilename === 'dockerfile' ||
        lowerFilename.includes('license')) {
      return FilePriority.HIGH;
    }
    
    // 根据类型确定基础优先级
    if (this.priorityMapping.has(fileType)) {
      return this.priorityMapping.get(fileType)!;
    }
    
    return FilePriority.LOW;
  }

  /**
   * 过滤和排序文件列表
   */
  private filterAndSortFiles(files: ProjectFile[], config: IndexingConfig): ProjectFile[] {
    let filteredFiles = files;
    
    // 1. 安全过滤
    filteredFiles = filteredFiles.filter(file => 
      this.securityStrategy.validateFile(file)
    );
    
    // 2. 按优先级和大小排序
    filteredFiles.sort((a, b) => {
      // 首先按优先级排序（数值越小优先级越高）
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // 然后按文件大小排序（小文件优先）
      return a.size - b.size;
    });
    
    // 3. 应用数量限制
    if (filteredFiles.length > config.maxFiles) {
      console.warn(`文件数量超过限制 ${config.maxFiles}，将截取前 ${config.maxFiles} 个文件`);
      filteredFiles = filteredFiles.slice(0, config.maxFiles);
    }
    
    // 4. 应用总大小限制
    let totalSize = 0;
    const sizeLimitedFiles: ProjectFile[] = [];
    
    for (const file of filteredFiles) {
      if (totalSize + file.size > config.maxTotalSize) {
        console.warn(`总文件大小超过限制 ${config.maxTotalSize} bytes，停止添加文件`);
        break;
      }
      sizeLimitedFiles.push(file);
      totalSize += file.size;
    }
    
    return sizeLimitedFiles;
  }

  /**
   * 初始化文件类型映射
   */
  private initializeTypeMappings(): void {
    this.fileTypeMapping = new Map([
      // 文档文件
      ['.md', ProjectFileType.DOCUMENT],
      ['.txt', ProjectFileType.DOCUMENT],
      ['.rst', ProjectFileType.DOCUMENT],
      ['.adoc', ProjectFileType.DOCUMENT],
      
      // 配置文件
      ['.json', ProjectFileType.CONFIG],
      ['.yaml', ProjectFileType.CONFIG],
      ['.yml', ProjectFileType.CONFIG],
      ['.toml', ProjectFileType.CONFIG],
      ['.ini', ProjectFileType.CONFIG],
      ['.conf', ProjectFileType.CONFIG],
      ['.config', ProjectFileType.CONFIG],
      ['.xml', ProjectFileType.CONFIG],
      
      // 构建脚本
      ['.dockerfile', ProjectFileType.BUILD_SCRIPT],
      ['.sh', ProjectFileType.BUILD_SCRIPT],
      ['.bat', ProjectFileType.BUILD_SCRIPT],
      ['.ps1', ProjectFileType.BUILD_SCRIPT],
      ['.makefile', ProjectFileType.BUILD_SCRIPT],
      
      // 源代码（将在 determineFileType 中处理）
      ['.js', ProjectFileType.SOURCE_CODE],
      ['.ts', ProjectFileType.SOURCE_CODE],
      ['.jsx', ProjectFileType.SOURCE_CODE],
      ['.tsx', ProjectFileType.SOURCE_CODE],
      ['.py', ProjectFileType.SOURCE_CODE],
      ['.java', ProjectFileType.SOURCE_CODE],
      ['.cpp', ProjectFileType.SOURCE_CODE],
      ['.c', ProjectFileType.SOURCE_CODE],
      ['.cs', ProjectFileType.SOURCE_CODE],
      ['.go', ProjectFileType.SOURCE_CODE],
      ['.rs', ProjectFileType.SOURCE_CODE],
      ['.rb', ProjectFileType.SOURCE_CODE],
      ['.php', ProjectFileType.SOURCE_CODE],
      ['.html', ProjectFileType.SOURCE_CODE],
      ['.css', ProjectFileType.SOURCE_CODE],
      ['.scss', ProjectFileType.SOURCE_CODE],
      ['.sass', ProjectFileType.SOURCE_CODE],
      ['.vue', ProjectFileType.SOURCE_CODE],
      ['.svelte', ProjectFileType.SOURCE_CODE]
    ]);
  }

  /**
   * 初始化优先级映射
   */
  private initializePriorityMappings(): void {
    this.priorityMapping = new Map([
      [ProjectFileType.DOCUMENT, FilePriority.HIGH],
      [ProjectFileType.CONFIG, FilePriority.HIGH],
      [ProjectFileType.LICENSE, FilePriority.HIGH],
      [ProjectFileType.CHANGELOG, FilePriority.MEDIUM],
      [ProjectFileType.BUILD_SCRIPT, FilePriority.MEDIUM],
      [ProjectFileType.SOURCE_CODE, FilePriority.LOW],
      [ProjectFileType.OTHER, FilePriority.LOW]
    ]);
  }

  /**
   * 获取文件统计信息
   */
  public getFileStatistics(files: ProjectFile[]): {
    totalFiles: number;
    totalSize: number;
    typeDistribution: Record<ProjectFileType, number>;
    priorityDistribution: Record<FilePriority, number>;
    averageSize: number;
    largestFile: ProjectFile | null;
    sensitiveFiles: number;
  } {
    const stats = {
      totalFiles: files.length,
      totalSize: 0,
      typeDistribution: {} as Record<ProjectFileType, number>,
      priorityDistribution: {} as Record<FilePriority, number>,
      averageSize: 0,
      largestFile: null as ProjectFile | null,
      sensitiveFiles: 0
    };

    // 初始化分布统计
    Object.values(ProjectFileType).forEach(type => {
      stats.typeDistribution[type] = 0;
    });
    
    Object.values(FilePriority).forEach(priority => {
      stats.priorityDistribution[priority as FilePriority] = 0;
    });

    let largestSize = 0;
    
    files.forEach(file => {
      stats.totalSize += file.size;
      stats.typeDistribution[file.type]++;
      stats.priorityDistribution[file.priority]++;
      
      if (file.isSensitive) {
        stats.sensitiveFiles++;
      }
      
      if (file.size > largestSize) {
        largestSize = file.size;
        stats.largestFile = file;
      }
    });

    stats.averageSize = files.length > 0 ? stats.totalSize / files.length : 0;

    return stats;
  }

  /**
   * 生成扫描报告
   */
  public generateScanReport(files: ProjectFile[]): {
    summary: {
      totalFiles: number;
      totalSize: string;
      averageSize: string;
    };
    distribution: {
      byType: Record<string, number>;
      byPriority: Record<string, number>;
    };
    recommendations: string[];
    warnings: string[];
  } {
    const stats = this.getFileStatistics(files);
    const recommendations: string[] = [];
    const warnings: string[] = [];

    // 生成建议
    if (stats.sensitiveFiles > 0) {
      warnings.push(`发现 ${stats.sensitiveFiles} 个敏感文件，请确认是否排除`);
    }

    if (stats.totalFiles > 30) {
      recommendations.push('文件数量较多，建议调整过滤规则以提高索引效率');
    }

    if (stats.totalSize > 1024 * 1024) { // 1MB
      recommendations.push('项目文件总大小较大，建议启用内容压缩功能');
    }

    const sourceCodeRatio = stats.typeDistribution[ProjectFileType.SOURCE_CODE] / stats.totalFiles;
    if (sourceCodeRatio > 0.7) {
      recommendations.push('项目以源代码文件为主，建议启用代码提取功能');
    }

    return {
      summary: {
        totalFiles: stats.totalFiles,
        totalSize: this.formatFileSize(stats.totalSize),
        averageSize: this.formatFileSize(stats.averageSize)
      },
      distribution: {
        byType: stats.typeDistribution,
        byPriority: stats.priorityDistribution
      },
      recommendations,
      warnings
    };
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}