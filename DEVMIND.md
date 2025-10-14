# DevMind MCP - 项目分析文档

## 🎯 项目概述

**DevMind MCP** 是一个基于 Model Context Protocol (MCP) 的智能上下文感知记忆系统，为AI助手提供持久化记忆能力。该项目通过自动监控开发活动、智能语义搜索和本地存储，实现跨对话的上下文记忆和智能检索。

### 核心价值

- **自动记忆**: 后台监控文件变更和Git操作
- **智能搜索**: 基于向量嵌入的语义搜索，理解代码含义
- **100%私有**: 所有数据本地存储在SQLite中，无云端传输
- **实时响应**: 开发过程中记录，即时检索
- **跨工具支持**: 与Claude Desktop、Cursor等MCP客户端无缝协作

## 🛠️ 开发命令

### 基本构建和测试
```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build

# 运行测试
npm test

# 代码检查
npm run lint
```

### 运行和部署
```bash
# 启动MCP服务器
npm start

# 运行CLI工具
npm run cli

# 启动守护进程
npm run daemon
```

## 🏗️ 架构概览

### 系统架构

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Assistant  │────│   DevMind MCP   │────│  SQLite Storage │
│   (MCP Client)  │    │     Server      │    │   (Local DB)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
    MCP Protocol          Context Processing        Persistent Data
    Communications        & Vector Search            Management
```

### 核心组件

#### 1. MCP服务器层 (`mcp-server.ts`)
- **职责**: MCP协议处理、请求路由、会话管理
- **特性**: 13个MCP工具支持、自动文件监控、智能上下文记录
- **关键类**: `AiMemoryMcpServer`

#### 2. 数据库层 (`database.ts`)
- **职责**: SQLite持久化存储、数据模型管理
- **特性**: 全文搜索索引、向量嵌入存储、外键约束
- **关键类**: `DatabaseManager`

#### 3. 向量搜索引擎 (`vector-search.ts`)
- **职责**: 语义搜索、向量嵌入生成
- **特性**: 混合搜索（关键词+语义）、本地模型推理
- **关键类**: `VectorSearchEngine`

#### 4. 会话管理器 (`session-manager.ts`)
- **职责**: 会话生命周期管理、项目关联
- **特性**: 自动会话激活、项目主会话管理
- **关键类**: `SessionManager`

#### 5. 内容处理模块
- **内容提取器** (`content-extractor.ts`): 代码分析、语言检测
- **质量评估器** (`content-quality-assessor.ts`): 内容质量评分
- **自动记录过滤器** (`auto-record-filter.ts`): 智能去重和过滤

#### 6. 项目索引器 (`project-indexer/`)
- **职责**: 智能项目分析、文档生成
- **特性**: 多语言文档生成、安全扫描、内存优化
- **关键组件**: `ProjectMemoryOptimizer`, `SmartIndexingStrategy`

## 🔧 核心组件

### 数据库模型

#### Projects表
- `id`: 项目唯一标识
- `name`: 项目名称
- `path`: 项目路径（唯一）
- `language`: 主要编程语言
- `framework`: 框架信息
- `metadata`: JSON格式元数据

#### Sessions表
- `id`: 会话唯一标识
- `project_id`: 关联项目ID
- `name`: 会话名称
- `status`: 状态（active/completed/paused）
- `tool_used`: 使用工具（vscode/cli等）

#### Contexts表
- `id`: 上下文唯一标识
- `session_id`: 关联会话ID
- `type`: 上下文类型（code/documentation/solution等）
- `content`: 内容文本
- `file_path`: 关联文件路径
- `embedding`: 向量嵌入（BLOB）
- `quality_score`: 质量评分

### MCP工具集

DevMind提供13个MCP工具和4个专业提示，分为以下类别：

#### 会话管理
- `create_session`: 创建开发会话
- `get_current_session`: 获取当前会话
- `end_session`: 结束会话
- `delete_session`: 删除会话（谨慎使用）

#### 上下文操作
- `record_context`: 记录开发上下文
- `list_contexts`: 列出所有上下文
- `delete_context`: 删除特定上下文
- `update_context`: 更新上下文内容
- `extract_file_context`: 从文件提取上下文

#### 搜索与发现
- `semantic_search`: AI驱动的语义搜索
- `get_related_contexts`: 查找相关上下文
- `generate_embeddings`: 生成向量嵌入

#### 内存优化
- `optimize_project_memory`: 优化内存存储和性能

#### 专业提示

- `context_summary`: 生成项目上下文摘要
- `code_explanation`: 生成代码解释
- `solution_recommendation`: 获取解决方案推荐
- `project_analysis_engineer`: 专业项目分析工程师提示

### 向量搜索系统

#### 嵌入模型
- **默认模型**: `Xenova/all-MiniLM-L6-v2`
- **维度**: 384维
- **相似度阈值**: 0.5
- **混合权重**: 0.7（语义vs关键词）

#### 搜索流程
1. **关键词搜索**: 使用SQLite FTS5全文搜索
2. **语义搜索**: 计算查询与上下文的余弦相似度
3. **混合排序**: 结合关键词和语义得分
4. **结果返回**: 按相关性排序的上下文列表

## 💡 重要实现细节

### 自动文件监控

```typescript
// 智能文件监控器配置
const watcher = watch(patterns, {
  cwd: projectPath,
  ignored: ['**/node_modules/**', '**/.git/**'],
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000, // 文件写入稳定后2秒再触发
    pollInterval: 100
  }
});
```

### 智能上下文记录

系统通过以下机制避免重复记录：
- **时间间隔过滤**: 30秒内同一文件只记录一次
- **内容长度过滤**: 50-50,000字符范围
- **文件类型过滤**: 支持特定扩展名
- **质量评估**: 基于内容复杂度和结构评分

### 多语言文档生成

项目分析工程师支持中英文文档生成：
- **自动检测**: 基于README内容检测语言
- **手动指定**: 通过language参数指定
- **专业术语**: 技术术语的中文解释

## ⚙️ 配置

### 基础配置

创建 `.devmind.json` 文件：

```json
{
  "database_path": "~/.devmind/memory.db",
  "max_contexts": 1000,
  "search_limit": 20,
  "auto_cleanup": true,
  "vector_dimensions": 1536,
  "vector_search": {
    "enabled": true,
    "model_name": "Xenova/all-MiniLM-L6-v2",
    "similarity_threshold": 0.5,
    "hybrid_weight": 0.7
  }
}
```

### MCP客户端配置

```json
{
  "mcpServers": {
    "devmind": {
      "command": "npx",
      "args": ["-y", "devmind-mcp@latest"]
    }
  }
}
```

## 📝 开发笔记

### 技术栈
- **语言**: TypeScript
- **运行时**: Node.js ≥ 18.0.0
- **数据库**: SQLite (better-sqlite3)
- **向量模型**: Transformers.js (Xenova)
- **文件监控**: Chokidar
- **构建工具**: TypeScript Compiler

### 性能优化

#### 数据库优化
- **全文搜索索引**: FTS5虚拟表
- **向量索引**: 嵌入版本和模型索引
- **外键约束**: 级联删除
- **本地时间格式化**: 减少重复计算

#### 内存优化
- **智能缓存**: 向量嵌入缓存
- **批量处理**: 嵌入生成批处理
- **懒加载**: 模型按需加载

### 安全考虑
- **本地存储**: 所有数据存储在本地
- **敏感文件过滤**: 自动排除.env、密钥文件
- **内容清理**: 移除密码、令牌、个人路径
- **权限控制**: 文件系统访问限制

## 🔄 常见开发任务

### 添加新MCP工具

1. **定义工具接口** (`types.ts`)
```typescript
export interface NewToolParams {
  param1: string;
  param2?: number;
}
```

2. **注册工具** (`mcp-server.ts`)
```typescript
{
  name: 'new_tool',
  description: 'New tool description',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string' },
      param2: { type: 'number' }
    },
    required: ['param1']
  }
}
```

3. **实现处理函数**
```typescript
private async handleNewTool(args: NewToolParams) {
  // 工具实现逻辑
}
```

### 扩展向量搜索

1. **选择新模型**: 在配置中指定新模型
2. **更新嵌入维度**: 调整向量维度设置
3. **性能测试**: 验证新模型的准确性和性能

### 自定义内容提取

1. **扩展ContentExtractor**: 添加新的内容分析逻辑
2. **更新质量评估**: 调整质量评分算法
3. **测试验证**: 确保新提取逻辑的准确性

## 🚀 部署和分发

### NPM发布
```bash
# 构建项目
npm run build

