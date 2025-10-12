/**
 * DevMind MCP 智能项目索引功能 - 项目分析器
 * 
 * 提供项目特征分析和结构识别功能
 */

import { 
  ProjectFeatures,
  ProjectStructure,
  ProjectComplexity,
  TechnicalStack,
  GitInfo,
  ProjectFile
} from '../types/IndexingTypes.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 项目分析器类
 */
export class ProjectAnalyzer {

  /**
   * 全面分析项目特征
   */
  public async analyzeProject(projectPath: string, files: ProjectFile[]): Promise<{
    structure: ProjectStructure;
    features: ProjectFeatures;
  }> {
    console.log(`开始分析项目: ${projectPath}`);
    const startTime = Date.now();
    
    try {
      // 分析项目结构
      const structure = await this.analyzeProjectStructure(projectPath, files);
      
      // 分析技术栈
      const technicalStack = this.analyzeTechnicalStack(files);
      
      // 分析项目复杂度
      const complexity = this.analyzeComplexity(files, structure);
      
      // 识别项目类型和架构
      const projectType = this.identifyProjectType(files, technicalStack);
      const architecture = this.identifyArchitecture(files, technicalStack);
      
      // 构建项目特征
      const features: ProjectFeatures = {
        projectType,
        architecture,
        technicalStack,
        complexity,
        metadata: {
          analysisTime: Date.now() - startTime,
          fileCount: files.length,
          analyzedAt: new Date().toISOString()
        }
      };
      
      console.log(`项目分析完成，类型: ${projectType}，复杂度: ${complexity.level}，耗时: ${Date.now() - startTime}ms`);
      
      return { structure, features };
      
    } catch (error) {
      console.error('项目分析失败:', error);
      throw error;
    }
  }

  /**
   * 分析项目结构
   */
  public async analyzeProjectStructure(projectPath: string, files: ProjectFile[]): Promise<ProjectStructure> {
    const projectName = path.basename(projectPath);
    const directories = this.extractDirectoryStructure(files);
    const gitInfo = await this.analyzeGitInfo(projectPath);
    
    // 识别主要编程语言
    const language = this.identifyMainLanguage(files);
    
    // 识别框架
    const framework = this.identifyFramework(files);
    
    // 识别构建工具
    const buildTools = this.identifyBuildTools(files);
    
    // 识别依赖
    const dependencies = await this.extractDependencies(files);
    
    return {
      rootPath: projectPath,
      name: projectName,
      totalFiles: files.length,
      selectedFiles: files,
      directories,
      gitInfo,
      language,
      framework,
      buildTools,
      dependencies
    };
  }

  /**
   * 分析技术栈
   */
  public analyzeTechnicalStack(files: ProjectFile[]): TechnicalStack {
    const language = this.identifyMainLanguage(files);
    const framework = this.identifyFramework(files);
    const database = this.identifyDatabase(files);
    const cloudServices = this.identifyCloudServices(files);
    const devTools = this.identifyDevTools(files);
    const runtime = this.identifyRuntime(files, language);
    
    return {
      language,
      framework,
      database,
      cloudServices,
      devTools,
      runtime
    };
  }

  /**
   * 分析项目复杂度
   */
  public analyzeComplexity(files: ProjectFile[], structure: ProjectStructure): ProjectComplexity {
    const factors = {
      fileCount: files.length,
      codeLines: this.estimateCodeLines(files),
      dependencyCount: structure.dependencies.length,
      moduleCount: this.countModules(files)
    };
    
    // 计算复杂度评分
    let score = 0;
    
    // 文件数量影响 (0-25分)
    score += Math.min(25, factors.fileCount / 10);
    
    // 代码行数影响 (0-30分)
    score += Math.min(30, factors.codeLines / 1000);
    
    // 依赖数量影响 (0-25分)
    score += Math.min(25, factors.dependencyCount / 2);
    
    // 模块数量影响 (0-20分)
    score += Math.min(20, factors.moduleCount / 5);
    
    // 确定复杂度级别
    let level: 'low' | 'medium' | 'high';
    if (score < 30) {
      level = 'low';
    } else if (score < 70) {
      level = 'medium';
    } else {
      level = 'high';
    }
    
    return {
      level,
      factors,
      score: Math.round(score)
    };
  }

