/**
 * DevMind MCP 智能项目索引功能 - 智能索引策略
 * 
 * 实现基于项目特征的智能索引决策功能
 */

import { 
  IndexingConfig,
  ContentCompressionConfig,
  ProjectFeatures,
  ProjectFile,
  ProjectFileType,
  IndexingDepth,
  DEFAULT_INDEXING_CONFIG,
  DEFAULT_COMPRESSION_CONFIG
} from '../types/IndexingTypes.js';

/**
 * 智能索引策略类
 */
export class SmartIndexingStrategy {
  
  /**
   * 基于项目特征动态调整索引配置
   */
  public optimizeIndexingConfig(
    projectFeatures: ProjectFeatures, 
    baseConfig: IndexingConfig = DEFAULT_INDEXING_CONFIG
  ): IndexingConfig {
    const optimizedConfig = { ...baseConfig };
    
    console.log(`开始智能优化索引配置，项目类型: ${projectFeatures.projectType}`);
    
    // 根据项目复杂度调整
    this.adjustForComplexity(optimizedConfig, projectFeatures);
    
    // 根据项目类型调整
    this.adjustForProjectType(optimizedConfig, projectFeatures);
    
    // 根据技术栈调整
    this.adjustForTechStack(optimizedConfig, projectFeatures);
    
    // 根据项目规模调整
    this.adjustForProjectScale(optimizedConfig, projectFeatures);
    
    console.log(`索引配置优化完成，文件限制: ${optimizedConfig.maxFiles}，大小限制: ${optimizedConfig.maxTotalSize / 1024 / 1024}MB`);
    
    return optimizedConfig;
  }

  /**
   * 基于项目特征优化内容压缩配置
   */
  public optimizeCompressionConfig(
    projectFeatures: ProjectFeatures,
    baseConfig: ContentCompressionConfig = DEFAULT_COMPRESSION_CONFIG
  ): ContentCompressionConfig {
    const optimizedConfig = { ...baseConfig };
    
    // 根据项目类型调整压缩策略
    this.adjustCompressionForProjectType(optimizedConfig, projectFeatures);
    
    // 根据代码复杂度调整
    this.adjustCompressionForComplexity(optimizedConfig, projectFeatures);
    
    // 根据技术栈调整
    this.adjustCompressionForTechStack(optimizedConfig, projectFeatures);
    
    return optimizedConfig;
  }

  /**
   * 推荐索引深度
   */
  public recommendIndexingDepth(projectFeatures: ProjectFeatures): IndexingDepth {
    const complexity = projectFeatures.complexity;
    const fileCount = complexity.factors.fileCount;
    const dependencyCount = complexity.factors.dependencyCount;
    
    // 小型项目 - 全面索引
    if (fileCount < 20 && dependencyCount < 10 && complexity.level === 'low') {
      return IndexingDepth.COMPREHENSIVE;
    }
    
    // 大型项目 - 基础索引
    if (fileCount > 100 || dependencyCount > 50 || complexity.level === 'high') {
      return IndexingDepth.BASIC;
    }
    
    // 中型项目 - 详细索引
    return IndexingDepth.DETAILED;
  }

