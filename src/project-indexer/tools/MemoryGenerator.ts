/**
 * DevMind MCP 智能项目索引功能 - 记忆生成器
 * 
 * 实现项目记忆内容生成和结构化输出功能
 */

import { 
  IMemoryGenerator, 
  FileAnalysisResult, 
  ProjectFeatures, 
  MemoryGenerationResult, 
  ProjectMemoryRecord, 
  ProjectMemoryType, 
  FilePriority,
  ProjectFileType 
} from '../types/IndexingTypes';

/**
 * 记忆生成器实现类
 */
export class MemoryGenerator implements IMemoryGenerator {
  
  /**
   * 生成项目记忆
   */
  public async generate(
    analysisResults: FileAnalysisResult[], 
    projectFeatures: ProjectFeatures
  ): Promise<MemoryGenerationResult> {
    const startTime = Date.now();
    
    console.log(`开始生成项目记忆，分析结果数量: ${analysisResults.length}`);
    
    try {
      // 生成各类型记忆
      const projectOverview = await this.generateProjectOverview(analysisResults, projectFeatures);
      const technicalStack = await this.generateTechnicalStackMemory(analysisResults, projectFeatures);
      const projectStructure = await this.generateProjectStructureMemory(analysisResults, projectFeatures);
      const keyFeatures = await this.generateKeyFeaturesMemory(analysisResults, projectFeatures);
      
      // 统计结果
      const memories = [projectOverview, technicalStack, projectStructure, keyFeatures].filter(m => m !== null);
      const totalSize = memories.reduce((sum, memory) => sum + memory.content.length, 0);
      const generationTime = Date.now() - startTime;
      
      console.log(`项目记忆生成完成，生成 ${memories.length} 条记忆，耗时 ${generationTime}ms`);
      
      return {
        projectOverview: projectOverview || undefined,
        technicalStack: technicalStack || undefined,
        projectStructure: projectStructure || undefined,
        keyFeatures: keyFeatures || undefined,
        totalRecords: memories.length,
        totalSize,
        generationTime
      };
      
    } catch (error) {
      console.error('项目记忆生成失败:', error);
      throw error;
    }
  }

  /**
   * 生成项目概览记忆
   */
  private async generateProjectOverview(
    analysisResults: FileAnalysisResult[], 
    projectFeatures: ProjectFeatures
  ): Promise<ProjectMemoryRecord | null> {
    try {
      // 获取文档类文件的分析结果
      const docResults = analysisResults.filter(result => 
        result.file.type === ProjectFileType.DOCUMENT || 
        result.file.name.toLowerCase().includes('readme')
      );
      
      // 获取配置文件信息
      const configResults = analysisResults.filter(result => 
        result.file.type === ProjectFileType.CONFIG &&
        (result.file.name.toLowerCase().includes('package.json') ||
         result.file.name.toLowerCase().includes('composer.json') ||
         result.file.name.toLowerCase().includes('requirements.txt'))
      );
      
      const overviewContent = this.buildProjectOverviewContent(docResults, configResults, projectFeatures);
      
      if (!overviewContent || overviewContent.length < 50) {
        console.warn('项目概览内容生成失败或过短');
        return null;
      }
      
      const sourceFiles = [...docResults, ...configResults].map(result => result.file.relativePath);
      const summary = this.generateOverviewSummary(overviewContent);
      
      return {
        id: this.generateMemoryId('overview'),
        type: ProjectMemoryType.PROJECT_OVERVIEW,
        priority: FilePriority.HIGH,
        content: overviewContent,
        summary,
        sourceFiles,
        tags: this.extractOverviewTags(overviewContent, projectFeatures),
        confidence: this.calculateOverviewConfidence(docResults, configResults),
        metadata: {
          generatedAt: new Date().toISOString(),
          sourceCount: sourceFiles.length,
          contentLength: overviewContent.length,
          processingTime: 0, // 将在调用处设置
          projectType: projectFeatures.projectType,
          primaryLanguage: projectFeatures.technicalStack.language,
          hasReadme: docResults.some(r => r.file.name.toLowerCase().includes('readme')),
          hasPackageInfo: configResults.length > 0
        }
      };
      
    } catch (error) {
      console.error('生成项目概览记忆失败:', error);
      return null;
    }
  }

