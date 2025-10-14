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
- **专业文档生成** - AI驱动的项目分析和DEVMIND.md生成
- **多语言支持** - 自动检测生成中文/英文文档
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
- **项目分析器** - 智能项目分析和记忆优化

## 项目结构

```
Devmind/
├── src/
│   ├── mcp-server.ts              # MCP协议服务器 - 核心服务器实现
│   ├── database.ts                # SQLite数据库层 - 持久化存储
│   ├── vector-search.ts           # 向量搜索引擎 - 语义搜索
│   ├── types.ts                   # TypeScript类型定义
│   ├── index.ts                   # 主入口点
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
│   ├── smart-confirmation-system.ts # 智能确认系统
│   ├── performance-optimizer.ts   # 性能优化器
│   │
│   ├── 🔧 工具类
│   ├── utils/
│   │   ├── file-path-detector.ts  # 文件路径检测工具
│   │   ├── git-diff-parser.ts     # Git差异解析
│   │   └── path-normalizer.ts     # 路径标准化
│   │
│   └── 📂 project-indexer/        # 智能项目分析模块
│       ├── index.ts               # 索引器入口点
│       ├── core/
│       │   └── ProjectMemoryOptimizer.ts # 记忆优化引擎
│       ├── strategies/
│       │   ├── SmartIndexingStrategy.ts  # 智能索引策略
│       │   └── SecurityStrategy.ts       # 安全扫描策略
│       ├── tools/
│       │   ├── FileScanner.ts     # 智能文件扫描器
│       │   ├── ContentExtractor.ts # 内容提取工具
│       │   └── ProjectAnalyzer.ts  # 项目结构分析器
│       └── types/
│           └── IndexingTypes.ts   # 索引类型定义
│
├── dist/                          # 编译后的JavaScript输出
├── docs/                          # 项目文档
│   └── zh/                        # 中文文档
├── scripts/                       # 工具脚本
│   ├── cleanup-test-data.js       # 数据库清理
│   ├── fix-duplicate-projects.js  # 修复重复项目
│   └── reset-database.js          # 数据库重置
└── 配置文件
    ├── package.json               # Node.js包配置
    ├── tsconfig.json              # TypeScript配置
    ├── .devmind.json              # DevMind配置
    └── mcp-config-example.json    # MCP配置示例
```

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

#### 专业文档生成

**使用 `project_analysis_engineer` 提示满足所有专业文档需求:**

| 提示                       | 用途                       | 使用示例                  |
|-----------------------------|----------------------------|---------------------------|
| `project_analysis_engineer`| 生成全面专业文档           | 创建DEVMIND.md分析报告    |

*注意: 之前的项目分析工具已统一到这个强大的基于提示的方法中。*

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

#### 内存优化

| 工具                      | 用途                   | 使用示例             |
|---------------------------|-----------------------|-----------------------|
| `optimize_project_memory` | 优化记忆存储和性能     | 清理、压缩、去重       |

*注意: 所有项目分析功能已统一到 `project_analysis_engineer` 提示中，提供更好的用户体验。*

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

## 🚀 专业文档生成

### 概述

DevMind 的**项目分析工程师**使用AI自动分析您的代码库并生成全面、专业的文档。这种强大的基于提示的方法提供了比传统静态分析更深入的洞察。

### 主要特性

- **AI驱动分析** - 深入理解代码模式、架构和业务逻辑
- **多语言支持** - 自动检测并生成中文或英文文档
- **专业品质** - 生成具有技术深度的DEVMIND.md格式文档
- **自动保存到记忆** - 文档自动保存到您项目的记忆中以便未来参考
- **可自定义焦点** - 针对架构、API、业务逻辑或安全等特定领域
- **多种格式** - 支持DEVMIND.md、技术规格和README格式

### 工作原理

```text
项目扫描 → 代码分析 → AI处理 → 专业文档 → 记忆存储
       │            │         │          │             │
   智能文件     提取技术  生成深入  创建 DEVMIND.md  自动保存到
   选择         洞察        分析        文档           可搜索数据库
```

### 使用方法

#### 自然语言生成

**中文:**
- "为这个项目生成专业的DevMind文档"
- "创建全面的技术分析，使用DEVMIND.md格式"
- "分析这个代码库并生成专业文档"

**英文:**
- "Generate professional DevMind documentation for this project"
- "Create comprehensive technical analysis with DEVMIND.md format"
- "Analyze this codebase and generate professional documentation"

#### 直接提示使用

```typescript
// 中文文档
const analysis = await project_analysis_engineer({
  project_path: "./my-project",
  doc_style: "devmind",
  language: "zh"
});

// 英文文档(自动检测)
const analysis = await project_analysis_engineer({
  project_path: "./english-project",
  doc_style: "devmind",
  language: "en"
});
```

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
6. 新项目: 使用 project_analysis_engineer 提示生成全面文档

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

#### `project_analysis_engineer(options: AnalysisOptions): Promise<AnalysisPrompt>`

**新功能!** 使用AI驱动的分析生成专业项目文档。

**参数:**

- `project_path` (string) - 项目目录路径
- `analysis_focus` (string) - 关注领域: `architecture,entities,apis,business_logic` 
- `doc_style` (string) - 文档风格: `devmind`、`claude`、`technical`、`readme`
- `language` (string) - 文档语言: `en`、`zh`、`auto` (默认: 自动检测)
- `auto_save` (boolean) - 自动保存分析结果到内存 (默认: true)

**返回:** 用于AI生成全面文档的分析提示

**示例:**

```typescript
// 英文文档
const analysis = await project_analysis_engineer({
  project_path: "./my-project",
  doc_style: "devmind",
  language: "en"
});

// 中文文档(自动检测或明确指定)
const analysis = await project_analysis_engineer({
  project_path: "./my-chinese-project",
  doc_style: "devmind",
  language: "zh"
});
```

**自然语言示例:**
- "为这个项目生成专业的DevMind文档"
- "Generate professional DevMind documentation for this project" (英文)
- "创建全面的技术分析，使用DEVMIND.md格式"

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
