import { ContextType } from './types.js';

export interface QualityAssessmentResult {
  score: number;                    // 0-1质量分数
  confidence: number;               // 评估置信度
  dimensions: QualityDimensions;    // 各维度评分
  reasoning: string;                // 评分理由
  recommendation: 'auto_record' | 'ask_user' | 'discard'; // 推荐动作
}

export interface QualityDimensions {
  syntaxCorrectness: number;        // 语法正确性
  logicCoherence: number;          // 逻辑连贯性  
  projectRelevance: number;        // 项目相关性
  technicalAccuracy: number;       // 技术准确性
  completeness: number;            // 内容完整性
  actionability: number;           // 可执行性
}

export class ContentQualityAssessor {
  private readonly qualityThresholds = {
    autoRecord: 0.8,    // 高质量自动记录
    askUser: 0.4,       // 中等质量询问用户
    discard: 0.4        // 低于此阈值自动丢弃
  };

  /**
   * 评估内容质量
   */
  assessContent(
    content: string, 
    type: ContextType, 
    projectContext?: any,
    metadata?: Record<string, any>
  ): QualityAssessmentResult {
    
    switch (type) {
      case ContextType.CODE:
        return this.assessCodeQuality(content, projectContext, metadata);
      case ContextType.CONVERSATION:
        return this.assessConversationQuality(content, metadata);
      case ContextType.ERROR:
        return this.assessErrorQuality(content, metadata);
      case ContextType.SOLUTION:
        return this.assessSolutionQuality(content, metadata);
      case ContextType.DOCUMENTATION:
        return this.assessDocumentationQuality(content, metadata);
      default:
        return this.assessGenericQuality(content, metadata);
    }
  }

  /**
   * 评估代码质量
   */
  private assessCodeQuality(
    content: string, 
    projectContext?: any, 
    metadata?: Record<string, any>
  ): QualityAssessmentResult {
    
    const dimensions: QualityDimensions = {
      syntaxCorrectness: this.checkSyntaxCorrectness(content, metadata?.language),
      logicCoherence: this.checkLogicCoherence(content),
      projectRelevance: this.checkProjectRelevance(content, projectContext),
      technicalAccuracy: this.checkTechnicalAccuracy(content, metadata?.language),
      completeness: this.checkCodeCompleteness(content),
      actionability: this.checkCodeActionability(content)
    };

    const weightedScore = this.calculateWeightedScore(dimensions, {
      syntaxCorrectness: 0.25,
      logicCoherence: 0.20,
      projectRelevance: 0.15,
      technicalAccuracy: 0.20,
      completeness: 0.15,
      actionability: 0.05
    });

    const reasoning = this.generateCodeReasoning(dimensions, content);
    const recommendation = this.getRecommendation(weightedScore);

    return {
      score: weightedScore,
      confidence: this.calculateConfidence(dimensions),
      dimensions,
      reasoning,
      recommendation
    };
  }

  /**
   * 评估对话质量
   */
  private assessConversationQuality(
    content: string, 
    metadata?: Record<string, any>
  ): QualityAssessmentResult {
    
    const dimensions: QualityDimensions = {
      syntaxCorrectness: 0.8, // 对话不强调语法
      logicCoherence: this.checkConversationLogic(content),
      projectRelevance: this.checkConversationRelevance(content),
      technicalAccuracy: this.checkConversationTechnicalContent(content),
      completeness: this.checkConversationCompleteness(content),
      actionability: this.checkConversationActionability(content)
    };

    const weightedScore = this.calculateWeightedScore(dimensions, {
      syntaxCorrectness: 0.05,
      logicCoherence: 0.25,
      projectRelevance: 0.20,
      technicalAccuracy: 0.20,
      completeness: 0.15,
      actionability: 0.15
    });

    const reasoning = this.generateConversationReasoning(dimensions, content);
    const recommendation = this.getRecommendation(weightedScore);

    return {
      score: weightedScore,
      confidence: this.calculateConfidence(dimensions),
      dimensions,
      reasoning,
      recommendation
    };
  }