  /**
   * 生成技术栈记忆
   */
  private async generateTechnicalStackMemory(
    analysisResults: FileAnalysisResult[], 
    projectFeatures: ProjectFeatures
  ): Promise<ProjectMemoryRecord | null> {
    try {
      const techStackContent = this.buildTechnicalStackContent(analysisResults, projectFeatures);
      
      if (!techStackContent || techStackContent.length < 50) {
        console.warn('技术栈记忆内容生成失败或过短');
        return null;
      }
      
      const sourceFiles = analysisResults
        .filter(result => this.isRelevantForTechStack(result))
        .map(result => result.file.relativePath);
      
      const summary = this.generateTechStackSummary(projectFeatures.technicalStack);
      
      return {
        id: this.generateMemoryId('techstack'),
        type: ProjectMemoryType.TECHNICAL_STACK,
        priority: FilePriority.HIGH,
        content: techStackContent,
        summary,
        sourceFiles,
        tags: this.extractTechStackTags(projectFeatures.technicalStack),
        confidence: this.calculateTechStackConfidence(analysisResults),
        metadata: {
          generatedAt: new Date().toISOString(),
          sourceCount: sourceFiles.length,
          contentLength: techStackContent.length,
          processingTime: 0,
          primaryLanguage: projectFeatures.technicalStack.language,
          framework: projectFeatures.technicalStack.framework,
          complexity: projectFeatures.complexity.level,
          dependencyCount: projectFeatures.complexity.factors.dependencyCount
        }
      };
      
    } catch (error) {
      console.error('生成技术栈记忆失败:', error);
      return null;
    }
  }

  /**
   * 生成项目结构记忆
   */
  private async generateProjectStructureMemory(
    analysisResults: FileAnalysisResult[], 
    projectFeatures: ProjectFeatures
  ): Promise<ProjectMemoryRecord | null> {
    try {
      const structureContent = this.buildProjectStructureContent(analysisResults, projectFeatures);
      
      if (!structureContent || structureContent.length < 50) {
        console.warn('项目结构记忆内容生成失败或过短');
        return null;
      }
      
      const sourceFiles = analysisResults.map(result => result.file.relativePath);
      const summary = this.generateStructureSummary(analysisResults);
      
      return {
        id: this.generateMemoryId('structure'),
        type: ProjectMemoryType.PROJECT_STRUCTURE,
        priority: FilePriority.MEDIUM,
        content: structureContent,
        summary,
        sourceFiles,
        tags: this.extractStructureTags(analysisResults),
        confidence: this.calculateStructureConfidence(analysisResults),
        metadata: {
          generatedAt: new Date().toISOString(),
          sourceCount: sourceFiles.length,
          contentLength: structureContent.length,
          processingTime: 0,
          totalFiles: analysisResults.length,
          fileTypes: this.getFileTypeDistribution(analysisResults),
          architecture: projectFeatures.architecture
        }
      };
      
    } catch (error) {
      console.error('生成项目结构记忆失败:', error);
      return null;
    }
  }

  /**
   * 生成关键特性记忆
   */
  private async generateKeyFeaturesMemory(
    analysisResults: FileAnalysisResult[], 
    projectFeatures: ProjectFeatures
  ): Promise<ProjectMemoryRecord | null> {
    try {
      const featuresContent = this.buildKeyFeaturesContent(analysisResults, projectFeatures);
      
      if (!featuresContent || featuresContent.length < 50) {
        console.warn('关键特性记忆内容生成失败或过短');
        return null;
      }
      
      const sourceFiles = analysisResults
        .filter(result => this.isRelevantForFeatures(result))
        .map(result => result.file.relativePath);
      
      const summary = this.generateFeaturesSummary(analysisResults);
      
      return {
        id: this.generateMemoryId('features'),
        type: ProjectMemoryType.KEY_FEATURES,
        priority: FilePriority.MEDIUM,
        content: featuresContent,
        summary,
        sourceFiles,
        tags: this.extractFeaturesTags(analysisResults, projectFeatures),
        confidence: this.calculateFeaturesConfidence(analysisResults),
        metadata: {
          generatedAt: new Date().toISOString(),
          sourceCount: sourceFiles.length,
          contentLength: featuresContent.length,
          processingTime: 0,
          extractedFeatures: this.extractFeaturesList(analysisResults),
          codeComplexity: projectFeatures.complexity.score
        }
      };
      
    } catch (error) {
      console.error('生成关键特性记忆失败:', error);
      return null;
    }
  }

