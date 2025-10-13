#!/usr/bin/env node

/**
 * 测试智能文件路径检测功能
 */

import { createFilePathDetector } from './dist/utils/file-path-detector.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testFilePathDetection() {
  console.log('🧪 Testing File Path Detection\n');

  const projectPath = __dirname; // 使用当前项目作为测试
  const detector = createFilePathDetector(projectPath);

  // 测试场景 1: 检测 Git 修改的文件
  console.log('📝 Test 1: Git Status Detection');
  try {
    const suggestions1 = await detector.detectFilePath({
      projectPath,
      content: 'Testing git status detection',
      recentContexts: []
    });

    console.log(`Found ${suggestions1.length} suggestions:`);
    suggestions1.forEach((s, i) => {
      console.log(`  ${i + 1}. ${detector.getRelativePath(s.path)}`);
      console.log(`     Confidence: ${Math.round(s.confidence * 100)}%`);
      console.log(`     Source: ${s.source}`);
      console.log(`     Reason: ${s.reason}\n`);
    });
  } catch (error) {
    console.error('❌ Test 1 failed:', error.message);
  }

  // 测试场景 2: 从内容中检测文件路径
  console.log('\n📝 Test 2: Content Analysis');
  const codeContent = `
    // 在 src/mcp-server.ts 中修改了处理逻辑
    import { createFilePathDetector } from './utils/file-path-detector.js';
    
    function handleRecordContext() {
      // 实现代码...
    }
  `;

  try {
    const suggestions2 = await detector.detectFilePath({
      projectPath,
      content: codeContent,
      recentContexts: []
    });

    console.log(`Found ${suggestions2.length} suggestions:`);
    suggestions2.forEach((s, i) => {
      if (s.path) {
        console.log(`  ${i + 1}. ${detector.getRelativePath(s.path)}`);
        console.log(`     Confidence: ${Math.round(s.confidence * 100)}%`);
        console.log(`     Source: ${s.source}`);
        console.log(`     Reason: ${s.reason}\n`);
      }
    });
  } catch (error) {
    console.error('❌ Test 2 failed:', error.message);
  }

  // 测试场景 3: 从上下文推断
  console.log('\n📝 Test 3: Context Inference');
  const recentContexts = [
    {
      file_path: join(projectPath, 'src/database.ts'),
      content: 'Database operations...',
      created_at: new Date(Date.now() - 60000).toISOString()
    },
    {
      file_path: join(projectPath, 'src/mcp-server.ts'),
      content: 'MCP server implementation...',
      created_at: new Date(Date.now() - 120000).toISOString()
    }
  ];

  try {
    const suggestions3 = await detector.detectFilePath({
      projectPath,
      content: 'Some new code without file path',
      recentContexts
    });

    console.log(`Found ${suggestions3.length} suggestions:`);
    suggestions3.forEach((s, i) => {
      console.log(`  ${i + 1}. ${detector.getRelativePath(s.path)}`);
      console.log(`     Confidence: ${Math.round(s.confidence * 100)}%`);
      console.log(`     Source: ${s.source}`);
      console.log(`     Reason: ${s.reason}\n`);
    });
  } catch (error) {
    console.error('❌ Test 3 failed:', error.message);
  }

  console.log('\n✅ All tests completed!');
}

testFilePathDetection().catch(console.error);
