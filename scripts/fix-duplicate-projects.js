#!/usr/bin/env node

/**
 * 修复Windows路径大小写导致的重复项目问题
 * 
 * 问题：由于Windows路径大小写不一致（D:\ vs d:\），导致同一个项目创建了多个记录
 * 解决：
 * 1. 识别重复的项目（路径仅大小写不同）
 * 2. 合并会话和上下文到最早创建的项目
 * 3. 删除重复的项目记录
 * 4. 更新所有项目路径为小写（Windows平台）
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';

const dbPath = process.env.DEVMIND_DB_PATH || join(homedir(), '.devmind', 'memory.db');

console.log(`📂 使用数据库: ${dbPath}\n`);

const db = new Database(dbPath);

// 启用外键约束
db.pragma('foreign_keys = ON');

try {
  // 开始事务
  db.exec('BEGIN TRANSACTION');

  console.log('🔍 查找重复的项目...\n');

  // 查找所有项目
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at ASC').all();

  // 按小写路径分组，找出重复项
  const projectGroups = new Map();
  
  for (const project of projects) {
    const normalizedPath = process.platform === 'win32' 
      ? project.path.toLowerCase() 
      : project.path;
    
    if (!projectGroups.has(normalizedPath)) {
      projectGroups.set(normalizedPath, []);
    }
    projectGroups.get(normalizedPath).push(project);
  }

  // 处理重复的项目组
  let mergedCount = 0;
  let updatedCount = 0;

  for (const [normalizedPath, group] of projectGroups.entries()) {
    if (group.length > 1) {
      console.log(`⚠️  发现重复项目: ${normalizedPath}`);
      console.log(`   共 ${group.length} 个记录:\n`);
      
      // 保留最早创建的项目（第一个）
      const primaryProject = group[0];
      const duplicateProjects = group.slice(1);
      
      console.log(`   ✅ 保留主项目: ${primaryProject.id} (${primaryProject.path})`);
      console.log(`      创建时间: ${primaryProject.created_at}`);
      
      // 合并所有重复项目的会话到主项目
      for (const duplicate of duplicateProjects) {
        console.log(`\n   🔄 合并项目: ${duplicate.id} (${duplicate.path})`);
        console.log(`      创建时间: ${duplicate.created_at}`);
        
        // 获取该项目的所有会话
        const sessions = db.prepare('SELECT * FROM sessions WHERE project_id = ?').all(duplicate.id);
        console.log(`      会话数量: ${sessions.length}`);
        
        if (sessions.length > 0) {
          // 将会话转移到主项目
          const updateSessions = db.prepare('UPDATE sessions SET project_id = ? WHERE project_id = ?');
          const result = updateSessions.run(primaryProject.id, duplicate.id);
          console.log(`      ✓ 已转移 ${result.changes} 个会话`);
        }
        
        // 删除重复的项目记录
        const deleteProject = db.prepare('DELETE FROM projects WHERE id = ?');
        deleteProject.run(duplicate.id);
        console.log(`      ✓ 已删除重复项目记录`);
        
        mergedCount++;
      }
      
      // 更新主项目路径为规范化路径（Windows上为小写）
      if (primaryProject.path !== normalizedPath) {
        const updatePath = db.prepare('UPDATE projects SET path = ? WHERE id = ?');
        updatePath.run(normalizedPath, primaryProject.id);
        console.log(`\n   ✓ 已更新主项目路径: ${primaryProject.path} → ${normalizedPath}`);
        updatedCount++;
      }
      
      console.log('\n' + '─'.repeat(80) + '\n');
    } else if (process.platform === 'win32' && group[0].path !== normalizedPath) {
      // 单个项目但路径需要规范化
      const project = group[0];
      const updatePath = db.prepare('UPDATE projects SET path = ? WHERE id = ?');
      updatePath.run(normalizedPath, project.id);
      console.log(`✓ 规范化路径: ${project.path} → ${normalizedPath}`);
      updatedCount++;
    }
  }

  // 提交事务
  db.exec('COMMIT');

  console.log('\n✅ 修复完成!\n');
  console.log(`📊 统计信息:`);
  console.log(`   - 合并的重复项目: ${mergedCount}`);
  console.log(`   - 更新的路径: ${updatedCount}`);
  console.log(`   - 当前项目总数: ${projectGroups.size}`);
  
  // 显示修复后的项目列表
  console.log('\n📋 当前项目列表:\n');
  const finalProjects = db.prepare('SELECT id, name, path, created_at FROM projects ORDER BY created_at ASC').all();
  
  for (const project of finalProjects) {
    const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE project_id = ?').get(project.id).count;
    console.log(`   ${project.name}`);
    console.log(`   路径: ${project.path}`);
    console.log(`   会话: ${sessionCount} 个`);
    console.log(`   创建: ${project.created_at}`);
    console.log('');
  }

} catch (error) {
  // 回滚事务
  db.exec('ROLLBACK');
  console.error('\n❌ 修复失败，已回滚所有更改\n');
  console.error(error);
  process.exit(1);
} finally {
  db.close();
}

