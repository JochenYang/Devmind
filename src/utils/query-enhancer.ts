/**
 * 智能查询增强器
 *
 * 功能：
 * 1. 同义词扩展 - 提升召回率
 * 2. 代码关键词提取 - 增强代码查询准确度
 * 3. 查询意图识别 - 支持文件类型权重调整
 * 4. 搜索模板系统 - 预设常用查询模板
 * 5. 智能查询优化 - 自动选择最佳搜索策略
 */

export interface QueryEnhancement {
  original: string;
  enhanced: string;
  keywords: string[];
  intent: QueryIntent;
  confidence: number;
  template?: SearchTemplate;
  suggestions?: string[];
  filters?: SearchFilters;
}

export interface SearchTemplate {
  name: string;
  description: string;
  query: string;
  params: Record<string, any>;
  intent: QueryIntent;
  weight: number; // 模板权重
}

export interface SearchFilters {
  types?: string[];
  tags?: string[];
  timeRange?: { days?: number; startDate?: string; endDate?: string };
  limit?: number;
  similarity_threshold?: number;
  hybrid_weight?: number;
}

export type QueryIntent =
  | "code_search" // 查找代码
  | "documentation" // 查找文档
  | "test_search" // 查找测试
  | "config_search" // 查找配置
  | "error_solution" // 错误解决
  | "feature_implementation" // 功能实现
  | "bug_fix" // Bug修复
  | "api_reference" // API参考
  | "database_query" // 数据库查询
  | "authentication" // 认证相关
  | "general"; // 通用查询

export class QueryEnhancer {
  private searchTemplates: SearchTemplate[] = [
    // 代码搜索模板
    {
      name: "find_code_by_feature",
      description: "查找特定功能的代码实现",
      query: "how to implement {feature} in {language}",
      params: { feature: "", language: "" },
      intent: "code_search",
      weight: 0.9,
    },
    {
      name: "find_api_usage",
      description: "查找API使用方法",
      query: "{api_name} usage example {language}",
      params: { api_name: "", language: "" },
      intent: "code_search",
      weight: 0.85,
    },

    // Bug修复模板
    {
      name: "debug_error",
      description: "查找错误解决方案",
      query: "fix {error_type} error {keywords}",
      params: { error_type: "", keywords: "" },
      intent: "error_solution",
      weight: 0.95,
    },
    {
      name: "resolve_bug",
      description: "查找类似Bug的修复方法",
      query: "bug fix {bug_type} {keywords}",
      params: { bug_type: "", keywords: "" },
      intent: "bug_fix",
      weight: 0.9,
    },

    // 测试相关模板
    {
      name: "find_tests",
      description: "查找测试代码",
      query: "test {component} {language}",
      params: { component: "", language: "" },
      intent: "test_search",
      weight: 0.8,
    },
    {
      name: "test_implementation",
      description: "查找测试实现示例",
      query: "{framework} test example {component}",
      params: { framework: "", component: "" },
      intent: "test_search",
      weight: 0.75,
    },

    // 配置相关模板
    {
      name: "find_config",
      description: "查找配置信息",
      query: "configure {service} {language}",
      params: { service: "", language: "" },
      intent: "config_search",
      weight: 0.8,
    },
    {
      name: "setup_guide",
      description: "查找设置指南",
      query: "setup {service} configuration",
      params: { service: "" },
      intent: "documentation",
      weight: 0.7,
    },

    // 文档搜索模板
    {
      name: "find_docs",
      description: "查找文档",
      query: "{topic} documentation {language}",
      params: { topic: "", language: "" },
      intent: "documentation",
      weight: 0.8,
    },

    // 特定领域模板
    {
      name: "auth_implementation",
      description: "查找认证实现",
      query: "{auth_type} authentication {language}",
      params: { auth_type: "jwt|oauth|saml", language: "" },
      intent: "authentication",
      weight: 0.9,
    },
    {
      name: "database_operation",
      description: "查找数据库操作",
      query: "{operation} database {database_type}",
      params: {
        operation: "select|insert|update|delete",
        database_type: "sql|mongodb|redis",
      },
      intent: "database_query",
      weight: 0.85,
    },
    {
      name: "api_reference",
      description: "查找API参考",
      query: "{framework} {version} api documentation",
      params: { framework: "", version: "" },
      intent: "api_reference",
      weight: 0.8,
    },
  ];