  /**
   * 构建项目概览内容
   */
  private buildProjectOverviewContent(
    docResults: FileAnalysisResult[], 
    configResults: FileAnalysisResult[], 
    projectFeatures: ProjectFeatures
  ): string {
    let content = '';
    
    // 项目基本信息
    content += `# 项目概览\n\n`;
    content += `**项目类型**: ${projectFeatures.projectType}\n`;
    content += `**主要语言**: ${projectFeatures.technicalStack.language}\n`;
    
    if (projectFeatures.technicalStack.framework) {
      content += `**框架**: ${projectFeatures.technicalStack.framework}\n`;
    }
    
    content += `**复杂度**: ${projectFeatures.complexity.level}\n\n`;
    
    // README 文件内容
    const readmeResult = docResults.find(result => 
      result.file.name.toLowerCase().includes('readme')
    );
    
    if (readmeResult && readmeResult.extractedContent) {
      content += `## 项目描述\n\n`;
      content += this.cleanupContent(readmeResult.extractedContent);
      content += `\n\n`;
    }
    
    // 配置文件信息
    if (configResults.length > 0) {
      content += `## 配置信息\n\n`;
      configResults.forEach(result => {
        content += `### ${result.file.name}\n`;
        content += `${result.summary}\n\n`;
        
        if (result.extractedContent && result.extractedContent.length < 500) {
          content += `\`\`\`json\n${this.cleanupContent(result.extractedContent)}\n\`\`\`\n\n`;
        }
      });
    }
    
    // 技术特点
    if (projectFeatures.architecture.length > 0) {
      content += `## 架构特点\n\n`;
      projectFeatures.architecture.forEach(arch => {
        content += `- ${arch}\n`;
      });
      content += '\n';
    }
    
    return content.trim();
  }

  /**
   * 构建技术栈内容
   */
  private buildTechnicalStackContent(
    analysisResults: FileAnalysisResult[], 
    projectFeatures: ProjectFeatures
  ): string {
    let content = '';
    
    content += `# 技术栈详情\n\n`;
    
    const techStack = projectFeatures.technicalStack;
    
    // 主要技术
    content += `## 核心技术\n\n`;
    content += `- **编程语言**: ${techStack.language}\n`;
    
    if (techStack.framework) {
      content += `- **主要框架**: ${techStack.framework}\n`;
    }
    
    if (techStack.runtime) {
      content += `- **运行时**: ${techStack.runtime}\n`;
    }
    
    content += '\n';
    
    // 数据库
    if (techStack.database && techStack.database.length > 0) {
      content += `## 数据存储\n\n`;
      techStack.database.forEach(db => {
        content += `- ${db}\n`;
      });
      content += '\n';
    }
    
    // 开发工具
    if (techStack.devTools.length > 0) {
      content += `## 开发工具\n\n`;
      techStack.devTools.forEach(tool => {
        content += `- ${tool}\n`;
      });
      content += '\n';
    }
    
    // 云服务
    if (techStack.cloudServices && techStack.cloudServices.length > 0) {
      content += `## 云服务\n\n`;
      techStack.cloudServices.forEach(service => {
        content += `- ${service}\n`;
      });
      content += '\n';
    }
    
    // 技术术语统计
    const allTechTerms = analysisResults
      .flatMap(result => result.technicalTerms)
      .filter((term, index, arr) => arr.indexOf(term) === index);
    
    if (allTechTerms.length > 0) {
      content += `## 项目中使用的技术术语\n\n`;
      allTechTerms.slice(0, 20).forEach(term => {
        content += `- ${term}\n`;
      });
      content += '\n';
    }
    
    return content.trim();
  }

