import { Context, Relationship, Project } from './types.js';
import { DatabaseManager } from './database.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export type GraphFormat = 'mermaid' | 'html' | 'json';

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
   * 生成记忆图谱
   */
  async generateGraph(
    projectId: string,
    format: GraphFormat = 'mermaid',
    options: {
      max_nodes?: number;
      focus_type?: string;
      output_path?: string;
    } = {}
  ): Promise<{ content: string; file_path?: string }> {
    // 获取图谱数据
    const graphData = this.extractGraphData(projectId, options);

    // 根据格式生成输出
    switch (format) {
      case 'mermaid':
        return { content: this.generateMermaid(graphData) };
      case 'html':
        return this.generateHTML(graphData, options.output_path);
      case 'json':
        return this.generateJSON(graphData, options.output_path);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
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
   * 生成Mermaid格式
   */
  private generateMermaid(data: MemoryGraphData): string {
    let mermaid = '```mermaid\n';
    mermaid += 'graph TD\n';
    mermaid += `  %% ${data.metadata.project_name} - Memory Graph\n`;
    mermaid += `  %% Generated: ${data.metadata.generated_at}\n\n`;

    // 添加节点（带样式）
    data.nodes.forEach(node => {
      const shape = this.getMermaidShape(node.type);
      const label = node.label.replace(/"/g, "'"); // 转义引号
      
      mermaid += `  ${node.id}${shape[0]}"${label}"${shape[1]}\n`;
    });

    mermaid += '\n';

    // 添加关系
    const relationStyles = {
      depends_on: '-->',
      related_to: '-.->',
      fixes: '==>',
      implements: '-->',
      tests: '-.->',
      documents: '-->'
    };

    data.edges.forEach(edge => {
      const style = relationStyles[edge.relation as keyof typeof relationStyles] || '-->';
      const label = edge.relation.replace(/_/g, ' ');
      mermaid += `  ${edge.from} ${style}|${label}| ${edge.to}\n`;
    });

    // 添加样式定义
    mermaid += '\n  %% Styles\n';
    mermaid += '  classDef solution fill:#4ade80,stroke:#22c55e,stroke-width:2px\n';
    mermaid += '  classDef error fill:#f87171,stroke:#ef4444,stroke-width:2px\n';
    mermaid += '  classDef code fill:#60a5fa,stroke:#3b82f6,stroke-width:2px\n';
    mermaid += '  classDef doc fill:#a78bfa,stroke:#8b5cf6,stroke-width:2px\n';

    // 应用样式
    const typeClasses: Record<string, string[]> = {
      solution: [],
      error: [],
      code: [],
      documentation: []
    };

    data.nodes.forEach(node => {
      if (typeClasses[node.type]) {
        typeClasses[node.type].push(node.id);
      }
    });

    Object.entries(typeClasses).forEach(([type, ids]) => {
      if (ids.length > 0) {
        mermaid += `  class ${ids.join(',')} ${type}\n`;
      }
    });

    mermaid += '```\n';

    return mermaid;
  }

  /**
   * 生成HTML格式（交互式可视化）
   */
  private generateHTML(
    data: MemoryGraphData,
    outputPath?: string
  ): { content: string; file_path: string } {
    // 检测项目主要语言（根据内容中中文字符比例）
    const detectLanguage = (): 'zh' | 'en' => {
      const allContent = data.nodes.map(n => n.content).join('');
      const chineseChars = (allContent.match(/[\u4e00-\u9fa5]/g) || []).length;
      const totalChars = allContent.length;
      return chineseChars / totalChars > 0.3 ? 'zh' : 'en';
    };
    
    const defaultLang = detectLanguage();
    
    const html = `<!DOCTYPE html>
<html lang="\${currentLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.metadata.project_name} - Memory Graph</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0;
      overflow: hidden;
    }
    #graph { width: 100vw; height: 100vh; }
    
    .controls {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(30, 41, 59, 0.95);
      backdrop-filter: blur(10px);
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 1000;
      min-width: 250px;
    }
    .controls h2 {
      margin-bottom: 15px;
      font-size: 18px;
      color: #60a5fa;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .controls input {
      width: 100%;
      padding: 10px 12px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #e2e8f0;
      font-size: 14px;
      transition: all 0.3s;
    }
    .controls input:focus {
      outline: none;
      border-color: #60a5fa;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
    }
    .filter-group {
      margin-top: 15px;
    }
    .filter-group label {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      color: #94a3b8;
    }
    .filter-group select {
      width: 100%;
      padding: 8px 12px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 14px;
    }
    
    .stats {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(30, 41, 59, 0.95);
      backdrop-filter: blur(10px);
      padding: 15px 20px;
      border-radius: 10px;
      font-size: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 1000;
    }
    .stats div { 
      margin: 6px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .stats strong { color: #60a5fa; font-size: 14px; }
    
    .legend {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(30, 41, 59, 0.95);
      backdrop-filter: blur(10px);
      padding: 15px;
      border-radius: 10px;
      font-size: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 1000;
    }
    .legend h3 {
      margin-bottom: 10px;
      color: #60a5fa;
      font-size: 14px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 8px 0;
      padding: 4px;
      border-radius: 4px;
      transition: background 0.2s;
    }
    .legend-item:hover {
      background: rgba(96, 165, 250, 0.1);
    }
    .legend-color {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      margin-right: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    
    .lang-switch {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(30, 41, 59, 0.95);
      backdrop-filter: blur(10px);
      padding: 10px 15px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 1000;
      display: flex;
      gap: 10px;
    }
    .lang-switch button {
      padding: 6px 14px;
      background: transparent;
      border: 1px solid #334155;
      border-radius: 6px;
      color: #94a3b8;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.3s;
    }
    .lang-switch button:hover {
      border-color: #60a5fa;
      color: #60a5fa;
    }
    .lang-switch button.active {
      background: #60a5fa;
      border-color: #60a5fa;
      color: #0f172a;
    }
    
    .node { 
      cursor: pointer;
      transition: all 0.3s;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    }
    .node:hover { 
      transform: scale(1.1);
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
    }
    .link { 
      stroke: #475569; 
      stroke-opacity: 0.6;
      transition: all 0.3s;
    }
    .link:hover {
      stroke: #60a5fa;
      stroke-opacity: 1;
    }
    .node-label {
      fill: #e2e8f0;
      font-size: 11px;
      pointer-events: none;
      text-anchor: middle;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }
    
    .tooltip {
      position: absolute;
      background: rgba(15, 23, 42, 0.98);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(96, 165, 250, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      color: #e2e8f0;
      font-size: 12px;
      pointer-events: none;
      opacity: 0;
      z-index: 2000;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      transition: opacity 0.2s;
    }
    .tooltip.show { opacity: 1; }
    .tooltip-title {
      font-weight: bold;
      color: #60a5fa;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .tooltip-content {
      margin-bottom: 8px;
      line-height: 1.5;
      max-height: 200px;
      overflow-y: auto;
    }
    .tooltip-meta {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.1);
      font-size: 11px;
      color: #94a3b8;
    }
    .tooltip-meta div { margin: 4px 0; }
    
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #1e293b; }
    ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #64748b; }
  </style>
</head>
<body>
  <div class="lang-switch">
    <button id="lang-zh" onclick="switchLang('zh')" class="\${defaultLang === 'zh' ? 'active' : ''}">中文</button>
    <button id="lang-en" onclick="switchLang('en')" class="\${defaultLang === 'en' ? 'active' : ''}">English</button>
  </div>

  <div class="controls">
    <h2>🔍 <span class="lang-text" data-zh="搜索" data-en="Search"></span></h2>
    <input type="text" id="search" class="lang-placeholder" data-zh="搜索节点..." data-en="Search nodes...">
    <div class="filter-group">
      <label class="lang-text" data-zh="节点类型" data-en="Node Type"></label>
      <select id="type-filter">
        <option value="all" class="lang-option" data-zh="全部" data-en="All">All</option>
        <option value="solution" class="lang-option" data-zh="解决方案" data-en="Solution">Solution</option>
        <option value="error" class="lang-option" data-zh="错误" data-en="Error">Error</option>
        <option value="code" class="lang-option" data-zh="代码" data-en="Code">Code</option>
        <option value="documentation" class="lang-option" data-zh="文档" data-en="Documentation">Documentation</option>
      </select>
    </div>
  </div>

  <div class="legend">
    <h3 class="lang-text" data-zh="节点类型" data-en="Node Types"></h3>
    <div class="legend-item">
      <div class="legend-color" style="background: #4ade80;"></div>
      <span class="lang-text" data-zh="解决方案" data-en="Solution"></span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #f87171;"></div>
      <span class="lang-text" data-zh="错误" data-en="Error"></span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #60a5fa;"></div>
      <span class="lang-text" data-zh="代码" data-en="Code"></span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #a78bfa;"></div>
      <span class="lang-text" data-zh="文档" data-en="Documentation"></span>
    </div>
  </div>

  <div class="stats">
    <div><strong>${data.metadata.project_name}</strong></div>
    <div>📊 <span class="lang-text" data-zh="节点数" data-en="Nodes"></span>: ${data.metadata.total_contexts}</div>
    <div>🔗 <span class="lang-text" data-zh="关系数" data-en="Relationships"></span>: ${data.metadata.total_relationships}</div>
    <div>📅 <span class="lang-text" data-zh="生成时间" data-en="Generated"></span>: ${new Date(data.metadata.generated_at).toLocaleString()}</div>
  </div>

  <div class="tooltip" id="tooltip"></div>
  <svg id="graph"></svg>

  <script>
    const data = ${JSON.stringify(data, null, 2)};
    
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
    
    // 颜色映射
    const colorMap = {
      solution: "#4ade80",
      error: "#f87171",
      code: "#60a5fa",
      documentation: "#a78bfa",
      conversation: "#fbbf24",
      test: "#34d399",
      configuration: "#f472b6",
      commit: "#818cf8"
    };
    
    // 力导向布局
    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.edges).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));
    
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
    const tooltip = d3.select("#tooltip");
    
    node.on("mouseover", function(event, d) {
      const contentPreview = d.content.substring(0, 500) + (d.content.length > 500 ? '...' : '');
      const typeLabel = currentLang === 'zh' ? 
        { solution: '解决方案', error: '错误', code: '代码', documentation: '文档' }[d.type] || d.type :
        d.type;
      
      let tooltipHtml = \`
        <div class="tooltip-title">\${d.label}</div>
        <div class="tooltip-content">\${contentPreview.replace(/\n/g, '<br>')}</div>
        <div class="tooltip-meta">
          <div>📝 \${currentLang === 'zh' ? '类型' : 'Type'}: \${typeLabel}</div>
          <div>⭐ \${currentLang === 'zh' ? '重要度' : 'Importance'}: \${(d.importance * 100).toFixed(0)}%</div>
          <div>📅 \${currentLang === 'zh' ? '创建时间' : 'Created'}: \${new Date(d.created_at).toLocaleString()}</div>
          \${d.file_path ? \`<div>📁 \${currentLang === 'zh' ? '文件' : 'File'}: \${d.file_path}</div>\` : ''}
        </div>
      \`;
      
      tooltip.html(tooltipHtml)
        .classed("show", true)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");
    })
    .on("mousemove", function(event) {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", function() {
      tooltip.classed("show", false);
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
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
    
    // 搜索功能
    document.getElementById("search").addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      filterNodes();
    });
    
    // 类型筛选
    document.getElementById("type-filter").addEventListener("change", () => {
      filterNodes();
    });
    
    function filterNodes() {
      const query = document.getElementById("search").value.toLowerCase();
      const typeFilter = document.getElementById("type-filter").value;
      
      node.attr("opacity", d => {
        const matchesSearch = !query || d.label.toLowerCase().includes(query) || 
                             d.content.toLowerCase().includes(query) ||
                             d.tags.some(t => t.toLowerCase().includes(query));
        const matchesType = typeFilter === 'all' || d.type === typeFilter;
        return matchesSearch && matchesType ? 1 : 0.1;
      });
      
      label.attr("opacity", d => {
        const matchesSearch = !query || d.label.toLowerCase().includes(query) || 
                             d.content.toLowerCase().includes(query) ||
                             d.tags.some(t => t.toLowerCase().includes(query));
        const matchesType = typeFilter === 'all' || d.type === typeFilter;
        return matchesSearch && matchesType ? 1 : 0.1;
      });
      
      link.attr("opacity", d => {
        const sourceVisible = node.filter(n => n.id === d.source.id).attr("opacity") == 1;
        const targetVisible = node.filter(n => n.id === d.target.id).attr("opacity") == 1;
        return sourceVisible && targetVisible ? 0.6 : 0.1;
      });
    }
    
    // 语言切换
    let currentLang = '${defaultLang}';
    
    function switchLang(lang) {
      currentLang = lang;
      document.documentElement.lang = lang;
      
      // 更新按钮状态
      document.querySelectorAll('.lang-switch button').forEach(btn => {
        btn.classList.remove('active');
      });
      document.getElementById('lang-' + lang).classList.add('active');
      
      // 更新文本
      document.querySelectorAll('.lang-text').forEach(el => {
        el.textContent = el.getAttribute('data-' + lang);
      });
      
      // 更新placeholder
      document.querySelectorAll('.lang-placeholder').forEach(el => {
        el.placeholder = el.getAttribute('data-' + lang);
      });
      
      // 更新选项
      document.querySelectorAll('.lang-option').forEach(el => {
        el.textContent = el.getAttribute('data-' + lang);
      });
    }
    
    // 初始化语言
    switchLang(currentLang);
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
   * 生成JSON格式
   */
  private generateJSON(
    data: MemoryGraphData,
    outputPath?: string
  ): { content: string; file_path: string } {
    const json = JSON.stringify(data, null, 2);

    // 保存文件 - 使用项目路径下的memory目录
    const projectPath = this.getProjectPath(data.metadata.project_name);
    const filePath = outputPath || join(projectPath || process.cwd(), 'memory', 'memory-graph.json');
    
    // 确保目录存在
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(filePath, json, 'utf-8');

    return { content: json, file_path: filePath };
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

  /**
   * 辅助方法：获取Mermaid节点形状
   */
  private getMermaidShape(type: string): [string, string] {
    const shapes: Record<string, [string, string]> = {
      solution: ['[', ']'],      // 矩形
      error: ['([', '])'],        // 圆角矩形
      code: ['[[', ']]'],         // 子程序形状
      documentation: ['[(', ')]'], // 圆柱形
      conversation: ['>', ']'],   // 不对称形
      test: ['{', '}'],          // 菱形
      configuration: ['{{', '}}'], // 六边形
      commit: ['[/', '/]']        // 平行四边形
    };

    return shapes[type] || ['[', ']'];
  }
}
