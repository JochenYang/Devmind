import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

/**
 * 项目语言检测器
 * 通过分析代码注释和文档来判断项目主要使用的语言
 */
export class LanguageDetector {
  private chinesePattern = /[\u4e00-\u9fa5]/g;
  private codeExtensions = [
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".php",
    ".rb",
    ".c",
    ".cpp",
    ".cs",
    ".swift",
    ".dart",
    ".vue",
  ];

  /**
   * 检测项目语言（用于 record_context 记录内容语言）
   * @param projectPath 项目路径
   * @param conversationLanguage 可选的对话语言（从用户对话中检测）
   * @returns 'zh' | 'en'
   */
  detectProjectLanguage(
    projectPath: string,
    conversationLanguage?: "zh" | "en"
  ): "zh" | "en" {
    // 1. 对话语言（最高优先级）
    if (conversationLanguage) {
      return conversationLanguage;
    }

    // 2. 从 README 检测（权重高于代码注释）
    const readmeLanguage = this.detectFromReadme(projectPath);
    if (readmeLanguage) {
      return readmeLanguage;
    }

    // 3. 从代码注释检测
    const commentLanguage = this.detectFromComments(projectPath);
    if (commentLanguage) {
      return commentLanguage;
    }

    // 4. 默认英文
    return "en";
  }

  /**
   * 从代码注释检测语言
   */
  private detectFromComments(projectPath: string): "zh" | "en" | null {
    try {
      const codeFiles = this.findCodeFiles(projectPath, 20); // 最多扫描 20 个文件
      let totalComments = "";

      for (const file of codeFiles) {
        try {
          const content = readFileSync(file, "utf-8");
          const comments = this.extractComments(content);
          totalComments += comments;

          // 如果已经收集了足够的注释（超过 500 字符），提前判断
          if (totalComments.length > 500) {
            break;
          }
        } catch (error) {
          // 跳过无法读取的文件
          continue;
        }
      }

      if (totalComments.length < 50) {
        return null; // 注释太少，无法判断
      }

      return this.detectLanguageFromText(totalComments);
    } catch (error) {
      return null;
    }
  }

  /**
   * 从 README 检测语言（支持多种中文文档路径）
   */
  private detectFromReadme(projectPath: string): "zh" | "en" | null {
    // 优先级顺序：明确的中文标识 > 根目录 README > docs 目录
    const readmePaths = [
      // 1. 明确的中文 README（根目录）
      "README.zh-CN.md",
      "README.zh.md",
      "README_CN.md",
      "README_ZH.md",
      // 2. docs 目录中的中文文档
      "docs/zh/README.md",
      "docs/zh-CN/README.md",
      "docs/README.zh.md",
      "docs/README.zh-CN.md",
      "doc/zh/README.md",
      // 3. 根目录默认 README
      "README.md",
      "readme.md",
    ];

    for (const relativePath of readmePaths) {
      const fullPath = join(projectPath, relativePath);
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          // 只取前 2000 字符判断（增加样本量）
          const sample = content.substring(0, 2000);
          const detectedLang = this.detectLanguageFromText(sample);
          
          // 如果检测到中文，立即返回
          if (detectedLang === "zh") {
            return "zh";
          }
          
          // 如果是明确的中文文档路径，即使占比不足 30% 也认为是中文项目
          if (relativePath.includes("/zh/") || 
              relativePath.includes("-CN") || 
              relativePath.includes("_CN") ||
              relativePath.includes(".zh.")) {
            return "zh";
          }
        } catch (error) {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * 从文本检测语言
   */
  private detectLanguageFromText(text: string): "zh" | "en" {
    const chineseChars = text.match(this.chinesePattern);
    const chineseCount = chineseChars ? chineseChars.length : 0;

    // 移除空白字符后的总字符数
    const totalChars = text.replace(/\s/g, "").length;

    if (totalChars === 0) {
      return "en";
    }

    // 如果中文字符占比超过 30%，判定为中文
    const chineseRatio = chineseCount / totalChars;
    return chineseRatio > 0.3 ? "zh" : "en";
  }

  /**
   * 查找代码文件
   */
  private findCodeFiles(dir: string, maxFiles: number): string[] {
    const files: string[] = [];

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        if (files.length >= maxFiles) {
          break;
        }

        // 跳过常见的忽略目录
        if (this.shouldIgnoreDir(entry)) {
          continue;
        }

        const fullPath = join(dir, entry);

        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            // 递归查找子目录
            const subFiles = this.findCodeFiles(
              fullPath,
              maxFiles - files.length
            );
            files.push(...subFiles);
          } else if (stat.isFile() && this.isCodeFile(entry)) {
            files.push(fullPath);
          }
        } catch (error) {
          // 跳过无法访问的文件/目录
          continue;
        }
      }
    } catch (error) {
      // 目录不存在或无法读取
    }

    return files;
  }

  /**
   * 判断是否应该忽略的目录
   */
  private shouldIgnoreDir(dirname: string): boolean {
    const ignoreDirs = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      ".next",
      ".nuxt",
      "out",
      "target",
      "vendor",
      "__pycache__",
      ".venv",
      "venv",
    ];
    return ignoreDirs.includes(dirname) || dirname.startsWith(".");
  }

  /**
   * 判断是否是代码文件
   */
  private isCodeFile(filename: string): boolean {
    const ext = extname(filename);
    return this.codeExtensions.includes(ext);
  }

  /**
   * 提取代码注释
   */
  private extractComments(code: string): string {
    let comments = "";

    // 提取单行注释 // ...
    const singleLineComments = code.match(/\/\/.*$/gm);
    if (singleLineComments) {
      comments += singleLineComments.join("\n");
    }

    // 提取多行注释 /* ... */
    const multiLineComments = code.match(/\/\*[\s\S]*?\*\//g);
    if (multiLineComments) {
      comments += multiLineComments.join("\n");
    }

    // 提取 Python/Shell 注释 # ...
    const hashComments = code.match(/#.*$/gm);
    if (hashComments) {
      comments += hashComments.join("\n");
    }

    return comments;
  }

  /**
   * 获取本地化文本
   */
  getLocalizedText(language: "zh" | "en", key: string): string {
    const texts: Record<string, Record<string, string>> = {
      file_change: {
        zh: "修改文件",
        en: "File changed",
      },
      file_deleted: {
        zh: "文件已删除",
        en: "File deleted",
      },
      cannot_read_file: {
        zh: "无法读取文件内容",
        en: "Cannot read file content",
      },
      git_commit: {
        zh: "Git 提交",
        en: "Git commit",
      },
      terminal_command: {
        zh: "终端命令",
        en: "Terminal command",
      },
    };

    return texts[key]?.[language] || texts[key]?.["en"] || key;
  }
}

// 单例导出
export const languageDetector = new LanguageDetector();
