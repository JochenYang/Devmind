/**
 * DevMind MCP 智能项目索引功能 - 类型定义
 * 
 * 定义项目索引系统中使用的所有接口、枚举和类型
 */

// ==================== 基础枚举类型 ====================

/**
 * 索引触发时机
 */
export enum IndexingTrigger {
  PROJECT_FIRST_OPEN = 'first_open',      // 项目首次打开
  MANUAL_TRIGGER = 'manual',              // 手动触发
  PERIODIC_UPDATE = 'periodic'            // 定期更新
}

/**
 * 文件优先级
 */
export enum FilePriority {
  HIGH = 1,      // 高优先级：README、package.json等核心文件
  MEDIUM = 2,    // 中优先级：配置文件、文档
  LOW = 3        // 低优先级：源代码文件
}

/**
 * 项目记忆类型
 */
export enum ProjectMemoryType {
  PROJECT_OVERVIEW = 'project_overview',   // 项目概览
  TECHNICAL_STACK = 'technical_stack',     // 技术栈
  PROJECT_STRUCTURE = 'project_structure', // 项目结构  
  KEY_FEATURES = 'key_features'           // 关键特性
}

/**
 * 索引深度级别
 */
export enum IndexingDepth {
  BASIC = 'basic',                // 基础索引：仅核心文件
  DETAILED = 'detailed',          // 详细索引：包含配置和文档
  COMPREHENSIVE = 'comprehensive'  // 全面索引：包含关键源代码
}

/**
 * 索引状态
 */
export enum IndexingStatus {
  NOT_STARTED = 'not_started',    // 未开始
  IN_PROGRESS = 'in_progress',    // 进行中
  COMPLETED = 'completed',        // 已完成
  FAILED = 'failed',              // 失败
  PARTIAL = 'partial'             // 部分完成
}

// ==================== 配置接口 ====================

/**
 * 索引配置
 */
export interface IndexingConfig {
  // 基础限制
  maxFiles: number;               // 最大索引文件数
  maxFileSize: number;           // 单文件最大大小(字节)
  maxTotalSize: number;          // 最大总内容大小(字节)
  maxDepth: number;              // 最大目录深度
  
  // 文件过滤模式
  excludePatterns: string[];      // 排除文件模式
  includePatterns: string[];      // 包含文件模式
  sensitivePatterns: string[];    // 敏感文件模式
  
  // 功能开关
  enableDocumentSummary: boolean; // 启用文档摘要
  enableCodeExtraction: boolean;  // 启用代码提取
  enableSecurityScan: boolean;    // 启用安全扫描
  
  // 性能控制
  asyncProcessing: boolean;       // 异步处理
  cacheEnabled: boolean;         // 启用缓存
  progressReporting: boolean;     // 进度报告
}

/**
 * 内容压缩策略配置
 */
export interface ContentCompressionConfig {
  documentSummary: {
    enabled: boolean;
    maxLength: number;            // 文档最大保留长度
    preserveSections: string[];   // 保留的章节标题
  };
  codeExtraction: {
    extractImports: boolean;      // 提取导入语句
    extractMainFunctions: boolean; // 提取主要函数
    extractClassDefinitions: boolean; // 提取类定义
    maxFunctionLines: number;     // 函数最大保留行数
  };
}

// ==================== 文件相关接口 ====================

/**
 * 项目文件信息
 */
export interface ProjectFile {
  path: string;                   // 文件路径
  relativePath: string;           // 相对路径
  name: string;                   // 文件名
  extension: string;              // 文件扩展名
  size: number;                   // 文件大小
  lastModified: Date;             // 最后修改时间
  priority: FilePriority;         // 文件优先级
  type: ProjectFileType;          // 文件类型
  isSensitive: boolean;           // 是否敏感文件
}

/**
 * 项目文件类型
 */
export enum ProjectFileType {
  DOCUMENT = 'document',          // 文档文件 (README.md, *.md)
  CONFIG = 'config',              // 配置文件 (package.json, *.config.js)
  SOURCE_CODE = 'source_code',    // 源代码文件 (*.ts, *.js, *.py)
  BUILD_SCRIPT = 'build_script',  // 构建脚本 (Dockerfile, *.yml)
  LICENSE = 'license',            // 许可证文件
  CHANGELOG = 'changelog',        // 变更日志
  OTHER = 'other'                 // 其他文件
}

/**
 * 文件内容分析结果
 */
