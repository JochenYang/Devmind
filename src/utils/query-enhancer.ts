/**
 * 智能查询增强器
 * 
 * 功能：
 * 1. 同义词扩展 - 提升召回率
 * 2. 代码关键词提取 - 增强代码查询准确度
 * 3. 查询意图识别 - 支持文件类型权重调整
 */

export interface QueryEnhancement {
  original: string;
  enhanced: string;
  keywords: string[];
  intent: QueryIntent;
  confidence: number;
}

export type QueryIntent = 
  | 'code_search'        // 查找代码
  | 'documentation'      // 查找文档
  | 'test_search'        // 查找测试
  | 'config_search'      // 查找配置
  | 'error_solution'     // 错误解决
  | 'general';           // 通用查询

export class QueryEnhancer {
  // 中英文同义词映射
  private synonymMap: Record<string, string[]> = {
    // 认证相关
    '认证': ['auth', 'authentication', 'login', 'signin', '登录'],
    'auth': ['authentication', 'login', 'signin', '认证', '登录'],
    '登录': ['login', 'signin', 'auth', 'authentication', '认证'],
    
    // 数据库相关
    '数据库': ['database', 'db', 'sql', 'query', '查询'],
    'database': ['db', 'sql', 'query', '数据库'],
    
    // 配置相关
    '配置': ['config', 'configuration', 'settings', 'setup', '设置'],
    'config': ['configuration', 'settings', 'setup', '配置'],
    
    // API相关
    'api': ['接口', 'endpoint', 'service', 'request'],
    '接口': ['api', 'endpoint', 'service', 'request'],
    
    // 测试相关
    '测试': ['test', 'spec', 'unittest', 'testing'],
    'test': ['testing', 'spec', 'unittest', '测试'],
    
    // 错误相关
    '错误': ['error', 'exception', 'bug', 'issue', '异常'],
    'error': ['exception', 'bug', 'issue', '错误', '异常'],
    
    // 组件相关
    '组件': ['component', 'widget', 'module', '模块'],
    'component': ['widget', 'module', '组件', '模块'],
    
    // 工具相关
    '工具': ['util', 'utility', 'helper', 'tool', '辅助'],
    'util': ['utility', 'helper', 'tool', '工具', '辅助'],
    
    // 服务相关
    '服务': ['service', 'server', 'daemon', 'worker'],
    'service': ['server', 'daemon', 'worker', '服务'],
    
    // 数据模型
    '模型': ['model', 'schema', 'entity', 'type'],
    'model': ['schema', 'entity', 'type', '模型'],
    
    // 路由相关
    '路由': ['route', 'router', 'routing', 'navigation'],
    'route': ['router', 'routing', 'navigation', '路由'],
    
    // 状态管理
    '状态': ['state', 'store', 'redux', 'context'],
    'state': ['store', 'redux', 'context', '状态'],
  };

  // 代码关键词映射（用于识别技术栈和概念）
  private codeKeywordMap: Record<string, string[]> = {
    // 前端框架
    'react': ['jsx', 'tsx', 'component', 'hook', 'useState', 'useEffect'],
    'vue': ['template', 'script', 'composition', 'reactive', 'ref'],
    'angular': ['component', 'service', 'module', 'directive'],
    
    // 后端框架
    'express': ['middleware', 'route', 'app', 'router'],
    'nestjs': ['controller', 'service', 'module', 'provider'],
    'django': ['view', 'model', 'serializer', 'url'],
    
    // 数据库
    'sql': ['select', 'insert', 'update', 'delete', 'join', 'where'],
    'mongodb': ['collection', 'document', 'aggregate', 'find'],
    'redis': ['cache', 'key', 'expire', 'set', 'get'],
    
    // 测试
    'jest': ['test', 'expect', 'describe', 'it', 'mock'],
    'vitest': ['test', 'expect', 'describe', 'it', 'vi'],
    'cypress': ['cy', 'visit', 'get', 'should'],
  };

  /**
   * 增强查询文本
   */
  enhance(query: string): QueryEnhancement {
    const normalized = this.normalizeQuery(query);
    const intent = this.detectIntent(normalized);
    const keywords = this.extractKeywords(normalized);
    const enhanced = this.buildEnhancedQuery(normalized, keywords);
    
    return {
      original: query,
      enhanced,
      keywords,
      intent,
      confidence: this.calculateConfidence(query, keywords)
    };
  }