  // 中英文同义词映射（增强版）
  private synonymMap: Record<string, string[]> = {
    // 认证相关
    认证: ["auth", "authentication", "login", "signin", "登录", "验证"],
    auth: ["authentication", "login", "signin", "认证", "登录", "验证"],
    登录: ["login", "signin", "auth", "authentication", "认证", "验证"],
    验证: ["verify", "validation", "authentication", "认证", "auth"],
    authorization: ["auth", "permission", "access control", "授权", "权限"],

    // 数据库相关
    数据库: ["database", "db", "sql", "query", "查询", "数据"],
    database: ["db", "sql", "query", "数据库", "数据"],
    查询: ["query", "select", "search", "查询", "检索"],
    sql: ["database", "query", "select", "数据库", "查询"],
    mongodb: ["mongo", "nosql", "document", "文档数据库"],
    redis: ["cache", "key-value", "缓存", "键值存储"],

    // API相关
    api: ["接口", "endpoint", "service", "request", "API", "接口"],
    接口: ["api", "endpoint", "service", "request", "API"],
    endpoint: ["api", "route", "url", "接口", "路径"],
    restful: ["rest", "api", "接口", "REST"],

    // 测试相关
    测试: ["test", "spec", "unittest", "testing", "测试"],
    test: ["testing", "spec", "unittest", "测试", "单元测试"],
    单元测试: ["unit test", "unittest", "测试", "test"],
    集成测试: ["integration test", "e2e", "端到端测试"],
    jest: ["test", "testing", "spec", "测试框架"],
    vitest: ["test", "testing", "spec", "测试框架"],

    // 错误相关
    错误: ["error", "exception", "bug", "issue", "异常", "问题"],
    error: ["exception", "bug", "issue", "错误", "异常", "问题"],
    异常: ["exception", "error", "错误", "exception"],
    bug: ["error", "issue", "defect", "错误", "问题", "缺陷"],
    修复: ["fix", "patch", "solve", "解决", "修复"],
    debug: ["调试", "debugging", "排错", "错误排查"],

    // 组件相关
    组件: ["component", "widget", "module", "模块", "元件"],
    component: ["widget", "module", "组件", "模块", "元件"],
    模块: ["module", "package", "library", "模块", "包"],
    service: ["服务", "server", "微服务", "服务"],

    // 工具相关
    工具: ["util", "utility", "helper", "tool", "辅助", "工具类"],
    util: ["utility", "helper", "tool", "工具", "辅助"],
    helper: ["util", "utility", "工具", "辅助函数"],

    // 配置相关
    配置: ["config", "configuration", "settings", "setup", "设置", "配置"],
    config: ["configuration", "settings", "setup", "配置", "设置"],
    环境变量: ["env", "environment", "环境", "变量"],
    环境: ["env", "environment", "prod", "dev", "环境"],

    // 框架相关
    react: [
      "jsx",
      "tsx",
      "component",
      "hook",
      "useState",
      "useEffect",
      "React",
    ],
    vue: ["template", "script", "composition", "reactive", "ref", "Vue"],
    angular: ["component", "service", "module", "directive", "Angular"],
    express: ["middleware", "route", "app", "router", "Express"],
    nestjs: ["controller", "service", "module", "provider", "NestJS"],
    django: ["view", "model", "serializer", "url", "Django"],

    // 数据模型
    模型: ["model", "schema", "entity", "type", "模型", "实体"],
    model: ["schema", "entity", "type", "模型", "实体"],
    schema: ["structure", "blueprint", "结构", "模式"],

    // 路由相关
    路由: ["route", "router", "routing", "navigation", "导航"],
    route: ["router", "routing", "navigation", "路由", "导航"],
    routing: ["route", "router", "navigation", "路由"],

    // 状态管理
    状态: ["state", "store", "redux", "context", "状态管理"],
    state: ["store", "redux", "context", "状态", "状态管理"],
    store: ["state", "redux", "context", "状态", "状态存储"],

    // 新增：功能实现相关
    实现: ["implement", "code", "功能", "实现"],
    功能: ["feature", "functionality", "implement", "功能", "特性"],
    特性: ["feature", "functionality", "特性", "功能"],
    新功能: ["new feature", "feature add", "新功能", "特性"],

    // 新增：认证授权
    jwt: ["json web token", "token", "认证令牌"],
    oauth: ["oauth2", "授权", "认证"],
    saml: ["saml2", "单点登录", "SSO"],
    权限: ["permission", "access", "authorization", "授权"],
    权限控制: ["access control", "rbac", "权限"],

    // 新增：缓存相关
    缓存: ["cache", "caching", "缓存", "高速缓存"],
    cache: ["caching", "缓存", "高速缓存"],
    session: ["会话", "session storage", "会话存储"],

    // 新增：文件相关
    文件: ["file", "document", "文件", "文档"],
    上传: ["upload", "file upload", "文件上传"],
    下载: ["download", "file download", "文件下载"],
  };