  // 私有分析方法

  private identifyMainLanguage(files: ProjectFile[]): string {
    const languageCount = new Map<string, number>();
    
    files.forEach(file => {
      const language = this.getLanguageFromExtension(file.extension);
      if (language) {
        languageCount.set(language, (languageCount.get(language) || 0) + 1);
      }
    });
    
    // 返回最常见的语言
    let maxCount = 0;
    let mainLanguage = 'Unknown';
    
    for (const [language, count] of languageCount) {
      if (count > maxCount) {
        maxCount = count;
        mainLanguage = language;
      }
    }
    
    return mainLanguage;
  }

  private identifyFramework(files: ProjectFile[]): string | undefined {
    const frameworks = new Map<string, string[]>([
      ['React', ['react', 'jsx', 'tsx', '.jsx', '.tsx']],
      ['Vue', ['vue', '@vue', '.vue']],
      ['Angular', ['@angular', 'angular.json']],
      ['Express', ['express', 'app.js', 'server.js']],
      ['Django', ['django', 'manage.py', 'settings.py']],
      ['Flask', ['flask', 'app.py']],
      ['Spring', ['spring', 'pom.xml', 'application.properties']],
      ['Laravel', ['laravel', 'artisan', 'composer.json']],
      ['Rails', ['rails', 'Gemfile', 'config.ru']],
      ['Next.js', ['next', '.next', 'next.config.js']],
      ['Nuxt.js', ['nuxt', '.nuxt', 'nuxt.config.js']],
      ['Gatsby', ['gatsby', 'gatsby-config.js']],
      ['React Native', ['react-native', 'metro.config.js']],
      ['Flutter', ['flutter', 'pubspec.yaml']],
      ['Docker', ['Dockerfile', 'docker-compose']],
      ['Kubernetes', ['kubernetes', '.k8s', 'kubectl']]
    ]);
    
    for (const [framework, indicators] of frameworks) {
      for (const indicator of indicators) {
        const hasIndicator = files.some(file => 
          file.name.toLowerCase().includes(indicator.toLowerCase()) ||
          file.relativePath.toLowerCase().includes(indicator.toLowerCase()) ||
          file.extension.toLowerCase() === indicator.toLowerCase()
        );
        
        if (hasIndicator) {
          return framework;
        }
      }
    }
    
    return undefined;
  }

  private identifyDatabase(files: ProjectFile[]): string[] | undefined {
    const databases: string[] = [];
    const dbIndicators = new Map<string, string[]>([
      ['MySQL', ['mysql', 'my.cnf']],
      ['PostgreSQL', ['postgresql', 'postgres', 'psql', '.pg']],
      ['MongoDB', ['mongodb', 'mongo', '.mongo']],
      ['Redis', ['redis', '.redis']],
      ['SQLite', ['sqlite', '.db', '.sqlite']],
      ['Oracle', ['oracle', '.ora']],
      ['SQL Server', ['sqlserver', 'mssql']],
      ['Elasticsearch', ['elasticsearch', 'elastic']]
    ]);
    
    for (const [db, indicators] of dbIndicators) {
      for (const indicator of indicators) {
        const hasIndicator = files.some(file =>
          file.name.toLowerCase().includes(indicator) ||
          file.relativePath.toLowerCase().includes(indicator)
        );
        
        if (hasIndicator) {
          databases.push(db);
          break;
        }
      }
    }
    
    return databases.length > 0 ? databases : undefined;
  }

  private identifyCloudServices(files: ProjectFile[]): string[] | undefined {
    const services: string[] = [];
    const serviceIndicators = new Map<string, string[]>([
      ['AWS', ['aws', 'amazon', 's3', 'lambda', 'ec2']],
      ['Azure', ['azure', 'microsoft']],
      ['Google Cloud', ['gcp', 'google-cloud', 'firebase']],
      ['Heroku', ['heroku', 'Procfile']],
      ['Vercel', ['vercel', '.vercel']],
      ['Netlify', ['netlify', '_redirects']],
      ['DigitalOcean', ['digitalocean', 'droplet']]
    ]);
    
    for (const [service, indicators] of serviceIndicators) {
      for (const indicator of indicators) {
        const hasIndicator = files.some(file =>
          file.name.toLowerCase().includes(indicator) ||
          file.relativePath.toLowerCase().includes(indicator)
        );
        
        if (hasIndicator) {
          services.push(service);
          break;
        }
      }
    }
    
    return services.length > 0 ? services : undefined;
  }

