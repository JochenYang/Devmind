# Windows路径大小写问题修复

## 问题描述

### 症状
- 同一个项目创建了多个项目记录
- 会话分散在不同的项目记录下
- 无法访问原始主会话
- 历史上下文丢失或分散

### 根本原因

**Windows文件系统 vs SQLite字符串比较的不匹配**

```
Windows文件系统:
  D:\codes\memory mcp  ≈  d:\codes\memory mcp  (不区分大小写,同一路径)

SQLite字符串比较:
  'D:\codes\memory mcp'  ≠  'd:\codes\memory mcp'  (区分大小写,不同字符串)
```

当用户或工具使用不同大小写的路径访问同一项目时:
1. `getProjectByPath()` 查询失败(路径字符串不匹配)
2. 系统认为是新项目,创建新的项目记录
3. 创建新的会话,导致会话分散
4. 原始主会话无法访问

### 实际案例

```
项目1: ffbbc24b-aa9e-4183-bead-96d98d270ad8
  路径: D:\codes\memory mcp  (大写D)
  会话: 6个 (包括原始主会话 6b3dee69-95cd-44e0-ad38-764fa52bb874)
  
项目2: bdbdf2bf-57ea-466e-8a61-5d06e147b75a  (重复!)
  路径: d:\codes\memory mcp  (小写d)
  会话: 3个 (新创建的会话)
```

## 解决方案

### 1. 路径规范化工具

**文件**: `src/utils/path-normalizer.ts`

```typescript
export function normalizeProjectPath(projectPath: string): string {
  let normalizedPath = resolve(projectPath);
  
  // Windows平台统一转为小写
  if (process.platform === 'win32') {
    normalizedPath = normalizedPath.toLowerCase();
  }
  
  return normalizedPath;
}
```

**原理**: 在Windows上统一将所有路径转换为小写,确保路径字符串一致性

### 2. 修改会话管理器

**文件**: `src/session-manager.ts`

**修改点**:
- `getOrCreateProject()` - 使用 `normalizeProjectPath()`
- `getCurrentSession()` - 使用 `normalizeProjectPath()`
- `generateProjectFingerprint()` - 使用 `normalizeProjectPath()`
- `generateProjectHash()` - 使用 `normalizeProjectPath()`

**影响**: 所有路径处理统一规范化,避免大小写不一致

### 3. 数据库修复脚本

**文件**: `scripts/fix-duplicate-projects.js`

**功能**:
1. 识别重复项目(路径仅大小写不同)
2. 保留最早创建的项目记录
3. 将重复项目的会话转移到主项目
4. 删除重复的项目记录
5. 规范化所有现有项目路径(Windows上转为小写)

**使用方法**:
```bash
node scripts/fix-duplicate-projects.js
```

**安全性**:
- 使用事务,失败自动回滚
- 保留所有会话和上下文数据
- 详细的操作日志

## 修复结果

### 执行修复脚本后

```
✅ 修复完成!

📊 统计信息:
   - 合并的重复项目: 1
   - 更新的路径: 3
   - 当前项目总数: 5

📋 当前项目列表:

   memory mcp
   路径: d:\codes\memory mcp  (已规范化为小写)
   会话: 9 个  (已合并所有会话)
   创建: 2025-10-11T04:24:06.146Z
```

### 验证

```bash
# 1. 检查当前会话
get_current_session_devmind({ project_path: "d:\\codes\\memory mcp" })
# 返回: 6b3dee69-95cd-44e0-ad38-764fa52bb874 (原始主会话)

# 2. 检查上下文数量
SELECT COUNT(*) FROM contexts WHERE session_id = '6b3dee69-95cd-44e0-ad38-764fa52bb874'
# 返回: 29 (所有历史上下文都在)

# 3. 测试记录功能
record_context_devmind({ session_id: "6b3dee69...", ... })
# 成功! ✅
```

## 影响范围

### 已修复
✅ 项目重复创建问题  
✅ 会话分散问题  
✅ 主会话访问问题  
✅ 历史上下文丢失问题  

### 向后兼容
✅ 现有数据完整保留  
✅ 会话和上下文关系保持  
✅ 不影响其他平台(macOS/Linux)  

### 未来保障
✅ 新项目自动使用规范化路径  
✅ 不会再创建重复项目  
✅ 主会话机制正常工作  

## 最佳实践

### 对于用户

1. **运行修复脚本** (如果遇到重复项目问题):
   ```bash
   node scripts/fix-duplicate-projects.js
   ```

2. **更新到最新版本**:
   ```bash
   npm install -g devmind-mcp@latest
   ```

3. **验证修复**:
   - 检查项目列表是否有重复
   - 确认主会话可以正常访问
   - 测试记录功能是否正常

### 对于开发者

1. **路径处理规范**:
   - 始终使用 `normalizeProjectPath()` 处理项目路径
   - 不要直接使用 `resolve()` 或原始路径字符串

2. **数据库查询**:
   - 路径查询前先规范化
   - 考虑Windows大小写不敏感特性

3. **测试覆盖**:
   - 添加Windows路径大小写测试用例
   - 验证路径规范化逻辑

## 相关文件

- `src/utils/path-normalizer.ts` - 路径规范化工具
- `src/session-manager.ts` - 会话管理器(已修改)
- `scripts/fix-duplicate-projects.js` - 数据库修复脚本
- `docs/fixes/windows-path-case-fix.md` - 本文档

## 提交信息

```
fix: resolve Windows path case sensitivity causing duplicate projects

- Add path normalization utility for Windows platform
- Update session manager to use normalized paths
- Create database migration script to merge duplicate projects
- Preserve all sessions and contexts during merge
- Update all existing project paths to lowercase on Windows

Fixes #[issue-number]
```

## 参考

- [Windows文件系统大小写不敏感](https://docs.microsoft.com/en-us/windows/wsl/case-sensitivity)
- [SQLite字符串比较](https://www.sqlite.org/datatype3.html#collation)
- [Node.js path.resolve()](https://nodejs.org/api/path.html#path_path_resolve_paths)

