# DevMind MCP

**语言版本:** [English](../../README.md) | [中文](README.md)

---

**为AI助手打造的智能上下文感知记忆系统**

DevMind MCP 通过模型上下文协议（MCP）为 AI 助手提供持久性记忆功能，实现跨对话的上下文保持和智能信息检索。

---

## 目录

- [功能特性](#功能特性)
- [架构设计](#架构设计)
- [安装部署](#安装部署)
- [配置设置](#配置设置)
- [使用指南](#使用指南)
- [API 参考](#api-参考)
- [开发指南](#开发指南)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 功能特性

### 核心功能

- **持久性记忆存储** - 基于 SQLite 的存储，自动上下文管理
- **智能搜索** - 基于向量的语义搜索，支持相关性评分
- **多语言支持** - 支持 JavaScript、Python、Go、Rust、Java 等
- **上下文感知检索** - 自动相关性过滤和上下文关联
- **实时操作** - 对话过程中实时记忆更新
- **跨会话连续性** - 多个会话间保持上下文

### 技术特性

- **MCP 协议兼容** - 完整的模型上下文协议实现
- **灵活配置** - 可自定义存储路径和行为
- **性能优化** - 高效处理数千个上下文
- **记忆管理** - 自动清理和优化
- **错误容灾** - 健壮的错误处理和恢复

---

## 架构设计

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI 助手      │────│   DevMind MCP   │────│  SQLite 存储  │
│                 │    │     服务器      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    MCP 协议通信           上下文处理        持久数据
                            和向量搜索           管理
```

### 组件概览

**MCP 服务器层**
- 协议处理和客户端通信
- 请求路由和响应格式化
- 会话管理和身份验证

**上下文处理引擎**
- 内容分析和分类
- 向量嵌入生成
- 相关性评分和排序

**存储层**
- 优化架构的 SQLite 数据库
- 向量存储和索引
- 事务管理和数据完整性

---

## 安装部署

### 环境要求

- **Node.js** 18.0 或更高版本
- **npm** 或 **yarn** 包管理器

### 快速安装

```bash
# 克隆仓库
git clone https://github.com/JochenYang/Devmind.git
cd Devmind

# 安装依赖
npm install

# 构建项目
npm run build

# 初始化配置
npm run init
```

这将在当前目录创建 `.devmind.json` 配置文件。

### NPM 包安装

**方式一：直接使用 NPX（推荐）**

无需安装，直接在 MCP 客户端中配置：

**基本配置：**
```json
{
  "mcpServers": {
    "devmind": {
      "command": "npx",
      "args": [
        "-y",
        "devmind-mcp@latest"
      ]
    }
  }
}
```

**注意：** 如需智能自动记录，请在您的MCP客户端中配置系统规则（如果支持）。详细配置方法请参考下方的[智能记录规则配置](#-智能记录规则配置)章节。

**方式二：全局安装**

```bash
# 全局安装
npm install -g devmind-mcp

# 初始化项目配置
devmind init

# 启动后台守护进程
devmind start
```

---

## 配置设置

### 基本配置

在项目根目录创建 `.devmind.json` 文件：

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

| 选项                | 类型    | 默认值                 | 描述               |
|---------------------|---------|------------------------|--------------------|
| `database_path`     | string  | `~/.devmind/memory.db` | SQLite 数据库位置  |
| `max_contexts`      | number  | `1000`                 | 最大存储上下文数量 |
| `search_limit`      | number  | `20`                   | 默认搜索结果限制   |
| `auto_cleanup`      | boolean | `true`                 | 启用自动清理       |
| `vector_dimensions` | number  | `1536`                 | 向量嵌入维度       |

### MCP 客户端配置

详细的MCP客户端配置请参考下方的[智能记录规则配置](#-智能记录规则配置)章节，其中包含了完整的配置方法和智能记录规则。

---

## 使用指南

### MCP 集成使用

在 MCP 客户端中配置后，DevMind 将自动：

1. **监控开发活动** - 追踪文件变更、Git 操作和项目上下文
2. **智能记忆存储** - 存储相关代码片段、决策和讨论
3. **语义搜索** - 使用 AI 驱动的向量搜索查找相关上下文
4. **跨会话上下文** - 在不同开发会话中保持知识连续性

**可用的 MCP 工具：**

**会话管理：**
- `create_session` - 创建新的开发会话
- `get_current_session` - 获取当前活跃会话信息
- `end_session` - 结束开发会话
- `delete_session` - 删除会话及所有上下文 ⚠️

**上下文操作：**
- `record_context` - 存储开发上下文和记忆
- `list_contexts` - 列出会话/项目中的所有上下文
- `delete_context` - 根据ID删除特定上下文
- `update_context` - 更新上下文内容/标签/元数据
- `extract_file_context` - 从文件中提取上下文

**搜索和发现：**
- `semantic_search` - AI 驱动的语义搜索
- `get_related_contexts` - 查找相关上下文
- `generate_embeddings` - 生成向量嵌入

### CLI 操作

**项目管理：**
```bash
# 在当前项目初始化 DevMind
devmind init

# 启动监控守护进程
devmind start

# 检查状态
devmind status

# 停止监控
devmind stop
```

**搜索和检索：**
```bash
# 搜索上下文
devmind search "身份验证实现"

# 带过滤条件的搜索
devmind search "数据库" --project myproject --limit 5
```

### 基本操作

**存储上下文信息**
```typescript
// 存储开发上下文
await store({
  content: "使用 JWT 令牌实现用户身份验证",
  type: "implementation",
  tags: ["auth", "jwt", "security"]
});
```

**搜索和检索**
```typescript
// 查找相关上下文
const results = await search({
  query: "身份验证实现",
  limit: 10
});
```

**更新现有上下文**
```typescript
// 更新上下文信息
await update(contextId, {
  content: "更新身份验证支持刷新令牌",
  tags: ["auth", "jwt", "security", "refresh-tokens"]
});
```

### 高级用法

**上下文化搜索**
```typescript
// 在特定上下文内搜索
const results = await search({
  query: "数据库优化",
  context: "performance-improvements",
  timeRange: { days: 7 }
});
```

**批量操作**
```typescript
// 批量处理上下文
await batchStore([
  { content: "API 端点创建", type: "development" },
  { content: "单元测试添加", type: "testing" },
  { content: "文档更新", type: "docs" }
]);
```

### 集成示例

**与开发流程集成**
```bash
# 存储 git 提交信息
git log --oneline -10 | devmind store --type="git-history"

# 搜索最近的更改
devmind search "最近的数据库更改" --days=7
```

**与 AI 助手集成**
- 对话过程中自动上下文存储
- 基于当前讨论的智能检索
- 跨会话上下文连续性

---

## API 参考

### 核心方法

#### `store(context: ContextData): Promise<string>`
存储新的上下文信息。

**参数：**
- `context.content` - 主要内容文本
- `context.type` - 内容类型分类
- `context.tags` - 关联标签数组
- `context.metadata` - 附加元数据对象

**返回：** 上下文 ID 字符串

#### `search(query: SearchQuery): Promise<Context[]>`
搜索相关上下文。

**参数：**
- `query.query` - 搜索查询字符串
- `query.limit` - 最大结果数量（默认：20）
- `query.type` - 按内容类型过滤
- `query.tags` - 按标签过滤
- `query.timeRange` - 时间范围过滤

**返回：** 匹配上下文数组

#### `retrieve(id: string): Promise<Context | null>`
通过 ID 获取特定上下文。

#### `update(id: string, updates: Partial<ContextData>): Promise<boolean>`
更新现有上下文。

#### `delete(id: string): Promise<boolean>`
通过 ID 删除上下文。

### 实用方法

#### `cleanup(): Promise<void>`
执行数据库清理和优化。

#### `stats(): Promise<DatabaseStats>`
获取数据库统计信息和健康状态。

#### `export(format: 'json' | 'csv'): Promise<string>`
将所有上下文导出为指定格式。

---

## 开发指南

### 开发环境设置

```bash
# 克隆和设置
git clone https://github.com/JochenYang/Devmind.git
cd Devmind
npm install

# 开发模式
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
│   ├── mcp-server.ts      # MCP 协议实现
│   ├── memory-manager.ts  # 核心记忆操作
│   ├── search-engine.ts   # 搜索和检索逻辑
│   ├── types.ts          # 类型定义
│   └── utils.ts          # 实用功能
├── dist/                 # 编译后的 JavaScript
├── tests/               # 测试套件
├── docs/               # 文档
└── examples/           # 使用示例
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

# 开发构建（带监听）
npm run build:dev

# 清理构建产物
npm run clean
```

---

## 🤖 智能记录规则配置

为了让DevMind MCP实现最智能的自动记录体验，建议在您的MCP客户端（如Claude Desktop、Warp等）中添加以下用户规则：

### 推荐的系统规则

```
使用DevMind MCP - 具有自动文件监控的智能开发记忆：

• 回答技术问题前：使用 semantic_search
• 用户说"记住这个"时：使用 record_context
• bug修复/解决方案： record_context, type="solution"
• 决策/配置说明： record_context, type="documentation"
• DevMind自动捕获文件变化，手动记录重点关注见解
• 始终添加相关标签和合适类型
```

### MCP 客户端配置

**步骤1：添加DevMind MCP服务器**

在您的MCP客户端配置文件中添加：

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


**配置文件位置：**
- **Claude Desktop (Windows)**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Claude Desktop (macOS)**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Linux)**: `~/.config/Claude/claude_desktop_config.json`
- **其他 MCP 客户端**: 请参考您的客户端文档查找配置文件位置

### 自动记录触发场景

#### 高优先级（必须记录）
- 用户说"记住这个"、"这很重要"
- 修复了bug或错误
- 实现了新功能
- 做出了架构决策
- 版本发布或重大更新

#### 中优先级（建议记录）
- 代码审查和建议
- 性能优化方案
- 配置变更说明
- 学习笔记和最佳实践

#### 低优先级（选择性记录）
- 一般性讨论
- 简单的命令解释
- 重复性内容

### 推荐记录格式

```typescript
// 推荐的记录模式
{
  content: "具体的技术内容，包含背景和解决方案",
  type: "solution|code|error|documentation|test|configuration",
  tags: ["技术栈", "模块", "重要性", "状态"],
  session_id: "当前会话ID"
}
```

### 实际使用示例

**场景1：修复bug**
```
用户："这个认证bug怎么修复？"
助理：[提供解决方案] + 自动调用record_context记录修复过程
```

**场景2：架构决策**
```
用户："我们选择哪个数据库方案？"
助理：[分析对比] + 自动调用record_context记录决策依据
```

**场景3：用户明确标记**
```
用户："记住这个API设计模式，很重要"
助理：立即调用record_context保存内容
```

---

## 使用场景

### 软件开发
- 跟踪实现决策和技术选择
- 维护跨开发会话的上下文
- 存储和检索代码片段和模式
- 文档架构决策

### 研究和学习
- 从多个来源积累知识
- 建立相关概念之间的联系
- 随时间维持研究上下文
- 创建可搜索的知识库

### 项目管理
- 跟踪项目演进和决策
- 维持跨团队会议的上下文
- 存储和检索项目相关信息
- 文档经验教训

### AI 助手增强
- 为 AI 对话提供持久性记忆
- 启用上下文感知响应
- 维持用户偏好和历史
- 支持长期关系建立

---

## 贡献指南

欢迎为 DevMind MCP 做出贡献。请在提交 Pull Request 之前阅读我们的贡献指南。

### 开发流程

1. **Fork** 仓库
2. **创建** 功能分支 (`git checkout -b feature/amazing-feature`)
3. **提交** 更改 (`git commit -m 'Add amazing feature'`)
4. **推送** 到分支 (`git push origin feature/amazing-feature`)
5. **打开** Pull Request

### 代码标准

- 遵循TypeScript 最佳实践
- 维持 80% 以上的测试覆盖率
- 使用约定式提交消息
- 对公共 API 进行充分文档记录

---

## 许可证

此项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

---

## 支持

- **文档：** [Wiki](https://github.com/JochenYang/Devmind/wiki)
- **问题反馈：** [GitHub Issues](https://github.com/JochenYang/Devmind/issues)
- **讨论：** [GitHub Discussions](https://github.com/JochenYang/Devmind/discussions)

---

## 语言版本

- [English](../../README.md)
- [中文](README.md) (当前)

---

**DevMind MCP** - 为 AI 助手打造的智能上下文感知记忆