  private identifyDevTools(files: ProjectFile[]): string[] {
    const tools: string[] = [];
    const toolIndicators = new Map<string, string[]>([
      ['Webpack', ['webpack', 'webpack.config']],
      ['Vite', ['vite', 'vite.config']],
      ['Babel', ['babel', '.babelrc', 'babel.config']],
      ['ESLint', ['eslint', '.eslintrc']],
      ['Prettier', ['prettier', '.prettierrc']],
      ['TypeScript', ['typescript', 'tsconfig.json']],
      ['Jest', ['jest', 'jest.config']],
      ['Cypress', ['cypress', 'cypress.json']],
      ['Docker', ['docker', 'Dockerfile']],
      ['Git', ['.git', '.gitignore']],
      ['npm', ['package.json', 'package-lock.json']],
      ['Yarn', ['yarn.lock', '.yarnrc']],
      ['pip', ['requirements.txt', 'Pipfile']],
      ['Maven', ['pom.xml']],
      ['Gradle', ['build.gradle', 'gradle.properties']]
    ]);
    
    for (const [tool, indicators] of toolIndicators) {
      for (const indicator of indicators) {
        const hasIndicator = files.some(file =>
          file.name.toLowerCase().includes(indicator.toLowerCase()) ||
          file.relativePath.toLowerCase().includes(indicator.toLowerCase())
        );
        
        if (hasIndicator) {
          tools.push(tool);
          break;
        }
      }
    }
    
    return tools;
  }

  private identifyRuntime(files: ProjectFile[], language: string): string | undefined {
    const runtimes = new Map<string, string>([
      ['JavaScript', 'Node.js'],
      ['TypeScript', 'Node.js'],
      ['Python', 'Python'],
      ['Java', 'JVM'],
      ['C#', '.NET'],
      ['Go', 'Go Runtime'],
      ['Rust', 'Rust Runtime'],
      ['Ruby', 'Ruby'],
      ['PHP', 'PHP']
    ]);
    
    // 检查特定运行时指示器
    if (files.some(f => f.name === 'package.json')) {
      return 'Node.js';
    }
    
    if (files.some(f => f.name === 'requirements.txt' || f.name === 'Pipfile')) {
      return 'Python';
    }
    
    if (files.some(f => f.name.includes('.csproj') || f.name.includes('.sln'))) {
      return '.NET';
    }
    
    return runtimes.get(language);
  }

  private identifyBuildTools(files: ProjectFile[]): string[] {
    const tools: string[] = [];
    
    const buildToolIndicators = [
      { tool: 'npm', files: ['package.json'] },
      { tool: 'Yarn', files: ['yarn.lock'] },
      { tool: 'Maven', files: ['pom.xml'] },
      { tool: 'Gradle', files: ['build.gradle', 'gradle.properties'] },
      { tool: 'Make', files: ['Makefile'] },
      { tool: 'CMake', files: ['CMakeLists.txt'] },
      { tool: 'Webpack', files: ['webpack.config.js'] },
      { tool: 'Vite', files: ['vite.config.js', 'vite.config.ts'] },
      { tool: 'Rollup', files: ['rollup.config.js'] },
      { tool: 'Gulp', files: ['gulpfile.js'] },
      { tool: 'Grunt', files: ['Gruntfile.js'] }
    ];
    
    for (const { tool, files: indicatorFiles } of buildToolIndicators) {
      const hasTool = indicatorFiles.some(indicatorFile =>
        files.some(file => file.name.toLowerCase() === indicatorFile.toLowerCase())
      );
      
      if (hasTool) {
        tools.push(tool);
      }
    }
    
    return tools;
  }

