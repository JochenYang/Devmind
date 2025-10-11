/**
 * DevMind MCP 智能项目索引功能 - 主入口文件
 * 
 * 导出所有项目索引相关的类型、接口和实现
 */

// 核心类型定义
export * from './types/IndexingTypes';

// 核心引擎
import { ProjectIndexer as _ProjectIndexer } from './core/ProjectIndexer';
export { ProjectIndexer } from './core/ProjectIndexer';

// 策略模块
export { SecurityStrategy } from './strategies/SecurityStrategy';
export { SmartIndexingStrategy } from './strategies/SmartIndexingStrategy';

// 工具模块
export { FileScanner } from './tools/FileScanner';
export { ContentExtractor } from './tools/ContentExtractor';
export { MemoryGenerator } from './tools/MemoryGenerator';
export { ProjectAnalyzer } from './tools/ProjectAnalyzer';
export { ProgressReporter } from './tools/ProgressReporter';

// 默认配置
export {
  DEFAULT_INDEXING_CONFIG,
  DEFAULT_COMPRESSION_CONFIG
} from './types/IndexingTypes';

/**
 * 快速创建项目索引器实例
 * @param config 可选的配置参数
 * @returns 配置好的项目索引器实例
 */
export function createProjectIndexer(config?: {
  indexingConfig?: any;
  compressionConfig?: any;
  onProgressUpdate?: (progress: any) => void;
}) {
  return new _ProjectIndexer(
    config?.indexingConfig,
    config?.compressionConfig,
    config?.onProgressUpdate
  );
}

/**
 * 项目索引器版本信息
 */
export const PROJECT_INDEXER_VERSION = '1.0.0';

/**
 * 项目索引器功能说明
 */
export const PROJECT_INDEXER_FEATURES = {
  smartIndexing: '基于项目特征的智能索引',
  securityFiltering: '敏感文件检测和过滤',
  contentExtraction: '智能内容提取和压缩',
  memoryGeneration: '结构化项目记忆生成',
  progressTracking: '详细的进度追踪和报告',
  projectAnalysis: '全面的项目特征分析'
} as const;