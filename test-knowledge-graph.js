/**
 * 测试知识图谱生成 - ECharts 版本
 * Test Knowledge Graph Generation - ECharts Version
 */

import { DatabaseManager } from './dist/database.js';
import { MemoryGraphGenerator } from './dist/memory-graph/index.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testGraphGeneration() {
  console.log('🧪 Testing ECharts Knowledge Graph Generation...\n');
  
  try {
    // 初始化数据库（使用用户主目录）
    const dbPath = join(process.env.USERPROFILE || process.env.HOME, '.devmind', 'memory.db');
    console.log(`📂 Database: ${dbPath}`);
    const db = new DatabaseManager(dbPath);
    
    // 获取所有项目
    const projects = db.getAllProjects();
    console.log(`\n📊 Found ${projects.length} projects:\n`);
    
    projects.forEach((project, idx) => {
      const contexts = db.getContextsByProject(project.id);
      console.log(`  ${idx + 1}. ${project.name}`);
      console.log(`     Path: ${project.path}`);
      console.log(`     Contexts: ${contexts.length}`);
      console.log(`     ID: ${project.id}\n`);
    });
    
    if (projects.length === 0) {
      console.log('❌ No projects found!');
      return;
    }
    
    // 使用第一个项目测试
    const testProject = projects[0];
    console.log(`\n🎯 Testing with project: ${testProject.name}`);
    console.log(`   ID: ${testProject.id}\n`);
    
    // 生成知识图谱
    console.log('📊 Generating knowledge graph...');
    const generator = new MemoryGraphGenerator(db);
    
    const result = await generator.generateGraph(testProject.id, {
      max_nodes: 0, // 显示所有节点
      focus_type: 'all'
    });
    
    console.log('\n✅ Knowledge Graph Generated Successfully!');
    console.log(`\n📁 Output File: ${result.file_path}`);
    console.log(`\n🌐 Open in browser:`);
    console.log(`   file:///${result.file_path.replace(/\\/g, '/')}`);
    
    // 统计信息
    const contexts = db.getContextsByProject(testProject.id);
    const typeStats = {};
    contexts.forEach(ctx => {
      typeStats[ctx.type] = (typeStats[ctx.type] || 0) + 1;
    });
    
    console.log(`\n📈 Statistics:`);
    console.log(`   Total Contexts: ${contexts.length}`);
    console.log(`   Type Distribution:`);
    Object.entries(typeStats).forEach(([type, count]) => {
      console.log(`     - ${type}: ${count}`);
    });
    
    console.log(`\n💡 Features to Test:`);
    console.log(`   1. Open the file in your browser`);
    console.log(`   2. Test zoom & pan (mouse wheel + drag)`);
    console.log(`   3. Test node hover tooltips`);
    console.log(`   4. Test search functionality (搜索支持中文)`);
    console.log(`   5. Test type filter`);
    console.log(`   6. Test language toggle (中文/English)`);
    console.log(`   7. Test show/hide labels`);
    console.log(`   8. Test adjacency highlight on node hover`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
testGraphGeneration();