  private identifyProjectType(files: ProjectFile[], techStack: TechnicalStack): string {
    // 检查移动应用指示器
    if (files.some(f => f.name === 'AndroidManifest.xml') ||
        files.some(f => f.name === 'Info.plist') ||
        techStack.framework === 'React Native' ||
        techStack.framework === 'Flutter') {
      return 'mobile';
    }
    
    // 检查Web应用指示器
    if (techStack.framework === 'React' ||
        techStack.framework === 'Vue' ||
        techStack.framework === 'Angular' ||
        files.some(f => f.name === 'index.html') ||
        files.some(f => f.relativePath.includes('public/') && f.extension === '.html')) {
      return 'web';
    }
    
    // 检查库/包指示器
    if (files.some(f => f.name === 'setup.py') ||
        files.some(f => f.name === 'Cargo.toml') ||
        files.some(f => f.name === '__init__.py') ||
        (files.some(f => f.name === 'package.json') && 
         !files.some(f => f.name === 'index.html'))) {
      return 'library';
    }
    
    // 检查API/服务器指示器
    if (techStack.framework === 'Express' ||
        techStack.framework === 'Django' ||
        techStack.framework === 'Flask' ||
        techStack.framework === 'Spring' ||
        files.some(f => f.relativePath.includes('api/')) ||
        files.some(f => f.relativePath.includes('routes/'))) {
      return 'api';
    }
    
    // 检查桌面应用指示器
    if (files.some(f => f.extension === '.exe') ||
        files.some(f => f.name.includes('.desktop')) ||
        techStack.framework === 'Electron') {
      return 'desktop';
    }
    
    // 检查CLI工具指示器
    if (files.some(f => f.name === 'bin') ||
        files.some(f => f.relativePath.includes('cli/')) ||
        files.some(f => f.name.includes('command'))) {
      return 'cli';
    }
    
    return 'application';
  }

  private identifyArchitecture(files: ProjectFile[], techStack: TechnicalStack): string[] {
    const architecture: string[] = [];
    
    // 微服务架构
    if (files.some(f => f.name === 'docker-compose.yml') ||
        files.some(f => f.relativePath.includes('microservices/')) ||
        files.some(f => f.relativePath.includes('services/'))) {
      architecture.push('microservices');
    }
    
    // 单体架构
    if (files.some(f => f.name === 'app.py') ||
        files.some(f => f.name === 'main.py') ||
        files.some(f => f.name === 'app.js') ||
        files.some(f => f.name === 'server.js')) {
      architecture.push('monolithic');
    }
    
    // 前后端分离
    if (files.some(f => f.relativePath.includes('frontend/')) &&
        files.some(f => f.relativePath.includes('backend/'))) {
      architecture.push('frontend-backend-separation');
    }
    
    // 组件化
    if (techStack.framework === 'React' ||
        techStack.framework === 'Vue' ||
        techStack.framework === 'Angular') {
      architecture.push('component-based');
    }
    
    // MVC
    if (files.some(f => f.relativePath.includes('models/')) &&
        files.some(f => f.relativePath.includes('views/')) &&
        files.some(f => f.relativePath.includes('controllers/'))) {
      architecture.push('mvc');
    }
    
    // 分层架构
    if (files.some(f => f.relativePath.includes('layers/')) ||
        files.some(f => f.relativePath.includes('business/')) ||
        files.some(f => f.relativePath.includes('data/'))) {
      architecture.push('layered');
    }
    
    // RESTful API
    if (files.some(f => f.relativePath.includes('api/')) ||
        files.some(f => f.relativePath.includes('rest/'))) {
      architecture.push('restful');
    }
    
    return architecture.length > 0 ? architecture : ['standard'];
  }