  /**
   * 评估错误质量
   */
  private assessErrorQuality(content: string, metadata?: Record<string, any>): QualityAssessmentResult {
    const dimensions: QualityDimensions = {
      syntaxCorrectness: 0.9, // 错误信息通常格式正确
      logicCoherence: this.checkErrorLogic(content),
      projectRelevance: this.checkErrorRelevance(content),
      technicalAccuracy: this.checkErrorAccuracy(content),
      completeness: this.checkErrorCompleteness(content),
      actionability: this.checkErrorActionability(content)
    };

    // 错误信息通常有价值，基础分较高
    const baseScore = 0.7;
    const adjustedScore = Math.min(baseScore + (this.calculateWeightedScore(dimensions) - 0.5) * 0.3, 1.0);

    return {
      score: adjustedScore,
      confidence: this.calculateConfidence(dimensions),
      dimensions,
      reasoning: `错误信息评估: ${this.summarizeErrorValue(content)}`,
      recommendation: this.getRecommendation(adjustedScore)
    };
  }

  /**
   * 评估解决方案质量  
   */
  private assessSolutionQuality(content: string, metadata?: Record<string, any>): QualityAssessmentResult {
    const dimensions: QualityDimensions = {
      syntaxCorrectness: this.checkSolutionSyntax(content),
      logicCoherence: this.checkSolutionLogic(content),
      projectRelevance: this.checkSolutionRelevance(content),
      technicalAccuracy: this.checkSolutionAccuracy(content),
      completeness: this.checkSolutionCompleteness(content),
      actionability: this.checkSolutionActionability(content)
    };

    // 解决方案通常很有价值
    const baseScore = 0.8;
    const adjustedScore = Math.min(baseScore + (this.calculateWeightedScore(dimensions) - 0.5) * 0.2, 1.0);

    return {
      score: adjustedScore,
      confidence: this.calculateConfidence(dimensions),
      dimensions,
      reasoning: `解决方案评估: ${this.summarizeSolutionValue(content)}`,
      recommendation: this.getRecommendation(adjustedScore)
    };
  }

  /**
   * 评估文档质量
   */
  private assessDocumentationQuality(content: string, metadata?: Record<string, any>): QualityAssessmentResult {
    const dimensions: QualityDimensions = {
      syntaxCorrectness: this.checkDocSyntax(content),
      logicCoherence: this.checkDocLogic(content),
      projectRelevance: this.checkDocRelevance(content),
      technicalAccuracy: this.checkDocAccuracy(content),
      completeness: this.checkDocCompleteness(content),
      actionability: this.checkDocActionability(content)
    };

    const weightedScore = this.calculateWeightedScore(dimensions, {
      syntaxCorrectness: 0.10,
      logicCoherence: 0.20,
      projectRelevance: 0.15,
      technicalAccuracy: 0.15,
      completeness: 0.25,
      actionability: 0.15
    });

    return {
      score: weightedScore,
      confidence: this.calculateConfidence(dimensions),
      dimensions,
      reasoning: `文档评估: ${this.summarizeDocValue(content)}`,
      recommendation: this.getRecommendation(weightedScore)
    };
  }

  /**
   * 通用质量评估
   */
  private assessGenericQuality(content: string, metadata?: Record<string, any>): QualityAssessmentResult {
    const baseScore = 0.5;
    const lengthFactor = Math.min(content.length / 200, 1) * 0.2; // 长度加分
    const technicalFactor = this.containsTechnicalContent(content) ? 0.2 : 0;
    
    const score = Math.min(baseScore + lengthFactor + technicalFactor, 1.0);

    const dimensions: QualityDimensions = {
      syntaxCorrectness: 0.7,
      logicCoherence: 0.6,
      projectRelevance: 0.5,
      technicalAccuracy: technicalFactor > 0 ? 0.7 : 0.5,
      completeness: Math.min(content.length / 100, 1),
      actionability: 0.5
    };

    return {
      score,
      confidence: 0.6, // 通用评估置信度较低
      dimensions,
      reasoning: '通用内容评估',
      recommendation: this.getRecommendation(score)
    };
  }

  // 具体检查方法实现