  /**
   * 构建项目结构内容
   */
  private buildProjectStructureContent(
    analysisResults: FileAnalysisResult[], 
    projectFeatures: ProjectFeatures
  ): string {
    let content = '';
    
    content += `# 项目结构\n\n`;
    
    // 文件类型分布
    const fileTypeStats = this.getFileTypeDistribution(analysisResults);
    content += `## 文件类型分布\n\n`;
    
    Object.entries(fileTypeStats).forEach(([type, count]) => {
      if (count > 0) {
        content += `- **${this.getFileTypeDisplayName(type)}**: ${count} 个文件\n`;
      }
    });
    content += '\n';
    
    // 重要文件列表
    const importantFiles = analysisResults
      .filter(result => result.file.priority === FilePriority.HIGH)
      .sort((a, b) => a.file.name.localeCompare(b.file.name));
    
    if (importantFiles.length > 0) {
      content += `## 核心文件\n\n`;
      importantFiles.forEach(result => {
        content += `### ${result.file.relativePath}\n`;
        content += `${result.summary}\n\n`;
      });
    }
    
    // 目录结构概览
    content += `## 目录结构概览\n\n`;
    const directories = this.extractDirectoryStructure(analysisResults);
    directories.slice(0, 15).forEach(dir => {
      content += `- ${dir}\n`;
    });
    
    if (directories.length > 15) {
      content += `- ... 以及其他 ${directories.length - 15} 个目录\n`;
    }
    
    content += '\n';
    
    return content.trim();
  }

  /**
   * 构建关键特性内容
   */
  private buildKeyFeaturesContent(
    analysisResults: FileAnalysisResult[], 
    projectFeatures: ProjectFeatures
  ): string {
    let content = '';
    
    content += `# 项目关键特性\n\n`;
    
    // 功能特性
    const features = this.extractFeaturesList(analysisResults);
    if (features.length > 0) {
      content += `## 主要功能\n\n`;
      features.slice(0, 10).forEach(feature => {
        content += `- ${feature}\n`;
      });
      content += '\n';
    }
    
    // 代码特征
    content += `## 代码特征\n\n`;
    
    const codeFiles = analysisResults.filter(result => 
      result.file.type === ProjectFileType.SOURCE_CODE
    );
    
    if (codeFiles.length > 0) {
      const avgConfidence = codeFiles.reduce((sum, result) => sum + result.confidence, 0) / codeFiles.length;
      content += `- **代码文件数量**: ${codeFiles.length}\n`;
      content += `- **平均分析可信度**: ${(avgConfidence * 100).toFixed(1)}%\n`;
      
      // 常用关键词
      const allKeywords = codeFiles
        .flatMap(result => result.keywords)
        .filter((keyword, index, arr) => arr.indexOf(keyword) === index);
      
      if (allKeywords.length > 0) {
        content += `- **常用关键词**: ${allKeywords.slice(0, 10).join(', ')}\n`;
      }
    }
    
    content += `- **项目复杂度评分**: ${projectFeatures.complexity.score}/100\n`;
    content += `- **依赖数量**: ${projectFeatures.complexity.factors.dependencyCount}\n\n`;
    
    // 构建脚本和配置
    const buildFiles = analysisResults.filter(result => 
      result.file.type === ProjectFileType.BUILD_SCRIPT
    );
    
    if (buildFiles.length > 0) {
      content += `## 构建和部署\n\n`;
      buildFiles.forEach(result => {
        content += `### ${result.file.name}\n`;
        content += `${result.summary}\n\n`;
      });
    }
    
    return content.trim();
  }

  // 辅助方法

