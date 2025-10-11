/**
 * DevMind MCP 智能项目索引功能 - 进度报告器
 * 
 * 提供索引过程的进度追踪和报告功能
 */

import { 
  IProgressReporter,
  IndexingProgress,
  IndexingResult,
  IndexingError,
  IndexingStage,
  IndexingStatus
} from '../types/IndexingTypes';

/**
 * 进度报告器实现类
 */
export class ProgressReporter implements IProgressReporter {
  private startTime: number;
  private currentStage: IndexingStage;
  private totalStages: number;
  private progressHistory: IndexingProgress[];
  private onProgressUpdate?: (progress: IndexingProgress) => void;

  constructor(onProgressUpdate?: (progress: IndexingProgress) => void) {
    this.startTime = Date.now();
    this.currentStage = IndexingStage.INITIALIZING;
    this.totalStages = Object.keys(IndexingStage).length - 1; // 排除 COMPLETED
    this.progressHistory = [];
    this.onProgressUpdate = onProgressUpdate;
  }

  /**
   * 报告索引进度
   */
  public report(progress: IndexingProgress): void {
    // 更新当前阶段
    this.currentStage = progress.stage;
    
    // 记录进度历史
    this.progressHistory.push({
      ...progress,
      elapsedTime: Date.now() - this.startTime
    });
    
    // 计算剩余时间
    const enhancedProgress = this.enhanceProgress(progress);
    
    // 输出进度日志
    this.logProgress(enhancedProgress);
    
    // 调用回调函数
    if (this.onProgressUpdate) {
      this.onProgressUpdate(enhancedProgress);
    }
  }