  /**
   * 动态文件优先级策略
   */
  public prioritizeFiles(
    files: ProjectFile[], 
    projectFeatures: ProjectFeatures
  ): ProjectFile[] {
    const prioritizedFiles = [...files];
    
    // 根据项目类型调整优先级权重
    const typeWeights = this.getFileTypeWeights(projectFeatures);
    
    // 重新计算文件权重分数
    prioritizedFiles.forEach(file => {
      file.priority = this.calculateDynamicPriority(file, projectFeatures, typeWeights);
    });
    
    // 按优先级排序
    return prioritizedFiles.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 生成项目特定的排除模式
   */
  public generateProjectSpecificExcludes(projectFeatures: ProjectFeatures): string[] {
    const excludes = [...DEFAULT_INDEXING_CONFIG.excludePatterns];
    
    // 根据技术栈添加特定排除
    const techStack = projectFeatures.technicalStack;
    
    if (techStack.language === 'JavaScript' || techStack.language === 'TypeScript') {
      excludes.push('**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**');
    }
    
    if (techStack.language === 'Python') {
      excludes.push('**/__pycache__/**', '**/venv/**', '**/env/**', '**/*.pyc');
    }
    
    if (techStack.language === 'Java') {
      excludes.push('**/target/**', '**/bin/**', '**/*.class');
    }
    
    if (techStack.language === 'C#') {
      excludes.push('**/bin/**', '**/obj/**', '**/*.dll', '**/*.exe');
    }
    
    if (techStack.language === 'Go') {
      excludes.push('**/vendor/**', '**/bin/**');
    }
    
    if (techStack.framework === 'React') {
      excludes.push('**/build/**', '**/public/**');
    }
    
    if (techStack.framework === 'Vue') {
      excludes.push('**/dist/**', '**/public/**');
    }
    
    if (techStack.framework === 'Docker') {
      excludes.push('**/.docker/**', '**/containers/**');
    }
    
    return Array.from(new Set(excludes));
  }

  /**
   * 生成智能包含模式
   */
  public generateSmartIncludes(projectFeatures: ProjectFeatures): string[] {
    const includes: string[] = [];
    const techStack = projectFeatures.technicalStack;
    
    // 总是包含的核心文件
    includes.push('**/README*', '**/LICENSE*', '**/CHANGELOG*');
    
    // 根据项目类型添加包含模式
    switch (projectFeatures.projectType) {
      case 'web':
        includes.push('**/src/**', '**/public/**', '**/assets/**');
        includes.push('**/package.json', '**/webpack.config.*', '**/vite.config.*');
        break;
        
      case 'mobile':
        includes.push('**/src/**', '**/assets/**', '**/resources/**');
        if (techStack.language === 'Java') {
          includes.push('**/AndroidManifest.xml', '**/build.gradle');
        }
        if (techStack.framework === 'React Native') {
          includes.push('**/index.js', '**/App.js', '**/package.json');
        }
        break;
        
      case 'desktop':
        includes.push('**/src/**', '**/resources/**');
        break;
        
      case 'library':
        includes.push('**/src/**', '**/lib/**', '**/api/**');
        includes.push('**/package.json', '**/setup.py', '**/Cargo.toml');
        break;
        
      case 'api':
        includes.push('**/src/**', '**/api/**', '**/routes/**', '**/controllers/**');
        includes.push('**/models/**', '**/middleware/**');
        break;
        
      default:
        includes.push('**/src/**', '**/lib/**');
    }
    
    // 根据技术栈添加特定包含
    if (techStack.language === 'JavaScript' || techStack.language === 'TypeScript') {
      includes.push('**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx');
      includes.push('**/tsconfig.json', '**/babel.config.*', '**/.eslintrc.*');
    }
    
    if (techStack.language === 'Python') {
      includes.push('**/*.py', '**/requirements.txt', '**/setup.py', '**/pyproject.toml');
    }
    
    if (techStack.language === 'Java') {
      includes.push('**/*.java', '**/pom.xml', '**/build.gradle');
    }
    
    if (techStack.language === 'C#') {
      includes.push('**/*.cs', '**/*.csproj', '**/*.sln');
    }
    
    if (techStack.framework === 'Docker') {
      includes.push('**/Dockerfile*', '**/docker-compose.*', '**/.dockerignore');
    }
    
    return Array.from(new Set(includes));
  }

  /**
   * 根据项目特征预估处理时间
   */
  public estimateProcessingTime(
    projectFeatures: ProjectFeatures, 
    fileCount: number
  ): {
    estimated: number;      // 预估时间(毫秒)
    confidence: number;     // 预估可信度(0-1)
    factors: string[];      // 影响因素
  } {
    let baseTime = fileCount * 50; // 基础时间：每文件50ms
    const factors: string[] = [];
    
    // 复杂度影响
    switch (projectFeatures.complexity.level) {
      case 'high':
        baseTime *= 2;
        factors.push('高复杂度项目');
        break;
      case 'medium':
        baseTime *= 1.3;
        factors.push('中等复杂度项目');
        break;
      case 'low':
        baseTime *= 0.8;
        factors.push('低复杂度项目');
        break;
    }
    
    // 项目类型影响
    const typeMultiplier: Record<string, number> = {
      'web': 1.2,
      'mobile': 1.4,
      'desktop': 1.1,
      'library': 0.9,
      'api': 1.0,
      'cli': 0.8
    };
    
    const multiplier = typeMultiplier[projectFeatures.projectType] || 1.0;
    baseTime *= multiplier;
    factors.push(`${projectFeatures.projectType}项目类型`);
    
    // 技术栈影响
    if (projectFeatures.technicalStack.framework) {
      baseTime *= 1.1;
      factors.push(`使用${projectFeatures.technicalStack.framework}框架`);
    }
    
    // 依赖数量影响
    const depCount = projectFeatures.complexity.factors.dependencyCount;
    if (depCount > 50) {
      baseTime *= 1.3;
      factors.push('大量依赖');
    } else if (depCount > 20) {
      baseTime *= 1.1;
      factors.push('较多依赖');
    }
    
    // 计算可信度
    let confidence = 0.7;
    if (fileCount > 10) confidence += 0.1;
    if (projectFeatures.complexity.level && projectFeatures.complexity.level !== 'unknown' as any) confidence += 0.1;
    if (factors.length > 2) confidence += 0.1;
    
    return {
      estimated: Math.round(baseTime),
      confidence: Math.min(confidence, 1.0),
      factors
    };
  }

  // 私有辅助方法

  private adjustForComplexity(config: IndexingConfig, features: ProjectFeatures): void {
    const complexity = features.complexity;
    
    switch (complexity.level) {
      case 'high':
        // 高复杂度项目：限制文件数量，提高单文件大小限制
        config.maxFiles = Math.min(config.maxFiles, 30);
        config.maxFileSize = Math.max(config.maxFileSize, 200 * 1024);
        config.maxDepth = Math.min(config.maxDepth, 2);
        config.enableCodeExtraction = true;
        config.enableDocumentSummary = true;
        break;
        
      case 'medium':
        // 中等复杂度：适中设置
        config.maxFiles = Math.min(config.maxFiles, 40);
        config.enableCodeExtraction = true;
        break;
        
      case 'low':
        // 低复杂度：允许更多文件
        config.maxFiles = Math.max(config.maxFiles, 60);
        config.maxDepth = Math.max(config.maxDepth, 4);
        break;
    }
  }

  private adjustForProjectType(config: IndexingConfig, features: ProjectFeatures): void {
    switch (features.projectType) {
      case 'web':
        // Web项目：关注配置和源码
        config.maxFiles = Math.max(config.maxFiles, 50);
        config.enableCodeExtraction = true;
        config.enableDocumentSummary = true;
        break;
        
      case 'library':
        // 库项目：重点关注文档和API
        config.enableDocumentSummary = true;
        config.maxDepth = 2; // 库项目通常结构简单
        break;
        
      case 'mobile':
        // 移动项目：关注资源和配置
        config.maxFileSize = Math.max(config.maxFileSize, 150 * 1024);
        break;
        
      case 'api':
        // API项目：关注路由和中间件
        config.enableCodeExtraction = true;
        break;
    }
  }

  private adjustForTechStack(config: IndexingConfig, features: ProjectFeatures): void {
    const techStack = features.technicalStack;
    
    // 根据主要语言调整
    if (techStack.language === 'JavaScript' || techStack.language === 'TypeScript') {
      // JS/TS项目通常文件较多
      config.maxFiles = Math.max(config.maxFiles, 60);
      config.enableCodeExtraction = true;
    }
    
    if (techStack.language === 'Python') {
      // Python项目通常有更多的配置文件
      config.maxFiles = Math.max(config.maxFiles, 45);
    }
    
    if (techStack.language === 'Java') {
      // Java项目结构较深
      config.maxDepth = Math.max(config.maxDepth, 4);
    }
    
    // 根据框架调整
    if (techStack.framework === 'React' || techStack.framework === 'Vue' || techStack.framework === 'Angular') {
      config.enableCodeExtraction = true;
      config.maxFiles = Math.max(config.maxFiles, 55);
    }
    
    if (techStack.framework === 'Django' || techStack.framework === 'Flask') {
      config.enableDocumentSummary = true;
    }
  }

  private adjustForProjectScale(config: IndexingConfig, features: ProjectFeatures): void {
    const scale = features.complexity.factors;
    
    // 根据文件数量调整
    if (scale.fileCount > 200) {
      // 大型项目
      config.maxFiles = Math.min(config.maxFiles, 25);
      config.maxDepth = Math.min(config.maxDepth, 2);
      config.enableDocumentSummary = true;
      config.enableCodeExtraction = true;
    } else if (scale.fileCount > 50) {
      // 中型项目
      config.maxFiles = Math.min(config.maxFiles, 40);
    } else {
      // 小型项目
      config.maxFiles = Math.max(config.maxFiles, 60);
      config.maxDepth = Math.max(config.maxDepth, 4);
    }
    
    // 根据代码行数调整
    if (scale.codeLines > 10000) {
      config.enableCodeExtraction = true;
      config.maxFileSize = Math.max(config.maxFileSize, 150 * 1024);
    }
  }

  private adjustCompressionForProjectType(config: ContentCompressionConfig, features: ProjectFeatures): void {
    switch (features.projectType) {
      case 'library':
        // 库项目：保留更多文档内容
        config.documentSummary.maxLength = Math.max(config.documentSummary.maxLength, 1500);
        config.documentSummary.preserveSections.push('## API', '## Examples', '## Installation');
        break;
        
      case 'web':
        // Web项目：关注功能描述
        config.documentSummary.preserveSections.push('## Features', '## Components');
        break;
        
      case 'api':
        // API项目：关注接口文档
        config.documentSummary.preserveSections.push('## Endpoints', '## Authentication');
        break;
    }
  }

  private adjustCompressionForComplexity(config: ContentCompressionConfig, features: ProjectFeatures): void {
    if (features.complexity.level === 'high') {
      // 高复杂度项目：更激进的压缩
      config.codeExtraction.maxFunctionLines = Math.min(config.codeExtraction.maxFunctionLines, 15);
      config.documentSummary.maxLength = Math.min(config.documentSummary.maxLength, 800);
    } else if (features.complexity.level === 'low') {
      // 低复杂度项目：保留更多内容
      config.codeExtraction.maxFunctionLines = Math.max(config.codeExtraction.maxFunctionLines, 25);
      config.documentSummary.maxLength = Math.max(config.documentSummary.maxLength, 1200);
    }
  }

  private adjustCompressionForTechStack(config: ContentCompressionConfig, features: ProjectFeatures): void {
    const techStack = features.technicalStack;
    
    // 根据语言特征调整代码提取
    if (techStack.language === 'Python') {
      // Python代码通常更紧凑
      config.codeExtraction.maxFunctionLines = Math.max(config.codeExtraction.maxFunctionLines, 25);
    }
    
    if (techStack.language === 'Java' || techStack.language === 'C#') {
      // 静态类型语言通常更冗长
      config.codeExtraction.maxFunctionLines = Math.min(config.codeExtraction.maxFunctionLines, 18);
    }
    
    if (techStack.framework === 'React' || techStack.framework === 'Vue') {
      // 组件化框架：提取组件定义
      config.codeExtraction.extractClassDefinitions = true;
    }
  }

  private getFileTypeWeights(features: ProjectFeatures): Record<ProjectFileType, number> {
    const weights: Record<ProjectFileType, number> = {
      [ProjectFileType.DOCUMENT]: 1,
      [ProjectFileType.CONFIG]: 1,
      [ProjectFileType.LICENSE]: 1,
      [ProjectFileType.CHANGELOG]: 2,
      [ProjectFileType.BUILD_SCRIPT]: 2,
      [ProjectFileType.SOURCE_CODE]: 3,
      [ProjectFileType.OTHER]: 4
    };
    
    // 根据项目类型调整权重
    if (features.projectType === 'library') {
      weights[ProjectFileType.DOCUMENT] = 0.5; // 文档更重要
      weights[ProjectFileType.LICENSE] = 0.8;
    }
    
    if (features.projectType === 'api') {
      weights[ProjectFileType.CONFIG] = 0.8; // 配置更重要
      weights[ProjectFileType.SOURCE_CODE] = 2;
    }
    
    return weights;
  }

  private calculateDynamicPriority(
    file: ProjectFile, 
    features: ProjectFeatures, 
    typeWeights: Record<ProjectFileType, number>
  ): number {
    let priority = typeWeights[file.type] || 3;
    
    // 根据文件名调整
    const fileName = file.name.toLowerCase();
    
    if (fileName.includes('readme')) priority *= 0.5;
    if (fileName.includes('main') || fileName.includes('index')) priority *= 0.7;
    if (fileName.includes('config')) priority *= 0.8;
    if (fileName.includes('test')) priority *= 2;
    if (fileName.includes('spec')) priority *= 2;
    if (fileName.includes('example')) priority *= 1.5;
    
    // 根据文件路径调整
    const path = file.relativePath.toLowerCase();
    
    if (path.includes('src/')) priority *= 0.8;
    if (path.includes('lib/')) priority *= 0.9;
    if (path.includes('test/')) priority *= 2;
    if (path.includes('doc/')) priority *= 1.2;
    if (path.includes('example/')) priority *= 1.5;
    
    // 确保优先级在有效范围内
    return Math.max(1, Math.min(4, Math.round(priority)));
  }
}