# 发布到NPM
npm publish
```

### 本地开发
```bash
# 链接到全局
npm link

# 在项目中使用
npx -y devmind-mcp@latest
```

### 版本管理
- **语义化版本**: 遵循semver规范
- **变更日志**: 维护CHANGELOG.md
- **发布流程**: 自动化构建和测试

## 📊 性能指标

### 存储性能
- **上下文数量**: 支持数千个上下文
- **搜索响应时间**: < 100ms（关键词搜索）
- **语义搜索时间**: < 500ms（包含模型加载）
- **数据库大小**: 优化压缩存储

### 内存使用
- **模型内存**: ~100MB（默认模型）
- **运行时内存**: ~200MB（包含数据库）
- **缓存优化**: 智能内存管理

## 🔍 故障排除

### 常见问题

#### 向量搜索不可用
- **检查配置**: 确保vector_search.enabled=true
- **模型下载**: 首次使用需要下载模型
- **内存检查**: 确保有足够内存加载模型

#### 文件监控失败
- **权限检查**: 确保有文件系统访问权限
- **路径验证**: 检查项目路径是否正确
- **依赖确认**: 确保chokidar正确安装

#### 数据库连接问题
- **文件权限**: 确保数据库文件可写
- **磁盘空间**: 检查存储空间
- **连接池**: 重启应用重置连接

### 调试模式

启用详细日志：
```bash
DEBUG=devmind* npx -y devmind-mcp@latest
```

---

**DevMind MCP** - 为AI助手提供智能记忆能力的强大工具，让开发更智能、更高效！

*最后更新: 2025-10-14*  