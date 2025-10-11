/**
 * DevMind MCP 智能项目索引功能 - 内容提取器
 * 
 * 实现文件内容分析、摘要生成和关键词提取功能
 */

import { 
  IContentExtractor, 
  ProjectFile, 
  FileAnalysisResult, 
  ContentCompressionConfig, 
  DEFAULT_COMPRESSION_CONFIG,
  ProjectFileType 
} from '../types/IndexingTypes';
import { SecurityStrategy } from '../strategies/SecurityStrategy';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 内容提取器实现类
 */
export class ContentExtractor implements IContentExtractor {
  private compressionConfig: ContentCompressionConfig;
  private securityStrategy: SecurityStrategy;
  private technicalTermsDict!: Set<string>;
  private stopWords!: Set<string>;

  constructor(compressionConfig: ContentCompressionConfig = DEFAULT_COMPRESSION_CONFIG) {
    this.compressionConfig = compressionConfig;
    this.securityStrategy = new SecurityStrategy();
    this.initializeTechnicalTerms();
    this.initializeStopWords();
  }

  /**
   * 提取文件内容
   */
  public async extract(file: ProjectFile, config: ContentCompressionConfig = this.compressionConfig): Promise<FileAnalysisResult> {
    const startTime = Date.now();
    
    try {
      console.log(`开始提取文件内容: ${file.relativePath}`);
      
      // 读取文件内容
      const rawContent = await this.readFileContent(file);
      
      // 安全性检查和清理
      const sanitizedContent = this.securityStrategy.sanitizeContent(rawContent);
      
      // 根据文件类型进行内容提取和压缩
      const extractedContent = await this.extractContentByType(file, sanitizedContent, config);
      
      // 生成摘要
      const summary = this.generateSummary(extractedContent, file.type);
      
      // 提取关键词和技术术语
      const keywords = this.extractKeywords(extractedContent);
      const technicalTerms = this.extractTechnicalTerms(extractedContent);
      
      // 计算可信度
      const confidence = this.calculateConfidence(file, extractedContent, rawContent);
      
      // 收集元数据
      const metadata = this.collectMetadata(file, rawContent, extractedContent);
      
      const processingTime = Date.now() - startTime;
      
      console.log(`文件内容提取完成: ${file.relativePath}，耗时 ${processingTime}ms`);
      
      return {
        file,
        extractedContent,
        summary,
        keywords,
        technicalTerms,
        confidence,
        metadata,
        processingTime
      };
      
    } catch (error) {
      console.error(`文件内容提取失败: ${file.relativePath}`, error);
      
      // 返回空结果而不是抛出异常
      return {
        file,
        extractedContent: '',
        summary: `文件读取失败: ${error instanceof Error ? error.message : '未知错误'}`,
        keywords: [],
        technicalTerms: [],
        confidence: 0,
        metadata: { error: error instanceof Error ? error.message : '未知错误' },
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * 读取文件内容
   */
  private async readFileContent(file: ProjectFile): Promise<string> {
    try {
      // 检查文件是否为文本文件
      if (!this.isTextFile(file)) {
        return `[二进制文件: ${file.name}]`;
      }
      
      const content = fs.readFileSync(file.path, 'utf-8');
      
      // 检查内容大小
      if (content.length > 500000) { // 500KB
        console.warn(`文件内容过大，截取前500KB: ${file.relativePath}`);
        return content.substring(0, 500000) + '\n... [内容已截断]';
      }
      
      return content;
      
    } catch (error) {
      console.warn(`读取文件内容失败: ${file.path}`, error);
      throw error;
    }
  }

  /**
   * 检查是否为文本文件
   */
  private isTextFile(file: ProjectFile): boolean {
    const textExtensions = [
      '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs',
      '.go', '.rs', '.rb', '.php', '.html', '.css', '.scss', '.sass', '.less', '.vue',
      '.svelte', '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.config', '.xml',
      '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.makefile', '.gitignore', '.env'
    ];
    
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.rar', '.tar', '.gz', '.7z',
      '.exe', '.dll', '.so', '.dylib', '.bin',
      '.mp3', '.mp4', '.avi', '.mkv', '.wav'
    ];
    
    const extension = file.extension.toLowerCase();
    
    if (textExtensions.includes(extension)) {
      return true;
    }
    
    if (binaryExtensions.includes(extension)) {
      return false;
    }
    
    // 对于未知扩展名，尝试检查文件内容
    try {
      const sample = fs.readFileSync(file.path, { encoding: 'utf-8', flag: 'r' }).substring(0, 1024);
      // 检查是否包含控制字符（除了常见的换行符）
      const controlCharCount = (sample.match(/[\x00-\x08\x0E-\x1F\x7F]/g) || []).length;
      return controlCharCount < sample.length * 0.05; // 少于5%的控制字符
    } catch (error) {
      return false;
    }
  }

  /**
   * 根据文件类型提取内容
   */
  private async extractContentByType(
    file: ProjectFile, 
    content: string, 
    config: ContentCompressionConfig
  ): Promise<string> {
    switch (file.type) {
      case ProjectFileType.DOCUMENT:
        return this.extractDocumentContent(content, config);
      
      case ProjectFileType.SOURCE_CODE:
        return this.extractCodeContent(content, file.extension, config);
      
      case ProjectFileType.CONFIG:
        return this.extractConfigContent(content, file.extension);
      
      case ProjectFileType.BUILD_SCRIPT:
        return this.extractScriptContent(content);
      
      default:
        return this.extractGenericContent(content);
    }
  }

  /**
   * 提取文档内容
   */
  private extractDocumentContent(content: string, config: ContentCompressionConfig): string {
    if (!config.documentSummary.enabled) {
      return content;
    }
    
    // 解析Markdown结构
    const lines = content.split('\n');
    const extractedLines: string[] = [];
    let currentSection = '';
    let inPreservedSection = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // 检测章节标题
      if (trimmedLine.match(/^#+\s+/)) {
        currentSection = trimmedLine;
        extractedLines.push(line);
        
        // 检查是否为保留章节
        inPreservedSection = config.documentSummary.preserveSections.some(section =>
          currentSection.toLowerCase().includes(section.toLowerCase().replace('## ', ''))
        );
        continue;
      }
      
      // 保留重要章节的内容
      if (inPreservedSection) {
        extractedLines.push(line);
      }
      
      // 保留列表项
      if (trimmedLine.match(/^[-*+]\s+/) || trimmedLine.match(/^\d+\.\s+/)) {
        extractedLines.push(line);
      }
      
      // 保留代码块
      if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
        extractedLines.push(line);
      }
      
      // 保留链接和重要信息
      if (trimmedLine.includes('http') || trimmedLine.includes('www.') || 
          trimmedLine.includes('@') || trimmedLine.match(/\[[^\]]+\]/)) {
        extractedLines.push(line);
      }
    }
    
    const extractedContent = extractedLines.join('\n');
    
    // 应用长度限制
    if (extractedContent.length > config.documentSummary.maxLength) {
      return extractedContent.substring(0, config.documentSummary.maxLength) + '\n... [文档已截断]';
    }
    
    return extractedContent || content.substring(0, Math.min(content.length, 1000));
  }