export interface FileAnalysisResult {
  file: ProjectFile;
  extractedContent: string;       // 提取的内容
  summary: string;                // 内容摘要
  keywords: string[];             // 关键词
  technicalTerms: string[];       // 技术术语
  confidence: number;             // 分析可信度 (0-1)
  metadata: Record<string, any>;  // 额外元数据
  processingTime: number;         // 处理耗时(毫秒)
}

// ==================== 项目分析相关接口 ====================

/**
 * 项目结构信息
 */
export interface ProjectStructure {
  rootPath: string;               // 项目根路径
  name: string;                   // 项目名称
  totalFiles: number;             // 总文件数
  selectedFiles: ProjectFile[];   // 选中的文件列表
  directories: string[];          // 目录结构
  gitInfo?: GitInfo;              // Git信息
  language: string;               // 主要编程语言
  framework?: string;             // 框架信息
  buildTools: string[];           // 构建工具
  dependencies: string[];         // 依赖列表
}

/**
 * Git仓库信息
 */
export interface GitInfo {
  isRepo: boolean;                // 是否Git仓库
  remoteUrl?: string;             // 远程仓库URL
  currentBranch?: string;         // 当前分支
  lastCommit?: {
    hash: string;
    message: string;
    author: string;
    date: Date;
  };
}

/**
 * 项目特征
 */
export interface ProjectFeatures {
  projectType: string;            // 项目类型 (web, mobile, desktop, library)
  architecture: string[];         // 架构模式
  technicalStack: TechnicalStack; // 技术栈
  complexity: ProjectComplexity;  // 项目复杂度
  metadata: Record<string, any>;  // 其他元数据
}

/**
 * 技术栈信息
 */
export interface TechnicalStack {
  language: string;               // 主要语言
  framework?: string;             // 主要框架
  database?: string[];            // 数据库
  cloudServices?: string[];       // 云服务
  devTools: string[];             // 开发工具
  runtime?: string;               // 运行时环境
}

/**
 * 项目复杂度
 */
export interface ProjectComplexity {
  level: 'low' | 'medium' | 'high'; // 复杂度级别
  factors: {
    fileCount: number;            // 文件数量
    codeLines: number;            // 代码行数
    dependencyCount: number;      // 依赖数量
    moduleCount: number;          // 模块数量
  };
  score: number;                  // 复杂度评分 (0-100)
}

// ==================== 记忆生成相关接口 ====================

/**
 * 项目记忆记录
 */
export interface ProjectMemoryRecord {
  id: string;                     // 记忆ID
  type: ProjectMemoryType;        // 记忆类型
  priority: FilePriority;         // 优先级
  content: string;                // 记忆内容
  summary: string;                // 内容摘要
  sourceFiles: string[];          // 来源文件列表
  tags: string[];                 // 标签
  confidence: number;             // 可信度 (0-1)
  metadata: {
    generatedAt: string;          // 生成时间
    sourceCount: number;          // 来源文件数量
    contentLength: number;        // 内容长度
    processingTime: number;       // 处理耗时
    [key: string]: any;           // 其他元数据
  };
}

/**
 * 记忆生成结果
 */
export interface MemoryGenerationResult {
  projectOverview?: ProjectMemoryRecord;  // 项目概览记忆
  technicalStack?: ProjectMemoryRecord;   // 技术栈记忆
  projectStructure?: ProjectMemoryRecord; // 项目结构记忆
  keyFeatures?: ProjectMemoryRecord;      // 关键特性记忆
  totalRecords: number;                   // 总记录数
  totalSize: number;                      // 总大小(字节)
  generationTime: number;                 // 生成耗时(毫秒)
}

// ==================== 索引过程相关接口 ====================

/**
 * 索引进度信息
 */
export interface IndexingProgress {
  stage: IndexingStage;           // 当前阶段
  progress: number;               // 进度百分比 (0-100)
  currentFile?: string;           // 当前处理文件
  processedFiles: number;         // 已处理文件数
  totalFiles: number;             // 总文件数
  elapsedTime: number;            // 已用时间(毫秒)
  estimatedTimeRemaining: number; // 预计剩余时间(毫秒)
  message: string;                // 状态消息
}

/**
 * 索引阶段
 */
export enum IndexingStage {
  INITIALIZING = 'initializing',         // 初始化
  SCANNING_FILES = 'scanning_files',     // 扫描文件
  SELECTING_FILES = 'selecting_files',   // 选择文件
  ANALYZING_FILES = 'analyzing_files',   // 分析文件
  EXTRACTING_CONTENT = 'extracting_content', // 提取内容
  GENERATING_MEMORY = 'generating_memory',    // 生成记忆
  STORING_RESULTS = 'storing_results',        // 存储结果
  COMPLETED = 'completed'                     // 完成
}