  private checkSyntaxCorrectness(content: string, language?: string): number {
    let score = 0.8; // 基础分
    
    // 检查明显的语法错误
    const syntaxErrors = [
      /\)[\s]*\(/g,           // 连续括号
      /\{\s*\}/g,             // 空块但可能正常
      /\bfunction\s*\(/g,     // JavaScript函数
      /\bdef\s+\w+\s*\(/g,    // Python函数
    ];

    // 基于语言的特定检查
    if (language === 'javascript' || language === 'typescript') {
      if (content.includes('SyntaxError') || content.includes('Unexpected token')) {
        score -= 0.4;
      }
      if (content.match(/\bfunction\s+\w+\s*\(/)) score += 0.1;
      if (content.includes('=>')) score += 0.05;
    } else if (language === 'python') {
      if (content.includes('SyntaxError') || content.includes('IndentationError')) {
        score -= 0.4;
      }
      if (content.match(/\bdef\s+\w+\s*\(/)) score += 0.1;
    }

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkLogicCoherence(content: string): number {
    let score = 0.6;

    // 检查逻辑流程
    if (content.includes('if') && content.includes('else')) score += 0.1;
    if (content.includes('for') || content.includes('while')) score += 0.05;
    if (content.includes('return')) score += 0.05;
    if (content.includes('import') || content.includes('from')) score += 0.05;

    // 检查变量使用一致性
    const variables = content.match(/\b[a-zA-Z_]\w*(?=\s*=)/g);
    if (variables && variables.length > 0) {
      score += 0.1; // 有变量定义加分
    }

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkProjectRelevance(content: string, projectContext?: any): number {
    let score = 0.5; // 无上下文时的基础分

    if (!projectContext) return score;

    // 检查项目相关关键词
    const projectLanguage = projectContext.language;
    const projectFramework = projectContext.framework;

    if (projectLanguage && content.toLowerCase().includes(projectLanguage.toLowerCase())) {
      score += 0.2;
    }

    if (projectFramework && content.toLowerCase().includes(projectFramework.toLowerCase())) {
      score += 0.2;
    }

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkTechnicalAccuracy(content: string, language?: string): number {
    let score = 0.6;

    // 检查技术关键词
    const techKeywords = [
      'function', 'class', 'interface', 'async', 'await', 'promise',
      'import', 'export', 'module', 'component', 'service', 'api',
      'database', 'query', 'schema', 'model', 'controller', 'middleware'
    ];

    const foundKeywords = techKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword)
    ).length;

    score += Math.min(foundKeywords * 0.05, 0.3);

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkCodeCompleteness(content: string): number {
    let score = 0.5;

    // 检查代码完整性指标
    if (content.includes('{') && content.includes('}')) score += 0.1;
    if (content.includes('(') && content.includes(')')) score += 0.05;
    if (content.includes('import') || content.includes('require')) score += 0.1;
    if (content.includes('export') || content.includes('module.exports')) score += 0.1;
    if (content.split('\n').length > 5) score += 0.1; // 多行代码
    if (content.includes('//') || content.includes('#') || content.includes('/*')) score += 0.1; // 有注释

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkCodeActionability(content: string): number {
    let score = 0.5;

    // 可执行性检查
    if (content.match(/\bfunction\s+\w+|def\s+\w+|class\s+\w+/)) score += 0.3;
    if (content.includes('export') || content.includes('module.exports')) score += 0.2;
    if (content.length > 50 && content.length < 500) score += 0.1; // 合适的长度

    return Math.max(Math.min(score, 1), 0.1);
  }

  // 对话相关检查方法
  private checkConversationLogic(content: string): number {
    let score = 0.6;
    
    if (content.includes('问题') || content.includes('Problem') || content.includes('问:')) score += 0.1;
    if (content.includes('解决') || content.includes('Solution') || content.includes('答:')) score += 0.1;
    if (content.includes('因为') || content.includes('所以') || content.includes('because')) score += 0.1;
    if (content.includes('首先') || content.includes('然后') || content.includes('最后')) score += 0.1;

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkConversationRelevance(content: string): number {
    const techTerms = [
      '代码', '函数', '变量', '错误', '调试', '测试', '部署', '数据库', 
      'code', 'function', 'variable', 'error', 'debug', 'test', 'deploy', 'database'
    ];
    
    const foundTerms = techTerms.filter(term => 
      content.toLowerCase().includes(term.toLowerCase())
    ).length;
    
    return Math.min(0.4 + foundTerms * 0.1, 1);
  }

  private checkConversationTechnicalContent(content: string): number {
    let score = 0.5;
    
    if (this.containsCode(content)) score += 0.3;
    if (this.containsCommands(content)) score += 0.2;
    if (this.containsLinks(content)) score += 0.1;

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkConversationCompleteness(content: string): number {
    const wordCount = content.split(/\s+/).length;
    
    if (wordCount < 10) return 0.3;
    if (wordCount < 50) return 0.6;
    if (wordCount < 200) return 0.9;
    return 1.0;
  }

  private checkConversationActionability(content: string): number {
    let score = 0.5;
    
    if (content.includes('步骤') || content.includes('step')) score += 0.2;
    if (content.includes('安装') || content.includes('install')) score += 0.1;
    if (content.includes('运行') || content.includes('run')) score += 0.1;
    if (this.containsCode(content) || this.containsCommands(content)) score += 0.2;

    return Math.max(Math.min(score, 1), 0.1);
  }

  // 错误相关检查方法 
  private checkErrorLogic(content: string): number {
    let score = 0.7; // 错误信息通常逻辑清晰
    
    if (content.includes('Error:') || content.includes('错误:')) score += 0.1;
    if (content.includes('at line') || content.includes('第') && content.includes('行')) score += 0.1;
    if (content.includes('Stack trace') || content.includes('堆栈跟踪')) score += 0.1;

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkErrorRelevance(content: string): number {
    const errorKeywords = [
      'SyntaxError', 'TypeError', 'ReferenceError', 'RangeError',
      'ImportError', 'ModuleNotFoundError', 'IndentationError',
      'CompilationError', 'RuntimeError', 'NullPointerException'
    ];
    
    const hasErrorType = errorKeywords.some(keyword => content.includes(keyword));
    return hasErrorType ? 0.9 : 0.6;
  }

  private checkErrorAccuracy(content: string): number {
    let score = 0.8;
    
    // 检查是否包含文件路径
    if (content.includes('.js') || content.includes('.py') || content.includes('.go')) score += 0.1;
    // 检查是否包含行号
    if (/:\d+/.test(content)) score += 0.1;

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkErrorCompleteness(content: string): number {
    const lines = content.split('\n').length;
    
    if (lines === 1) return 0.5; // 单行错误
    if (lines < 5) return 0.7;   // 简短错误
    if (lines < 20) return 0.9;  // 详细错误
    return 1.0;                  // 完整堆栈跟踪
  }

  private checkErrorActionability(content: string): number {
    let score = 0.6;
    
    if (content.includes('Expected') || content.includes('期望')) score += 0.2;
    if (content.includes('near') || content.includes('附近')) score += 0.1;
    if (/:\d+:\d+/.test(content)) score += 0.2; // 行列号

    return Math.max(Math.min(score, 1), 0.1);
  }

  // 解决方案相关检查方法
  private checkSolutionSyntax(content: string): number {
    return this.checkSyntaxCorrectness(content);
  }

  private checkSolutionLogic(content: string): number {
    let score = 0.7;
    
    if (content.includes('解决方案') || content.includes('Solution')) score += 0.1;
    if (content.includes('步骤') || content.includes('Step')) score += 0.1;
    if (content.includes('原因') || content.includes('Cause')) score += 0.1;

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkSolutionRelevance(content: string): number {
    return this.checkConversationRelevance(content);
  }

  private checkSolutionAccuracy(content: string): number {
    return this.checkTechnicalAccuracy(content);
  }

  private checkSolutionCompleteness(content: string): number {
    let score = 0.6;
    
    if (this.containsCode(content)) score += 0.2;
    if (this.containsCommands(content)) score += 0.1;
    if (content.includes('步骤') || content.includes('step')) score += 0.1;

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkSolutionActionability(content: string): number {
    return this.checkConversationActionability(content);
  }

  // 文档相关检查方法
  private checkDocSyntax(content: string): number {
    // Markdown语法检查
    let score = 0.7;
    
    if (content.includes('#') || content.includes('##')) score += 0.1;
    if (content.includes('```')) score += 0.1;
    if (content.includes('*') || content.includes('_')) score += 0.05;

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkDocLogic(content: string): number {
    return this.checkLogicCoherence(content);
  }

  private checkDocRelevance(content: string): number {
    return this.checkConversationRelevance(content);
  }

  private checkDocAccuracy(content: string): number {
    return this.checkTechnicalAccuracy(content);
  }

  private checkDocCompleteness(content: string): number {
    let score = 0.5;
    
    const wordCount = content.split(/\s+/).length;
    if (wordCount > 100) score += 0.2;
    if (wordCount > 300) score += 0.2;
    if (this.containsCodeExamples(content)) score += 0.1;

    return Math.max(Math.min(score, 1), 0.1);
  }

  private checkDocActionability(content: string): number {
    return this.checkConversationActionability(content);
  }

  // 辅助方法
  private calculateWeightedScore(dimensions: QualityDimensions, weights?: Record<string, number>): number {
    const defaultWeights = {
      syntaxCorrectness: 0.2,
      logicCoherence: 0.2,
      projectRelevance: 0.15,
      technicalAccuracy: 0.15,
      completeness: 0.15,
      actionability: 0.15
    };

    const finalWeights = weights || defaultWeights;
    
    return Object.entries(dimensions).reduce((total, [key, value]) => {
      return total + value * (finalWeights[key as keyof typeof finalWeights] || 0);
    }, 0);
  }

  private calculateConfidence(dimensions: QualityDimensions): number {
    const scores = Object.values(dimensions);
    const variance = this.calculateVariance(scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    // 低方差且高平均分 = 高置信度
    const confidence = Math.max(0.5, Math.min(0.95, avgScore * (1 - variance)));
    return confidence;
  }

  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  }

  private getRecommendation(score: number): 'auto_record' | 'ask_user' | 'discard' {
    if (score >= this.qualityThresholds.autoRecord) return 'auto_record';
    if (score >= this.qualityThresholds.askUser) return 'ask_user';
    return 'discard';
  }

  // 推理生成方法
  private generateCodeReasoning(dimensions: QualityDimensions, content: string): string {
    const issues: string[] = [];
    const strengths: string[] = [];

    if (dimensions.syntaxCorrectness < 0.6) issues.push('语法可能有问题');
    if (dimensions.logicCoherence < 0.5) issues.push('逻辑不够清晰');
    if (dimensions.completeness < 0.5) issues.push('代码不完整');

    if (dimensions.syntaxCorrectness > 0.8) strengths.push('语法正确');
    if (dimensions.technicalAccuracy > 0.7) strengths.push('技术准确');
    if (dimensions.actionability > 0.7) strengths.push('可执行性强');

    let reasoning = '代码质量评估: ';
    if (strengths.length > 0) reasoning += `优点: ${strengths.join(', ')}`;
    if (issues.length > 0) reasoning += `${strengths.length > 0 ? '; ' : ''}问题: ${issues.join(', ')}`;

    return reasoning;
  }

  private generateConversationReasoning(dimensions: QualityDimensions, content: string): string {
    let reasoning = '对话质量评估: ';
    
    if (dimensions.technicalAccuracy > 0.7) reasoning += '包含技术内容, ';
    if (dimensions.actionability > 0.7) reasoning += '具有可操作性, ';
    if (dimensions.completeness > 0.8) reasoning += '信息完整';
    
    return reasoning.replace(/,\s*$/, '');
  }

  private summarizeErrorValue(content: string): string {
    if (content.includes('Stack trace')) return '包含完整堆栈跟踪';
    if (/:\d+/.test(content)) return '包含行号信息';
    if (content.includes('Error:')) return '标准错误格式';
    return '基础错误信息';
  }

  private summarizeSolutionValue(content: string): string {
    let value = '';
    if (this.containsCode(content)) value += '包含代码示例, ';
    if (this.containsCommands(content)) value += '包含命令行操作, ';
    if (content.includes('步骤') || content.includes('step')) value += '有详细步骤';
    
    return value.replace(/,\s*$/, '') || '提供解决思路';
  }

  private summarizeDocValue(content: string): string {
    let value = '';
    if (this.containsCodeExamples(content)) value += '包含代码示例, ';
    if (this.containsLinks(content)) value += '包含参考链接, ';
    if (content.length > 300) value += '内容详细';
    
    return value.replace(/,\s*$/, '') || '基础文档';
  }

  // 内容检测辅助方法
  private containsCode(content: string): boolean {
    const codePatterns = [
      /```[\s\S]*?```/,
      /`[^`]+`/,
      /\bfunction\s+\w+/,
      /\bclass\s+\w+/,
      /\bdef\s+\w+/,
      /\bimport\s+\w+/,
    ];
    
    return codePatterns.some(pattern => pattern.test(content));
  }

  private containsCommands(content: string): boolean {
    const commandPatterns = [
      /npm\s+install/,
      /pip\s+install/,
      /git\s+\w+/,
      /docker\s+\w+/,
      /cargo\s+\w+/,
      /go\s+run/,
    ];
    
    return commandPatterns.some(pattern => pattern.test(content));
  }

  private containsLinks(content: string): boolean {
    return /https?:\/\/[^\s]+/.test(content);
  }

  private containsCodeExamples(content: string): boolean {
    return /```[\s\S]*?```/.test(content);
  }

  private containsTechnicalContent(content: string): boolean {
    const techTerms = [
      'api', 'database', 'server', 'client', 'framework', 'library',
      'algorithm', 'function', 'class', 'interface', 'module', 'component'
    ];
    
    const lowerContent = content.toLowerCase();
    return techTerms.some(term => lowerContent.includes(term));
  }
}