  /**
   * 提取代码内容
   */
  private extractCodeContent(content: string, extension: string, config: ContentCompressionConfig): string {
    if (!config.codeExtraction.extractImports && 
        !config.codeExtraction.extractMainFunctions && 
        !config.codeExtraction.extractClassDefinitions) {
      return content;
    }
    
    const lines = content.split('\n');
    const extractedLines: string[] = [];
    let inFunction = false;
    let functionLineCount = 0;
    let braceDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // 提取导入语句
      if (config.codeExtraction.extractImports && this.isImportLine(trimmedLine, extension)) {
        extractedLines.push(line);
        continue;
      }
      
      // 提取类定义
      if (config.codeExtraction.extractClassDefinitions && this.isClassDefinition(trimmedLine, extension)) {
        extractedLines.push(line);
        // 添加类的开头几行
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (lines[j].trim() && !lines[j].trim().startsWith('//') && !lines[j].trim().startsWith('/*')) {
            extractedLines.push(lines[j]);
          }
        }
        continue;
      }
      
      // 提取主要函数
      if (config.codeExtraction.extractMainFunctions && this.isFunctionDefinition(trimmedLine, extension)) {
        extractedLines.push(line);
        inFunction = true;
        functionLineCount = 1;
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }
      
      // 在函数内部时
      if (inFunction && functionLineCount < config.codeExtraction.maxFunctionLines) {
        extractedLines.push(line);
        functionLineCount++;
        braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        
        // 检查函数是否结束
        if (braceDepth <= 0 && functionLineCount > 1) {
          inFunction = false;
          functionLineCount = 0;
        }
      } else if (inFunction && functionLineCount >= config.codeExtraction.maxFunctionLines) {
        extractedLines.push('    // ... [函数内容已截断]');
        inFunction = false;
        functionLineCount = 0;
      }
      
