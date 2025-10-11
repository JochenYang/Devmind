/**
 * DevMind MCP 智能项目索引功能 - 安全策略模块
 * 
 * 实现敏感文件检测、内容过滤和文件验证功能
 */

import { 
  ISecurityStrategy, 
  ProjectFile, 
  IndexingConfig, 
  DEFAULT_INDEXING_CONFIG 
} from '../types/IndexingTypes';
import * as path from 'path';

/**
 * 安全策略实现类
 */
export class SecurityStrategy implements ISecurityStrategy {
  private config: IndexingConfig;
  private sensitiveExtensions!: Set<string>;
  private sensitiveKeywords!: string[];
  private sensitiveFilenames!: string[];

  constructor(config: IndexingConfig = DEFAULT_INDEXING_CONFIG) {
    this.config = config;
    this.initializeSensitivePatterns();
  }

  /**
   * 初始化敏感文件模式
   */
  private initializeSensitivePatterns(): void {
    // 敏感文件扩展名
    this.sensitiveExtensions = new Set([
      '.key', '.pem', '.p12', '.pfx', '.crt', '.cer',
      '.jks', '.keystore', '.ppk', '.rsa', '.ssh',
      '.gpg', '.asc', '.sig'
    ]);

    // 敏感关键词
    this.sensitiveKeywords = [
      'password', 'passwd', 'pwd', 'secret', 'token',
      'api_key', 'apikey', 'access_key', 'private_key',
      'credential', 'auth', 'oauth', 'jwt', 'session',
      'cookie', 'hash', 'salt', 'encryption', 'decrypt',
      'database_url', 'db_password', 'connection_string',
      'aws_access', 'azure_', 'google_', 'github_token'
    ];

    // 敏感文件名
    this.sensitiveFilenames = [
      '.env', '.env.local', '.env.production', '.env.development',
      'secrets.json', 'credentials.json', 'config.json',
      'private.json', 'auth.json', 'keys.json',
      'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
      '.htpasswd', '.htaccess', 'shadow', 'passwd',
      'authorized_keys', 'known_hosts'
    ];
  }

  /**
   * 检查文件是否为敏感文件
   */
  public isSensitive(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath).toLowerCase();
    const filename = path.basename(normalizedPath);
    const extension = path.extname(normalizedPath);
    const dirname = path.dirname(normalizedPath);

    // 1. 检查配置中的敏感模式
    if (this.matchesPatterns(normalizedPath, this.config.sensitivePatterns)) {
      return true;
    }

    // 2. 检查文件扩展名
    if (this.sensitiveExtensions.has(extension)) {
      return true;
    }

    // 3. 检查文件名
    if (this.sensitiveFilenames.some(sensitiveName => 
      filename.includes(sensitiveName) || filename === sensitiveName)) {
      return true;
    }

    // 4. 检查目录路径
    if (this.containsSensitiveDirectory(dirname)) {
      return true;
    }

    // 5. 检查关键词
    if (this.containsSensitiveKeywords(filename)) {
      return true;
    }

