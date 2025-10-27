# DevMind CLI 命令完整参考

## 目录
- [项目管理](#项目管理)
- [守护进程管理](#守护进程管理)
- [会话管理](#会话管理)
- [搜索与查询](#搜索与查询)
- [内容提取](#内容提取)
- [优化与维护](#优化与维护)
- [可视化](#可视化)

---

## 项目管理

### `devmind init`
初始化 DevMind 配置文件

```bash
devmind init [options]
```

**选项**：
- `--config-path <path>` - 配置文件路径（默认：`.devmind.json`）

**示例**：
```bash
# 在当前目录初始化
devmind init

# 指定配置文件路径
devmind init --config-path ./config/devmind.json
```

### `devmind project <action>`
管理项目

```bash
devmind project <action> [path] [options]
```

**Actions**：
- `list` - 列出所有项目
- `create` - 创建新项目
- `info` - 查看项目信息

**选项**：
- `--config <path>` - 配置文件路径

**示例**：
```bash
# 列出所有项目
devmind project list

# 创建新项目
devmind project create /path/to/project

# 查看项目信息
devmind project info /path/to/project
```

### `devmind stats`
显示数据库统计信息

```bash
devmind stats [options]
```

**选项**：
- `--config <path>` - 配置文件路径

**示例**：
```bash
devmind stats
```

---

## 守护进程管理

### `devmind start`
启动文件监控守护进程

```bash
devmind start [options]
```

**选项**：
- `--no-terminal` - 禁用终端命令监控
- `--project <path>` - 项目路径（默认：当前目录）

**功能**：
- 自动监控文件变化
- 记录 Git 提交
- 监控终端命令（可选）
- 后台运行

**示例**：
```bash
# 启动守护进程（完整监控）
devmind start

# 启动但不监控终端命令
devmind start --no-terminal

# 指定项目路径
devmind start --project /path/to/project
```

**输出示例**：
```
🚀 启动 DevMind 守护进程...

✅ 守护进程启动成功
   PID: 12345
   项目: /path/to/project

   使用 'devmind status' 查看状态
   使用 'devmind stop' 停止守护进程
```

### `devmind stop`
停止守护进程

```bash
devmind stop [options]
```

**选项**：
- `--project <path>` - 项目路径（默认：当前目录）

**示例**：
```bash
# 停止当前项目的守护进程
devmind stop

# 停止指定项目的守护进程
devmind stop --project /path/to/project
```

### `devmind status`
查看守护进程状态

```bash
devmind status [options]
```

**选项**：
- `--project <path>` - 项目路径（默认：当前目录）

**示例**：
```bash
devmind status
```

**输出示例**：
```
📊 DevMind 守护进程状态

   项目: /path/to/project
   状态: ✅ 运行中
   PID: 12345
   运行时间: 2h 15m
   启动时间: 2025-10-27T01:23:45.678Z
```

---

## 会话管理

### `devmind session <action>`
管理开发会话

```bash
devmind session <action> [path_or_id] [options]
```

**Actions**：
- `create` - 创建新会话
- `end` - 结束会话
- `list` - 列出会话
- `info` - 查看会话信息

**选项**：
- `--config <path>` - 配置文件路径
- `--name <name>` - 会话名称
- `--tool <tool>` - 工具名称

**示例**：
```bash
# 创建新会话
devmind session create /path/to/project --name "Feature Development"

# 列出所有会话
devmind session list

# 查看会话信息
devmind session info <session-id>

# 结束会话
devmind session end <session-id>
```

---

## 搜索与查询

### `devmind search <query>`
语义搜索上下文

```bash
devmind search <query> [options]
```

**选项**：
- `--config <path>` - 配置文件路径
- `--project <id>` - 项目 ID
- `--session <id>` - 会话 ID
- `--limit <number>` - 结果数量限制（默认：10）
- `--threshold <number>` - 相似度阈值（0-1，默认：0.5）

**示例**：
```bash
# 基本搜索
devmind search "authentication implementation"

# 限制结果数量
devmind search "error handling" --limit 5

# 在特定项目中搜索
devmind search "database query" --project <project-id>

# 设置相似度阈值
devmind search "API design" --threshold 0.7
```

---

## 内容提取

### `devmind extract <file>`
从文件提取结构化上下文

```bash
devmind extract <file> [options]
```

**选项**：
- `--config <path>` - 配置文件路径
- `--session <id>` - 会话 ID
- `--record` - 是否记录到数据库

**功能**：
- 提取函数、类、导入等
- 检测编程语言
- 分析代码结构
- 可选记录到数据库

**示例**：
```bash
# 提取文件内容
devmind extract src/app.ts

# 提取并记录到数据库
devmind extract src/app.ts --record --session <session-id>
```

---

## 优化与维护

### `devmind optimize <project-id>`
优化项目内存存储

```bash
devmind optimize <project-id> [options]
```

**选项**：
- `--config <path>` - 配置文件路径
- `--strategies <list>` - 优化策略（逗号分隔）
- `--dry-run` - 预览模式，不实际执行

**优化策略**：
- `clustering` - 聚类相似上下文
- `compression` - 压缩内容
- `deduplication` - 去重
- `summarization` - 摘要化
- `ranking` - 质量排序
- `archiving` - 归档旧数据

**示例**：
```bash
# 使用所有策略优化
devmind optimize <project-id>

# 只使用去重和压缩
devmind optimize <project-id> --strategies deduplication,compression

# 预览优化效果
devmind optimize <project-id> --dry-run
```

### `devmind quality`
更新上下文质量评分

```bash
devmind quality [options]
```

**选项**：
- `--config <path>` - 配置文件路径
- `--project <id>` - 项目 ID
- `--limit <number>` - 处理数量限制
- `--force-all` - 强制更新所有上下文

**示例**：
```bash
# 更新质量评分
devmind quality

# 更新特定项目
devmind quality --project <project-id>

# 强制更新所有
devmind quality --force-all
```

### `devmind maintenance <action>`
数据库维护操作

```bash
devmind maintenance <action> [backup-file] [options]
```

**Actions**：
- `vacuum` - 压缩数据库
- `backup` - 创建备份
- `restore` - 恢复备份

**选项**：
- `--config <path>` - 配置文件路径
- `--output <path>` - 备份输出路径
- `--force` - 强制执行（跳过确认）

**示例**：
```bash
# 压缩数据库
devmind maintenance vacuum

# 创建备份
devmind maintenance backup --output ./backups/

# 恢复备份
devmind maintenance restore ./backups/backup-2025-10-27.json

# 强制恢复（不提示确认）
devmind maintenance restore ./backups/backup.json --force
```

---

## 可视化

### `devmind graph <project-id>`
导出交互式记忆图谱

```bash
devmind graph <project-id> [options]
```

**选项**：
- `--config <path>` - 配置文件路径
- `--output <path>` - 输出文件路径
- `--max-nodes <number>` - 最大节点数（0 = 全部）
- `--focus-type <type>` - 聚焦类型

**聚焦类型**：
- `all` - 所有类型
- `solution` - 解决方案
- `error` - 错误
- `code` - 代码
- `documentation` - 文档
- `conversation` - 对话

**示例**：
```bash
# 导出完整图谱
devmind graph <project-id>

# 限制节点数量
devmind graph <project-id> --max-nodes 100

# 只显示解决方案和错误
devmind graph <project-id> --focus-type solution

# 指定输出路径
devmind graph <project-id> --output ./visualizations/memory-graph.html
```

---

## 全局选项

所有命令都支持以下全局选项：

- `-V, --version` - 显示版本号
- `-h, --help` - 显示帮助信息

**示例**：
```bash
# 查看版本
devmind --version

# 查看帮助
devmind --help

# 查看特定命令的帮助
devmind start --help
```

---

## 配置文件

DevMind 使用 `.devmind.json` 配置文件：

```json
{
  "database_path": "~/.devmind/memory.db",
  "max_contexts_per_session": 1000,
  "quality_threshold": 0.3,
  "ignored_patterns": [
    "node_modules/**",
    ".git/**",
    "dist/**"
  ],
  "included_extensions": [
    ".js", ".ts", ".py", ".go"
  ]
}
```

---

## 常见工作流

### 开始新项目
```bash
# 1. 初始化配置
devmind init

# 2. 启动守护进程
devmind start

# 3. 查看状态
devmind status
```

### 搜索和查询
```bash
# 搜索相关代码
devmind search "authentication logic"

# 查看项目统计
devmind stats

# 查看会话列表
devmind session list
```

### 维护和优化
```bash
# 优化存储
devmind optimize <project-id>

# 更新质量评分
devmind quality

# 创建备份
devmind maintenance backup

# 压缩数据库
devmind maintenance vacuum
```

### 停止监控
```bash
# 停止守护进程
devmind stop

# 确认已停止
devmind status
```

---

## 故障排除

### 守护进程无法启动
```bash
# 检查是否已在运行
devmind status

# 如果显示运行但实际未运行，手动清理
rm .devmind/daemon.pid

# 重新启动
devmind start
```

### 数据库问题
```bash
# 压缩数据库
devmind maintenance vacuum

# 创建备份
devmind maintenance backup

# 如果需要，恢复备份
devmind maintenance restore <backup-file>
```

### 搜索结果不准确
```bash
# 更新质量评分
devmind quality --force-all

# 优化存储
devmind optimize <project-id>
```

---

## 环境变量

- `DEVMIND_DB_PATH` - 覆盖数据库路径
- `DEVMIND_CONFIG_PATH` - 覆盖配置文件路径

**示例**：
```bash
export DEVMIND_DB_PATH=/custom/path/memory.db
devmind start
```
