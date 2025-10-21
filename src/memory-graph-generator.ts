import { Context, Relationship, Project } from './types.js';
import { DatabaseManager } from './database.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';


export interface GraphNode {
  id: string;
  label: string;
  content: string;        // 完整内容
  type: string;
  importance: number;
  tags: string[];
  created_at: string;
  file_path?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  strength: number;
}

export interface MemoryGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    project_name: string;
    total_contexts: number;
    total_relationships: number;
    generated_at: string;
  };
}

export class MemoryGraphGenerator {
  constructor(private db: DatabaseManager) {}

  /**
   * 生成记忆图谱（HTML格式）
   */
  async generateGraph(
    projectId: string,
    options: {
      max_nodes?: number;
      focus_type?: string;
      output_path?: string;
    } = {}
  ): Promise<{ content: string; file_path: string }> {
    // 获取图谱数据
    const graphData = this.extractGraphData(projectId, options);

    // 生成HTML输出
    return this.generateHTML(graphData, options.output_path);
  }

  /**
   * 从数据库提取图谱数据
   */
  private extractGraphData(
    projectId: string,
    options: { max_nodes?: number; focus_type?: string }
  ): MemoryGraphData {
    const project = this.db.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // 获取contexts
    let contexts = this.db.getContextsByProject(projectId);

    // 过滤类型
    if (options.focus_type && options.focus_type !== 'all') {
      contexts = contexts.filter(c => c.type === options.focus_type);
    }

    // 限制节点数量（选择最重要的）
    // max_nodes=0 表示显示所有，默认也是显示所有
    const maxNodes = options.max_nodes || 0;
    if (maxNodes > 0 && contexts.length > maxNodes) {
      contexts = contexts
        .sort((a, b) => b.quality_score - a.quality_score)
        .slice(0, maxNodes);
    }

    // 构建节点
    const nodes: GraphNode[] = contexts.map(context => ({
      id: context.id,
      label: this.truncateLabel(context.content),
      content: context.content,  // 保存完整内容
      type: context.type,
      importance: context.quality_score,
      tags: context.tags ? context.tags.split(',').filter(t => t) : [],
      created_at: context.created_at,
      file_path: context.file_path
    }));

    // 获取关系
    const contextIds = new Set(contexts.map(c => c.id));
    const edges: GraphEdge[] = [];

    contexts.forEach(context => {
      const related = this.db.getRelatedContexts(context.id);
      related.forEach((rel: any) => {
        // 只包含在节点集合中的关系
        if (contextIds.has(rel.to_context_id)) {
          edges.push({
            from: rel.from_context_id,
            to: rel.to_context_id,
            relation: rel.type,
            strength: rel.strength
          });
        }
      });
    });

    return {
      nodes,
      edges,
      metadata: {
        project_name: project.name,
        total_contexts: contexts.length,
        total_relationships: edges.length,
        generated_at: new Date().toISOString()
      }
    };
  }

