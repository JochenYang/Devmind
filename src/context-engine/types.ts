/**
 * ContextEngine 类型定义
 */

export interface ScanOptions {
  forceReindex?: boolean;
  maxFileSize?: number; // MB
  includeExtensions?: string[];
  excludePatterns?: string[];
  skipLargeDirs?: string[];
}

export interface ScanResult {
  filePath: string;
  relativePath: string;
  content: string;
  size: number;
  language?: string;
  isBinary: boolean;
  modifiedTime: Date;
}

export interface IgnoreRule {
  source: string; // '.gitignore', '.augmentignore', 'built-in'
  patterns: string[];
  priority: number;
}

export interface IndexResult {
  totalFiles: number;
  successFiles: number;
  failedFiles: number;
  skippedFiles: number;
  duration: number; // ms
  errors?: string[];
}

export interface FileTypeInfo {
  language: string;
  fileType: 'code' | 'doc' | 'config' | 'other';
  extensions: string[];
}

export const SUPPORTED_LANGUAGES: Record<string, FileTypeInfo> = {
  'typescript': { language: 'TypeScript', fileType: 'code', extensions: ['.ts', '.tsx'] },
  'javascript': { language: 'JavaScript', fileType: 'code', extensions: ['.js', '.jsx', '.mjs'] },
  'python': { language: 'Python', fileType: 'code', extensions: ['.py'] },
  'java': { language: 'Java', fileType: 'code', extensions: ['.java'] },
  'go': { language: 'Go', fileType: 'code', extensions: ['.go'] },
  'rust': { language: 'Rust', fileType: 'code', extensions: ['.rs'] },
  'csharp': { language: 'C#', fileType: 'code', extensions: ['.cs'] },
  'cpp': { language: 'C++', fileType: 'code', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h'] },
  'c': { language: 'C', fileType: 'code', extensions: ['.c', '.h'] },
  'php': { language: 'PHP', fileType: 'code', extensions: ['.php'] },
  'ruby': { language: 'Ruby', fileType: 'code', extensions: ['.rb'] },
  'swift': { language: 'Swift', fileType: 'code', extensions: ['.swift'] },
  'kotlin': { language: 'Kotlin', fileType: 'code', extensions: ['.kt'] },
  'scala': { language: 'Scala', fileType: 'code', extensions: ['.scala'] },
  'shell': { language: 'Shell', fileType: 'code', extensions: ['.sh', '.bash', '.zsh'] },
  'sql': { language: 'SQL', fileType: 'code', extensions: ['.sql'] },
  'json': { language: 'JSON', fileType: 'config', extensions: ['.json'] },
  'yaml': { language: 'YAML', fileType: 'config', extensions: ['.yaml', '.yml'] },
  'xml': { language: 'XML', fileType: 'config', extensions: ['.xml'] },
  'markdown': { language: 'Markdown', fileType: 'doc', extensions: ['.md', '.markdown'] },
  'html': { language: 'HTML', fileType: 'doc', extensions: ['.html', '.htm'] },
  'css': { language: 'CSS', fileType: 'doc', extensions: ['.css', '.scss', '.sass'] },
};

export const DEFAULT_EXCLUDE_PATTERNS = [
  // Version control
  '**/.git/**',
  '**/.svn/**',
  '**/.hg/**',

  // Node.js
  '**/node_modules/**',
  '**/.npm/**',
  '**/package-lock.json',
  '**/yarn.lock',

  // Build outputs
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.vite/**',
  '**/target/**',
  '**/.cache/**',

  // Dependencies
  '**/vendor/**',
  '**/.composer/**',
  '**/__pycache__/**',
  '**/venv/**',
  '**/.venv/**',
  '**/env/**',

  // Logs and temporary files
  '**/*.log',
  '**/*.tmp',
  '**/*.temp',
  '**/.DS_Store',
  '**/Thumbs.db',

  // IDE files
  '**/.vscode/**',
  '**/.idea/**',
  '**/*.swp',
  '**/*.swo',

  // Coverage reports
  '**/coverage/**',
  '**/.nyc_output/**',
  '**/.pytest_cache/**',
];
