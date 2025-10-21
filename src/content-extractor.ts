import { readFileSync, existsSync } from 'fs';
import { extname, basename } from 'path';
import { ContextType, RecordContextParams, EnhancedContextMetadata } from './types.js';

export interface ExtractedContext {
  type: ContextType;
  content: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  language?: string;
  tags: string[];
  quality_score: number;
  metadata: Record<string, any>;
}

export class ContentExtractor {
  private readonly languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'javascript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.php': 'php',
    '.rb': 'ruby',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.dart': 'dart',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sql': 'sql',
    '.md': 'markdown',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
  };

  /**
   * 从代码片段提取上下文（增强版）
   * 自动识别变更类型、提取函数/类名、分析影响范围
   */
  extractCodeContext(
    content: string, 
    filePath?: string, 
    lineStart?: number, 
    lineEnd?: number
  ): ExtractedContext {
    const language = filePath ? this.detectLanguage(filePath) : undefined;
    const tags = this.extractCodeTags(content, language);
    const qualityScore = this.calculateCodeQualityScore(content, language);
    
    const metadata: Record<string, any> = {};
    
    if (language) {
      // 提取特定语言的元数据
      const langMetadata = this.extractLanguageSpecificMetadata(content, language);
      Object.assign(metadata, langMetadata);
    }
    
    // === 增强功能：智能识别变更信息 ===
    const enhancedMeta = this.analyzeCodeChange(content, language);
    Object.assign(metadata, enhancedMeta);

    return {
      type: ContextType.CODE,
      content: content.trim(),
      file_path: filePath,
      line_start: lineStart,
      line_end: lineEnd,
      language,
      tags,
      quality_score: qualityScore,
      metadata
    };
  }
  
  /**
   * 🚀 智能分析代码变更
   * 自动识别：变更类型、修改的函数/类、影响范围
   */
  private analyzeCodeChange(content: string, language?: string): Partial<EnhancedContextMetadata> {
    const metadata: Partial<EnhancedContextMetadata> = {};
    
    // 1. 识别变更类型
    metadata.change_type = this.detectChangeType(content);
    
    // 2. 提取修改的函数名
    metadata.affected_functions = this.extractFunctionNames(content, language);
    
    // 3. 提取修改的类名
    metadata.affected_classes = this.extractClassNames(content, language);
    
    // 4. 分析影响范围
    if (metadata.affected_functions && metadata.affected_functions.length > 0 ||
        metadata.affected_classes && metadata.affected_classes.length > 0) {
      metadata.impact_level = this.assessImpactLevel(content, metadata);
    }
    
    // 5. 提取相关文件（从import语句）
    metadata.related_files = this.extractImportedFiles(content, language);
    
    // 6. 提取Issue/PR编号
    const issuesAndPrs = this.extractIssuesAndPRs(content);
    metadata.related_issues = issuesAndPrs.issues;
    metadata.related_prs = issuesAndPrs.prs;
    
    return metadata;
  }
  
  /**
   * 检测变更类型
   */
  private detectChangeType(content: string): 'add' | 'modify' | 'delete' | 'refactor' | 'rename' {
    const lowerContent = content.toLowerCase();
    
    // 检测删除标记
    if (content.includes('// DELETE:') || content.includes('# DELETE:') || 
        content.includes('TODO: remove') || lowerContent.includes('deprecated')) {
      return 'delete';
    }
    
    // 检测重命名标记
    if (content.includes('renamed from') || content.includes('rename to')) {
      return 'rename';
    }
    
    // 检测重构标记
    if (lowerContent.includes('refactor') || lowerContent.includes('restructure')) {
      return 'refactor';
    }
    
    // 检测新增标记
    if (content.includes('// NEW:') || content.includes('# NEW:') || 
        content.includes('// ADD:') || content.includes('# ADD:')) {
      return 'add';
    }
    
    // 默认为修改
    return 'modify';
  }
  
  /**
   * 提取函数名（支持多种语言）
   */
  private extractFunctionNames(content: string, language?: string): string[] {
    const functions: string[] = [];
    
    // JavaScript/TypeScript: function name() / const name = () => / name() {}
    const jsFuncPatterns = [
      /function\s+(\w+)\s*\(/g,
      /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
      /let\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
      /(\w+)\s*\([^)]*\)\s*{/g,
      /async\s+function\s+(\w+)/g,
    ];
    
    // Python: def name()
    const pyFuncPattern = /def\s+(\w+)\s*\(/g;
    
    // Go: func name()
    const goFuncPattern = /func\s+(\w+)\s*\(/g;
    
    // Java/Kotlin/C#: public/private type name()
    const javaFuncPattern = /(?:public|private|protected)?\s*\w+\s+(\w+)\s*\(/g;
    
    let patterns: RegExp[] = [];
    
    switch (language) {
      case 'javascript':
      case 'typescript':
        patterns = jsFuncPatterns;
        break;
      case 'python':
        patterns = [pyFuncPattern];
        break;
      case 'go':
        patterns = [goFuncPattern];
        break;
      case 'java':
      case 'kotlin':
      case 'csharp':
        patterns = [javaFuncPattern];
        break;
      default:
        // 尝试所有模式
        patterns = [...jsFuncPatterns, pyFuncPattern, goFuncPattern, javaFuncPattern];
    }
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !functions.includes(match[1])) {
          functions.push(match[1]);
        }
      }
    }
    
    return functions.slice(0, 20); // 限制数量
  }
  
  /**
   * 提取类名（支持多种语言）
   */
  private extractClassNames(content: string, language?: string): string[] {
    const classes: string[] = [];
    
    // 通用类定义模式
    const classPatterns = [
      /class\s+(\w+)/g,
      /interface\s+(\w+)/g,
      /struct\s+(\w+)/g,
      /type\s+(\w+)\s+struct/g,  // Go
      /enum\s+(\w+)/g,
    ];
    
    for (const pattern of classPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !classes.includes(match[1])) {
          classes.push(match[1]);
        }
      }
    }
    
    return classes.slice(0, 10); // 限制数量
  }
  
  /**
   * 评估影响级别
   */
  private assessImpactLevel(content: string, metadata: Partial<EnhancedContextMetadata>): 'breaking' | 'major' | 'minor' | 'patch' {
    const lowerContent = content.toLowerCase();
    
    // Breaking changes 标记
    if (lowerContent.includes('breaking') || lowerContent.includes('breaking change')) {
      return 'breaking';
    }
    
    // 检测API变更（接口、公共函数）
    if (content.includes('export ') || content.includes('public ')) {
      // 如果修改了多个导出的函数/类，可能是major
      const affectedCount = (metadata.affected_functions?.length || 0) + (metadata.affected_classes?.length || 0);
      if (affectedCount >= 3) return 'major';
      if (affectedCount >= 1) return 'minor';
    }
    
    // 检测内部实现变更
    if (content.includes('private ') || content.includes('internal ')) {
      return 'patch';
    }
    
    // 默认为minor
    return 'minor';
  }
  
  /**
   * 提取导入的文件
   */
  private extractImportedFiles(content: string, language?: string): string[] {
    const files: string[] = [];
    
    // JavaScript/TypeScript: import ... from '...'
    const jsImportPattern = /from\s+['"]([^'"]+)['"]/g;
    
    // Python: import ... / from ... import
    const pyImportPattern = /(?:import|from)\s+([\w.]+)/g;
    
    // Go: import "..."
    const goImportPattern = /import\s+"([^"]+)"/g;
    
    const patterns = [jsImportPattern, pyImportPattern, goImportPattern];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !files.includes(match[1])) {
          files.push(match[1]);
        }
      }
    }
    
    return files.slice(0, 15); // 限制数量
  }
  
  /**
   * 提取Issue和PR编号
   */
  private extractIssuesAndPRs(content: string): { issues: string[], prs: string[] } {
    const issues: string[] = [];
    const prs: string[] = [];
    
    // 匹配 #123 格式
    const issuePattern = /#(\d+)/g;
    
    // 匹配 fixes #123, closes #123, resolves #123
    const fixPattern = /(?:fix(?:es)?|close(?:s)?|resolve(?:s)?)\s+#(\d+)/gi;
    
    // 匹配 PR #123
    const prPattern = /pr\s+#(\d+)/gi;
    
    let match;
    
    // 提取修复的Issue
    while ((match = fixPattern.exec(content)) !== null) {
      const num = `#${match[1]}`;
      if (!issues.includes(num)) issues.push(num);
    }
    
    // 提取PR
    while ((match = prPattern.exec(content)) !== null) {
      const num = `#${match[1]}`;
      if (!prs.includes(num)) prs.push(num);
    }
    
    // 如果没有明确标记，收集所有 #数字 作为Issue
    if (issues.length === 0 && prs.length === 0) {
      while ((match = issuePattern.exec(content)) !== null) {
        const num = `#${match[1]}`;
        if (!issues.includes(num) && issues.length < 5) {
          issues.push(num);
        }
      }
    }
    
    return { issues, prs };
  }

  /**
   * 从AI对话中提取上下文
   */
  extractConversationContext(
    content: string,
    role: 'user' | 'assistant' = 'assistant'
  ): ExtractedContext {
    const tags = this.extractConversationTags(content);
    const qualityScore = this.calculateConversationQualityScore(content);
    
    const metadata = {
      role,
      word_count: content.split(/\s+/).length,
      has_code: this.containsCode(content),
      has_error: this.containsError(content),
      has_solution: this.containsSolution(content)
    };

    return {
      type: ContextType.CONVERSATION,
      content: content.trim(),
      tags,
      quality_score: qualityScore,
      metadata
    };
  }

  /**
   * 从错误信息提取上下文
   */
  extractErrorContext(
    errorMessage: string,
    filePath?: string,
    language?: string
  ): ExtractedContext {
    const tags = this.extractErrorTags(errorMessage, language);
    const qualityScore = this.calculateErrorQualityScore(errorMessage);
    
    const metadata = {
      error_type: this.classifyError(errorMessage, language),
      severity: this.assessErrorSeverity(errorMessage),
      stack_trace_lines: errorMessage.split('\n').length
    };

    return {
      type: ContextType.ERROR,
      content: errorMessage.trim(),
      file_path: filePath,
      language,
      tags,
      quality_score: qualityScore,
      metadata
    };
  }

  /**
   * 从解决方案提取上下文
   */
  extractSolutionContext(
    solution: string,
    relatedError?: string
  ): ExtractedContext {
    const tags = this.extractSolutionTags(solution);
    const qualityScore = this.calculateSolutionQualityScore(solution);
    
    const metadata = {
      has_code: this.containsCode(solution),
      has_commands: this.containsCommands(solution),
      has_links: this.containsLinks(solution),
      related_error_hash: relatedError ? this.hashContent(relatedError) : undefined
    };

    return {
      type: ContextType.SOLUTION,
      content: solution.trim(),
      tags,
      quality_score: qualityScore,
      metadata
    };
  }

  /**
   * 从文档内容提取上下文
   */
  extractDocumentationContext(
    content: string,
    filePath?: string
  ): ExtractedContext {
    const language = filePath ? this.detectLanguage(filePath) : undefined;
    const tags = this.extractDocumentationTags(content, language);
    const qualityScore = this.calculateDocumentationQualityScore(content);
    
    const metadata = {
      word_count: content.split(/\s+/).length,
      has_code_examples: this.containsCodeExamples(content),
      has_links: this.containsLinks(content),
      format: language || 'text'
    };

    return {
      type: ContextType.DOCUMENTATION,
      content: content.trim(),
      file_path: filePath,
      language,
      tags,
      quality_score: qualityScore,
      metadata
    };
  }

  /**
   * 批量提取文件内容
   * 注意：每个文件只生成一个上下文记录，不分块
   */
  extractFromFile(filePath: string): ExtractedContext[] {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);
    const lineCount = content.split('\n').length;
    const contexts: ExtractedContext[] = [];

    // 根据文件类型进行不同的处理，但每个文件只创建一个上下文记录
    if (this.isCodeFile(filePath)) {
      const context = this.extractCodeContext(
        content, 
        filePath, 
        1, 
        lineCount
      );
      contexts.push(context);
    } else if (this.isDocumentationFile(filePath)) {
      const context = this.extractDocumentationContext(content, filePath);
      contexts.push(context);
    } else {
      // 默认作为文档处理
      const context = this.extractDocumentationContext(content, filePath);
      contexts.push(context);
    }

    return contexts;
  }

  // 私有方法

  private detectLanguage(filePath: string): string | undefined {
    const ext = extname(filePath);
    return this.languageMap[ext];
  }

  private isCodeFile(filePath: string): boolean {
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java', '.kt', '.php', '.rb', '.c', '.cpp', '.cs', '.swift', '.dart'];
    return codeExtensions.includes(extname(filePath));
  }

  private isDocumentationFile(filePath: string): boolean {
    const docExtensions = ['.md', '.txt', '.rst', '.adoc'];
    return docExtensions.includes(extname(filePath));
  }

  private splitCodeIntoChunks(content: string, language?: string): string[] {
    const lines = content.split('\n');
    const chunks: string[] = [];
    
    // 简单的基于行数的分块策略
    const maxChunkLines = 100;
    let currentChunk: string[] = [];
    
    for (const line of lines) {
      currentChunk.push(line);
      
      if (currentChunk.length >= maxChunkLines) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
      }
    }
    
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }
    
    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  private extractCodeTags(content: string, language?: string): string[] {
    const tags: string[] = [];
    
    if (language) {
      tags.push(language);
    }
    
    // 通用模式识别
    if (content.includes('function') || content.includes('def ') || content.includes('func ')) {
      tags.push('function');
    }
    
    if (content.includes('class ') || content.includes('interface ') || content.includes('struct ')) {
      tags.push('class');
    }
    
    if (content.includes('import ') || content.includes('from ') || content.includes('#include')) {
      tags.push('import');
    }
    
    if (content.includes('test') || content.includes('spec')) {
      tags.push('test');
    }
    
    if (content.includes('TODO') || content.includes('FIXME')) {
      tags.push('todo');
    }
    
    return tags;
  }

  private extractConversationTags(content: string): string[] {
    const tags: string[] = [];
    
    if (this.containsCode(content)) {
      tags.push('code');
    }
    
    if (this.containsError(content)) {
      tags.push('error');
    }
    
    if (this.containsSolution(content)) {
      tags.push('solution');
    }
    
    if (content.toLowerCase().includes('explain') || content.toLowerCase().includes('how')) {
      tags.push('explanation');
    }
    
    if (content.toLowerCase().includes('debug') || content.toLowerCase().includes('fix')) {
      tags.push('debugging');
    }
    
    return tags;
  }

  private extractErrorTags(errorMessage: string, language?: string): string[] {
    const tags = ['error'];
    
    if (language) {
      tags.push(language);
    }
    
    // 常见错误类型
    const errorPatterns = [
      { pattern: /syntax\s*error/i, tag: 'syntax-error' },
      { pattern: /reference\s*error/i, tag: 'reference-error' },
      { pattern: /type\s*error/i, tag: 'type-error' },
      { pattern: /runtime\s*error/i, tag: 'runtime-error' },
      { pattern: /undefined/i, tag: 'undefined' },
      { pattern: /null\s*pointer/i, tag: 'null-pointer' },
      { pattern: /index\s*out\s*of\s*bounds/i, tag: 'index-error' },
      { pattern: /compilation\s*error/i, tag: 'compilation-error' },
    ];
    
    for (const { pattern, tag } of errorPatterns) {
      if (pattern.test(errorMessage)) {
        tags.push(tag);
      }
    }
    
    return tags;
  }

  private extractSolutionTags(solution: string): string[] {
    const tags = ['solution'];
    
    if (this.containsCode(solution)) {
      tags.push('code-solution');
    }
    
    if (this.containsCommands(solution)) {
      tags.push('command-solution');
    }
    
    if (solution.toLowerCase().includes('install')) {
      tags.push('installation');
    }
    
    if (solution.toLowerCase().includes('config')) {
      tags.push('configuration');
    }
    
    return tags;
  }

  private extractDocumentationTags(content: string, language?: string): string[] {
    const tags = ['documentation'];
    
    if (language) {
      tags.push(language);
    }
    
    if (this.containsCodeExamples(content)) {
      tags.push('code-examples');
    }
    
    if (content.toLowerCase().includes('api')) {
      tags.push('api');
    }
    
    if (content.toLowerCase().includes('tutorial') || content.toLowerCase().includes('guide')) {
      tags.push('tutorial');
    }
    
    return tags;
  }

  private extractLanguageSpecificMetadata(content: string, language: string): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    switch (language) {
      case 'javascript':
      case 'typescript':
        metadata.has_async = content.includes('async') || content.includes('await');
        metadata.has_react = content.includes('React') || content.includes('jsx');
        metadata.has_node = content.includes('require') || content.includes('process.');
        break;
        
      case 'python':
        metadata.has_class = content.includes('class ');
        metadata.has_decorators = content.includes('@');
        metadata.has_async = content.includes('async def') || content.includes('await ');
        break;
        
      case 'go':
        metadata.has_goroutines = content.includes('go ') && content.includes('func');
        metadata.has_channels = content.includes('chan ');
        metadata.has_interfaces = content.includes('interface{');
        break;
    }
    
    return metadata;
  }

  // 质量评分方法

  private calculateCodeQualityScore(content: string, language?: string): number {
    let score = 0.5; // 基础分数
    
    // 长度评分
    const lines = content.split('\n').length;
    if (lines > 5 && lines < 200) score += 0.1;
    
    // 注释评分
    const commentRatio = this.calculateCommentRatio(content, language);
    score += Math.min(commentRatio * 0.2, 0.1);
    
    // 结构化评分
    if (this.hasGoodStructure(content)) score += 0.1;
    
    // 可读性评分
    if (this.hasGoodReadability(content)) score += 0.1;
    
    return Math.min(Math.max(score, 0.1), 1.0);
  }

  private calculateConversationQualityScore(content: string): number {
    let score = 0.5;
    
    const wordCount = content.split(/\s+/).length;
    
    // 长度评分
    if (wordCount > 10 && wordCount < 500) score += 0.1;
    
    // 包含代码的对话更有价值
    if (this.containsCode(content)) score += 0.2;
    
    // 包含技术术语
    if (this.containsTechnicalTerms(content)) score += 0.1;
    
    // 包含解决方案
    if (this.containsSolution(content)) score += 0.1;
    
    return Math.min(Math.max(score, 0.1), 1.0);
  }

  private calculateErrorQualityScore(errorMessage: string): number {
    let score = 0.7; // 错误信息通常比较有价值
    
    // 包含堆栈跟踪
    if (errorMessage.includes('\n') && errorMessage.split('\n').length > 3) {
      score += 0.1;
    }
    
    // 包含文件路径
    if (errorMessage.includes('.js') || errorMessage.includes('.py') || errorMessage.includes('.go')) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  private calculateSolutionQualityScore(solution: string): number {
    let score = 0.8; // 解决方案通常很有价值
    
    if (this.containsCode(solution)) score += 0.1;
    if (this.containsCommands(solution)) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private calculateDocumentationQualityScore(content: string): number {
    let score = 0.6;
    
    if (this.containsCodeExamples(content)) score += 0.2;
    if (this.containsLinks(content)) score += 0.1;
    if (content.length > 200) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  // 辅助方法

  private containsCode(content: string): boolean {
    const codePatterns = [
      /```[\s\S]*?```/,  // 代码块
      /`[^`]+`/,         // 内联代码
      /function\s+\w+/,  // 函数定义
      /class\s+\w+/,     // 类定义
      /def\s+\w+/,       // Python函数
      /import\s+\w+/,    // 导入语句
    ];
    
    return codePatterns.some(pattern => pattern.test(content));
  }

  private containsCodeExamples(content: string): boolean {
    return /```[\s\S]*?```/.test(content);
  }

  private containsError(content: string): boolean {
    const errorKeywords = ['error', 'exception', 'fail', 'crash', 'bug', 'issue'];
    return errorKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
  }

  private containsSolution(content: string): boolean {
    const solutionKeywords = ['solution', 'fix', 'resolve', 'solve', 'answer'];
    return solutionKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
  }

  private containsCommands(content: string): boolean {
    const commandPatterns = [
      /npm\s+install/,
      /pip\s+install/,
      /cargo\s+add/,
      /go\s+get/,
      /git\s+\w+/,
      /docker\s+\w+/,
    ];
    
    return commandPatterns.some(pattern => pattern.test(content));
  }

  private containsLinks(content: string): boolean {
    return /https?:\/\/[^\s]+/.test(content);
  }

  private containsTechnicalTerms(content: string): boolean {
    const techTerms = [
      'api', 'database', 'server', 'client', 'framework', 'library',
      'algorithm', 'data structure', 'async', 'sync', 'promise',
      'callback', 'closure', 'middleware', 'endpoint', 'query'
    ];
    
    const lowerContent = content.toLowerCase();
    return techTerms.some(term => lowerContent.includes(term));
  }

  private calculateCommentRatio(content: string, language?: string): number {
    const lines = content.split('\n');
    let commentLines = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (language === 'python' && trimmed.startsWith('#')) {
        commentLines++;
      } else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        commentLines++;
      }
    }
    
    return lines.length > 0 ? commentLines / lines.length : 0;
  }

  private hasGoodStructure(content: string): boolean {
    // 简单的结构化检查
    const hasIndentation = content.includes('  ') || content.includes('\t');
    const hasBlocks = content.includes('{') && content.includes('}');
    return hasIndentation || hasBlocks;
  }

  private hasGoodReadability(content: string): boolean {
    const lines = content.split('\n');
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    return avgLineLength > 10 && avgLineLength < 120;
  }

  private classifyError(errorMessage: string, language?: string): string {
    const message = errorMessage.toLowerCase();
    
    if (message.includes('syntax')) return 'syntax';
    if (message.includes('type')) return 'type';
    if (message.includes('reference')) return 'reference';
    if (message.includes('runtime')) return 'runtime';
    if (message.includes('compile')) return 'compilation';
    
    return 'unknown';
  }

  private assessErrorSeverity(errorMessage: string): 'low' | 'medium' | 'high' {
    const message = errorMessage.toLowerCase();
    
    if (message.includes('fatal') || message.includes('critical')) return 'high';
    if (message.includes('warning')) return 'low';
    
    return 'medium';
  }

  private hashContent(content: string): string {
    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
}