/**
 * 索引结果
 */
export interface IndexingResult {
  status: IndexingStatus;         // 索引状态
  projectPath: string;            // 项目路径
  sessionId: string;              // 会话ID
  indexedFiles: number;           // 索引文件数
  generatedMemories: number;      // 生成记忆数
  totalSize: number;              // 总内容大小
  processingTime: number;         // 处理总时间
  errors: IndexingError[];        // 错误列表
  warnings: string[];             // 警告列表
  metadata: Record<string, any>;  // 结果元数据
}

/**
 * 索引错误
 */
export interface IndexingError {
  type: IndexingErrorType;        // 错误类型
  message: string;                // 错误消息
  file?: string;                  // 相关文件
  details?: any;                  // 错误详情
  timestamp: Date;                // 错误时间
}

/**
 * 索引错误类型
 */
export enum IndexingErrorType {
  FILE_ACCESS_ERROR = 'file_access_error',       // 文件访问错误
  PARSING_ERROR = 'parsing_error',               // 解析错误
  SIZE_LIMIT_EXCEEDED = 'size_limit_exceeded',   // 大小限制超出
  SECURITY_VIOLATION = 'security_violation',     // 安全违规
  PROCESSING_TIMEOUT = 'processing_timeout',     // 处理超时
  MEMORY_ERROR = 'memory_error',                 // 内存错误
  UNKNOWN_ERROR = 'unknown_error'                // 未知错误
}

// ==================== 工具和实用接口 ====================

/**
 * 进度报告器接口
 */
export interface IProgressReporter {
  report(progress: IndexingProgress): void;
  complete(result: IndexingResult): void;
  error(error: IndexingError): void;
}

/**
 * 文件扫描器接口
 */
export interface IFileScanner {
  scan(projectPath: string, config: IndexingConfig): Promise<ProjectFile[]>;
}

/**
 * 内容提取器接口
 */
export interface IContentExtractor {
  extract(file: ProjectFile, config: ContentCompressionConfig): Promise<FileAnalysisResult>;
}

/**
 * 记忆生成器接口
 */
export interface IMemoryGenerator {
  generate(analysisResults: FileAnalysisResult[], projectFeatures: ProjectFeatures): Promise<MemoryGenerationResult>;
}

/**
 * 安全策略接口
 */
export interface ISecurityStrategy {
  isSensitive(filePath: string): boolean;
  sanitizeContent(content: string): string;
  validateFile(file: ProjectFile): boolean;
}

// ==================== 默认配置常量 ====================

/**
 * 默认索引配置
 */
export const DEFAULT_INDEXING_CONFIG: IndexingConfig = {
  maxFiles: 50,
  maxFileSize: 100 * 1024, // 100KB
  maxTotalSize: 5 * 1024 * 1024, // 5MB
  maxDepth: 3,
  
  excludePatterns: [
    '**/node_modules/**', '**/dist/**', '**/build/**',
    '**/*.log', '**/.git/**', '**/coverage/**',
    '**/.next/**', '**/.nuxt/**', '**/vendor/**'
  ],
  
  includePatterns: [
    '**/README*', '**/package.json', '**/src/**',
    '**/docs/**', '**/*.md', '**/config/**',
    '**/tsconfig.json', '**/webpack.config.js'
  ],
  
  sensitivePatterns: [
    '**/*.key', '**/*.pem', '**/*.p12',
    '.env*', '*.env', 'secrets.json',
    '*password*', '*secret*', '*credential*',
    '**/private/**', '**/confidential/**'
  ],
  
  enableDocumentSummary: true,
  enableCodeExtraction: true,
  enableSecurityScan: true,
  asyncProcessing: true,
  cacheEnabled: true,
  progressReporting: true
};

/**
 * 默认内容压缩配置
 */
export const DEFAULT_COMPRESSION_CONFIG: ContentCompressionConfig = {
  documentSummary: {
    enabled: true,
    maxLength: 1000,
    preserveSections: [
      '## Features', '## Installation', '## Usage',
      '## Getting Started', '## API', '## Configuration'
    ]
  },
  codeExtraction: {
    extractImports: true,
    extractMainFunctions: true,
    extractClassDefinitions: true,
    maxFunctionLines: 20
  }
};