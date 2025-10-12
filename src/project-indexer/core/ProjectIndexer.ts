/**
 * DevMind MCP 智能项目索引功能 - 主索引引擎
 * 
 * 作为核心协调器整合所有组件完成索引流程
 */

import { 
  IndexingConfig,
  ContentCompressionConfig,
  IndexingResult,
  IndexingStatus,
  IndexingTrigger,
  IndexingStage,
  IndexingError,
  IndexingErrorType,
  MemoryGenerationResult,
  DEFAULT_INDEXING_CONFIG,
  DEFAULT_COMPRESSION_CONFIG
} from '../types/IndexingTypes.js';

import { SecurityStrategy } from '../strategies/SecurityStrategy.js';
import { SmartIndexingStrategy } from '../strategies/SmartIndexingStrategy.js';
import { FileScanner } from '../tools/FileScanner.js';
import { ContentExtractor } from '../tools/ContentExtractor.js';
import { MemoryGenerator } from '../tools/MemoryGenerator.js';
import { ProjectAnalyzer } from '../tools/ProjectAnalyzer.js';
import { ProgressReporter } from '../tools/ProgressReporter.js';

/**
 * 主项目索引器类
 */
export class ProjectIndexer {
  private securityStrategy: SecurityStrategy;
  private smartStrategy: SmartIndexingStrategy;
  private fileScanner: FileScanner;
  private contentExtractor: ContentExtractor;
  private memoryGenerator: MemoryGenerator;
  private projectAnalyzer: ProjectAnalyzer;
  private progressReporter: ProgressReporter;

  private indexingConfig: IndexingConfig;
  private compressionConfig: ContentCompressionConfig;
  private isIndexing: boolean = false;

  constructor(
    indexingConfig?: IndexingConfig,
    compressionConfig?: ContentCompressionConfig,
    onProgressUpdate?: (progress: any) => void
  ) {
    this.indexingConfig = indexingConfig || { ...DEFAULT_INDEXING_CONFIG };
    this.compressionConfig = compressionConfig || { ...DEFAULT_COMPRESSION_CONFIG };
    
    // 初始化所有组件
    this.securityStrategy = new SecurityStrategy(this.indexingConfig);
    this.smartStrategy = new SmartIndexingStrategy();
    this.fileScanner = new FileScanner(this.indexingConfig);
    this.contentExtractor = new ContentExtractor(this.compressionConfig);
    this.memoryGenerator = new MemoryGenerator();
    this.projectAnalyzer = new ProjectAnalyzer();
    this.progressReporter = new ProgressReporter(onProgressUpdate);
    
    console.log('🚀 项目索引器初始化完成');
  }