  /**
   * 生成HTML格式（交互式可视化）
   */
  private generateHTML(
    data: MemoryGraphData,
    outputPath?: string
  ): { content: string; file_path: string } {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>${data.metadata.project_name} - Memory Graph</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #1e293b 100%);
      color: #e2e8f0;
      overflow: hidden;
    }
    #graph { width: 100vw; height: 100vh; }
    .controls {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(30, 41, 59, 0.8);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 20px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
      z-index: 1000;
      min-width: 260px;
    }
    .controls h2 {
      margin-bottom: 15px;
      font-size: 18px;
      color: #60a5fa;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .controls input, .controls select {
      width: 100%;
      padding: 8px 12px;
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid #334155;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 14px;
      transition: all 0.2s;
    }
    .controls input:focus, .controls select:focus {
      outline: none;
      border-color: #60a5fa;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
    }
    .control-group {
      margin-bottom: 15px;
    }
    .control-group:last-child {
      margin-bottom: 0;
    }
    .control-label {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      color: #94a3b8;
      font-weight: 500;
    }
    .stats {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(30, 41, 59, 0.8);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 15px 20px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.1);
      font-size: 12px;
      z-index: 1000;
    }
    .stats div { margin: 4px 0; }
    .legend {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(30, 41, 59, 0.8);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 15px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.1);
      font-size: 12px;
      z-index: 1000;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 6px 0;
    }
    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      margin-right: 8px;
    }
    .node { 
      cursor: pointer; 
      transition: all 0.3s ease;
    }
    .node:hover { 
      opacity: 0.8;
      filter: brightness(1.2);
    }
    .node.filtered-out {
      opacity: 0.1 !important;
      transition: opacity 0.3s ease;
    }
    .node.dimmed {
      opacity: 0.15 !important;
      transition: opacity 0.3s ease;
    }
    .link { 
      stroke: #475569; 
      stroke-opacity: 0.6;
      transition: all 0.3s ease;
    }
    .link.filtered-out {
      opacity: 0.1 !important;
      transition: opacity 0.3s ease;
    }
    .link.dimmed {
      opacity: 0.05 !important;
      transition: opacity 0.3s ease;
    }
    .node-label {
      fill: #e2e8f0;
      font-size: 11px;
      pointer-events: none;
      text-anchor: middle;
      transition: opacity 0.3s ease;
    }
    .node-label.filtered-out {
      opacity: 0.1 !important;
    }
    .node-label.dimmed {
      opacity: 0.15 !important;
      transition: opacity 0.3s ease;
    }
    .btn {
      padding: 8px 16px;
      background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }
    .btn-secondary {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    }
    .btn-secondary:hover {
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
    }
    .button-group {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .custom-tooltip {
      position: absolute;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px;
      padding: 12px 16px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 2000;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    .custom-tooltip.visible {
      opacity: 1;
    }
    .tooltip-title {
      font-weight: 600;
      color: #60a5fa;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .tooltip-content {
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 8px;
    }
    .tooltip-meta {
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid rgba(148, 163, 184, 0.2);
      padding-top: 8px;
      margin-top: 8px;
    }
    .tooltip-meta div {
      margin: 2px 0;
    }
  </style>
</head>
<body>
  <div class="controls">
    <h2>
      <span id="controlTitle">🔍 Search</span>
      <button class="btn btn-secondary" id="langToggle" style="padding: 4px 8px; font-size: 12px;">中文</button>
    </h2>
    <div class="control-group">
      <label class="control-label" id="searchLabel">Search Nodes</label>
      <input type="text" id="search" placeholder="Search nodes...">
    </div>
    <div class="control-group">
      <label class="control-label" id="typeLabel">Filter by Type</label>
      <select id="typeFilter">
        <option value="all">All Types</option>
        <optgroup label="Core Types" data-label-zh="核心类型">
          <option value="solution" data-text-zh="解决方案">Solution</option>
          <option value="error" data-text-zh="错误">Error</option>
          <option value="code" data-text-zh="代码">Code</option>
          <option value="documentation" data-text-zh="文档">Documentation</option>
          <option value="conversation" data-text-zh="对话">Conversation</option>
          <option value="test" data-text-zh="测试">Test</option>
          <option value="configuration" data-text-zh="配置">Configuration</option>
          <option value="commit" data-text-zh="提交">Commit</option>
        </optgroup>
        <optgroup label="Code Changes" data-label-zh="代码变更">
          <option value="code_create" data-text-zh="代码创建">Code Create</option>
          <option value="code_modify" data-text-zh="代码修改">Code Modify</option>
          <option value="code_delete" data-text-zh="代码删除">Code Delete</option>
          <option value="code_refactor" data-text-zh="代码重构">Code Refactor</option>
          <option value="code_optimize" data-text-zh="代码优化">Code Optimize</option>
        </optgroup>
        <optgroup label="Bug Related" data-label-zh="Bug相关">
          <option value="bug_fix" data-text-zh="修复Bug">Bug Fix</option>
          <option value="bug_report" data-text-zh="Bug报告">Bug Report</option>
        </optgroup>
        <optgroup label="Features" data-label-zh="功能">
          <option value="feature_add" data-text-zh="功能新增">Feature Add</option>
          <option value="feature_update" data-text-zh="功能更新">Feature Update</option>
          <option value="feature_remove" data-text-zh="功能移除">Feature Remove</option>
        </optgroup>
        <optgroup label="Debug & Test" data-label-zh="调试测试">
          <option value="debug_session" data-text-zh="调试会话">Debug Session</option>
          <option value="test_add" data-text-zh="添加测试">Test Add</option>
          <option value="test_fix" data-text-zh="修复测试">Test Fix</option>
        </optgroup>
        <optgroup label="Documentation" data-label-zh="文档">
          <option value="docs_update" data-text-zh="文档更新">Docs Update</option>
        </optgroup>
      </select>
    </div>
    <div class="control-group">
      <label class="control-label" id="timeLabel">Time Range</label>
      <select id="timeFilter">
        <option value="all">All Time</option>
        <option value="24h">Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="90d">Last 90 Days</option>
      </select>
    </div>
    <div class="button-group">
      <button class="btn" id="resetLayout">🔄 Reset Layout</button>
      <button class="btn" id="exportJson">💾 Export JSON</button>
    </div>
  </div>

  <div class="custom-tooltip" id="customTooltip">
    <div class="tooltip-title" id="tooltipTitle"></div>
    <div class="tooltip-content" id="tooltipContent"></div>
    <div class="tooltip-meta" id="tooltipMeta"></div>
  </div>

  <div class="legend">
    <h3 id="legendTitle" style="margin-bottom: 10px;">Node Types</h3>
    <div class="legend-item">
      <div class="legend-color" style="background: #fbbf24;"></div>
      <span id="legendConversation">Conversation</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #a78bfa;"></div>
      <span id="legendDocumentation">Documentation</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #4ade80;"></div>
      <span id="legendSolution">Solution</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #60a5fa;"></div>
      <span id="legendCode">Code/Test</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #f87171;"></div>
      <span id="legendError">Error</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #f472b6;"></div>
      <span id="legendConfig">Config/Commit</span>
    </div>
  </div>

  <div class="stats">
    <div><strong>${data.metadata.project_name}</strong></div>
    <div id="statsNodes">📊 Nodes: <span id="statsNodesCount">${data.metadata.total_contexts}</span></div>
    <div id="statsRels">🔗 Relationships: <span id="statsRelsCount">${data.metadata.total_relationships}</span></div>
    <div id="statsGenerated">📅 Generated: ${new Date(data.metadata.generated_at).toLocaleString()}</div>
  </div>

  <svg id="graph"></svg>

  <script>
    const data = ${JSON.stringify(data, null, 2)};
    
    // 多语言支持
    let currentLang = 'en';
    const i18n = {
      en: {
        controlTitle: '🔍 Search',
        searchLabel: 'Search Nodes',
        typeLabel: 'Filter by Type',
        timeLabel: 'Time Range',
        resetLayout: '🔄 Reset Layout',
        exportJson: '💾 Export JSON',
        langToggle: '中文',
        legendTitle: 'Node Types',
        allTypes: 'All Types',
        allTime: 'All Time',
        last24h: 'Last 24 Hours',
        last7d: 'Last 7 Days',
        last30d: 'Last 30 Days',
        last90d: 'Last 90 Days',
        solution: 'Solution',
        error: 'Error',
        code: 'Code',
        documentation: 'Documentation',
        conversation: 'Conversation',
        test: 'Test',
        configuration: 'Configuration',
        commit: 'Commit',
        codeTest: 'Code/Test',
        configCommit: 'Config/Commit',
        type: 'Type',
        importance: 'Importance',
        created: 'Created',
        file: 'File',
        tags: 'Tags',
        nodes: 'Nodes',
        relationships: 'Relationships',
        generated: 'Generated'
      },
      zh: {
        controlTitle: '🔍 搜索',
        searchLabel: '搜索节点',
        typeLabel: '按类型筛选',
        timeLabel: '时间范围',
        resetLayout: '🔄 重置布局',
        exportJson: '💾 导出JSON',
        langToggle: 'English',
        legendTitle: '节点类型',
        allTypes: '所有类型',
        allTime: '全部时间',
        last24h: '最近24小时',
        last7d: '最近7天',
        last30d: '最近30天',
        last90d: '最近90天',
        solution: '解决方案',
        error: '错误',
        code: '代码',
        documentation: '文档',
        conversation: '对话',
        test: '测试',
        configuration: '配置',
        commit: '提交',
        codeTest: '代码/测试',
        configCommit: '配置/提交',
        type: '类型',
        importance: '重要性',
        created: '创建时间',
        file: '文件',
        tags: '标签',
        nodes: '节点数',
        relationships: '关系数',
        generated: '生成时间'
      }
    };
    
    function updateLanguage() {
      const t = i18n[currentLang];
      document.getElementById('controlTitle').textContent = t.controlTitle;
      document.getElementById('searchLabel').textContent = t.searchLabel;
      document.getElementById('typeLabel').textContent = t.typeLabel;
      document.getElementById('timeLabel').textContent = t.timeLabel;
      document.getElementById('resetLayout').innerHTML = t.resetLayout;
      document.getElementById('exportJson').innerHTML = t.exportJson;
      document.getElementById('langToggle').textContent = t.langToggle;
      document.getElementById('legendTitle').textContent = t.legendTitle;
      
      // 更新legend标签
      document.getElementById('legendConversation').textContent = t.conversation;
      document.getElementById('legendDocumentation').textContent = t.documentation;
      document.getElementById('legendSolution').textContent = t.solution;
      document.getElementById('legendCode').textContent = t.codeTest;
      document.getElementById('legendError').textContent = t.error;
      document.getElementById('legendConfig').textContent = t.configCommit;
      
      const typeFilter = document.getElementById('typeFilter');
      // 更新所有option的文本（支持data-text-zh属性）
      Array.from(typeFilter.options).forEach(option => {
        if (currentLang === 'zh' && option.dataset.textZh) {
          option.text = option.dataset.textZh;
        } else if (currentLang === 'en') {
          // 恢复英文文本（从原始HTML中读取）
          const value = option.value;
          const textMap = {
            'all': 'All Types',
            'solution': 'Solution', 'error': 'Error', 'code': 'Code',
            'documentation': 'Documentation', 'conversation': 'Conversation',
            'test': 'Test', 'configuration': 'Configuration', 'commit': 'Commit',
            'code_create': 'Code Create', 'code_modify': 'Code Modify',
            'code_delete': 'Code Delete', 'code_refactor': 'Code Refactor',
            'code_optimize': 'Code Optimize', 'bug_fix': 'Bug Fix',
            'bug_report': 'Bug Report', 'feature_add': 'Feature Add',
            'feature_update': 'Feature Update', 'feature_remove': 'Feature Remove',
            'debug_session': 'Debug Session', 'test_add': 'Test Add',
            'test_fix': 'Test Fix', 'docs_update': 'Docs Update'
          };
          option.text = textMap[value] || option.text;
        }
      });
      // 更新optgroup标签
      Array.from(typeFilter.querySelectorAll('optgroup')).forEach(group => {
        if (currentLang === 'zh' && group.dataset.labelZh) {
          group.label = group.dataset.labelZh;
        } else if (currentLang === 'en') {
          const labelMap = {
            '代码变更': 'Code Changes',
            'Bug相关': 'Bug Related',
            '功能': 'Features',
            '调试测试': 'Debug & Test',
            '文档': 'Documentation',
            '核心类型': 'Core Types'
          };
          group.label = labelMap[group.label] || group.label;
        }
      });
      
      const timeFilter = document.getElementById('timeFilter');
      timeFilter.options[0].text = t.allTime;
      timeFilter.options[1].text = t.last24h;
      timeFilter.options[2].text = t.last7d;
      timeFilter.options[3].text = t.last30d;
      timeFilter.options[4].text = t.last90d;
      
      // 更新区域标签
      d3.select('.zone-label-conversation').text(t.conversation);
      d3.select('.zone-label-documentation').text(t.documentation);
      d3.select('.zone-label-solution').text(t.solution);
      d3.select('.zone-label-code').text(t.codeTest);
      d3.select('.zone-label-error').text(t.error);
      d3.select('.zone-label-configuration').text(t.configCommit);
      
      // 更新统计信息
      updateStats();
    }
    
    // 语言切换
    document.getElementById('langToggle').addEventListener('click', () => {
      currentLang = currentLang === 'en' ? 'zh' : 'en';
      updateLanguage();
    });
    
    // 重置布局
    document.getElementById('resetLayout').addEventListener('click', () => {
      // 移除所有固定位置
      data.nodes.forEach(node => {
        node.fx = null;
        node.fy = null;
      });
      
      // 重启力导向模拟
      simulation
        .alpha(1)
        .restart();
    });
    
    // JSON导出
    document.getElementById('exportJson').addEventListener('click', () => {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'memory-graph.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    
    // D3.js 可视化
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const svg = d3.select("#graph")
      .attr("width", width)
      .attr("height", height);
    
    const g = svg.append("g");
    
    // 缩放
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));
    
    svg.call(zoom);
    
    // 类型到区域的映射（将新类型归类到对应的基础区域）
    const typeToZone = {
      // 基础类型
      conversation: 'conversation',
      documentation: 'documentation',
      solution: 'solution',
      code: 'code',
      test: 'code',  // test归类到code区域
      error: 'error',
      configuration: 'configuration',
      commit: 'configuration',  // commit归类到configuration区域
      
      // 代码变更类型 → code区域
      code_create: 'code',
      code_modify: 'code',
      code_delete: 'code',
      code_refactor: 'code',
      code_optimize: 'code',
      code_review: 'code',
      
      // Bug相关 → error区域
      bug_fix: 'error',
      bug_report: 'error',
      bug_analysis: 'error',
      
      // 功能相关 → solution区域
      feature_add: 'solution',
      feature_update: 'solution',
      feature_remove: 'solution',
      feature_request: 'solution',
      feature_improvement: 'solution',
      
      // 调试测试 → code区域
      debug_session: 'code',
      test_add: 'code',
      test_fix: 'code',
      
      // 文档 → documentation区域
      docs_update: 'documentation',
      
      // 性能 → solution区域
      performance_issue: 'solution',
      performance_optimization: 'solution',
      
      // 依赖 → configuration区域
      dependency_update: 'configuration'
    };
    
    // 颜色映射（支持新旧类型）
    const colorMap = {
      // 通用类型（向后兼容）
      solution: "#4ade80",
      error: "#f87171",
      code: "#60a5fa",
      documentation: "#a78bfa",
      conversation: "#fbbf24",
      test: "#60a5fa",
      configuration: "#f472b6",
      commit: "#f472b6",
      
      // 细化的代码变更类型 → 蓝色系（与code同色）
      code_create: "#60a5fa",
      code_modify: "#60a5fa",
      code_delete: "#60a5fa",
      code_refactor: "#60a5fa",
      code_optimize: "#60a5fa",
      code_review: "#60a5fa",
      
      // Bug相关 → 红色系（与error同色）
      bug_fix: "#f87171",
      bug_report: "#f87171",
      bug_analysis: "#f87171",
      
      // 功能相关 → 绿色系（与solution同色）
      feature_add: "#4ade80",
      feature_update: "#4ade80",
      feature_remove: "#4ade80",
      feature_request: "#4ade80",
      feature_improvement: "#4ade80",
      
      // 调试测试 → 蓝色系（与test同色）
      debug_session: "#60a5fa",
      test_add: "#60a5fa",
      test_fix: "#60a5fa",
      
      // 文档 → 紫色系（与documentation同色）
      docs_update: "#a78bfa",
      
      // 性能 → 绿色系
      performance_issue: "#4ade80",
      performance_optimization: "#4ade80",
      
      // 依赖 → 粉色系
      dependency_update: "#f472b6"
    };
    
    // 统计每个类型的节点数量
    const typeCounts = {};
    data.nodes.forEach(node => {
      const type = node.type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    // 动态计算区域半径（根据节点数量）
    const baseRadius = Math.min(width, height) * 0.12;
    const zoneRadii = {};
    Object.keys(typeCounts).forEach(type => {
      const count = typeCounts[type] + (typeCounts[type === 'code' ? 'test' : type === 'test' ? 'code' : type === 'configuration' ? 'commit' : type === 'commit' ? 'configuration' : null] || 0);
      // 根据节点数量动态调整半径
      zoneRadii[type] = baseRadius + Math.sqrt(count) * 15;
    });
    
    // 获取最大区域半径，用于计算安全间距
    const maxRadius = Math.max(...Object.values(zoneRadii), baseRadius);
    // 区域中心之间的距离 = 2.8個最大半径 + 额外缓冲
    const minDistance = maxRadius * 2.8 + 120;
    
    // 动态计算类型中心点位置（六边形布局）
    const centerX = width / 2;
    const centerY = height / 2;
    // 确保区域间距至少是minDistance
    const verticalSpacing = Math.max(height * 0.28, minDistance);
    const horizontalSpacing = Math.max(width * 0.32, minDistance);
    
    const typeCenter = {
      conversation: { x: centerX, y: centerY - verticalSpacing * 1.3 },
      documentation: { x: centerX - horizontalSpacing, y: centerY - verticalSpacing * 0.4 },
      solution: { x: centerX + horizontalSpacing, y: centerY - verticalSpacing * 0.4 },
      code: { x: centerX + horizontalSpacing, y: centerY + verticalSpacing * 0.4 },
      test: { x: centerX + horizontalSpacing, y: centerY + verticalSpacing * 0.4 },  // 与code共享区域
      error: { x: centerX - horizontalSpacing, y: centerY + verticalSpacing * 0.4 },
      configuration: { x: centerX, y: centerY + verticalSpacing * 1.3 },
      commit: { x: centerX, y: centerY + verticalSpacing * 1.3 },  // 与configuration共享区域
      default: { x: centerX, y: centerY }
    };
    
    // 设置节点初始位置（按类型分组，使用映射）
    data.nodes.forEach(node => {
      const zone = typeToZone[node.type] || 'default';
      const center = typeCenter[zone] || typeCenter.default;
      const radius = Math.random() * (zoneRadii[zone] || baseRadius) * 0.7;
      const angle = Math.random() * Math.PI * 2;
      node.x = center.x + Math.cos(angle) * radius;
      node.y = center.y + Math.sin(angle) * radius;
      // 保存zone信息供后续使用
      node.zone = zone;
    });
    
    // 绘制类型区域背景圆圈
    const zones = [
      { type: 'conversation', center: typeCenter.conversation, color: colorMap.conversation },
      { type: 'documentation', center: typeCenter.documentation, color: colorMap.documentation },
      { type: 'solution', center: typeCenter.solution, color: colorMap.solution },
      { type: 'code', center: typeCenter.code, color: colorMap.code },
      { type: 'error', center: typeCenter.error, color: colorMap.error },
      { type: 'configuration', center: typeCenter.configuration, color: colorMap.configuration }
    ];
    
    const zoneGroup = g.append('g').attr('class', 'zones');
    
    zones.forEach(zone => {
      const radius = zoneRadii[zone.type] || baseRadius;
      // 背景圆
      zoneGroup.append('circle')
        .attr('cx', zone.center.x)
        .attr('cy', zone.center.y)
        .attr('r', radius)
        .attr('fill', zone.color)
        .attr('opacity', 0.08)
        .attr('stroke', zone.color)
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.3);
      
      // 区域标签
      zoneGroup.append('text')
        .attr('x', zone.center.x)
        .attr('y', zone.center.y - radius - 10)
        .attr('text-anchor', 'middle')
        .attr('class', 'zone-label zone-label-' + zone.type)
        .style('font-size', '14px')
        .style('font-weight', '600')
        .style('fill', zone.color)
        .style('opacity', 0.6)
        .style('pointer-events', 'none')
        .text(i18n[currentLang][zone.type === 'code' ? 'codeTest' : zone.type === 'configuration' ? 'configCommit' : zone.type]);
    });
    
    // 力导向布局 - 增强碰撞防止重叠（包含标签空间）
    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.edges).id(d => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("collision", d3.forceCollide().radius(d => {
        // 节点半径 + 标签预留空间
        const nodeRadius = 5 + d.importance * 15;
        const labelSpace = 35; // 为标签预留的额外空间
        return nodeRadius + labelSpace;
      }).strength(0.9))
      // 类型向心力（X轴）- 使用zone映射
      .force("typeX", d3.forceX(d => {
        const zone = typeToZone[d.type] || 'default';
        const center = typeCenter[zone] || typeCenter.default;
        return center.x;
      }).strength(0.5))
      // 类型向心力（Y轴）- 使用zone映射
      .force("typeY", d3.forceY(d => {
        const zone = typeToZone[d.type] || 'default';
        const center = typeCenter[zone] || typeCenter.default;
        return center.y;
      }).strength(0.5))
      // 微弱的径向力，让重要节点更靠近类型中心
      .force("radial", d3.forceRadial(
        d => (1 - d.importance) * 80,
        d => {
          const zone = typeToZone[d.type] || 'default';
          return typeCenter[zone]?.x || width / 2;
        },
        d => {
          const zone = typeToZone[d.type] || 'default';
          return typeCenter[zone]?.y || height / 2;
        }
      ).strength(0.1));
    
    // 绘制连线
    const link = g.append("g")
      .selectAll("line")
      .data(data.edges)
      .join("line")
      .attr("class", "link")
      .attr("stroke-width", d => Math.sqrt(d.strength) * 2);
    
    // 绘制节点
    const node = g.append("g")
      .selectAll("circle")
      .data(data.nodes)
      .join("circle")
      .attr("class", "node")
      .attr("r", d => 5 + d.importance * 15)
      .attr("fill", d => colorMap[d.type] || "#64748b")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
    
    // 节点标签
    const label = g.append("g")
      .selectAll("text")
      .data(data.nodes)
      .join("text")
      .attr("class", "node-label")
      .attr("dy", -15)
      .text(d => d.label.substring(0, 30) + (d.label.length > 30 ? "..." : ""));
    
    // 自定义tooltip
    const tooltip = d3.select('#customTooltip');
    
    node.on('mouseenter', function(event, d) {
      const t = i18n[currentLang];
      const contentPreview = d.content.length > 300 ? d.content.substring(0, 300) + '...' : d.content;
      
      tooltip.select('#tooltipTitle').text(d.label);
      tooltip.select('#tooltipContent').text(contentPreview);
      
      let metaHTML = '<div><strong>' + t.type + ':</strong> ' + d.type + '</div>';
      metaHTML += '<div><strong>' + t.importance + ':</strong> ' + (d.importance * 100).toFixed(0) + '%</div>';
      metaHTML += '<div><strong>' + t.created + ':</strong> ' + new Date(d.created_at).toLocaleString() + '</div>';
      if (d.file_path) {
        metaHTML += '<div><strong>' + t.file + ':</strong> ' + d.file_path + '</div>';
      }
      if (d.tags.length > 0) {
        metaHTML += '<div><strong>' + t.tags + ':</strong> ' + d.tags.join(', ') + '</div>';
      }
      
      tooltip.select('#tooltipMeta').html(metaHTML);
      tooltip.classed('visible', true);
    })
    .on('mousemove', function(event) {
      tooltip
        .style('left', (event.pageX + 15) + 'px')
        .style('top', (event.pageY + 15) + 'px');
    })
    .on('mouseleave', function() {
      tooltip.classed('visible', false);
    });
    
    // 更新位置
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      
      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
      
      label
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });
    
    // 拖拽
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.5).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      // 只有未锁定的节点才清除fx/fy
      if (!event.subject.locked) {
        event.subject.fx = null;
        event.subject.fy = null;
      }
    }
    
    // 搜索和筛选功能
    let currentTypeFilter = 'all';
    let currentTimeFilter = 'all';
    let currentSearchQuery = '';
    
    function getTimeFilterDate(filter) {
      const now = new Date();
      switch(filter) {
        case '24h': return new Date(now - 24 * 60 * 60 * 1000);
        case '7d': return new Date(now - 7 * 24 * 60 * 60 * 1000);
        case '30d': return new Date(now - 30 * 24 * 60 * 60 * 1000);
        case '90d': return new Date(now - 90 * 24 * 60 * 60 * 1000);
        default: return null;
      }
    }
    
    function applyFilters() {
      const timeFilterDate = getTimeFilterDate(currentTimeFilter);
      let visibleCount = 0;
      let visibleRelCount = 0;
      
      node.each(function(d) {
        const matchesSearch = !currentSearchQuery || 
          d.label.toLowerCase().includes(currentSearchQuery) || 
          d.content.toLowerCase().includes(currentSearchQuery) ||
          d.tags.some(t => t.toLowerCase().includes(currentSearchQuery));
        const matchesType = currentTypeFilter === 'all' || d.type === currentTypeFilter;
        const matchesTime = !timeFilterDate || new Date(d.created_at) >= timeFilterDate;
        const isVisible = matchesSearch && matchesType && matchesTime;
        
        d3.select(this)
          .classed('filtered-out', !isVisible)
          .attr('opacity', isVisible ? 1 : 0.1);
        
        if (isVisible) visibleCount++;
      });
      
      label.each(function(d) {
        const matchesSearch = !currentSearchQuery || 
          d.label.toLowerCase().includes(currentSearchQuery) || 
          d.content.toLowerCase().includes(currentSearchQuery) ||
          d.tags.some(t => t.toLowerCase().includes(currentSearchQuery));
        const matchesType = currentTypeFilter === 'all' || d.type === currentTypeFilter;
        const matchesTime = !timeFilterDate || new Date(d.created_at) >= timeFilterDate;
        const isVisible = matchesSearch && matchesType && matchesTime;
        
        d3.select(this)
          .classed('filtered-out', !isVisible)
          .attr('opacity', isVisible ? 1 : 0.1);
      });
      
      link.each(function(d) {
        const sourceVisible = !d3.select(node.filter(n => n.id === d.source.id).node()).classed('filtered-out');
        const targetVisible = !d3.select(node.filter(n => n.id === d.target.id).node()).classed('filtered-out');
        const isVisible = sourceVisible && targetVisible;
        
        d3.select(this)
          .classed('filtered-out', !isVisible)
          .attr('opacity', isVisible ? 0.6 : 0.1);
        
        if (isVisible) visibleRelCount++;
      });
      
      // 更新统计数字
      document.getElementById('statsNodesCount').textContent = visibleCount;
      document.getElementById('statsRelsCount').textContent = visibleRelCount;
    }
    
    function updateStats() {
      const t = i18n[currentLang];
      document.getElementById('statsNodes').innerHTML = '📊 ' + t.nodes + ': <span id="statsNodesCount">' + document.getElementById('statsNodesCount').textContent + '</span>';
      document.getElementById('statsRels').innerHTML = '🔗 ' + t.relationships + ': <span id="statsRelsCount">' + document.getElementById('statsRelsCount').textContent + '</span>';
      document.getElementById('statsGenerated').textContent = '📅 ' + t.generated + ': ' + new Date(data.metadata.generated_at).toLocaleString();
    }
    
    document.getElementById("search").addEventListener("input", (e) => {
      currentSearchQuery = e.target.value.toLowerCase();
      applyFilters();
    });
    
    document.getElementById("typeFilter").addEventListener("change", (e) => {
      currentTypeFilter = e.target.value;
      applyFilters();
    });
    
    document.getElementById("timeFilter").addEventListener("change", (e) => {
      currentTimeFilter = e.target.value;
      applyFilters();
    });
    
    // 节点点击高亮相关节点
    let selectedNode = null;
    let clickTimeout = null;
    
    node.on('click', function(event, d) {
      event.stopPropagation();
      
      // 延迟处理单击，等待双击
      clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        
        if (selectedNode === d) {
          // 取消选中
          selectedNode = null;
          node.classed('dimmed', false);
          link.classed('dimmed', false);
          label.classed('dimmed', false);
        } else {
          // 选中节点
          selectedNode = d;
          
          // 获取相关节点ID
          const connectedNodes = new Set([d.id]);
          data.edges.forEach(edge => {
            if (edge.source.id === d.id) connectedNodes.add(edge.target.id);
            if (edge.target.id === d.id) connectedNodes.add(edge.source.id);
          });
          
          // 高亮相关节点
          node.classed('dimmed', n => !connectedNodes.has(n.id));
          label.classed('dimmed', n => !connectedNodes.has(n.id));
          link.classed('dimmed', e => e.source.id !== d.id && e.target.id !== d.id);
        }
      }, 250); // 250ms延迟，等待双击
    });
    
    // 节点双击固定/解锁位置
    node.on('dblclick', function(event, d) {
      event.stopPropagation();
      event.preventDefault();
      clearTimeout(clickTimeout); // 取消单击
      
      console.log('Double click - before:', { fx: d.fx, fy: d.fy, locked: d.locked });
      
      if (!d.locked) {
        // 固定节点
        d.locked = true;
        d.fx = d.x;
        d.fy = d.y;
        console.log('Locking node at:', { fx: d.fx, fy: d.fy });
        d3.select(this)
          .attr('stroke', '#fbbf24')
          .attr('stroke-width', 4)
          .attr('stroke-opacity', 1);
      } else {
        // 解锁节点
        console.log('Unlocking node');
        d.locked = false;
        d.fx = null;
        d.fy = null;
        d3.select(this)
          .attr('stroke', null)
          .attr('stroke-width', null)
          .attr('stroke-opacity', null);
      }
      
      console.log('Double click - after:', { fx: d.fx, fy: d.fy, locked: d.locked });
    });
    
    // 点击背景取消选中
    svg.on('click', () => {
      selectedNode = null;
      node.classed('dimmed', false);
      link.classed('dimmed', false);
      label.classed('dimmed', false);
    });
  </script>
</body>
</html>`;

    // 保存文件 - 使用项目路径下的memory目录
    const projectPath = this.getProjectPath(data.metadata.project_name);
    const filePath = outputPath || join(projectPath || process.cwd(), 'memory', 'memory-graph.html');
    
    // 确保目录存在
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(filePath, html, 'utf-8');

    return { content: html, file_path: filePath };
  }

  /**
   * 辅助方法：截断标签
   */
  private truncateLabel(text: string, maxLength: number = 40): string {
    text = text.replace(/\n/g, ' ').trim();
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /**
   * 获取项目路径
   */
  private getProjectPath(projectName: string): string | null {
    try {
      // 从数据库查找项目路径
      const projects = this.db.getAllProjects(100);
      const project = projects.find(p => p.name === projectName);
      return project ? project.path : null;
    } catch {
      return null;
    }
  }

}
