import { resolve } from 'path';

/**
 * 规范化项目路径，确保在Windows上路径大小写一致
 * 
 * 问题：Windows文件系统不区分大小写，但SQLite字符串比较区分大小写
 * 例如：'D:\codes\project' 和 'd:\codes\project' 在Windows上是同一个路径
 * 但在SQLite中会被视为不同的字符串，导致创建重复的项目记录
 * 
 * 解决方案：在Windows上统一将路径转换为小写
 * 
 * @param projectPath - 原始项目路径
 * @returns 规范化后的路径
 */
export function normalizeProjectPath(projectPath: string): string {
  // 首先使用Node.js的resolve进行路径规范化
  let normalizedPath = resolve(projectPath);
  
  // 在Windows平台上，统一转换为小写以避免大小写不一致问题
  if (process.platform === 'win32') {
    normalizedPath = normalizedPath.toLowerCase();
  }
  
  return normalizedPath;
}

/**
 * 将路径转换为 Unix 风格（正斜杠），用于 glob 模式匹配
 * 
 * 许多文件扫描库（如 glob）需要使用正斜杠路径
 * Windows 反斜杠路径会导致匹配失败
 * 
 * @param path - 原始路径
 * @returns Unix 风格路径
 */
export function toUnixPath(path: string): string {
  return path.replace(/\\/g, '/');
}