  // 代码关键词映射（用于识别技术栈和概念）
  private codeKeywordMap: Record<string, string[]> = {
    // 前端框架
    react: ["jsx", "tsx", "component", "hook", "useState", "useEffect"],
    vue: ["template", "script", "composition", "reactive", "ref"],
    angular: ["component", "service", "module", "directive"],

    // 后端框架
    express: ["middleware", "route", "app", "router"],
    nestjs: ["controller", "service", "module", "provider"],
    django: ["view", "model", "serializer", "url"],

    // 数据库
    sql: ["select", "insert", "update", "delete", "join", "where"],
    mongodb: ["collection", "document", "aggregate", "find"],
    redis: ["cache", "key", "expire", "set", "get"],

    // 测试
    jest: ["test", "expect", "describe", "it", "mock"],
    vitest: ["test", "expect", "describe", "it", "vi"],
    cypress: ["cy", "visit", "get", "should"],
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
      confidence: this.calculateConfidence(query, keywords),
    };
  }

  /**
   * 使用模板增强查询
   */
  enhanceWithTemplate(query: string): QueryEnhancement {
    const enhancement = this.enhance(query);

    // 查找匹配的模板
    const matchingTemplate = this.findBestTemplate(query, enhancement.intent);
    if (matchingTemplate) {
      enhancement.template = matchingTemplate;
      enhancement.enhanced = this.applyTemplate(
        matchingTemplate,
        enhancement.keywords
      );
    }

    return enhancement;
  }

  /**
   * 查找最佳匹配的模板
   */
  private findBestTemplate(
    query: string,
    intent: QueryIntent
  ): SearchTemplate | undefined {
    const normalizedQuery = query.toLowerCase();

    // 首先按意图过滤
    const intentTemplates = this.searchTemplates.filter(
      (t) => t.intent === intent
    );

    // 计算每个模板的匹配度
    const scoredTemplates = intentTemplates.map((template) => {
      const score = this.calculateTemplateScore(normalizedQuery, template);
      return { template, score };
    });

    // 返回得分最高的模板
    scoredTemplates.sort((a, b) => b.score - a.score);
    return scoredTemplates[0]?.score > 0.3
      ? scoredTemplates[0].template
      : undefined;
  }

  /**
   * 计算模板匹配得分
   */
  private calculateTemplateScore(
    query: string,
    template: SearchTemplate
  ): number {
    let score = 0;
    const queryWords = query.split(/\s+/);

    // 检查模板参数在查询中的出现情况
    for (const [paramName, paramValue] of Object.entries(template.params)) {
      if (
        paramValue &&
        queryWords.some(
          (word) => word.includes(paramValue) || paramValue.includes(word)
        )
      ) {
        score += 0.3;
      }
    }

    // 检查查询意图与模板意图的匹配度
    if (template.intent) {
      score += template.weight * 0.5;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 应用模板到查询
   */
  private applyTemplate(template: SearchTemplate, keywords: string[]): string {
    let result = template.query;

    // 替换模板中的参数
    Object.entries(template.params).forEach(([key, value]) => {
      if (value && keywords.includes(value)) {
        result = result.replace(new RegExp(`{${key}}`, "g"), value);
      }
    });

    // 如果还有未替换的参数，用第一个关键词替换
    if (result.includes("{")) {
      result = result.replace(/\{[^}]+\}/g, keywords[0] || "");
    }

    return result;
  }

  /**
   * 标准化查询（清理、小写）
   */
  private normalizeQuery(query: string): string {
    return query.trim().replace(/\s+/g, " ").toLowerCase();
  }

  /**
   * 检测查询意图
   */
  private detectIntent(query: string): QueryIntent {
    const patterns: Record<string, RegExp> = {
      documentation: /文档|说明|readme|doc|guide|教程|帮助/i,
      test_search: /测试|test|spec|单元测试|集成测试/i,
      config_search: /配置|config|设置|settings|环境变量/i,
      error_solution: /错误|异常|error|exception|bug|修复|fix|解决/i,
      code_search: /函数|方法|类|class|function|代码|实现|logic/i,
      feature_implementation: /实现|功能|feature|implement|添加|新增/i,
      bug_fix: /修复|fix|bug|错误|异常|解决/i,
      api_reference: /api|接口|文档|reference|endpoint/i,
      database_query: /database|db|sql|query|数据库|查询/i,
      authentication: /auth|login|认证|登录|jwt|oauth|权限/i,
    };

    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(query)) {
        return intent as QueryIntent;
      }
    }

    return "general";
  }

  /**
   * 提取关键词（同义词扩展 + 代码关键词）
   */
  private extractKeywords(query: string): string[] {
    const keywords = new Set<string>();
    const words = query.split(/\s+/);

    // 添加原始词
    words.forEach((word) => {
      if (word.length > 1) {
        keywords.add(word);
      }
    });

    // 同义词扩展
    words.forEach((word) => {
      const synonyms = this.synonymMap[word];
      if (synonyms) {
        synonyms.slice(0, 3).forEach((syn) => keywords.add(syn)); // 限制每个词最多3个同义词
      }
    });

    // 代码关键词扩展
    words.forEach((word) => {
      const codeKeywords = this.codeKeywordMap[word];
      if (codeKeywords) {
        codeKeywords.slice(0, 2).forEach((kw) => keywords.add(kw));
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
    const additionalKeywords = keywords.filter((kw) => !originalWords.has(kw));

    // 限制增强关键词数量避免噪音
    const topKeywords = additionalKeywords.slice(0, 5);

    if (topKeywords.length === 0) {
      return original;
    }

    return `${original} ${topKeywords.join(" ")}`;
  }

  /**
   * 计算增强置信度
   */
  private calculateConfidence(query: string, keywords: string[]): number {
    const wordCount = query.split(/\s+/).length;
    const keywordCount = keywords.length;

    // 基础置信度：查询越具体，置信度越高
    let confidence = Math.min(0.5 + wordCount * 0.1, 0.9);

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
    const hints: Record<
      QueryIntent,
      { preferred: string[]; weights: Record<string, number> }
    > = {
      code_search: {
        preferred: [".ts", ".js", ".tsx", ".jsx", ".py", ".go", ".rs"],
        weights: { ".ts": 1.0, ".js": 1.0, ".tsx": 1.0, ".jsx": 1.0 },
      },
      documentation: {
        preferred: [".md", ".txt", ".rst", ".adoc"],
        weights: { ".md": 1.3, ".txt": 1.1, ".rst": 1.2 },
      },
      test_search: {
        preferred: [".test.ts", ".spec.ts", ".test.js", ".spec.js"],
        weights: { ".test": 1.5, ".spec": 1.5, "test/": 1.3 },
      },
      config_search: {
        preferred: [".json", ".yaml", ".yml", ".toml", ".env"],
        weights: { config: 1.4, ".json": 1.2, ".yaml": 1.2, ".env": 1.3 },
      },
      error_solution: {
        preferred: [".ts", ".js", ".log", ".md"],
        weights: { error: 1.2, solution: 1.3, ".log": 1.1 },
      },
      feature_implementation: {
        preferred: [".ts", ".js", ".py", ".go"],
        weights: { ".ts": 1.0, ".js": 1.0, ".py": 1.0 },
      },
      bug_fix: {
        preferred: [".ts", ".js", ".py", ".log"],
        weights: { fix: 1.3, bug: 1.3, ".log": 1.1 },
      },
      api_reference: {
        preferred: [".md", ".ts", ".js"],
        weights: { ".md": 1.2, api: 1.3, ".ts": 1.0 },
      },
      database_query: {
        preferred: [".sql", ".ts", ".py"],
        weights: { ".sql": 1.5, query: 1.3, ".ts": 1.0 },
      },
      authentication: {
        preferred: [".ts", ".js", ".py"],
        weights: { auth: 1.5, jwt: 1.4, ".ts": 1.0 },
      },
      general: {
        preferred: [],
        weights: {},
      },
    };

    return hints[intent];
  }

  /**
   * 获取所有搜索模板
   */
  getAllTemplates(): SearchTemplate[] {
    return [...this.searchTemplates];
  }

  /**
   * 根据意图获取模板
   */
  getTemplatesByIntent(intent: QueryIntent): SearchTemplate[] {
    return this.searchTemplates.filter((t) => t.intent === intent);
  }
}
