/**
 * 上下文智能增强器（v2.2.0）
 *
 * 功能：
 * 1. 自动提取函数/类名
 * 2. 检测编程语言
 * 3. 提取相关文件和依赖
 * 4. 分析变更统计
 * 5. 提取Issue/PR编号
 * 6. 生成智能标签
 */

import { existsSync } from 'fs';
import { extname, basename, dirname, join } from 'path';

export interface EnrichmentResult {
  language?: string;
  affected_functions?: string[];
  affected_classes?: string[];
  affected_components?: string[];
  related_files?: string[];
  related_issues?: string[];
  related_prs?: string[];
  business_domain?: string[];
  priority?: 'critical' | 'high' | 'medium' | 'low';
  tags?: string[];
  code_quality_score?: number;
  change_impact?: {
    files_affected?: number;
    lines_added?: number;
    lines_deleted?: number;
    complexity?: 'low' | 'medium' | 'high';
  };
  metadata?: Record<string, any>;
}

export class ContextEnricher {
  // 编程语言检测映射
  private languageMap: Record<string, string> = {
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

  // 业务领域关键词映射
  private businessDomainMap: Record<string, string[]> = {
    authentication: ['auth', 'login', 'signin', 'jwt', 'oauth', 'permission', '认证', '登录'],
    authorization: ['auth', 'rbac', 'access', 'role', '权限', '授权'],
    payment: ['payment', 'pay', 'billing', 'invoice', 'payment', '支付', '账单'],
    database: ['database', 'db', 'sql', 'query', 'mongodb', 'redis', '数据库', '查询'],
    api: ['api', 'endpoint', 'rest', 'graphql', '接口', 'API'],
    ui: ['ui', 'component', 'button', 'modal', '界面', '组件'],
    ux: ['ux', 'usability', 'interaction', '用户体验', '交互'],
    testing: ['test', 'spec', 'testing', '测试', 'spec'],
    monitoring: ['monitor', 'log', 'metrics', 'alert', '监控', '日志'],
    cache: ['cache', 'redis', 'memcached', '缓存'],
    search: ['search', 'elasticsearch', 'lucene', '搜索'],
    file: ['file', 'upload', 'download', 'storage', '文件', '上传'],
    email: ['email', 'smtp', 'mail', '邮件'],
    notification: ['notify', 'push', 'websocket', '通知'],
    security: ['security', 'encrypt', 'hash', '安全', '加密'],
    performance: ['performance', 'optimization', 'benchmark', '性能', '优化'],
    deployment: ['deploy', 'docker', 'kubernetes', '部署', '容器'],
  };

  // 优先级关键词映射
  private priorityMap: Record<string, string[]> = {
    critical: ['critical', 'urgent', 'security', '紧急', '严重', '安全'],
    high: ['important', 'priority', 'high', '重要', '高优先级'],
    medium: ['normal', 'medium', 'moderate', '一般', '中等'],
    low: ['low', 'minor', 'optional', '低优先级', '可选'],
  };

  // 变更影响级别映射
  private complexityMap: Record<string, string[]> = {
    low: ['simple', 'fix', 'minor', '简单', '修复'],
    medium: ['moderate', 'update', '中等', '更新'],
    high: ['complex', 'major', 'refactor', '复杂', '重大', '重构'],
  };

  /**
   * 增强上下文内容
   */
  enrich(content: string, filePath?: string, metadata?: Record<string, any>): EnrichmentResult {
    const enrichment: EnrichmentResult = {};

    // 1. 检测编程语言
    enrichment.language = this.detectLanguage(content, filePath);

    // 2. 提取函数名
    enrichment.affected_functions = this.extractFunctions(content, enrichment.language);

    // 3. 提取类名
    enrichment.affected_classes = this.extractClasses(content, enrichment.language);

    // 4. 提取组件名
    enrichment.affected_components = this.extractComponents(content, enrichment.language);

    // 5. 提取相关文件
    enrichment.related_files = this.extractRelatedFiles(content, enrichment.language);

    // 6. 提取Issue/PR编号
    const issuesAndPrs = this.extractIssuesAndPRs(content);
    enrichment.related_issues = issuesAndPrs.issues;
    enrichment.related_prs = issuesAndPrs.prs;

    // 7. 分析业务领域
    enrichment.business_domain = this.analyzeBusinessDomain(content);

    // 8. 确定优先级
    enrichment.priority = this.determinePriority(content, metadata);

    // 9. 生成标签
    enrichment.tags = this.generateTags(content, enrichment);

    // 10. 计算代码质量评分
    enrichment.code_quality_score = this.calculateCodeQualityScore(content);

    // 11. 分析变更影响
    enrichment.change_impact = this.analyzeChangeImpact(content, metadata);

    return enrichment;
  }

  /**
   * 检测编程语言
   */
  private detectLanguage(content: string, filePath?: string): string | undefined {
    // 从文件扩展名检测
    if (filePath) {
      const ext = extname(filePath).toLowerCase();
      if (this.languageMap[ext]) {
        return this.languageMap[ext];
      }
    }

    // 从内容特征检测
    const languagePatterns: Record<string, RegExp[]> = {
      javascript: [/\b(const|let|var|function|import|export)\b/],
      typescript: [/\b(interface|type|enum|import|export)\b/],
      python: [/\b(def|import|class|from)\b/],
      go: [/\b(func|package|import)\b/],
      rust: [/\b(fn|let|mut|impl)\b/],
      java: [/\b(public|private|class|import)\b/],
      php: [/\b(<?php|function|class)\b/],
      ruby: [/\b(def|class|require)\b/],
      sql: [/\b(SELECT|INSERT|UPDATE|DELETE|CREATE)\b/i],
    };

    for (const [lang, patterns] of Object.entries(languagePatterns)) {
      if (patterns.some(pattern => pattern.test(content))) {
        return lang;
      }
    }

    return undefined;
  }

  /**
   * 提取函数名
   */
  private extractFunctions(content: string, language?: string): string[] {
    const functions: string[] = [];

    // JavaScript/TypeScript
    if (language === 'javascript' || language === 'typescript') {
      const patterns = [
        /function\s+(\w+)\s*\(/g,
        /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
        /let\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
        /(\w+)\s*\([^)]*\)\s*\{/g,
        /async\s+function\s+(\w+)/g,
        /(\w+):\s*\([^)]*\)\s*=>/g,
      ];
      patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (match[1] && !match[1].match(/^(if|for|while|switch)$/)) {
            functions.push(match[1]);
          }
        }
      });
    }

    // Python
    if (language === 'python') {
      const pattern = /def\s+(\w+)\s*\(/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        functions.push(match[1]);
      }
    }

    // Go
    if (language === 'go') {
      const pattern = /func\s+(\w+)\s*\(/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        functions.push(match[1]);
      }
    }

    // Java
    if (language === 'java') {
      const pattern = /(?:public|private|protected)?\s*\w+\s+(\w+)\s*\(/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        functions.push(match[1]);
      }
    }

    // Rust
    if (language === 'rust') {
      const pattern = /fn\s+(\w+)\s*\(/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        functions.push(match[1]);
      }
    }

    // 去重并限制数量
    return [...new Set(functions)].slice(0, 10);
  }

  /**
   * 提取类名
   */
  private extractClasses(content: string, language?: string): string[] {
    const classes: string[] = [];

    const classPatterns: Record<string, RegExp> = {
      javascript: /class\s+(\w+)/g,
      typescript: /class\s+(\w+)/g,
      python: /class\s+(\w+)/g,
      java: /class\s+(\w+)/g,
      php: /class\s+(\w+)/g,
      ruby: /class\s+(\w+)/g,
      go: /type\s+(\w+)\s+struct/g,
      rust: /struct\s+(\w+)/g,
    };

    if (language && classPatterns[language]) {
      const pattern = classPatterns[language];
      let match;
      while ((match = pattern.exec(content)) !== null) {
        classes.push(match[1]);
      }
    }

    return [...new Set(classes)].slice(0, 10);
  }

  /**
   * 提取组件名
   */
  private extractComponents(content: string, language?: string): string[] {
    const components: string[] = [];

    // React/Vue/Angular 组件模式
    const componentPatterns = [
      /export\s+(?:default\s+)?(?:function|const)?\s*(\w+)(?:\s*=|:)/g,
      /component:\s*\{\s*name:\s*['"](\w+)['"]/g,
      /@Component\s*\(\s*\{[^}]*name:\s*['"](\w+)['"]/g,
    ];

    componentPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          components.push(match[1]);
        }
      }
    });

    // 文件名作为组件名
    if (components.length === 0 && content.includes('export')) {
      const exportMatch = content.match(/export\s+(?:default\s+)?(\w+)/);
      if (exportMatch && exportMatch[1]) {
        components.push(exportMatch[1]);
      }
    }

    return [...new Set(components)].slice(0, 10);
  }

  /**
   * 提取相关文件
   */
  private extractRelatedFiles(content: string, language?: string): string[] {
    const relatedFiles: string[] = [];

    // import 语句
    const importPatterns: Record<string, RegExp> = {
      javascript: /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      typescript: /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      python: /(?:from\s+(\S+)\s+)?import\s+(\S+)/g,
      go: /import\s+['"]([^'"]+)['"]/g,
    };

    if (language && importPatterns[language]) {
      const pattern = importPatterns[language];
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const module = language === 'python' ? match[1] || match[2] : match[1];
        if (module && !module.startsWith('.') && !module.includes('node_modules')) {
          relatedFiles.push(module);
        }
      }
    }

    // require 语句
    const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let requireMatch;
    while ((requireMatch = requirePattern.exec(content)) !== null) {
      if (!requireMatch[1].includes('node_modules')) {
        relatedFiles.push(requireMatch[1]);
      }
    }

    // 文件路径引用
    const pathPattern = /['"](\.\/|\.\.\/)[^'"]+['"]/g;
    let pathMatch;
    while ((pathMatch = pathPattern.exec(content)) !== null) {
      relatedFiles.push(pathMatch[1]);
    }

    return [...new Set(relatedFiles)].slice(0, 20);
  }

  /**
   * 提取Issue和PR编号
   */
  private extractIssuesAndPRs(content: string): { issues: string[]; prs: string[] } {
    const issues: string[] = [];
    const prs: string[] = [];

    // Issue编号 (#123)
    const issuePattern = /#(\d+)/g;
    let match;
    while ((match = issuePattern.exec(content)) !== null) {
      issues.push(`#${match[1]}`);
    }

    // PR编号 (PR #456)
    const prPattern = /PR\s+#(\d+)/gi;
    while ((match = prPattern.exec(content)) !== null) {
      prs.push(`#${match[1]}`);
    }

    // GitHub链接
    const githubIssuePattern = /github\.com\/.*?\/.*?\/issues\/(\d+)/gi;
    while ((match = githubIssuePattern.exec(content)) !== null) {
      issues.push(`#${match[1]}`);
    }

    const githubPrPattern = /github\.com\/.*?\/.*?\/pull\/(\d+)/gi;
    while ((match = githubPrPattern.exec(content)) !== null) {
      prs.push(`#${match[1]}`);
    }

    return {
      issues: [...new Set(issues)],
      prs: [...new Set(prs)],
    };
  }

  /**
   * 分析业务领域
   */
  private analyzeBusinessDomain(content: string): string[] {
    const domains: string[] = [];
    const contentLower = content.toLowerCase();

    for (const [domain, keywords] of Object.entries(this.businessDomainMap)) {
      const matches = keywords.filter(keyword =>
        contentLower.includes(keyword.toLowerCase())
      );
      if (matches.length > 0) {
        domains.push(domain);
      }
    }

    return domains.slice(0, 5);
  }

  /**
   * 确定优先级
   */
  private determinePriority(
    content: string,
    metadata?: Record<string, any>
  ): 'critical' | 'high' | 'medium' | 'low' | undefined {
    // 从元数据获取
    if (metadata?.priority) {
      const validPriorities = ['critical', 'high', 'medium', 'low'];
      if (validPriorities.includes(metadata.priority)) {
        return metadata.priority as any;
      }
    }

    // 从内容模式获取
    for (const [priority, keywords] of Object.entries(this.priorityMap)) {
      if ((keywords as string[]).some((keyword: string) => content.toLowerCase().includes(keyword.toLowerCase()))) {
        return priority as any;
      }
    }

    return undefined;
  }

  /**
   * 生成标签
   */
  private generateTags(content: string, enrichment: EnrichmentResult): string[] {
    const tags: string[] = [];

    // 语言标签
    if (enrichment.language) {
      tags.push(enrichment.language);
    }

    // 函数标签
    if (enrichment.affected_functions && enrichment.affected_functions.length > 0) {
      tags.push('has-functions');
    }

    // 类标签
    if (enrichment.affected_classes && enrichment.affected_classes.length > 0) {
      tags.push('has-classes');
    }

    // 组件标签
    if (enrichment.affected_components && enrichment.affected_components.length > 0) {
      tags.push('has-components');
    }

    // 测试标签
    if (/\b(test|spec|testing)\b/i.test(content)) {
      tags.push('testing');
    }

    // 修复标签
    if (/\b(fix|bug|error)\b/i.test(content)) {
      tags.push('bug-fix');
    }

    // API标签
    if (/\b(api|endpoint|rest)\b/i.test(content)) {
      tags.push('api');
    }

    // 认证标签
    if (/\b(auth|login|permission)\b/i.test(content)) {
      tags.push('auth');
    }

    // 数据库标签
    if (/\b(database|db|sql|query)\b/i.test(content)) {
      tags.push('database');
    }

    // UI标签
    if (/\b(ui|component|button|modal)\b/i.test(content)) {
      tags.push('ui');
    }

    // 配置标签
    if (/\b(config|setting|env)\b/i.test(content)) {
      tags.push('config');
    }

    // 性能标签
    if (/\b(performance|optimization|speed)\b/i.test(content)) {
      tags.push('performance');
    }

    // 安全标签
    if (/\b(security|encrypt|hash)\b/i.test(content)) {
      tags.push('security');
    }

    return [...new Set(tags)].slice(0, 15);
  }

  /**
   * 计算代码质量评分
   */
  private calculateCodeQualityScore(content: string): number {
    let score = 0.5; // 基础分

    // 有注释加分
    if (/\/\/.*$/m.test(content) || /#.*$/m.test(content)) {
      score += 0.1;
    }

    // 有文档字符串加分
    if (/"""[\s\S]*?"""/.test(content) || /'''[\s\S]*?'''/.test(content)) {
      score += 0.1;
    }

    // 代码长度适中加分
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    if (lines.length >= 10 && lines.length <= 200) {
      score += 0.1;
    }

    // 有类型注解加分
    if (/: \w+/.test(content) || /\btype\b.*=/.test(content)) {
      score += 0.1;
    }

    // 有错误处理加分
    if (/\b(try|catch|except)\b/.test(content)) {
      score += 0.1;
    }

    // 有测试代码加分
    if (/\b(test|spec|it|describe)\b/.test(content)) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 分析变更影响
   */
  private analyzeChangeImpact(
    content: string,
    metadata?: Record<string, any>
  ): EnrichmentResult['change_impact'] {
    const impact: EnrichmentResult['change_impact'] = {};

    // 从元数据获取统计信息
    if (metadata?.diff_stats) {
      impact.lines_added = metadata.diff_stats.additions || 0;
      impact.lines_deleted = metadata.diff_stats.deletions || 0;
      impact.files_affected = metadata.diff_stats.files_count || 1;
    } else {
      // 估算行数
      const lines = content.split('\n');
      impact.lines_added = lines.length;
    }

    // 分析复杂度
    const complexityKeywords = Object.entries(this.complexityMap);
    for (const [level, keywords] of complexityKeywords) {
      if ((keywords as string[]).some((keyword: string) => content.toLowerCase().includes(keyword.toLowerCase()))) {
        impact.complexity = level as any;
        break;
      }
    }

    // 默认复杂度
    if (!impact.complexity) {
      const lineCount = content.split('\n').length;
      if (lineCount < 20) {
        impact.complexity = 'low';
      } else if (lineCount < 100) {
        impact.complexity = 'medium';
      } else {
        impact.complexity = 'high';
      }
    }

    return impact;
  }

  /**
   * 批量增强
   */
  batchEnrich(items: Array<{ content: string; filePath?: string; metadata?: Record<string, any> }>): EnrichmentResult[] {
    return items.map(item => this.enrich(item.content, item.filePath, item.metadata));
  }
}