  /**
   * 报告索引完成
   */
  public complete(result: IndexingResult): void {
    const totalTime = Date.now() - this.startTime;
    
    console.log('\n=== 项目索引完成 ===');
    console.log(`状态: ${this.getStatusDisplayName(result.status)}`);
    console.log(`处理时间: ${this.formatTime(totalTime)}`);
    console.log(`索引文件数: ${result.indexedFiles}`);
    console.log(`生成记忆数: ${result.generatedMemories}`);
    console.log(`内容总大小: ${this.formatSize(result.totalSize)}`);
    
    if (result.warnings.length > 0) {
      console.log(`\n警告 (${result.warnings.length} 个):`);
      result.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }
    
    if (result.errors.length > 0) {
      console.log(`\n错误 (${result.errors.length} 个):`);
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. [${error.type}] ${error.message}`);
        if (error.file) {
          console.log(`      文件: ${error.file}`);
        }
      });
    }
    
    console.log('========================\n');
    
    // 生成性能报告
    this.generatePerformanceReport(result, totalTime);
  }

  /**
   * 报告索引错误
   */
  public error(error: IndexingError): void {
    console.error(`\n❌ 索引错误 [${error.type}]:`);
    console.error(`   消息: ${error.message}`);
    
    if (error.file) {
      console.error(`   文件: ${error.file}`);
    }
    
    if (error.details) {
      console.error(`   详情: ${JSON.stringify(error.details, null, 2)}`);
    }
    
    console.error(`   时间: ${error.timestamp.toISOString()}\n`);
  }

  /**
   * 设置总文件数（用于进度计算）
   */
  public setTotalFiles(totalFiles: number): void {
    // 可以用于更精确的进度计算
  }

  /**
   * 开始新阶段
   */
  public startStage(stage: IndexingStage, message: string = ''): void {
    this.currentStage = stage;
    
    const progress: IndexingProgress = {
      stage,
      progress: this.calculateStageProgress(stage),
      processedFiles: 0,
      totalFiles: 0,
      elapsedTime: Date.now() - this.startTime,
      estimatedTimeRemaining: 0,
      message: message || this.getStageDisplayName(stage)
    };
    
    this.report(progress);
  }

  /**
   * 更新当前阶段进度
   */
  public updateStageProgress(processedFiles: number, totalFiles: number, currentFile?: string): void {
    const stageBaseProgress = this.calculateStageProgress(this.currentStage);
    const stageProgressRange = 100 / this.totalStages;
    const fileProgress = totalFiles > 0 ? (processedFiles / totalFiles) * stageProgressRange : 0;
    
    const progress: IndexingProgress = {
      stage: this.currentStage,
      progress: stageBaseProgress + fileProgress,
      currentFile,
      processedFiles,
      totalFiles,
      elapsedTime: Date.now() - this.startTime,
      estimatedTimeRemaining: this.estimateRemainingTime(processedFiles, totalFiles),
      message: currentFile ? `处理文件: ${currentFile}` : this.getStageDisplayName(this.currentStage)
    };
    
    this.report(progress);
  }

  /**
   * 生成进度摘要
   */
  public generateProgressSummary(): {
    totalTime: number;
    stageBreakdown: Record<string, number>;
    averageFileProcessingTime: number;
    bottlenecks: string[];
  } {
    const totalTime = Date.now() - this.startTime;
    const stageBreakdown: Record<string, number> = {};
    const bottlenecks: string[] = [];
    
    // 计算各阶段耗时
    let lastTime = this.startTime;
    let lastStage = IndexingStage.INITIALIZING;
    
    for (const progress of this.progressHistory) {
      if (progress.stage !== lastStage) {
        const stageTime = progress.elapsedTime - (lastTime - this.startTime);
        stageBreakdown[this.getStageDisplayName(lastStage)] = stageTime;
        
        // 识别耗时较长的阶段
        if (stageTime > totalTime * 0.3) {
          bottlenecks.push(`${this.getStageDisplayName(lastStage)} 阶段耗时较长`);
        }
        
        lastStage = progress.stage;
        lastTime = this.startTime + progress.elapsedTime;
      }
    }
    
    // 计算平均文件处理时间
    const fileProcessingHistory = this.progressHistory.filter(p => p.processedFiles > 0);
    const averageFileProcessingTime = fileProcessingHistory.length > 0 ?
      fileProcessingHistory.reduce((sum, p) => sum + (p.elapsedTime / p.processedFiles), 0) / fileProcessingHistory.length : 0;
    
    return {
      totalTime,
      stageBreakdown,
      averageFileProcessingTime,
      bottlenecks
    };
  }

  // 私有辅助方法

  private enhanceProgress(progress: IndexingProgress): IndexingProgress {
    return {
      ...progress,
      elapsedTime: Date.now() - this.startTime,
      estimatedTimeRemaining: this.estimateRemainingTime(progress.processedFiles, progress.totalFiles)
    };
  }

  private logProgress(progress: IndexingProgress): void {
    const progressBar = this.createProgressBar(progress.progress);
    const timeInfo = this.formatProgressTime(progress.elapsedTime, progress.estimatedTimeRemaining);
    const fileInfo = progress.totalFiles > 0 ? 
      ` (${progress.processedFiles}/${progress.totalFiles})` : '';
    
    // 使用 \r 实现同行更新
    process.stdout.write(
      `\r🔄 ${this.getStageDisplayName(progress.stage)} ${progressBar} ${progress.progress.toFixed(1)}%${fileInfo} ${timeInfo}`
    );
    
    // 如果进度完成或有特殊消息，换行
    if (progress.progress >= 100 || progress.currentFile) {
      console.log();
      if (progress.currentFile) {
        console.log(`   📄 ${progress.currentFile}`);
      }
    }
  }

  private createProgressBar(progress: number, width: number = 20): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  private formatProgressTime(elapsed: number, estimated: number): string {
    const elapsedStr = this.formatTime(elapsed);
    if (estimated > 0) {
      const estimatedStr = this.formatTime(estimated);
      return `⏱️ ${elapsedStr} (剩余 ~${estimatedStr})`;
    }
    return `⏱️ ${elapsedStr}`;
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

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private calculateStageProgress(stage: IndexingStage): number {
    const stageOrder = [
      IndexingStage.INITIALIZING,
      IndexingStage.SCANNING_FILES,
      IndexingStage.SELECTING_FILES,
      IndexingStage.ANALYZING_FILES,
      IndexingStage.EXTRACTING_CONTENT,
      IndexingStage.GENERATING_MEMORY,
      IndexingStage.STORING_RESULTS
    ];
    
    const stageIndex = stageOrder.indexOf(stage);
    if (stageIndex === -1) return 0;
    
    return (stageIndex / this.totalStages) * 100;
  }

  private estimateRemainingTime(processedFiles: number, totalFiles: number): number {
    if (processedFiles === 0 || totalFiles === 0) return 0;
    
    const elapsedTime = Date.now() - this.startTime;
    const averageTimePerFile = elapsedTime / processedFiles;
    const remainingFiles = totalFiles - processedFiles;
    
    return remainingFiles * averageTimePerFile;
  }

  private getStageDisplayName(stage: IndexingStage): string {
    const stageNames: Record<IndexingStage, string> = {
      [IndexingStage.INITIALIZING]: '初始化',
      [IndexingStage.SCANNING_FILES]: '扫描文件',
      [IndexingStage.SELECTING_FILES]: '选择文件',
      [IndexingStage.ANALYZING_FILES]: '分析文件',
      [IndexingStage.EXTRACTING_CONTENT]: '提取内容',
      [IndexingStage.GENERATING_MEMORY]: '生成记忆',
      [IndexingStage.STORING_RESULTS]: '存储结果',
      [IndexingStage.COMPLETED]: '完成'
    };
    
    return stageNames[stage] || stage;
  }

  private getStatusDisplayName(status: IndexingStatus): string {
    const statusNames: Record<IndexingStatus, string> = {
      [IndexingStatus.NOT_STARTED]: '未开始',
      [IndexingStatus.IN_PROGRESS]: '进行中',
      [IndexingStatus.COMPLETED]: '已完成',
      [IndexingStatus.FAILED]: '失败',
      [IndexingStatus.PARTIAL]: '部分完成'
    };
    
    return statusNames[status] || status;
  }

  private generatePerformanceReport(result: IndexingResult, totalTime: number): void {
    const summary = this.generateProgressSummary();
    
    console.log('📊 性能报告:');
    console.log(`   总处理时间: ${this.formatTime(totalTime)}`);
    console.log(`   平均文件处理时间: ${this.formatTime(summary.averageFileProcessingTime)}`);
    console.log(`   处理速度: ${(result.indexedFiles / (totalTime / 1000)).toFixed(2)} 文件/秒`);
    
    if (Object.keys(summary.stageBreakdown).length > 0) {
      console.log('\n   阶段耗时分布:');
      Object.entries(summary.stageBreakdown).forEach(([stage, time]) => {
        const percentage = ((time / totalTime) * 100).toFixed(1);
        console.log(`     ${stage}: ${this.formatTime(time)} (${percentage}%)`);
      });
    }
    
    if (summary.bottlenecks.length > 0) {
      console.log('\n⚠️  性能瓶颈:');
      summary.bottlenecks.forEach(bottleneck => {
        console.log(`     ${bottleneck}`);
      });
    }
    
    // 生成建议
    const suggestions = this.generateOptimizationSuggestions(result, summary);
    if (suggestions.length > 0) {
      console.log('\n💡 优化建议:');
      suggestions.forEach(suggestion => {
        console.log(`     ${suggestion}`);
      });
    }
    
    console.log();
  }

  private generateOptimizationSuggestions(
    result: IndexingResult, 
    summary: { totalTime: number; averageFileProcessingTime: number; bottlenecks: string[] }
  ): string[] {
    const suggestions: string[] = [];
    
    // 基于处理速度的建议
    const filesPerSecond = result.indexedFiles / (summary.totalTime / 1000);
    if (filesPerSecond < 1) {
      suggestions.push('处理速度较慢，考虑启用异步处理或调整文件大小限制');
    }
    
    // 基于错误率的建议
    const errorRate = result.errors.length / result.indexedFiles;
    if (errorRate > 0.1) {
      suggestions.push('错误率较高，检查文件路径和权限设置');
    }
    
    // 基于文件数量的建议
    if (result.indexedFiles > 100) {
      suggestions.push('文件数量较多，考虑使用更严格的过滤规则');
    }
    
    // 基于内容大小的建议
    if (result.totalSize > 10 * 1024 * 1024) { // 10MB
      suggestions.push('内容总大小较大，建议启用内容压缩功能');
    }
    
    return suggestions;
  }
}