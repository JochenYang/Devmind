# DevMind MCP

<div align="center">

[![npm version](https://img.shields.io/npm/v/devmind-mcp.svg)](https://www.npmjs.com/package/devmind-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Downloads](https://img.shields.io/npm/dm/devmind-mcp.svg)](https://www.npmjs.com/package/devmind-mcp)

**为AI助手打造的智能上下文感知记忆系统**

[English](../../README.md) | [中文](README.md)

</div>

---

## 为什么选择 DevMind MCP?

**自动记忆** - 自动监控文件变化和Git操作
**智能搜索** - 基于向量的语义搜索,理解代码含义
**100%私密** - 所有数据本地存储在SQLite,无云端传输
**实时响应** - AI对话中即时检索上下文
**跨工具** - 无缝集成Claude Desktop、Cursor等工具
**项目智能** - 全面的项目文档生成与智能索引

---

## 📖 目录

- [概览](#-概览)
- [快速开始](#-快速开始)
- [使用指南](#-使用指南)
- [智能项目索引](#-智能项目索引)
- [配置设置](#-配置设置)
- [API参考](#-api参考)
- [使用场景](#-使用场景)
- [开发指南](#-开发指南)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)
- [支持](#-支持)

---

## 🎯 概览

### 什么是 DevMind MCP?

DevMind MCP 通过模型上下文协议(MCP)为AI助手提供**持久性记忆功能**。它使AI能够跨对话记住上下文,自动跟踪开发活动,并智能检索相关信息。

### 核心特性

#### 主要功能

- **自动记忆** - 后台监控文件变化、Git操作和错误日志
- **语义搜索** - AI驱动的向量嵌入搜索,查找相关上下文
- **持久存储** - 基于SQLite的本地存储,完全私密
- **混合搜索** - 结合关键词和语义搜索,获得最佳结果
- **实时响应** - 开发过程中记录,即时检索
- **跨工具支持** - 兼容多个MCP客户端和开发环境
- **项目文档** - 全面的项目分析和文档生成
- **统一会话** - 每个项目一个主会话,保持上下文一致

#### 技术特性

- 完整的MCP协议实现
- 统一会话管理(每个项目一个主会话)
- 自动会话重新激活
- 可自定义存储路径和行为
- 高效处理数千个上下文
- 自动清理和内存优化
- 健壮的错误处理和恢复

### 架构设计

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI 助手      │────│   DevMind MCP   │────│  SQLite 存储  │
│  (MCP 客户端)  │    │     服务器      │    │   (本地数据库)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
    MCP 协议通信           上下文处理           持久数据
                         和向量搜索             管理
```

**组件说明:**

- **MCP服务器** - 协议处理、请求路由、会话管理
- **上下文引擎** - 内容分析、向量嵌入、相关性评分
- **存储层** - 优化架构的SQLite数据库和向量索引
- **项目索引器** - 智能项目分析、文件扫描和记忆生成

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 18.0.0
- **MCP兼容客户端** (Claude Desktop、Cursor等)

### 安装

选择适合您的安装方式:

| 安装方式     | 命令                         | 适用场景          | 自动更新 |
|:-------------|:-----------------------------|:------------------|:--------:|
| **NPX** ⭐    | `npx -y devmind-mcp@latest`  | 快速测试、首次使用 |    ✅     |
| **全局安装** | `npm install -g devmind-mcp` | 日常开发          |    ❌     |
| **源码安装** | `git clone + npm install`    | 贡献代码、定制开发 |    ❌     |

### 逐步配置

#### 1️⃣ 添加到MCP客户端

编辑您的MCP客户端配置文件:

**配置文件位置:**

- **Windows**: `C:\Users\<用户名>\.claude.json` 或 `%USERPROFILE%\.claude.json`
- **macOS**: `~/.claude.json`
- **Linux**: `~/.claude.json`

**添加以下配置:**

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

**使用全局安装?** 替换为: `{"command": "devmind-mcp"}`

#### 2️⃣ 重启MCP客户端

重启Claude Desktop或您的MCP客户端以加载DevMind。

#### 3️⃣ 初始化DevMind (CLI功能可选)

如果需要使用CLI功能:

```bash
# 首先全局安装
npm install -g devmind-mcp

# 在项目中初始化
devmind init

# 启动监控守护进程
devmind start
```

#### 4️⃣ 尝试第一个命令

在您的AI助手中尝试:

> "使用 semantic_search 查找有关身份验证的信息"

**完成!** DevMind现在正在用持久记忆增强您的AI。

### 下一步

- 📖 阅读[使用指南](#-使用指南)了解可用工具
- ⚙️ 查看[配置设置](#%EF%B8%8F-配置设置)了解智能记录规则
- 🎨 探索[使用场景](#-使用场景)获取灵感

---

## 💡 使用指南

### MCP工具速查

DevMind为您的AI助手提供 **18个强大工具**:

#### 会话管理

| 工具                  | 用途                 | 使用示例       |
|-----------------------|----------------------|----------------|
| `create_session`      | 创建新的开发会话     | 开始新功能开发 |
| `get_current_session` | 获取当前活跃会话信息 | 检查当前上下文 |
| `end_session`         | 结束开发会话         | 完成工作       |
| `delete_session` ⚠️   | 删除会话及所有上下文 | 清理旧会话     |

**注意**: DevMind自动管理每个项目的主会话。会话会在需要时自动创建并跨对话重新激活。

#### 上下文操作

| 工具                   | 用途                | 使用示例        |
|------------------------|---------------------|-----------------|
| `record_context`       | 存储开发上下文      | 保存bug修复方案 |
| `list_contexts`        | 列出所有上下文      | 查看项目历史    |
| `delete_context`       | 删除特定上下文      | 移除过时信息    |
| `update_context`       | 更新上下文内容/标签 | 完善文档        |
| `extract_file_context` | 从文件提取上下文    | 分析代码结构    |

#### 搜索与发现

| 工具                   | 用途             | 使用示例     |
|------------------------|------------------|--------------|
| `semantic_search`      | AI驱动的语义搜索 | 查找相关实现 |
| `get_related_contexts` | 查找相关上下文   | 探索关联性   |
| `generate_embeddings`  | 生成向量嵌入     | 索引新内容   |

#### 项目智能

| 工具                      | 用途                   | 使用示例             |
|---------------------------|------------------------|----------------------|
| `index_project`           | 分析整个项目           | 生成全面项目洞察     |
| `analyze_project`         | 获取项目结构和指标     | 理解项目架构         |
| `generate_project_doc`    | 生成项目文档           | 创建初始项目文档     |
| `query_project_memory`    | 查询项目记忆(高级功能) | 时间查询、演进跟踪    |
| `get_project_context`     | 获取智能项目感知       | 智能建议和成熟度评估 |
| `optimize_project_memory` | 优化记忆存储和性能     | 清理、压缩、去重       |

### CLI命令

**项目管理:**

```bash
# 在当前项目初始化DevMind
devmind init

# 启动监控守护进程
devmind start

# 检查守护进程状态
devmind status

# 停止监控
devmind stop
```

**搜索与检索:**

```bash
# 搜索上下文
devmind search "身份验证实现"

# 带过滤条件搜索
devmind search "数据库" --project myproject --limit 5
```

### 使用示例

#### 存储上下文信息

```typescript
// 存储开发上下文
await record_context({
  content: "使用JWT令牌和刷新令牌实现用户身份验证",
  type: "implementation",
  tags: ["auth", "jwt", "security", "api"]
});
```

#### 搜索和检索

```typescript
// 查找相关上下文
const results = await semantic_search({
  query: "我们是如何实现身份验证的?",
  limit: 10
});
```

#### 更新现有上下文

```typescript
// 更新上下文信息
await update_context(contextId, {
  content: "更新身份验证以支持OAuth2和SAML",
  tags: ["auth", "jwt", "oauth2", "saml", "security"]
});
```

#### 上下文化搜索

```typescript
// 在特定时间范围内搜索
const results = await semantic_search({
  query: "数据库优化",
  timeRange: { days: 7 }
});
```

---

## 📂 智能项目索引

### 概述

DevMind 的**智能项目索引**功能能够自动分析整个项目，生成全面、结构化的项目记忆。这个功能能够智能扫描文件、提取有意义的内容，并创建可搜索的项目洞察。

### 主要特性

- **智能分析** - 自动识别项目类型、技术栈和架构模式
- **安全优先** - 内置敏感文件检测和内容过滤
- **性能优化** - 智能文件优先级排序和内容压缩
- **记忆生成** - 创建结构化项目记忆：概览、技术栈、结构和特性
- **进度跟踪** - 实时索引进度显示和性能洞察
- **上下文理解** - 分析项目复杂度并提供智能建议

### 工作原理

```text
项目发现 → 文件扫描 → 内容分析 → 记忆生成
    │           │          │          │
 自动识别     智能过滤    提取洞察   结构化记忆
 项目类型     和优先级    和技术特性  供AI上下文
```

### 可用工具

#### 项目索引工具

| 工具                   | 用途           | 使用示例           |
|------------------------|----------------|--------------------|
| `index_project`        | 分析整个项目   | 生成全面项目洞察   |
| `get_project_insights` | 获取项目记忆   | 访问缓存的项目分析 |
| `validate_project`     | 索引前项目验证 | 确保安全索引       |
| `get_indexing_status`  | 检查索引进度   | 监控后台分析       |

### 使用示例

#### 索引当前项目

```typescript
// 开始智能项目索引
const result = await index_project({
  project_path: "/path/to/project",
  trigger: "manual",
  options: {
    max_files: 50,
    include_code_analysis: true,
    generate_memories: true
  }
});
```

#### 获取项目洞察

```typescript
// 获取生成的项目记忆
const insights = await get_project_insights({
  project_path: "/path/to/project",
  memory_types: ["overview", "tech_stack", "structure"]
});
```

#### 项目验证

```typescript
// 索引前验证项目
const validation = await validate_project({
  project_path: "/path/to/project"
});

if (validation.is_valid) {
  console.log("项目已准备好进行索引");
} else {
  console.log("发现问题:", validation.issues);
}
```

### 生成的记忆类型

索引器生成四种类型的结构化记忆：

#### 1. 项目概览
- 项目类型识别（web、mobile、library 等）
- 主要编程语言和框架
- 项目复杂度评估
- README 和文档分析

#### 2. 技术栈
- 编程语言和框架
- 开发工具和构建系统
- 依赖和包管理器
- 云服务和数据库

#### 3. 项目结构
- 文件类型分布和组织
- 目录结构和模式
- 重要文件识别
- 架构模式识别

#### 4. 关键特性
- 主要功能提取
- 代码特征分析
- 构建和部署配置
- 文档质量评估

### 配置选项

#### 索引配置

```json
{
  "project_indexing": {
    "max_files": 50,
    "max_file_size": "100KB",
    "max_total_size": "5MB",
    "max_depth": 3,
    "enable_security_scan": true,
    "enable_code_extraction": true,
    "enable_content_compression": true
  }
}
```

#### 安全与隐私

- **自动敏感文件检测** - 排除 `.env`、密钥、凭据文件
- **内容清理** - 移除密码、令牌、个人路径
- **纯本地处理** - 数据不传输到外部服务
- **可配置排除模式** - 自定义索引内容

### CLI 命令

```bash
# 索引当前项目
devmind index

# 索引指定项目
devmind index /path/to/project

# 查看项目洞察
devmind insights

# 验证项目索引适用性
devmind validate /path/to/project
```

### 最佳实践

#### 何时使用项目索引

- **新项目入门** - 生成全面的项目理解
- **代码审查** - 快速获取项目上下文和结构概览
- **文档编写** - 自动生成项目文档基础
- **团队协作** - 分享一致的项目理解

#### 优化建议

1. **使用 `.gitignore` 模式** - 项目索引器遵循标准排除规则
2. **配置文件限制** - 在全面性和性能之间取平衡
3. **定期重新索引** - 随项目演进更新洞察
4. **结合手动上下文** - 用手动注释增强自动生成的洞察

---

## ⚡ 配置设置

### 基础配置

在项目根目录创建 `.devmind.json`:

```json
{
  "database_path": "~/.devmind/memory.db",
  "max_contexts": 1000,
  "search_limit": 20,
  "auto_cleanup": true,
  "vector_dimensions": 1536
}
```

### 配置选项

| 选项                | 类型    | 默认值                 | 描述                 |
|---------------------|---------|------------------------|----------------------|
| `database_path`     | string  | `~/.devmind/memory.db` | SQLite数据库文件位置 |
| `max_contexts`      | number  | `1000`                 | 最大存储上下文数量   |
| `search_limit`      | number  | `20`                   | 默认搜索结果限制     |
| `auto_cleanup`      | boolean | `true`                 | 启用旧上下文自动清理 |
| `vector_dimensions` | number  | `1536`                 | 向量嵌入维度         |

### 推荐系统提示

在您的MCP客户端系统提示中添加这个简洁规则:

```
DevMind 记忆规则:

1. 先搜索: 回答技术问题前使用 semantic_search
2. 立即记录 (不询问):
   - 用户说"记住这个"
   - 已完成的 bug 修复 → type="solution"
3. 建议记录 (先询问):
   - 新功能 → type="code"
   - 架构决策 → type="documentation"
   - 复杂解决方案 → type="solution"
4. 格式: 包含 file_path、line_ranges [[起始,结束],...] 和 tags
5. 会话: 自动创建/复用项目唯一会话
6. 新项目: 首次建议使用 generate_project_doc 生成完整文档

注意: NPX 模式无自动监听，AI 需主动记录重要内容。
```

#### 自动记录触发场景

| 优先级    | 何时记录 | 示例场景                             |
|-----------|----------|--------------------------------------|
| 🔴 **高** | 必须记录 | 用户说"记住"、bug修复、新功能、架构决策 |
| 🟡 **中** | 建议记录 | 代码审查、优化方案、配置更改、最佳实践  |
| 🟢 **低** | 可选记录 | 一般性讨论、简单解释、重复内容         |

#### 推荐记录格式

```typescript
{
  content: "具体的技术内容,包含背景和解决方案",
  type: "solution|code|error|documentation|test|configuration",
  tags: ["技术栈", "模块", "重要性", "状态"],
  session_id: "当前会话ID"
}
```

### 完整MCP配置示例

**使用NPX (推荐):**

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

**使用全局安装:**

```json
{
  "mcpServers": {
    "devmind": {
      "command": "devmind-mcp"
    }
  }
}
```

**重要提示**: 配置更改后需要重启MCP客户端。

---

## 📚 API参考

### 核心方法

#### `record_context(context: ContextData): Promise<string>`

存储新的上下文信息。

**参数:**

- `content` (string) - 主要内容文本
- `type` (string) - 内容类型: `solution`、`code`、`error`、`documentation`、`test`、`configuration`
- `tags` (string[]) - 关联标签
- `metadata` (object) - 附加元数据

**返回:** 上下文ID字符串

**示例:**

```typescript
const id = await record_context({
  content: "修复WebSocket连接处理器中的内存泄漏",
  type: "solution",
  tags: ["websocket", "memory-leak", "bug-fix"]
});
```

---

#### `semantic_search(query: SearchQuery): Promise<Context[]>`

使用语义理解搜索相关上下文。

**参数:**

- `query` (string) - 搜索查询
- `limit` (number) - 最大结果数 (默认: 20)
- `type` (string) - 按内容类型过滤
- `tags` (string[]) - 按标签过滤
- `timeRange` (object) - 时间范围过滤: `{ days: 7 }`

**返回:** 匹配上下文数组

**示例:**

```typescript
const results = await semantic_search({
  query: "身份验证实现",
  limit: 10,
  type: "implementation"
});
```

---

#### `retrieve(id: string): Promise<Context | null>`

通过ID获取特定上下文。

---

#### `update_context(id: string, updates: Partial<ContextData>): Promise<boolean>`

更新现有上下文。

**示例:**

```typescript
await update_context(contextId, {
  tags: ["websocket", "memory-leak", "bug-fix", "resolved"]
});
```

---

#### `delete_context(id: string): Promise<boolean>`

通过ID删除上下文。

---

### 实用方法

#### `cleanup(): Promise<void>`

执行数据库清理和优化。

#### `stats(): Promise<DatabaseStats>`

获取数据库统计信息和健康状态。

#### `export(format: 'json' | 'csv'): Promise<string>`

将所有上下文导出为指定格式。

---

## 🎨 使用场景

### 软件开发

- 跟踪实现决策和技术选择
- 跨开发会话维护上下文
- 存储和检索代码模式与片段
- 记录架构决策及其原因

### 研究与学习

- 从多个来源积累知识
- 建立相关概念之间的联系
- 在数周或数月内维护研究上下文
- 创建可搜索的个人知识库

### 项目管理

- 跟踪项目演进和关键决策
- 跨团队会议维护上下文
- 存储项目相关的见解和经验
- 记录事后总结和回顾

### AI助手增强

- 为AI对话提供持久记忆
- 基于历史启用上下文感知响应
- 维护用户偏好和项目细节
- 支持与AI的长期关系建立

---

## 🛠️ 开发指南

### 环境设置

```bash
# 克隆仓库
git clone https://github.com/JochenYang/Devmind.git
cd Devmind

# 安装依赖
npm install

# 开发模式(带监听)
npm run dev

# 运行测试
npm test

# 类型检查
npm run type-check

# 代码检查
npm run lint
```

### 项目结构

```
Devmind/
├── src/
│   ├── mcp-server.ts              # MCP协议服务器 - 核心服务器实现
│   ├── database.ts                # SQLite数据库层 - 持久存储
│   ├── vector-search.ts           # 向量搜索引擎 - 语义搜索
│   ├── types.ts                   # TypeScript类型定义
│   ├── index.ts                   # 主入口文件
│   │
│   ├── 🧠 会话与内容管理
│   ├── session-manager.ts         # 会话管理器 - 跨对话上下文
│   ├── content-extractor.ts       # 内容提取器 - 代码分析
│   ├── content-quality-assessor.ts # 质量评估器 - 内容评分
│   ├── auto-record-filter.ts      # 自动记录过滤器 - 智能去重
│   │
│   ├── 🛠️ 系统工具
│   ├── daemon.ts                  # 守护进程 - 后台监控
│   ├── cli.ts                     # CLI工具入口
│   ├── cli-new.ts                 # 新版CLI实现
│   ├── smart-confirmation-system.ts # 智能确认系统
│   ├── performance-optimizer.ts   # 性能优化器
│   │
│   └── 📂 project-indexer/        # 智能项目索引器模块
│       ├── index.ts               # 索引器入口
│       ├── core/
│       │   └── ProjectIndexer.ts  # 核心索引引擎
│       ├── strategies/
│       │   ├── SmartIndexingStrategy.ts  # 智能索引策略
│       │   └── SecurityStrategy.ts       # 安全扫描策略
│       ├── tools/
│       │   ├── FileScanner.ts     # 文件扫描器
│       │   ├── ContentExtractor.ts # 内容提取工具
│       │   ├── ProjectAnalyzer.ts  # 项目分析器
│       │   ├── MemoryGenerator.ts  # 记忆生成器
│       │   └── ProgressReporter.ts # 进度报告器
│       └── types/
│           └── IndexingTypes.ts   # 索引类型定义
│
├── dist/                          # 编译后JavaScript输出
├── tests/                         # 测试套件
├── docs/                          # 项目文档
│   ├── zh/                        # 中文文档
│   └── en/                        # 英文文档
└── examples/                      # 使用示例
```

**核心组件说明:**

- **核心服务器** - MCP协议处理、数据库层、向量搜索
- **会话管理** - 跨对话上下文、会话生命周期、自动记录
- **内容处理** - 智能提取、质量评估、去重过滤
- **项目索引器** - 智能项目全局分析与自动特征提取
- **系统工具** - 后台守护进程、CLI界面、性能优化

### 测试

```bash
# 运行所有测试
npm test

# 带覆盖率运行
npm run test:coverage

# 运行特定测试套件
npm test -- --grep "搜索功能"
```

### 构建

```bash
# 生产构建
npm run build

# 开发构建(带监听)
npm run build:dev

# 清理构建产物
npm run clean
```

---

## 🤝 贡献指南

我们欢迎为DevMind MCP做出贡献!请遵循以下步骤:

### 开发流程

1. **Fork** 仓库
2. **创建** 功能分支: `git checkout -b feature/amazing-feature`
3. **提交** 更改: `git commit -m 'Add amazing feature'`
4. **推送** 到分支: `git push origin feature/amazing-feature`
5. **打开** Pull Request

### 代码标准

- 遵循TypeScript最佳实践
- 维持80%以上的测试覆盖率
- 使用约定式提交消息
- 为所有公共API编写文档
- 为新功能添加测试

---

## 📄 许可证

本项目采用MIT许可证。详情请参阅[LICENSE](../../LICENSE)文件。

---

## 🔗 支持

- **问题反馈**: [GitHub Issues](https://github.com/JochenYang/Devmind/issues)
- **讨论交流**: [GitHub Discussions](https://github.com/JochenYang/Devmind/discussions)
- **NPM包**: [devmind-mcp](https://www.npmjs.com/package/devmind-mcp)

---

<div align="center">

**DevMind MCP** - 为AI助手打造的智能上下文感知记忆系统

Made with ❤️ by [Rhys](https://github.com/JochenYang)

</div>
