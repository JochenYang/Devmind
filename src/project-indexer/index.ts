/**
 * DevMind MCP 项目索引器模块 - 主入口文件
 * 
 * 导出项目分析和记忆优化相关的核心功能
 */

// 核心类型定义
export * from './types/IndexingTypes.js';

// 核心优化器
export { ProjectMemoryOptimizer, OptimizationStrategy } from './core/ProjectMemoryOptimizer.js';

// 策略模块
export { SecurityStrategy } from './strategies/SecurityStrategy.js';
export { SmartIndexingStrategy } from './strategies/SmartIndexingStrategy.js';

// 工具模块 - 仍在使用的核心工具
export { FileScanner } from './tools/FileScanner.js';
export { ContentExtractor } from './tools/ContentExtractor.js';
export { ProjectAnalyzer } from './tools/ProjectAnalyzer.js';

// 默认配置
export {
  DEFAULT_INDEXING_CONFIG,
  DEFAULT_COMPRESSION_CONFIG
} from './types/IndexingTypes.js';

/**
 * 项目索引器模块版本信息
 */
export const PROJECT_INDEXER_VERSION = '2.0.0';

/**
 * 项目索引器可用功能
 */
export const PROJECT_INDEXER_FEATURES = {
  projectAnalysis: '全面的项目特征分析',
  fileScanning: '智能文件扫描和过滤',
  contentExtraction: '智能内容提取和处理',
  memoryOptimization: '项目记忆优化和管理',
  securityFiltering: '敏感文件检测和保护'
} as const;