      // 提取注释（特别是文档注释）
      if (trimmedLine.startsWith('/**') || trimmedLine.startsWith('///') || 
          trimmedLine.startsWith('#') && extension === '.py') {
        extractedLines.push(line);
      }
    }
    
    return extractedLines.length > 0 ? extractedLines.join('\n') : content.substring(0, 1000);
  }

  /**
   * 提取配置文件内容
   */
  private extractConfigContent(content: string, extension: string): string {
    try {
      // 对于JSON文件，格式化并提取关键配置
      if (extension === '.json') {
        const parsed = JSON.parse(content);
        const important = this.extractImportantConfigFields(parsed);
        return JSON.stringify(important, null, 2);
      }
      
      // 对于YAML文件，提取主要配置段
      if (extension === '.yml' || extension === '.yaml') {
        const lines = content.split('\n');
        return lines
          .filter(line => !line.trim().startsWith('#') && line.trim().length > 0)
          .slice(0, 50)
          .join('\n');
      }
      
      return content;
    } catch (error) {
      console.warn('配置文件内容解析失败，返回原始内容', error);
      return content;
    }
  }

  /**
   * 提取脚本内容
   */
  private extractScriptContent(content: string): string {
    const lines = content.split('\n');
    const extractedLines: string[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // 跳过空行和注释行（除非是重要注释）
      if (!trimmedLine || 
          (trimmedLine.startsWith('#') && !trimmedLine.includes('TODO') && !trimmedLine.includes('FIXME'))) {
        continue;
      }
      
      // 保留重要的命令和配置
      if (this.isImportantScriptLine(trimmedLine)) {
        extractedLines.push(line);
      }
    }
    
    return extractedLines.slice(0, 30).join('\n');
  }

  /**
   * 提取通用内容
   */
  private extractGenericContent(content: string): string {
    // 对于其他类型的文件，返回前1000个字符
    return content.substring(0, 1000);
  }

  /**
   * 生成内容摘要
   */
  private generateSummary(content: string, fileType: ProjectFileType): string {
    if (!content || content.length === 0) {
      return '文件内容为空';
    }
    
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      return '文件仅包含空行';
    }
    
    // 根据文件类型生成不同的摘要
    switch (fileType) {
      case ProjectFileType.DOCUMENT:
        return this.generateDocumentSummary(lines);
      
      case ProjectFileType.SOURCE_CODE:
        return this.generateCodeSummary(lines);
      
      case ProjectFileType.CONFIG:
        return this.generateConfigSummary(lines);
      
      default:
        return this.generateGenericSummary(lines);
    }
  }

  /**
   * 生成文档摘要
   */
  private generateDocumentSummary(lines: string[]): string {
    const headings = lines.filter(line => line.trim().match(/^#+\s+/));
    const firstParagraph = lines.find(line => line.trim().length > 20 && !line.trim().startsWith('#'));
    
    let summary = '';
    
    if (headings.length > 0) {
      summary += `文档包含 ${headings.length} 个章节`;
      if (headings.length <= 3) {
        summary += `: ${headings.map(h => h.trim().replace(/^#+\s+/, '')).join(', ')}`;
      }
    }
    
    if (firstParagraph) {
      summary += summary ? `。${firstParagraph.substring(0, 100)}` : firstParagraph.substring(0, 100);
    }
    
    return summary || '文档摘要生成失败';
  }

  /**
   * 生成代码摘要
   */
  private generateCodeSummary(lines: string[]): string {
    const imports = lines.filter(line => this.isImportLine(line.trim(), '')).length;
    const functions = lines.filter(line => this.isFunctionDefinition(line.trim(), '')).length;
    const classes = lines.filter(line => this.isClassDefinition(line.trim(), '')).length;
    
    const parts: string[] = [];
    
    if (imports > 0) parts.push(`${imports} 个导入`);
    if (classes > 0) parts.push(`${classes} 个类`);
    if (functions > 0) parts.push(`${functions} 个函数`);
    
    return parts.length > 0 ? `代码文件包含 ${parts.join('、')}` : '代码文件结构分析';
  }

  /**
   * 生成配置摘要
   */
  private generateConfigSummary(lines: string[]): string {
    const configKeys = lines
      .filter(line => line.includes(':') || line.includes('='))
      .length;
    
    return `配置文件包含 ${configKeys} 个配置项`;
  }

  /**
   * 生成通用摘要
   */
  private generateGenericSummary(lines: string[]): string {
    return `文件包含 ${lines.length} 行内容`;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word));
    
    // 计算词频
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });
    
    // 返回出现频率最高的关键词
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * 提取技术术语
   */
  private extractTechnicalTerms(content: string): string[] {
    const words = content
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    const technicalTerms = new Set<string>();
    
    words.forEach(word => {
      const lowerWord = word.toLowerCase();
      if (this.technicalTermsDict.has(lowerWord)) {
        technicalTerms.add(word);
      }
    });
    
    return Array.from(technicalTerms).slice(0, 15);
  }

  /**
   * 计算分析可信度
   */
  private calculateConfidence(file: ProjectFile, extractedContent: string, rawContent: string): number {
    let confidence = 0.8; // 基础可信度
    
    // 根据文件类型调整
    switch (file.type) {
      case ProjectFileType.DOCUMENT:
      case ProjectFileType.CONFIG:
        confidence = 0.9;
        break;
      case ProjectFileType.SOURCE_CODE:
        confidence = 0.85;
        break;
      default:
        confidence = 0.7;
    }
    
    // 根据内容完整性调整
    if (extractedContent.length < rawContent.length * 0.1) {
      confidence *= 0.6; // 提取内容过少
    } else if (extractedContent.length < rawContent.length * 0.5) {
      confidence *= 0.8; // 提取内容适中
    }
    
    // 根据内容质量调整
    if (extractedContent.includes('[REDACTED]') || extractedContent.includes('[截断]')) {
      confidence *= 0.7; // 内容被清理或截断
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * 收集元数据
   */
  private collectMetadata(file: ProjectFile, rawContent: string, extractedContent: string): Record<string, any> {
    return {
      originalSize: rawContent.length,
      extractedSize: extractedContent.length,
      compressionRatio: rawContent.length > 0 ? extractedContent.length / rawContent.length : 0,
      lineCount: rawContent.split('\n').length,
      extractedLineCount: extractedContent.split('\n').length,
      hasBeenSanitized: rawContent !== extractedContent,
      encoding: 'utf-8',
      lastAnalyzed: new Date().toISOString()
    };
  }

  // 工具方法
  private isImportLine(line: string, extension: string): boolean {
    return line.startsWith('import ') || 
           line.startsWith('from ') || 
           line.startsWith('#include') || 
           line.startsWith('using ') || 
           line.startsWith('require(') ||
           line.includes('require(') ||
           line.startsWith('const ') && line.includes('require(') ||
           line.startsWith('let ') && line.includes('require(');
  }

  private isFunctionDefinition(line: string, extension: string): boolean {
    return line.includes('function ') || 
           line.match(/def\s+\w+\s*\(/) !== null || 
           line.match(/\w+\s*\([^)]*\)\s*{/) !== null ||
           line.match(/\w+\s*:\s*\([^)]*\)\s*=>/) !== null ||
           line.match(/(public|private|protected|static)?\s*\w+\s*\([^)]*\)/) !== null;
  }

  private isClassDefinition(line: string, extension: string): boolean {
    return line.startsWith('class ') || 
           line.startsWith('interface ') || 
           line.startsWith('type ') || 
           line.includes('class ') ||
           line.match(/struct\s+\w+/) !== null;
  }

  private isImportantScriptLine(line: string): boolean {
    const importantKeywords = [
      'FROM', 'RUN', 'COPY', 'ADD', 'EXPOSE', 'ENV', 'WORKDIR',
      'npm', 'yarn', 'pip', 'maven', 'gradle',
      'docker', 'kubectl', 'helm',
      'git', 'curl', 'wget'
    ];
    
    return importantKeywords.some(keyword => 
      line.toUpperCase().includes(keyword.toUpperCase())
    );
  }

  private extractImportantConfigFields(obj: any, maxDepth: number = 2): any {
    if (maxDepth <= 0 || typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    const important: Record<string, any> = {};
    const importantKeys = [
      'name', 'version', 'description', 'main', 'scripts', 'dependencies',
      'devDependencies', 'engines', 'repository', 'author', 'license',
      'port', 'host', 'database', 'server', 'api', 'config'
    ];
    
    for (const [key, value] of Object.entries(obj)) {
      if (importantKeys.some(importantKey => 
        key.toLowerCase().includes(importantKey.toLowerCase()))) {
        important[key] = typeof value === 'object' ? 
          this.extractImportantConfigFields(value, maxDepth - 1) : value;
      }
    }
    
    return important;
  }

  /**
   * 初始化技术术语词典
   */
  private initializeTechnicalTerms(): void {
    this.technicalTermsDict = new Set([
      // 编程语言
      'javascript', 'typescript', 'python', 'java', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby',
      // 框架和库
      'react', 'vue', 'angular', 'express', 'django', 'flask', 'spring', 'laravel', 'rails',
      'nodejs', 'webpack', 'babel', 'eslint', 'prettier', 'jest', 'mocha', 'cypress',
      // 数据库
      'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'sqlite',
      // 云服务
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'gitlab', 'github',
      // 工具和概念
      'api', 'rest', 'graphql', 'oauth', 'jwt', 'ssl', 'https', 'json', 'xml', 'yaml',
      'microservice', 'serverless', 'cicd', 'devops', 'agile', 'scrum',
      // 前端技术
      'html', 'css', 'sass', 'less', 'bootstrap', 'tailwind', 'jquery',
      // 数据科学
      'numpy', 'pandas', 'tensorflow', 'pytorch', 'sklearn', 'matplotlib'
    ]);
  }

  /**
   * 初始化停用词
   */
  private initializeStopWords(): void {
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
      'from', 'up', 'about', 'into', 'over', 'after', 'before', 'during', 'between', 'among',
      'through', 'against', 'above', 'below', 'down', 'out', 'off', 'away', 'back', 'again',
      'here', 'there', 'where', 'when', 'why', 'how', 'what', 'which', 'who', 'whom', 'whose',
      'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'
    ]);
  }
}