  private cleanupContent(content: string): string {
    return content
      .replace(/\[REDACTED[^\]]*\]/g, '[已清理]')
      .replace(/\[(内容已截断|文档已截断)\]/g, '[已截断]')
      .trim();
  }

  private generateMemoryId(type: string): string {
    return `project_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateOverviewSummary(content: string): string {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const firstMeaningfulLine = lines.find(line => 
      !line.startsWith('#') && 
      !line.startsWith('**') && 
      line.length > 20
    );
    
    return firstMeaningfulLine ? 
      firstMeaningfulLine.substring(0, 150) + (firstMeaningfulLine.length > 150 ? '...' : '') :
      '项目概览记忆';
  }

  private generateTechStackSummary(techStack: any): string {
    const parts = [techStack.language];
    if (techStack.framework) parts.push(techStack.framework);
    if (techStack.database?.length > 0) parts.push(techStack.database[0]);
    
    return `技术栈: ${parts.join(' + ')}`;
  }

  private generateStructureSummary(analysisResults: FileAnalysisResult[]): string {
    const fileCount = analysisResults.length;
    const typeDistribution = this.getFileTypeDistribution(analysisResults);
    const mainType = Object.entries(typeDistribution)
      .sort(([,a], [,b]) => b - a)[0]?.[0];
    
    return `项目包含 ${fileCount} 个文件，主要类型为 ${this.getFileTypeDisplayName(mainType)}`;
  }

  private generateFeaturesSummary(analysisResults: FileAnalysisResult[]): string {
    const features = this.extractFeaturesList(analysisResults);
    return features.length > 0 ? 
      `项目主要功能: ${features.slice(0, 3).join(', ')}` :
      '项目关键特性分析';
  }

  private extractOverviewTags(content: string, projectFeatures: ProjectFeatures): string[] {
    const tags = [projectFeatures.projectType, projectFeatures.technicalStack.language];
    
    if (projectFeatures.technicalStack.framework) {
      tags.push(projectFeatures.technicalStack.framework);
    }
    
    tags.push(projectFeatures.complexity.level);
    
    return tags.filter(tag => tag && tag.length > 0);
  }

  private extractTechStackTags(techStack: any): string[] {
    const tags = [techStack.language];
    
    if (techStack.framework) tags.push(techStack.framework);
    if (techStack.runtime) tags.push(techStack.runtime);
    if (techStack.database) tags.push(...techStack.database);
    if (techStack.cloudServices) tags.push(...techStack.cloudServices);
    
    return tags.filter(tag => tag && tag.length > 0).slice(0, 10);
  }

  private extractStructureTags(analysisResults: FileAnalysisResult[]): string[] {
    const tags = ['project-structure'];
    
    const typeDistribution = this.getFileTypeDistribution(analysisResults);
    Object.entries(typeDistribution).forEach(([type, count]) => {
      if (count > 0) {
        tags.push(type);
      }
    });
    
    return tags.slice(0, 8);
  }

  private extractFeaturesTags(analysisResults: FileAnalysisResult[], projectFeatures: ProjectFeatures): string[] {
    const tags = ['features', 'functionality'];
    
    const features = this.extractFeaturesList(analysisResults);
    tags.push(...features.slice(0, 5));
    
    tags.push(projectFeatures.complexity.level);
    
    return tags.filter(tag => tag && tag.length > 0).slice(0, 10);
  }

  private getFileTypeDistribution(analysisResults: FileAnalysisResult[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    analysisResults.forEach(result => {
      const type = result.file.type;
      distribution[type] = (distribution[type] || 0) + 1;
    });
    
    return distribution;
  }

  private getFileTypeDisplayName(type: string): string {
    const displayNames: Record<string, string> = {
      [ProjectFileType.DOCUMENT]: '文档文件',
      [ProjectFileType.CONFIG]: '配置文件',
      [ProjectFileType.SOURCE_CODE]: '源代码文件',
      [ProjectFileType.BUILD_SCRIPT]: '构建脚本',
      [ProjectFileType.LICENSE]: '许可证文件',
      [ProjectFileType.CHANGELOG]: '变更日志',
      [ProjectFileType.OTHER]: '其他文件'
    };
    
    return displayNames[type] || type;
  }

  private extractDirectoryStructure(analysisResults: FileAnalysisResult[]): string[] {
    const directories = new Set<string>();
    
    analysisResults.forEach(result => {
      const parts = result.file.relativePath.split('/');
      for (let i = 1; i <= parts.length - 1; i++) {
        const dir = parts.slice(0, i).join('/');
        if (dir) directories.add(dir);
      }
    });
    
    return Array.from(directories).sort();
  }

  private extractFeaturesList(analysisResults: FileAnalysisResult[]): string[] {
    const features: string[] = [];
    
    // 从README等文档文件中提取功能描述
    analysisResults
      .filter(result => result.file.type === ProjectFileType.DOCUMENT)
      .forEach(result => {
        const content = result.extractedContent.toLowerCase();
        
        // 查找常见的功能描述模式
        const featurePatterns = [
          /- (.*?)(?:\n|$)/g,
          /\* (.*?)(?:\n|$)/g,
          /features?:?\s*(.*?)(?:\n|$)/gi,
          /functionality:?\s*(.*?)(?:\n|$)/gi
        ];
        
        featurePatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const feature = match[1].trim();
            if (feature.length > 10 && feature.length < 100) {
              features.push(feature);
            }
          }
        });
      });
    
    // 从关键词中推断功能
    const allKeywords = analysisResults
      .flatMap(result => result.keywords)
      .filter((keyword, index, arr) => arr.indexOf(keyword) === index);
    
    const functionalKeywords = allKeywords.filter(keyword => 
      /^(api|auth|login|register|dashboard|admin|user|client|server|database|cache|search|upload|download)/.test(keyword)
    );
    
    features.push(...functionalKeywords.map(keyword => `${keyword}功能`));
    
    return Array.from(new Set(features)).slice(0, 15);
  }

  private isRelevantForTechStack(result: FileAnalysisResult): boolean {
    return result.file.type === ProjectFileType.CONFIG ||
           result.file.type === ProjectFileType.BUILD_SCRIPT ||
           (result.file.type === ProjectFileType.SOURCE_CODE && result.technicalTerms.length > 0);
  }

  private isRelevantForFeatures(result: FileAnalysisResult): boolean {
    return result.file.type === ProjectFileType.DOCUMENT ||
           result.file.type === ProjectFileType.SOURCE_CODE ||
           result.file.name.toLowerCase().includes('readme');
  }

  private calculateOverviewConfidence(docResults: FileAnalysisResult[], configResults: FileAnalysisResult[]): number {
    let confidence = 0.5;
    
    if (docResults.some(r => r.file.name.toLowerCase().includes('readme'))) {
      confidence += 0.3;
    }
    
    if (configResults.length > 0) {
      confidence += 0.2;
    }
    
    const avgDocConfidence = docResults.length > 0 ?
      docResults.reduce((sum, result) => sum + result.confidence, 0) / docResults.length : 0;
    
    confidence += avgDocConfidence * 0.3;
    
    return Math.min(1.0, confidence);
  }

  private calculateTechStackConfidence(analysisResults: FileAnalysisResult[]): number {
    const relevantResults = analysisResults.filter(result => this.isRelevantForTechStack(result));
    
    if (relevantResults.length === 0) return 0.3;
    
    const avgConfidence = relevantResults.reduce((sum, result) => sum + result.confidence, 0) / relevantResults.length;
    
    return Math.max(0.4, avgConfidence);
  }

  private calculateStructureConfidence(analysisResults: FileAnalysisResult[]): number {
    if (analysisResults.length < 3) return 0.4;
    
    const avgConfidence = analysisResults.reduce((sum, result) => sum + result.confidence, 0) / analysisResults.length;
    
    return Math.max(0.6, avgConfidence);
  }

  private calculateFeaturesConfidence(analysisResults: FileAnalysisResult[]): number {
    const featureRelevantResults = analysisResults.filter(result => this.isRelevantForFeatures(result));
    
    if (featureRelevantResults.length === 0) return 0.3;
    
    const avgConfidence = featureRelevantResults.reduce((sum, result) => sum + result.confidence, 0) / featureRelevantResults.length;
    
    return Math.max(0.4, avgConfidence * 0.8);
  }
}