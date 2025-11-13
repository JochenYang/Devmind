/**
 * 项目根目录查找器
 * 
 * 用于从任意子目录向上查找真实的项目根目录，避免在同一项目的不同子目录创建多个会话ID
 * 
 * 检测策略（按优先级）：
 * 1. .git 目录（最高优先级）
 * 2. 项目配置文件（package.json, pyproject.toml, go.mod等）
 * 3. 如果都没找到，返回传入的路径本身
 */

import { existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { normalizeProjectPath } from './path-normalizer.js';

/**
 * 项目根目录标识文件
 * 按优先级排序
 */
const PROJECT_ROOT_INDICATORS = [
  // Git 仓库（最高优先级）
  '.git',
  
  // 主要项目配置文件
  'package.json',      // Node.js
  'pyproject.toml',    // Python (Poetry)
  'setup.py',          // Python (setuptools)
  'requirements.txt',  // Python
  'go.mod',            // Go
  'Cargo.toml',        // Rust
  'pom.xml',           // Java (Maven)
  'build.gradle',      // Java/Kotlin (Gradle)
  'composer.json',     // PHP
  'Gemfile',           // Ruby
  'mix.exs',           // Elixir
  'pubspec.yaml',      // Dart/Flutter
  'Pipfile',           // Python (Pipenv)
  'yarn.lock',         // Node.js (Yarn)
  'pnpm-lock.yaml',    // Node.js (pnpm)
  'poetry.lock',       // Python (Poetry)
];

/**
 * 从给定路径向上查找项目根目录
 * 
 * @param startPath 起始路径（可以是子目录）
 * @param maxDepth 最大向上查找层数（默认10层，避免无限循环）
 * @returns 项目根目录的绝对路径
 */
export function findProjectRoot(startPath: string, maxDepth: number = 10): string {
  const normalizedPath = normalizeProjectPath(startPath);
  
  // 验证路径存在
  if (!existsSync(normalizedPath)) {
    return normalizedPath;
  }
  
  // 如果是文件，从其父目录开始查找
  let currentPath = normalizedPath;
  try {
    const stats = statSync(currentPath);
    if (stats.isFile()) {
      currentPath = dirname(currentPath);
    }
  } catch (error) {
    return normalizedPath;
  }
  
  // 向上查找项目根目录
  let depth = 0;
  let previousPath = '';
  
  while (depth < maxDepth && currentPath !== previousPath) {
    // 检查是否存在项目根标识文件
    for (const indicator of PROJECT_ROOT_INDICATORS) {
      const indicatorPath = join(currentPath, indicator);
      
      if (existsSync(indicatorPath)) {
        console.error(`[ProjectRootFinder] Found project root at: ${currentPath} (indicator: ${indicator})`);
        return currentPath;
      }
    }
    
    // 移动到父目录
    previousPath = currentPath;
    currentPath = dirname(currentPath);
    depth++;
    
    // Windows 盘符检测（到达根目录）
    if (/^[a-zA-Z]:\\?$/.test(currentPath)) {
      break;
    }
    
    // Unix 根目录检测
    if (currentPath === '/') {
      break;
    }
  }
  
  // 未找到项目根标识，返回原始路径
  console.error(`[ProjectRootFinder] No project root found, using original path: ${normalizedPath}`);
  return normalizedPath;
}

/**
 * 检查路径是否为项目根目录
 */
export function isProjectRoot(path: string): boolean {
  const normalizedPath = normalizeProjectPath(path);
  
  return PROJECT_ROOT_INDICATORS.some(indicator => {
    const indicatorPath = join(normalizedPath, indicator);
    return existsSync(indicatorPath);
  });
}

/**
 * 获取项目根目录标识符（用于调试）
 */
export function getProjectRootIndicator(path: string): string | null {
  const normalizedPath = normalizeProjectPath(path);
  
  for (const indicator of PROJECT_ROOT_INDICATORS) {
    const indicatorPath = join(normalizedPath, indicator);
    if (existsSync(indicatorPath)) {
      return indicator;
    }
  }
  
  return null;
}