    return false;
  }

  /**
   * 过滤和清理文件内容
   */
  public sanitizeContent(content: string): string {
    if (!content || content.length === 0) {
      return content;
    }

    let sanitizedContent = content;

    try {
      // 1. 移除明显的密码和令牌
      sanitizedContent = this.removeCredentials(sanitizedContent);

      // 2. 移除URL中的敏感参数
      sanitizedContent = this.removeSensitiveUrls(sanitizedContent);

      // 3. 移除IP地址和端口信息
      sanitizedContent = this.removeNetworkInfo(sanitizedContent);

      // 4. 移除文件路径中的用户信息
      sanitizedContent = this.removePersonalPaths(sanitizedContent);

      // 5. 移除环境变量设置
      sanitizedContent = this.removeEnvironmentVariables(sanitizedContent);

    } catch (error) {
      console.warn('内容清理过程中出现错误:', error);
      // 如果清理失败，返回截断的内容以确保安全
      return content.substring(0, Math.min(content.length, 500)) + '... [内容已截断]';
    }

    return sanitizedContent;
  }

  /**
   * 验证文件是否可以安全索引
   */
  public validateFile(file: ProjectFile): boolean {
    try {
      // 1. 检查文件是否被标记为敏感
      if (file.isSensitive) {
        return false;
      }

      // 2. 检查文件大小限制
      if (file.size > this.config.maxFileSize) {
        return false;
      }

      // 3. 检查文件扩展名是否安全
      if (this.sensitiveExtensions.has(file.extension.toLowerCase())) {
        return false;
      }

      // 4. 检查文件路径是否包含敏感信息
      if (this.isSensitive(file.path)) {
        return false;
      }

      // 5. 检查文件名是否合规
      if (this.isFilenameSuspicious(file.name)) {
        return false;
      }

      return true;

    } catch (error) {
      console.warn(`文件验证失败: ${file.path}`, error);
      return false;
    }
  }

  /**
   * 检查是否匹配敏感文件模式
   */
  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      try {
        const regexPattern = this.globToRegex(pattern);
        return new RegExp(regexPattern, 'i').test(filePath);
      } catch (error) {
        console.warn(`模式匹配错误: ${pattern}`, error);
        return false;
      }
    });
  }

  /**
   * 将glob模式转换为正则表达式
   */
  private globToRegex(glob: string): string {
    return glob
      .replace(/\*\*/g, '.*')  // ** 匹配任意路径
      .replace(/\*/g, '[^/]*') // * 匹配除路径分隔符外的任意字符
      .replace(/\?/g, '[^/]')  // ? 匹配单个字符
      .replace(/\./g, '\\.')   // 转义点号
      .replace(/\//g, '[\\\\/]'); // 路径分隔符兼容
  }

  /**
   * 检查目录是否包含敏感路径
   */
  private containsSensitiveDirectory(dirname: string): boolean {
    const sensitiveDirs = [
      'private', 'confidential', 'secret', 'credentials',
      'keys', 'certs', 'certificates', 'auth', 'oauth',
      '.ssh', '.gnupg', '.aws', '.azure', '.gcp',
      'passwords', 'tokens', 'secrets'
    ];

    const pathParts = dirname.split(path.sep);
    return pathParts.some(part => 
      sensitiveDirs.some(sensitiveDir => 
        part.toLowerCase().includes(sensitiveDir)
      )
    );
  }

  /**
   * 检查文件名是否包含敏感关键词
   */
  private containsSensitiveKeywords(filename: string): boolean {
    const lowerFilename = filename.toLowerCase();
    return this.sensitiveKeywords.some(keyword => 
      lowerFilename.includes(keyword.toLowerCase())
    );
  }

  /**
   * 移除内容中的凭证信息
   */
  private removeCredentials(content: string): string {
    // 移除常见的密码和令牌模式
    const credentialPatterns = [
      /password\s*[:=]\s*["'][^"']*["']/gi,
      /token\s*[:=]\s*["'][^"']*["']/gi,
      /api[_-]?key\s*[:=]\s*["'][^"']*["']/gi,
      /secret\s*[:=]\s*["'][^"']*["']/gi,
      /access[_-]?key\s*[:=]\s*["'][^"']*["']/gi,
      /private[_-]?key\s*[:=]\s*["'][^"']*["']/gi,
      /-----BEGIN [^-]*-----[\s\S]*?-----END [^-]*-----/gi,
      /[a-zA-Z0-9]{32,}/g // 长的十六进制字符串（可能是哈希或令牌）
    ];

    return credentialPatterns.reduce((sanitized, pattern) => {
      return sanitized.replace(pattern, '[REDACTED]');
    }, content);
  }

  /**
   * 移除敏感URL信息
   */
  private removeSensitiveUrls(content: string): string {
    // 移除包含认证信息的URL
    const urlPatterns = [
      /https?:\/\/[^:\/\s]+:[^@\/\s]+@[^\s]*/gi,
      /[?&](api[_-]?key|token|secret|password)=[^&\s]*/gi,
      /mongodb:\/\/[^:\/\s]+:[^@\/\s]+@[^\s]*/gi,
      /postgres:\/\/[^:\/\s]+:[^@\/\s]+@[^\s]*/gi
    ];

    return urlPatterns.reduce((sanitized, pattern) => {
      return sanitized.replace(pattern, '[REDACTED_URL]');
    }, content);
  }

  /**
   * 移除网络信息
   */
  private removeNetworkInfo(content: string): string {
    // 移除IP地址和端口信息
    const networkPatterns = [
      /\b(?:\d{1,3}\.){3}\d{1,3}:\d+\b/g, // IP:端口
      /\b(?:\d{1,3}\.){3}\d{1,3}\b(?=.*(?:server|host|database|redis|mongo))/gi // 可能是服务器的IP
    ];

    return networkPatterns.reduce((sanitized, pattern) => {
      return sanitized.replace(pattern, '[REDACTED_NETWORK]');
    }, content);
  }

  /**
   * 移除个人路径信息
   */
  private removePersonalPaths(content: string): string {
    // 移除包含用户名的路径
    const pathPatterns = [
      /[C-Z]:\\Users\\[^\\]+/gi,
      /\/home\/[^\/]+/gi,
      /\/Users\/[^\/]+/gi
    ];

    return pathPatterns.reduce((sanitized, pattern) => {
      return sanitized.replace(pattern, '[REDACTED_PATH]');
    }, content);
  }

  /**
   * 移除环境变量设置
   */
  private removeEnvironmentVariables(content: string): string {
    // 移除环境变量设置
    const envPatterns = [
      /export\s+[A-Z_][A-Z0-9_]*\s*=\s*["'][^"']*["']/gi,
      /set\s+[A-Z_][A-Z0-9_]*\s*=\s*["'][^"']*["']/gi,
      /[A-Z_][A-Z0-9_]*\s*=\s*["'][^"']*["'](?=.*(?:password|secret|token|key))/gi
    ];

    return envPatterns.reduce((sanitized, pattern) => {
      return sanitized.replace(pattern, '[REDACTED_ENV]');
    }, content);
  }

  /**
   * 检查文件名是否可疑
   */
  private isFilenameSuspicious(filename: string): boolean {
    const suspiciousPatterns = [
      /backup/i,
      /dump/i,
      /\.bak$/i,
      /\.old$/i,
      /\.orig$/i,
      /~$/,
      /\.(tmp|temp)$/i,
      /password/i,
      /secret/i,
      /private/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * 获取安全等级评估
   */
  public getSecurityLevel(file: ProjectFile): 'safe' | 'warning' | 'danger' {
    if (file.isSensitive || this.isSensitive(file.path)) {
      return 'danger';
    }

    if (this.isFilenameSuspicious(file.name) || 
        this.containsSensitiveKeywords(file.name)) {
      return 'warning';
    }

    return 'safe';
  }

  /**
   * 生成安全报告
   */
  public generateSecurityReport(files: ProjectFile[]): {
    safeFiles: number;
    warningFiles: number;
    dangerFiles: number;
    sensitiveFiles: string[];
    recommendations: string[];
  } {
    let safeFiles = 0;
    let warningFiles = 0;
    let dangerFiles = 0;
    const sensitiveFiles: string[] = [];
    const recommendations: string[] = [];

    files.forEach(file => {
      const level = this.getSecurityLevel(file);
      switch (level) {
        case 'safe':
          safeFiles++;
          break;
        case 'warning':
          warningFiles++;
          break;
        case 'danger':
          dangerFiles++;
          sensitiveFiles.push(file.path);
          break;
      }
    });

    // 生成建议
    if (dangerFiles > 0) {
      recommendations.push('发现敏感文件，建议从索引中排除');
    }
    if (warningFiles > 0) {
      recommendations.push('部分文件可能包含敏感信息，建议仔细审查');
    }
    if (sensitiveFiles.length > 10) {
      recommendations.push('项目包含大量敏感文件，建议调整过滤规则');
    }

    return {
      safeFiles,
      warningFiles,
      dangerFiles,
      sensitiveFiles,
      recommendations
    };
  }
}