  /**
   * 标准化查询（清理、小写）
   */
  private normalizeQuery(query: string): string {
    return query
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  /**
   * 检测查询意图
   */
  private detectIntent(query: string): QueryIntent {
    const patterns = {
      documentation: /文档|说明|readme|doc|guide|教程|帮助/i,
      test_search: /测试|test|spec|单元测试|集成测试/i,
      config_search: /配置|config|设置|settings|环境变量/i,
      error_solution: /错误|异常|error|exception|bug|修复|fix|解决/i,
      code_search: /函数|方法|类|class|function|代码|实现|logic/i,
    };

    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(query)) {
        return intent as QueryIntent;
      }
    }

    return 'general';
  }

  /**
   * 提取关键词（同义词扩展 + 代码关键词）
   */
  private extractKeywords(query: string): string[] {
    const keywords = new Set<string>();
    const words = query.split(/\s+/);

    // 添加原始词
    words.forEach(word => {
      if (word.length > 1) {
        keywords.add(word);
      }
    });

    // 同义词扩展
    words.forEach(word => {
      const synonyms = this.synonymMap[word];
      if (synonyms) {
        synonyms.slice(0, 3).forEach(syn => keywords.add(syn)); // 限制每个词最多3个同义词
      }
    });

    // 代码关键词扩展
    words.forEach(word => {
      const codeKeywords = this.codeKeywordMap[word];
      if (codeKeywords) {
        codeKeywords.slice(0, 2).forEach(kw => keywords.add(kw));
      }
    });

    return Array.from(keywords);
  }

  /**
   * 构建增强查询
   */
  private buildEnhancedQuery(original: string, keywords: string[]): string {
    // 移除原始查询中已包含的关键词
    const originalWords = new Set(original.split(/\s+/));
    const additionalKeywords = keywords.filter(kw => !originalWords.has(kw));

    // 限制增强关键词数量避免噪音
    const topKeywords = additionalKeywords.slice(0, 5);

    if (topKeywords.length === 0) {
      return original;
    }

    return `${original} ${topKeywords.join(' ')}`;
  }

  /**
   * 计算增强置信度
   */
  private calculateConfidence(query: string, keywords: string[]): number {
    const wordCount = query.split(/\s+/).length;
    const keywordCount = keywords.length;
    
    // 基础置信度：查询越具体，置信度越高
    let confidence = Math.min(0.5 + (wordCount * 0.1), 0.9);
    
    // 关键词扩展度加成
    if (keywordCount > wordCount * 1.5) {
      confidence = Math.min(confidence + 0.1, 1.0);
    }
    
    return confidence;
  }

  /**
   * 获取查询意图的文件类型提示
   */
  getFileTypeHints(intent: QueryIntent): {
    preferred: string[];
    weights: Record<string, number>;
  } {
    const hints: Record<QueryIntent, { preferred: string[]; weights: Record<string, number> }> = {
      code_search: {
        preferred: ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs'],
        weights: { '.ts': 1.0, '.js': 1.0, '.tsx': 1.0, '.jsx': 1.0 }
      },
      documentation: {
        preferred: ['.md', '.txt', '.rst', '.adoc'],
        weights: { '.md': 1.3, '.txt': 1.1, '.rst': 1.2 }
      },
      test_search: {
        preferred: ['.test.ts', '.spec.ts', '.test.js', '.spec.js'],
        weights: { '.test': 1.5, '.spec': 1.5, 'test/': 1.3 }
      },
      config_search: {
        preferred: ['.json', '.yaml', '.yml', '.toml', '.env'],
        weights: { 'config': 1.4, '.json': 1.2, '.yaml': 1.2, '.env': 1.3 }
      },
      error_solution: {
        preferred: ['.ts', '.js', '.log', '.md'],
        weights: { 'error': 1.2, 'solution': 1.3, '.log': 1.1 }
      },
      general: {
        preferred: [],
        weights: {}
      }
    };

    return hints[intent];
  }
}