  private async extractDependencies(files: ProjectFile[]): Promise<string[]> {
    const dependencies: string[] = [];
    
    try {
      // 从 package.json 提取依赖
      const packageJson = files.find(f => f.name === 'package.json');
      if (packageJson) {
        const content = fs.readFileSync(packageJson.path, 'utf-8');
        const parsed = JSON.parse(content);
        
        if (parsed.dependencies) {
          dependencies.push(...Object.keys(parsed.dependencies));
        }
        if (parsed.devDependencies) {
          dependencies.push(...Object.keys(parsed.devDependencies));
        }
      }
      
      // 从 requirements.txt 提取依赖
      const requirements = files.find(f => f.name === 'requirements.txt');
      if (requirements) {
        const content = fs.readFileSync(requirements.path, 'utf-8');
        const deps = content.split('\n')
          .map(line => line.split('==')[0].split('>=')[0].split('~=')[0].trim())
          .filter(dep => dep && !dep.startsWith('#'));
        dependencies.push(...deps);
      }
      
      // 从 Gemfile 提取依赖
      const gemfile = files.find(f => f.name === 'Gemfile');
      if (gemfile) {
        const content = fs.readFileSync(gemfile.path, 'utf-8');
        const gemMatches = content.match(/gem\s+['"]([^'"]+)['"]/g);
        if (gemMatches) {
          const gems = gemMatches.map(match => match.match(/['"]([^'"]+)['"]/)?.[1]).filter(Boolean);
          dependencies.push(...gems as string[]);
        }
      }
      
    } catch (error) {
      console.warn('提取依赖信息失败:', error);
    }
    
    return Array.from(new Set(dependencies)).slice(0, 50); // 限制数量
  }

  private async analyzeGitInfo(projectPath: string): Promise<GitInfo | undefined> {
    const gitPath = path.join(projectPath, '.git');
    
    if (!fs.existsSync(gitPath)) {
      return undefined;
    }
    
    try {
      const gitInfo: GitInfo = {
        isRepo: true
      };
      
      // 尝试读取 git 配置信息
      // 注意：这里简化实现，实际应该使用 git 命令或库
      
      return gitInfo;
      
    } catch (error) {
      return { isRepo: true };
    }
  }

  private getLanguageFromExtension(extension: string): string | undefined {
    const languageMap = new Map<string, string>([
      ['.js', 'JavaScript'],
      ['.ts', 'TypeScript'],
      ['.jsx', 'JavaScript'],
      ['.tsx', 'TypeScript'],
      ['.py', 'Python'],
      ['.java', 'Java'],
      ['.cpp', 'C++'],
      ['.c', 'C'],
      ['.cs', 'C#'],
      ['.go', 'Go'],
      ['.rs', 'Rust'],
      ['.rb', 'Ruby'],
      ['.php', 'PHP'],
      ['.swift', 'Swift'],
      ['.kt', 'Kotlin'],
      ['.scala', 'Scala'],
      ['.r', 'R'],
      ['.m', 'Objective-C'],
      ['.sh', 'Shell'],
      ['.ps1', 'PowerShell'],
      ['.vue', 'Vue'],
      ['.html', 'HTML'],
      ['.css', 'CSS'],
      ['.scss', 'SCSS'],
      ['.sass', 'Sass'],
      ['.less', 'Less']
    ]);
    
    return languageMap.get(extension.toLowerCase());
  }

  private extractDirectoryStructure(files: ProjectFile[]): string[] {
    const directories = new Set<string>();
    
    files.forEach(file => {
      const parts = file.relativePath.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        if (dir) {
          directories.add(dir);
        }
      }
    });
    
    return Array.from(directories).sort();
  }

  private estimateCodeLines(files: ProjectFile[]): number {
    // 简单估算：基于文件大小估算代码行数
    let totalLines = 0;
    
    files.forEach(file => {
      if (this.isCodeFile(file)) {
        // 平均每行约50字符
        const estimatedLines = Math.round(file.size / 50);
        totalLines += estimatedLines;
      }
    });
    
    return totalLines;
  }

  private countModules(files: ProjectFile[]): number {
    // 计算模块数量（简化版本）
    const moduleIndicators = [
      'index.js', 'index.ts', '__init__.py', 'mod.rs',
      'package.json', 'setup.py', 'Cargo.toml'
    ];
    
    return files.filter(file =>
      moduleIndicators.includes(file.name) ||
      file.relativePath.includes('/src/') ||
      file.relativePath.includes('/lib/')
    ).length;
  }

  private isCodeFile(file: ProjectFile): boolean {
    const codeExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs',
      '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala'
    ];
    
    return codeExtensions.includes(file.extension.toLowerCase());
  }
}