  /**
   * 开始项目索引
   */
  public async indexProject(
    projectPath: string,
    trigger: IndexingTrigger = IndexingTrigger.MANUAL_TRIGGER,
    customConfig?: Partial<IndexingConfig>
  ): Promise<IndexingResult> {
    if (this.isIndexing) {
      throw new Error('索引器正在运行中，请等待当前任务完成');
    }

    this.isIndexing = true;
    const sessionId = this.generateSessionId();
    const startTime = Date.now();
    const errors: IndexingError[] = [];
    const warnings: string[] = [];

    console.log(`\n🎯 开始项目智能索引: ${projectPath}`);
    console.log(`触发方式: ${this.getTriggerDisplayName(trigger)}`);
    console.log(`会话ID: ${sessionId}\n`);

    try {
      // 阶段1: 初始化
      this.progressReporter.startStage(IndexingStage.INITIALIZING, '正在初始化索引器...');
      
      // 合并自定义配置
      const finalConfig = { ...this.indexingConfig, ...customConfig };
      
      // 阶段2: 扫描文件
      this.progressReporter.startStage(IndexingStage.SCANNING_FILES, '正在扫描项目文件...');
      const allFiles = await this.fileScanner.scan(projectPath, finalConfig);
      
      if (allFiles.length === 0) {
        warnings.push('未找到任何可索引的文件');
        return this.createEmptyResult(projectPath, sessionId, warnings);
      }

      this.progressReporter.updateStageProgress(allFiles.length, allFiles.length);

      // 阶段3: 项目分析
      this.progressReporter.startStage(IndexingStage.ANALYZING_FILES, '正在分析项目特征...');
      const { structure, features } = await this.projectAnalyzer.analyzeProject(projectPath, allFiles);

      // 阶段4: 智能优化配置
      this.progressReporter.startStage(IndexingStage.SELECTING_FILES, '正在优化索引策略...');
      
      const optimizedConfig = this.smartStrategy.optimizeIndexingConfig(features, finalConfig);
      const optimizedCompression = this.smartStrategy.optimizeCompressionConfig(features, this.compressionConfig);
      
      // 应用智能文件优先级
      const prioritizedFiles = this.smartStrategy.prioritizeFiles(allFiles, features);
      
      // 预估处理时间
      const timeEstimate = this.smartStrategy.estimateProcessingTime(features, prioritizedFiles.length);
      console.log(`⏰ 预估处理时间: ${this.formatTime(timeEstimate.estimated)} (可信度: ${(timeEstimate.confidence * 100).toFixed(1)}%)`);
      
      this.progressReporter.updateStageProgress(prioritizedFiles.length, allFiles.length);

      // 阶段5: 内容提取
      this.progressReporter.startStage(IndexingStage.EXTRACTING_CONTENT, '正在提取文件内容...');
      
      const analysisResults = [];
      let processedFiles = 0;
      
      for (const file of prioritizedFiles) {
        try {
          this.progressReporter.updateStageProgress(processedFiles, prioritizedFiles.length, file.relativePath);
          
          const analysisResult = await this.contentExtractor.extract(file, optimizedCompression);
          analysisResults.push(analysisResult);
          
          processedFiles++;
          
          // 检查是否超过大小限制
          const totalSize = analysisResults.reduce((sum, result) => sum + result.extractedContent.length, 0);
          if (totalSize > optimizedConfig.maxTotalSize) {
            warnings.push('内容总大小超过限制，停止处理更多文件');
            break;
          }
          
        } catch (error) {
          const indexingError: IndexingError = {
            type: IndexingErrorType.PROCESSING_TIMEOUT,
            message: error instanceof Error ? error.message : '文件处理失败',
            file: file.relativePath,
            timestamp: new Date()
          };
          
          errors.push(indexingError);
          this.progressReporter.error(indexingError);
          processedFiles++;
        }
      }

      if (analysisResults.length === 0) {
        warnings.push('没有成功提取任何文件内容');
        return this.createPartialResult(projectPath, sessionId, 0, 0, 0, errors, warnings, startTime);
      }

      // 阶段6: 生成记忆
      this.progressReporter.startStage(IndexingStage.GENERATING_MEMORY, '正在生成项目记忆...');
      
      let memoryResult: MemoryGenerationResult;
      try {
        memoryResult = await this.memoryGenerator.generate(analysisResults, features);
        this.progressReporter.updateStageProgress(1, 1);
      } catch (error) {
        const memoryError: IndexingError = {
          type: IndexingErrorType.MEMORY_ERROR,
          message: error instanceof Error ? error.message : '记忆生成失败',
          timestamp: new Date()
        };
        
        errors.push(memoryError);
        this.progressReporter.error(memoryError);
        
        return this.createPartialResult(
          projectPath, sessionId, analysisResults.length, 0, 
          analysisResults.reduce((sum, r) => sum + r.extractedContent.length, 0),
          errors, warnings, startTime
        );
      }

      // 阶段7: 存储结果 (这里可以扩展为实际存储到数据库或文件)
      this.progressReporter.startStage(IndexingStage.STORING_RESULTS, '正在存储索引结果...');
      
      // TODO: 实现实际的存储逻辑
      await this.storeIndexingResults(sessionId, structure, features, analysisResults, memoryResult);
      
      this.progressReporter.updateStageProgress(1, 1);

      // 创建最终结果
      const result: IndexingResult = {
        status: errors.length > 0 ? IndexingStatus.PARTIAL : IndexingStatus.COMPLETED,
        projectPath,
        sessionId,
        indexedFiles: analysisResults.length,
        generatedMemories: memoryResult.totalRecords,
        totalSize: memoryResult.totalSize,
        processingTime: Date.now() - startTime,
        errors,
        warnings,
        metadata: {
          trigger,
          projectType: features.projectType,
          complexity: features.complexity.level,
          technicalStack: features.technicalStack.language,
          optimizedConfig: {
            maxFiles: optimizedConfig.maxFiles,
            maxTotalSize: optimizedConfig.maxTotalSize,
            enabledFeatures: {
              codeExtraction: optimizedConfig.enableCodeExtraction,
              documentSummary: optimizedConfig.enableDocumentSummary,
              securityScan: optimizedConfig.enableSecurityScan
            }
          },
          timeEstimate,
          memoryBreakdown: {
            projectOverview: !!memoryResult.projectOverview,
            technicalStack: !!memoryResult.technicalStack,
            projectStructure: !!memoryResult.projectStructure,
            keyFeatures: !!memoryResult.keyFeatures
          }
        }
      };

      // 报告完成
      this.progressReporter.complete(result);
      
      return result;

    } catch (error) {
      const fatalError: IndexingError = {
        type: IndexingErrorType.UNKNOWN_ERROR,
        message: error instanceof Error ? error.message : '未知错误',
        timestamp: new Date()
      };
      
      errors.push(fatalError);
      this.progressReporter.error(fatalError);
      
      const failedResult: IndexingResult = {
        status: IndexingStatus.FAILED,
        projectPath,
        sessionId,
        indexedFiles: 0,
        generatedMemories: 0,
        totalSize: 0,
        processingTime: Date.now() - startTime,
        errors,
        warnings,
        metadata: { trigger, error: fatalError.message }
      };
      
      this.progressReporter.complete(failedResult);
      
      return failedResult;
      
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * 获取索引器状态
   */
  public getStatus(): {
    isIndexing: boolean;
    config: IndexingConfig;
    compressionConfig: ContentCompressionConfig;
    componentStatus: Record<string, boolean>;
  } {
    return {
      isIndexing: this.isIndexing,
      config: this.indexingConfig,
      compressionConfig: this.compressionConfig,
      componentStatus: {
        securityStrategy: !!this.securityStrategy,
        smartStrategy: !!this.smartStrategy,
        fileScanner: !!this.fileScanner,
        contentExtractor: !!this.contentExtractor,
        memoryGenerator: !!this.memoryGenerator,
        projectAnalyzer: !!this.projectAnalyzer,
        progressReporter: !!this.progressReporter
      }
    };
  }

  /**
   * 停止当前索引任务
   */
  public async stopIndexing(): Promise<void> {
    if (this.isIndexing) {
      console.log('⏹️ 正在停止索引任务...');
      this.isIndexing = false;
      // TODO: 实现优雅停止逻辑
    }
  }

  /**
   * 更新配置
   */
  public updateConfig(
    indexingConfig?: Partial<IndexingConfig>,
    compressionConfig?: Partial<ContentCompressionConfig>
  ): void {
    if (this.isIndexing) {
      throw new Error('无法在索引过程中更新配置');
    }

    if (indexingConfig) {
      this.indexingConfig = { ...this.indexingConfig, ...indexingConfig };
    }

    if (compressionConfig) {
      this.compressionConfig = { ...this.compressionConfig, ...compressionConfig };
    }

    console.log('⚙️ 索引器配置已更新');
  }

  /**
   * 验证项目路径
   */
  public async validateProject(projectPath: string): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // 基本路径检查
      const fs = await import('fs');
      if (!fs.existsSync(projectPath)) {
        issues.push('项目路径不存在');
        return { isValid: false, issues, recommendations };
      }

      if (!fs.statSync(projectPath).isDirectory()) {
        issues.push('项目路径不是一个目录');
        return { isValid: false, issues, recommendations };
      }

      // 快速扫描检查
      const quickScan = await this.fileScanner.scan(projectPath, {
        ...this.indexingConfig,
        maxFiles: 10,
        maxDepth: 2
      });

      if (quickScan.length === 0) {
        issues.push('项目中没有找到可索引的文件');
        recommendations.push('检查文件过滤规则是否过于严格');
      }

      // 安全性检查
      const securityReport = this.securityStrategy.generateSecurityReport(quickScan);
      if (securityReport.dangerFiles > quickScan.length * 0.5) {
        issues.push('项目包含大量敏感文件');
        recommendations.push('调整敏感文件过滤规则');
      }

      return {
        isValid: issues.length === 0,
        issues,
        recommendations
      };

    } catch (error) {
      issues.push(`项目验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return { isValid: false, issues, recommendations };
    }
  }

  // 私有辅助方法

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substr(2, 9);
    return `idx_${timestamp}_${randomStr}`;
  }

  private getTriggerDisplayName(trigger: IndexingTrigger): string {
    const triggerNames = {
      [IndexingTrigger.PROJECT_FIRST_OPEN]: '项目首次打开',
      [IndexingTrigger.MANUAL_TRIGGER]: '手动触发',
      [IndexingTrigger.PERIODIC_UPDATE]: '定期更新'
    };
    
    return triggerNames[trigger] || trigger;
  }

  private formatTime(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = Math.floor((milliseconds % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  private createEmptyResult(
    projectPath: string, 
    sessionId: string, 
    warnings: string[]
  ): IndexingResult {
    return {
      status: IndexingStatus.PARTIAL,
      projectPath,
      sessionId,
      indexedFiles: 0,
      generatedMemories: 0,
      totalSize: 0,
      processingTime: 0,
      errors: [],
      warnings,
      metadata: { reason: 'no_files_found' }
    };
  }

  private createPartialResult(
    projectPath: string,
    sessionId: string,
    indexedFiles: number,
    generatedMemories: number,
    totalSize: number,
    errors: IndexingError[],
    warnings: string[],
    startTime: number
  ): IndexingResult {
    return {
      status: IndexingStatus.PARTIAL,
      projectPath,
      sessionId,
      indexedFiles,
      generatedMemories,
      totalSize,
      processingTime: Date.now() - startTime,
      errors,
      warnings,
      metadata: { reason: 'partial_completion' }
    };
  }

  private async storeIndexingResults(
    sessionId: string,
    structure: any,
    features: any,
    analysisResults: any[],
    memoryResult: MemoryGenerationResult
  ): Promise<void> {
    // TODO: 实现实际的存储逻辑
    // 这里可以存储到数据库、文件系统或其他存储后端
    
    console.log(`💾 存储索引结果 (会话: ${sessionId})`);
    console.log(`   - 项目结构信息`);
    console.log(`   - 项目特征分析`);
    console.log(`   - ${analysisResults.length} 个文件分析结果`);
    console.log(`   - ${memoryResult.totalRecords} 条生成记忆`);
    
    // 模拟存储延迟
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /**
   * 生成索引报告
   */
  public generateIndexingReport(result: IndexingResult): string {
    const lines: string[] = [];
    
    lines.push('# 项目索引报告');
    lines.push('');
    lines.push(`**项目路径**: ${result.projectPath}`);
    lines.push(`**会话ID**: ${result.sessionId}`);
    lines.push(`**状态**: ${result.status}`);
    lines.push(`**处理时间**: ${this.formatTime(result.processingTime)}`);
    lines.push('');
    
    lines.push('## 索引统计');
    lines.push(`- 索引文件数: ${result.indexedFiles}`);
    lines.push(`- 生成记忆数: ${result.generatedMemories}`);
    lines.push(`- 内容总大小: ${this.formatSize(result.totalSize)}`);
    lines.push('');
    
    if (result.metadata?.projectType) {
      lines.push('## 项目信息');
      lines.push(`- 项目类型: ${result.metadata.projectType}`);
      if (result.metadata.technicalStack) {
        lines.push(`- 技术栈: ${result.metadata.technicalStack}`);
      }
      if (result.metadata.complexity) {
        lines.push(`- 复杂度: ${result.metadata.complexity}`);
      }
      lines.push('');
    }
    
    if (result.warnings.length > 0) {
      lines.push('## 警告');
      result.warnings.forEach((warning, index) => {
        lines.push(`${index + 1}. ${warning}`);
      });
      lines.push('');
    }
    
    if (result.errors.length > 0) {
      lines.push('## 错误');
      result.errors.forEach((error, index) => {
        lines.push(`${index + 1}. [${error.type}] ${error.message}`);
        if (error.file) {
          lines.push(`   - 文件: ${error.file}`);
        }
      });
    }
    
    return lines.join('\n');
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}